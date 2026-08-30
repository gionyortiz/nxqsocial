import { validateEnvironment } from './environment';

const validProductionEnvironment = () => ({
  NODE_ENV: 'production',
  PORT: '3000',
  DATABASE_URL: 'postgresql://nxq:password@db.internal:5432/nxqsocial',
  REDIS_URL: 'rediss://default:password@redis.internal:6380',
  JWT_SECRET: 'a'.repeat(64),
  FRONTEND_URL: 'https://staging.nxqsocial.test',
  APP_BASE_URL: 'https://staging.nxqsocial.test',
  API_BASE_URL: 'https://api-staging.nxqsocial.test/api',
  SIGNUP_HARDENING_ENABLED: 'true',
  TURNSTILE_SECRET_KEY: '0x4AAAAAAABBBBBBBBCCCCCCCC',
  TURNSTILE_ALLOWED_HOSTNAMES: 'staging.nxqsocial.test',
  OTP_PEPPER: 'b'.repeat(64),
  RESEND_API_KEY: 're_live_1234567890abcdef',
  EMAIL_FROM: 'NXQ Social <noreply@nxqsocial.test>',
  S3_ENDPOINT: 'https://account.r2.example.test',
  S3_BUCKET: 'nxq-staging-public',
  S3_QUARANTINE_BUCKET: 'nxq-staging-quarantine',
  S3_PUBLIC_BASE_URL: 'https://media-staging.example.test',
  AWS_ACCESS_KEY_ID: 'r2-access-key',
  AWS_SECRET_ACCESS_KEY: 'r2-secret-key',
  REKOGNITION_REGION: 'us-east-1',
  REKOGNITION_ACCESS_KEY_ID: 'aws-moderation-access-key',
  REKOGNITION_SECRET_ACCESS_KEY: 'aws-moderation-secret-key',
  REKOGNITION_S3_BUCKET: 'nxq-staging-moderation',
});

