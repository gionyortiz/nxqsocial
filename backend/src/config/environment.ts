import { isIP } from 'net';

type Environment = Record<string, unknown>;

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const PLACEHOLDER_VALUE =
  /(change[-_ ]?me|replace[-_ ]?with|placeholder|your[-_ ])/i;

export function validateEnvironment(environment: Environment): Environment {
  const errors: string[] = [];
  const nodeEnv = readString(environment, 'NODE_ENV') || 'development';
  const railwayRuntime = Boolean(
    readString(environment, 'RAILWAY_ENVIRONMENT_ID') ||
    readString(environment, 'RAILWAY_PROJECT_ID') ||
    readString(environment, 'RAILWAY_SERVICE_ID'),
  );

  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    errors.push('NODE_ENV must be development, test, or production');
  }

  if (railwayRuntime && nodeEnv !== 'production') {
    errors.push('NODE_ENV must be production in a Railway runtime');
  }

  if (nodeEnv !== 'production' && !railwayRuntime) {
    throwIfInvalid(errors);
    return environment;
  }

  requireUrl(environment, 'DATABASE_URL', ['postgres:', 'postgresql:'], errors);
  requireUrl(environment, 'REDIS_URL', ['redis:', 'rediss:'], errors);
  requireSecret(environment, 'JWT_SECRET', 32, errors);
  requireCanonicalHttpsUrl(environment, 'APP_BASE_URL', '/', errors);
  requireCanonicalHttpsUrl(environment, 'API_BASE_URL', '/api', errors);
  requireFrontendOrigins(environment, errors);
  validatePort(environment, errors);
  validateProxyConfiguration(environment, errors);
  requireObjectStorage(environment, errors);
  requireMediaModeration(environment, errors);

  const signupHardening = readBoolean(
    environment,
    'SIGNUP_HARDENING_ENABLED',
    errors,
  );
  if (signupHardening === false) {
    errors.push('SIGNUP_HARDENING_ENABLED cannot be disabled in production');
  }
  requireSecret(environment, 'TURNSTILE_SECRET_KEY', 1, errors);
  requireHostnames(environment, 'TURNSTILE_ALLOWED_HOSTNAMES', errors);
  requireSecret(environment, 'OTP_PEPPER', 32, errors);
  requireSecret(environment, 'RESEND_API_KEY', 1, errors);
  requireEmailFrom(environment, errors);

  const testBypass = readBoolean(environment, 'TURNSTILE_TEST_BYPASS', errors);
  if (testBypass === true) {
    errors.push('TURNSTILE_TEST_BYPASS cannot be enabled in production');
  }

  requireCompleteGroup(
    environment,
    ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    errors,
  );
  validatePaidGifts(environment, errors);
  requireCompleteGroup(
    environment,
    ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
    errors,
  );
  requireCompleteGroup(
    environment,
    ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    errors,
  );

  throwIfInvalid(errors);

  return environment;
}

function validatePaidGifts(environment: Environment, errors: string[]) {
  const enabled = readBoolean(environment, 'GIFTS_ENABLED', errors);
  if (enabled !== true) return;
  requireSecret(environment, 'STRIPE_GIFTS_RESTRICTED_KEY', 12, errors);
  requireSecret(environment, 'STRIPE_GIFTS_WEBHOOK_SECRET', 12, errors);

  const share = readString(environment, 'CREATOR_GIFT_SHARE_BPS');
  if (
    share &&
    (!/^\d+$/.test(share) || Number(share) < 0 || Number(share) > 10_000)
  ) {
    errors.push(
      'CREATOR_GIFT_SHARE_BPS must be an integer between 0 and 10000',
    );
  }
  const currency = readString(environment, 'GIFT_CURRENCY') || 'usd';
  if (!/^[a-zA-Z]{3}$/.test(currency)) {
    errors.push('GIFT_CURRENCY must be a three-letter currency code');
  }
}