describe('validateEnvironment', () => {
  it('does not require production services in development or tests', () => {
    const environment = { NODE_ENV: 'test' };
    expect(validateEnvironment(environment)).toBe(environment);
  });

  it('accepts a complete production environment', () => {
    const environment = validProductionEnvironment();
    expect(validateEnvironment(environment)).toBe(environment);
  });

  it('allows the moderation mock only for an explicit staging release', () => {
    const environment = {
      ...validProductionEnvironment(),
      NXQ_RELEASE_TARGET: 'staging',
      RAILWAY_ENVIRONMENT_NAME: 'staging',
      MEDIA_MODERATION_PROVIDER: 'staging-mock',
      REKOGNITION_REGION: '',
      REKOGNITION_ACCESS_KEY_ID: '',
      REKOGNITION_SECRET_ACCESS_KEY: '',
      REKOGNITION_S3_BUCKET: '',
    };
    expect(validateEnvironment(environment)).toBe(environment);

    expect(() =>
      validateEnvironment({
        ...environment,
        NXQ_RELEASE_TARGET: 'production',
        RAILWAY_ENVIRONMENT_NAME: 'production',
      }),
    ).toThrow(/staging-mock is allowed only for the staging release target/);
  });

  it('fails once with the complete missing-variable inventory', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      /DATABASE_URL is required[\s\S]*REDIS_URL is required[\s\S]*JWT_SECRET is required[\s\S]*TURNSTILE_SECRET_KEY is required[\s\S]*OTP_PEPPER is required/,
    );
  });

  it('requires production mode and full validation in Railway runtimes', () => {
    expect(() =>
      validateEnvironment({ RAILWAY_PROJECT_ID: 'railway-project' }),
    ).toThrow(
      /NODE_ENV must be production in a Railway runtime[\s\S]*DATABASE_URL is required[\s\S]*API_BASE_URL is required/,
    );
  });

  it('rejects an invalid NODE_ENV before returning from non-production validation', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV must be development, test, or production/,
    );
  });

  it('rejects unsafe URLs, secrets, ports, and production test bypasses', () => {
    const environment = {
      ...validProductionEnvironment(),
      DATABASE_URL: 'https://db.internal',
      JWT_SECRET: 'replace-with-secret',
      FRONTEND_URL: 'https://staging.nxqsocial.test/path',
      PORT: '70000',
      TURNSTILE_TEST_BYPASS: 'true',
    };

    expect(() => validateEnvironment(environment)).toThrow(
      /DATABASE_URL must use postgres: or postgresql:[\s\S]*JWT_SECRET must be at least 32 characters[\s\S]*FRONTEND_URL entries must be HTTPS origins[\s\S]*PORT must be an integer[\s\S]*TURNSTILE_TEST_BYPASS cannot be enabled/,
    );
  });

  it('rejects non-HTTPS, non-canonical public application and storage URLs', () => {
    const environment = {
      ...validProductionEnvironment(),
      FRONTEND_URL: 'http://staging.nxqsocial.test',
      APP_BASE_URL: 'https://staging.nxqsocial.test/',
      API_BASE_URL: 'https://api-staging.nxqsocial.test/api/',
      S3_ENDPOINT: 'http://account.r2.example.test',
      S3_PUBLIC_BASE_URL: 'https://media-staging.example.test/path',
    };

    expect(() => validateEnvironment(environment)).toThrow(
      /APP_BASE_URL must be the canonical HTTPS origin[\s\S]*API_BASE_URL must be the canonical HTTPS URL ending in \/api[\s\S]*FRONTEND_URL entries must be HTTPS origins[\s\S]*S3_PUBLIC_BASE_URL must be the canonical HTTPS origin[\s\S]*S3_ENDPOINT must be the canonical HTTPS origin/,
    );
  });

  it('does not allow signup protection to be disabled in production', () => {
    const environment = validProductionEnvironment();
    environment.SIGNUP_HARDENING_ENABLED = 'false';

    expect(() => validateEnvironment(environment)).toThrow(
      /SIGNUP_HARDENING_ENABLED cannot be disabled in production/,
    );
  });

  it('rejects partially configured optional provider credential groups', () => {
    const environment = {
      ...validProductionEnvironment(),
      LIVEKIT_URL: 'wss://livekit.example.test',
      LIVEKIT_API_KEY: 'api-key',
    };

    expect(() => validateEnvironment(environment)).toThrow(
      /LIVEKIT_URL\/LIVEKIT_API_KEY\/LIVEKIT_API_SECRET must be configured together; missing LIVEKIT_API_SECRET/,
    );
  });

  it('keeps paid gifts fail-closed unless dedicated payment secrets are complete', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment(),
        GIFTS_ENABLED: 'true',
      }),
    ).toThrow(
      /STRIPE_GIFTS_RESTRICTED_KEY is required[\s\S]*STRIPE_GIFTS_WEBHOOK_SECRET is required/,
    );

    const enabled = {
      ...validProductionEnvironment(),
      GIFTS_ENABLED: 'true',
      STRIPE_GIFTS_RESTRICTED_KEY: 'rk_test_dedicated_gifts_key',
      STRIPE_GIFTS_WEBHOOK_SECRET: 'whsec_dedicated_gifts_endpoint',
      CREATOR_GIFT_SHARE_BPS: '5000',
      GIFT_CURRENCY: 'usd',
    };
    expect(validateEnvironment(enabled)).toBe(enabled);
  });

  it('accepts explicit proxy IP and CIDR lists', () => {
    const environment = {
      ...validProductionEnvironment(),
      TRUSTED_PROXY_IPS: '127.0.0.1,::1,192.0.2.10',
      TRUSTED_PROXY_CIDRS: '192.0.2.0/24,2001:db8::/32',
      CLOUDFLARE_PROXY_CIDRS: '198.51.100.0/24,2001:db9::/48',
    };

    expect(validateEnvironment(environment)).toBe(environment);
  });

  it('rejects malformed, placeholder, and catch-all proxy configuration', () => {
    const environment = {
      ...validProductionEnvironment(),
      TRUSTED_PROXY_IPS: '127.0.0.1,not-an-ip',
      TRUSTED_PROXY_CIDRS: '0.0.0.0/0',
      CLOUDFLARE_PROXY_CIDRS: 'REPLACE_WITH_CURRENT_CLOUDFLARE_CIDRS',
    };

    expect(() => validateEnvironment(environment)).toThrow(
      /TRUSTED_PROXY_IPS must be a comma-separated list[\s\S]*TRUSTED_PROXY_CIDRS must contain valid non-catch-all[\s\S]*CLOUDFLARE_PROXY_CIDRS must contain only valid CIDR ranges/,
    );
  });
});