function throwIfInvalid(errors: string[]) {
  if (errors.length === 0) return;
  throw new Error(
    `Invalid production environment:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
}

function readString(environment: Environment, name: string): string {
  const value = environment[name];
  return typeof value === 'string' ? value.trim() : '';
}

function requireSecret(
  environment: Environment,
  name: string,
  minimumLength: number,
  errors: string[],
) {
  const value = readString(environment, name);
  if (!value) {
    errors.push(`${name} is required`);
    return;
  }
  if (value.length < minimumLength) {
    errors.push(`${name} must be at least ${minimumLength} characters`);
  }
  if (PLACEHOLDER_VALUE.test(value) || value.endsWith('...')) {
    errors.push(`${name} still contains an example or placeholder value`);
  }
}

function requireUrl(
  environment: Environment,
  name: string,
  protocols: string[],
  errors: string[],
) {
  const value = readString(environment, name);
  if (!value) {
    errors.push(`${name} is required`);
    return;
  }

  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol) || !parsed.hostname) {
      errors.push(`${name} must use ${protocols.join(' or ')}`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
}

function requireCanonicalHttpsUrl(
  environment: Environment,
  name: string,
  expectedPath: '/' | '/api',
  errors: string[],
) {
  const value = readString(environment, name);
  if (!value) {
    errors.push(`${name} is required`);
    return;
  }

  try {
    const parsed = new URL(value);
    const canonical =
      expectedPath === '/' ? parsed.origin : `${parsed.origin}${expectedPath}`;
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== expectedPath ||
      value !== canonical
    ) {
      errors.push(
        `${name} must be the canonical HTTPS ${expectedPath === '/' ? 'origin' : `URL ending in ${expectedPath}`}`,
      );
    }
  } catch {
    errors.push(
      `${name} must be the canonical HTTPS ${expectedPath === '/' ? 'origin' : `URL ending in ${expectedPath}`}`,
    );
  }
}

function requireFrontendOrigins(environment: Environment, errors: string[]) {
  const origins = readString(environment, 'FRONTEND_URL')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    errors.push('FRONTEND_URL must contain at least one allowed origin');
    return;
  }

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      const isOriginOnly =
        parsed.origin === origin &&
        parsed.pathname === '/' &&
        !parsed.search &&
        !parsed.hash;
      if (parsed.protocol !== 'https:' || !isOriginOnly) {
        errors.push(
          'FRONTEND_URL entries must be HTTPS origins without paths or trailing slashes',
        );
        return;
      }
    } catch {
      errors.push('FRONTEND_URL contains an invalid origin');
      return;
    }
  }
}

function validatePort(environment: Environment, errors: string[]) {
  const value = readString(environment, 'PORT');
  if (!value) return;
  if (!/^\d+$/.test(value)) {
    errors.push('PORT must be an integer between 1 and 65535');
    return;
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    errors.push('PORT must be an integer between 1 and 65535');
  }
}

function readBoolean(
  environment: Environment,
  name: string,
  errors: string[],
): boolean | undefined {
  const raw = readString(environment, name);
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  errors.push(`${name} must be a boolean value`);
  return undefined;
}

function requireHostnames(
  environment: Environment,
  name: string,
  errors: string[],
) {
  const hostnames = readString(environment, name)
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);

  if (hostnames.length === 0) {
    errors.push(`${name} must contain at least one hostname`);
    return;
  }

  for (const hostname of hostnames) {
    try {
      const parsed = new URL(`https://${hostname}`);
      if (
        parsed.hostname !== hostname ||
        parsed.pathname !== '/' ||
        parsed.port ||
        parsed.username ||
        parsed.password
      ) {
        errors.push(
          `${name} entries must be hostnames without schemes or paths`,
        );
        return;
      }
    } catch {
      errors.push(`${name} contains an invalid hostname`);
      return;
    }
  }
}

function requireEmailFrom(environment: Environment, errors: string[]) {
  const value = readString(environment, 'EMAIL_FROM');
  const match = value.match(/^(?:[^<>]+<)?([^<>\s]+@[^<>\s]+)>?$/);
  if (!match) {
    errors.push('EMAIL_FROM must contain a valid sender email address');
  }
}

function requireCompleteGroup(
  environment: Environment,
  names: string[],
  errors: string[],
) {
  const configured = names.filter((name) => readString(environment, name));
  if (configured.length === 0) return;
  if (configured.length === names.length) {
    for (const name of names) {
      const value = readString(environment, name);
      if (PLACEHOLDER_VALUE.test(value) || value.endsWith('...')) {
        errors.push(`${name} still contains an example or placeholder value`);
      }
    }
    return;
  }
  const missing = names.filter((name) => !configured.includes(name));
  errors.push(
    `${names.join('/')} must be configured together; missing ${missing.join(', ')}`,
  );
}

function requireObjectStorage(environment: Environment, errors: string[]) {
  const publicBucket =
    readString(environment, 'S3_BUCKET_NAME') ||
    readString(environment, 'S3_BUCKET');
  const quarantineBucket = readString(environment, 'S3_QUARANTINE_BUCKET');
  if (!publicBucket) errors.push('S3_BUCKET or S3_BUCKET_NAME is required');
  if (!quarantineBucket) errors.push('S3_QUARANTINE_BUCKET is required');
  if (publicBucket && quarantineBucket && publicBucket === quarantineBucket) {
    errors.push(
      'S3_QUARANTINE_BUCKET must differ from the public media bucket',
    );
  }
  requireCanonicalHttpsUrl(environment, 'S3_PUBLIC_BASE_URL', '/', errors);
  requireSecret(environment, 'AWS_ACCESS_KEY_ID', 1, errors);
  requireSecret(environment, 'AWS_SECRET_ACCESS_KEY', 1, errors);
  const endpoint = readString(environment, 'S3_ENDPOINT');
  if (endpoint)
    requireCanonicalHttpsUrl(environment, 'S3_ENDPOINT', '/', errors);
}

function requireMediaModeration(environment: Environment, errors: string[]) {
  const provider =
    readString(environment, 'MEDIA_MODERATION_PROVIDER') || 'rekognition';
  if (provider === 'staging-mock') {
    if (
      readString(environment, 'NXQ_RELEASE_TARGET') !== 'staging' ||
      readString(environment, 'RAILWAY_ENVIRONMENT_NAME') !== 'staging'
    ) {
      errors.push(
        'MEDIA_MODERATION_PROVIDER=staging-mock is allowed only for the staging release target',
      );
    }
    return;
  }
  if (provider !== 'rekognition') {
    errors.push(
      'MEDIA_MODERATION_PROVIDER must be rekognition or staging-mock',
    );
    return;
  }
  requireSecret(environment, 'REKOGNITION_ACCESS_KEY_ID', 1, errors);
  requireSecret(environment, 'REKOGNITION_SECRET_ACCESS_KEY', 1, errors);
  requireSecret(environment, 'REKOGNITION_S3_BUCKET', 1, errors);
  const region = readString(environment, 'REKOGNITION_REGION');
  if (!region) errors.push('REKOGNITION_REGION is required');
  else if (region.toLowerCase() === 'auto') {
    errors.push('REKOGNITION_REGION must be a real AWS region, not auto');
  }
}

function validateProxyConfiguration(
  environment: Environment,
  errors: string[],
) {
  validateIpList(environment, 'TRUSTED_PROXY_IPS', errors);
  validateCidrList(environment, 'TRUSTED_PROXY_CIDRS', errors);
  validateCidrList(environment, 'CLOUDFLARE_PROXY_CIDRS', errors);
}

function validateIpList(
  environment: Environment,
  name: string,
  errors: string[],
) {
  const raw = readString(environment, name);
  if (!raw) return;

  const values = raw.split(',').map((value) => value.trim());
  if (
    values.some(
      (value) =>
        !value ||
        PLACEHOLDER_VALUE.test(value) ||
        isIP(value.startsWith('::ffff:') ? value.slice(7) : value) === 0,
    )
  ) {
    errors.push(
      `${name} must be a comma-separated list of literal IP addresses`,
    );
  }
}

function validateCidrList(
  environment: Environment,
  name: string,
  errors: string[],
) {
  const raw = readString(environment, name);
  if (!raw) return;

  const values = raw.split(',').map((value) => value.trim());
  for (const value of values) {
    if (!value || PLACEHOLDER_VALUE.test(value)) {
      errors.push(`${name} must contain only valid CIDR ranges`);
      return;
    }

    const parts = value.split('/');
    if (parts.length !== 2 || !/^\d+$/.test(parts[1])) {
      errors.push(`${name} must contain only valid CIDR ranges`);
      return;
    }

    const network = parts[0].startsWith('::ffff:')
      ? parts[0].slice(7)
      : parts[0];
    const family = isIP(network);
    const prefix = Number(parts[1]);
    const maxPrefix = family === 4 ? 32 : 128;
    if (family === 0 || prefix < 1 || prefix > maxPrefix) {
      errors.push(
        `${name} must contain valid non-catch-all IPv4 or IPv6 CIDR ranges`,
      );
      return;
    }
  }
}
