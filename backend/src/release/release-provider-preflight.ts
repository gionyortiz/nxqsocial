import { NXQ_SOCIAL_STAGING_TARGET } from './staging-target';

type ReleaseEnvironment = Record<string, string | undefined>;

export const FULL_STAGING_PROVIDER_GROUPS = [
  'R2 public/quarantine storage',
  'AWS Rekognition moderation',
  'Resend email',
  'Turnstile bot protection',
  'Stripe test mode',
  'LiveKit',
] as const;

export interface ReleaseProviderPreflightResult {
  ok: true;
  checkedGroups: readonly string[];
}

export class ReleaseProviderPreflightError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      [
        'Full staging provider preflight failed:',
        ...issues.map((issue) => `- ${issue}`),
      ].join('\n'),
    );
    this.name = 'ReleaseProviderPreflightError';
  }
}

const PLACEHOLDER =
  /(?:^|[^a-z0-9])(change[-_ ]?me|replace(?:[-_ ]?with)?|placeholder|example|dummy|todo|tbd|required)(?:$|[^a-z0-9])|<(?:account|bucket|key|secret|value|host|hostname|id|url|region)[^>]*>|__[^_]+__|\$\{[^}]+\}|\.\.\.$/i;
const RESERVED_HOST =
  /(?:^|\.)(?:example|invalid|localhost|test)(?:\.[a-z0-9-]+)?$/i;

/**
 * Validate the provider set required for an end-to-end staging release.
 *
 * This is intentionally stricter than application boot validation: optional
 * production features become mandatory here, Stripe must be in test mode, and
 * the storage provider must be Cloudflare R2. Error text contains field names
 * and rules only; environment values are never included.
 */
export function validateFullStagingReleaseProviders(
  environment: ReleaseEnvironment,
): ReleaseProviderPreflightResult {
  const issues: string[] = [];

  validateRailwayTarget(environment, issues);
  validateApplicationOrigins(environment, issues);
  validateR2(environment, issues);
  validateRekognition(environment, issues);
  validateResend(environment, issues);
  validateTurnstile(environment, issues);
  validateStripeTestMode(environment, issues);
  validateLiveKit(environment, issues);
  validateProviderSeparation(environment, issues);

  if (issues.length > 0) {
    throw new ReleaseProviderPreflightError(issues);
  }

  return {
    ok: true,
    checkedGroups: [...FULL_STAGING_PROVIDER_GROUPS],
  };
}

function validateApplicationOrigins(
  environment: ReleaseEnvironment,
  issues: string[],
) {
  const target = NXQ_SOCIAL_STAGING_TARGET.application;
  const appBaseUrl = value(environment, 'APP_BASE_URL');
  const apiBaseUrl = value(environment, 'API_BASE_URL');
  const frontendUrl = value(environment, 'FRONTEND_URL');

  if (appBaseUrl !== target.frontendOrigin) {
    issues.push(
      '[Application] APP_BASE_URL must equal the approved NXQ Social staging frontend origin',
    );
  }
  if (frontendUrl !== target.frontendOrigin) {
    issues.push(
      '[Application] FRONTEND_URL must equal the approved NXQ Social staging frontend origin only',
    );
  }
  if (apiBaseUrl !== target.apiBaseUrl) {
    issues.push(
      '[Application] API_BASE_URL must equal the approved NXQ Social staging API URL ending in /api',
    );
  }
}

export function formatReleaseProviderPreflightSuccess(
  result: ReleaseProviderPreflightResult,
): string {
  return [
    'Offline staging provider configuration validation passed.',
    `Validated declared provider groups: ${result.checkedGroups.length}.`,
    'No network calls were made and no credential values were printed.',
    'Offline validation cannot prove provider credential scope or provider-side resource ownership; provider API smoke checks are still required.',
  ].join('\n');
}

function validateRailwayTarget(
  environment: ReleaseEnvironment,
  issues: string[],
) {
  const target = NXQ_SOCIAL_STAGING_TARGET.railway;
  if (value(environment, 'RAILWAY_PROJECT_ID') !== target.projectId) {
    issues.push(
      '[Railway] RAILWAY_PROJECT_ID must match the approved NXQ Social staging project',
    );
  }
  if (value(environment, 'RAILWAY_ENVIRONMENT_ID') !== target.environmentId) {
    issues.push(
      '[Railway] RAILWAY_ENVIRONMENT_ID must match the approved NXQ Social staging environment',
    );
  }
  if (
    value(environment, 'RAILWAY_ENVIRONMENT_NAME') !== target.environmentName
  ) {
    issues.push('[Railway] RAILWAY_ENVIRONMENT_NAME must equal staging');
  }
}

function validateR2(environment: ReleaseEnvironment, issues: string[]) {
  const group = 'R2';
  const bucket =
    value(environment, 'S3_BUCKET_NAME') || value(environment, 'S3_BUCKET');
  const bucketName = value(environment, 'S3_BUCKET_NAME');
  const legacyBucketName = value(environment, 'S3_BUCKET');
  const quarantineBucket = value(environment, 'S3_QUARANTINE_BUCKET');
  const endpoint = requireValue(environment, 'S3_ENDPOINT', group, issues);
  const publicBaseUrl = requireValue(
    environment,
    'S3_PUBLIC_BASE_URL',
    group,
    issues,
  );

  if (!bucket) {
    issues.push('[R2] S3_BUCKET or S3_BUCKET_NAME is required');
  } else {
    validateBucketName(bucket, 'S3_BUCKET or S3_BUCKET_NAME', group, issues);
    if (bucket !== NXQ_SOCIAL_STAGING_TARGET.resources.publicBucket) {
      issues.push(
        '[R2] public media bucket must match the approved staging identity',
      );
    }
  }
  if (bucketName && legacyBucketName && bucketName !== legacyBucketName) {
    issues.push(
      '[R2] S3_BUCKET and S3_BUCKET_NAME must not identify different public buckets',
    );
  }

  if (!quarantineBucket) {
    issues.push('[R2] S3_QUARANTINE_BUCKET is required');
  } else {
    validateBucketName(quarantineBucket, 'S3_QUARANTINE_BUCKET', group, issues);
    if (
      quarantineBucket !== NXQ_SOCIAL_STAGING_TARGET.resources.quarantineBucket
    ) {
      issues.push(
        '[R2] S3_QUARANTINE_BUCKET must match the approved staging identity',
      );
    }
  }
  if (
    bucket &&
    quarantineBucket &&
    bucket.toLowerCase() === quarantineBucket.toLowerCase()
  ) {
    issues.push(
      '[R2] S3_QUARANTINE_BUCKET must differ from the public media bucket',
    );
  }

  const endpointUrl = endpoint
    ? canonicalUrl(endpoint, 'https:', 'S3_ENDPOINT', group, issues)
    : null;
  const publicUrl = publicBaseUrl
    ? canonicalUrl(publicBaseUrl, 'https:', 'S3_PUBLIC_BASE_URL', group, issues)
    : null;

  if (
    endpointUrl &&
    !endpointUrl.hostname.endsWith('.r2.cloudflarestorage.com')
  ) {
    issues.push('[R2] S3_ENDPOINT must be a Cloudflare R2 account endpoint');
  }
  if (publicUrl && publicUrl.hostname.endsWith('.r2.cloudflarestorage.com')) {
    issues.push(
      '[R2] S3_PUBLIC_BASE_URL must be a public media origin, not the private R2 API endpoint',
    );
  }
  if (endpointUrl && publicUrl && endpointUrl.origin === publicUrl.origin) {
    issues.push('[R2] S3_ENDPOINT and S3_PUBLIC_BASE_URL must differ');
  }
  if (
    publicBaseUrl &&
    publicBaseUrl !== NXQ_SOCIAL_STAGING_TARGET.resources.publicMediaOrigin
  ) {
    issues.push(
      '[R2] S3_PUBLIC_BASE_URL must match the approved staging media origin',
    );
  }

  requireSecret(environment, 'AWS_ACCESS_KEY_ID', group, 8, issues);
  requireSecret(environment, 'AWS_SECRET_ACCESS_KEY', group, 16, issues);
  const region = requireValue(environment, 'AWS_REGION', group, issues);
  if (region && region !== 'auto') {
    issues.push('[R2] AWS_REGION must be auto for Cloudflare R2');
  }
}

function validateRekognition(
  environment: ReleaseEnvironment,
  issues: string[],
) {
  const group = 'Rekognition';
  const region = requireValue(environment, 'REKOGNITION_REGION', group, issues);
  if (region && !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) {
    issues.push(
      '[Rekognition] REKOGNITION_REGION must be an explicit AWS region',
    );
  }
  requireSecret(environment, 'REKOGNITION_ACCESS_KEY_ID', group, 12, issues);
  requireSecret(
    environment,
    'REKOGNITION_SECRET_ACCESS_KEY',
    group,
    24,
    issues,
  );
  const moderationBucket = requireValue(
    environment,
    'REKOGNITION_S3_BUCKET',
    group,
    issues,
  );
  if (moderationBucket) {
    validateBucketName(
      moderationBucket,
      'REKOGNITION_S3_BUCKET',
      group,
      issues,
    );
    if (
      moderationBucket !== NXQ_SOCIAL_STAGING_TARGET.resources.moderationBucket
    ) {
      issues.push(
        '[Rekognition] REKOGNITION_S3_BUCKET must match the approved staging identity',
      );
    }
  }
}

function validateResend(environment: ReleaseEnvironment, issues: string[]) {
  const group = 'Resend';
  const key = requireSecret(environment, 'RESEND_API_KEY', group, 8, issues);
  if (key && !key.startsWith('re_')) {
    issues.push('[Resend] RESEND_API_KEY must use a Resend API-key prefix');
  }
  const from = requireValue(environment, 'EMAIL_FROM', group, issues);
  if (from && !/^(?:[^<>]+<)?[^<>\s]+@[^<>\s]+>?$/.test(from)) {
    issues.push('[Resend] EMAIL_FROM must contain a valid sender address');
  } else if (
    from &&
    senderDomain(from) !== NXQ_SOCIAL_STAGING_TARGET.resources.emailDomain
  ) {
    issues.push(
      '[Resend] EMAIL_FROM must use the approved staging.nxqsocial.com domain',
    );
  }
}

function validateTurnstile(environment: ReleaseEnvironment, issues: string[]) {
  const group = 'Turnstile';
  requireSecret(environment, 'TURNSTILE_SECRET_KEY', group, 8, issues);
  const hostnames = requireValue(
    environment,
    'TURNSTILE_ALLOWED_HOSTNAMES',
    group,
    issues,
  );
  if (hostnames) {
    for (const hostname of hostnames.split(',').map((item) => item.trim())) {
      if (
        !hostname ||
        hostname.includes('://') ||
        hostname.includes('/') ||
        hostname.includes('*') ||
        hostname.includes(':') ||
        PLACEHOLDER.test(hostname) ||
        RESERVED_HOST.test(hostname)
      ) {
        issues.push(
          '[Turnstile] TURNSTILE_ALLOWED_HOSTNAMES must contain only explicit staging hostnames',
        );
        break;
      }
    }
    if (hostnames !== NXQ_SOCIAL_STAGING_TARGET.resources.turnstileHostname) {
      issues.push(
        '[Turnstile] TURNSTILE_ALLOWED_HOSTNAMES must equal staging.nxqsocial.com only',
      );
    }
  }

  if (value(environment, 'SIGNUP_HARDENING_ENABLED').toLowerCase() !== 'true') {
    issues.push('[Turnstile] SIGNUP_HARDENING_ENABLED must be true');
  }
  if (truthy(value(environment, 'TURNSTILE_TEST_BYPASS'))) {
    issues.push('[Turnstile] TURNSTILE_TEST_BYPASS must be disabled');
  }
}

function validateStripeTestMode(
  environment: ReleaseEnvironment,
  issues: string[],
) {
  const group = 'Stripe test';
  const secret = requireSecret(
    environment,
    'STRIPE_SECRET_KEY',
    group,
    12,
    issues,
  );
  if (secret && !secret.startsWith('sk_test_')) {
    issues.push('[Stripe test] STRIPE_SECRET_KEY must be a test-mode key');
  }
  const webhook = requireSecret(
    environment,
    'STRIPE_WEBHOOK_SECRET',
    group,
    12,
    issues,
  );
  if (webhook && !webhook.startsWith('whsec_')) {
    issues.push(
      '[Stripe test] STRIPE_WEBHOOK_SECRET must be a Stripe webhook secret',
    );
  }
}

function validateLiveKit(environment: ReleaseEnvironment, issues: string[]) {
  const group = 'LiveKit';
  const liveKitUrl = requireValue(environment, 'LIVEKIT_URL', group, issues);
  const expectedLiveKitUrl = requireValue(
    environment,
    'LIVEKIT_EXPECTED_STAGING_URL',
    group,
    issues,
  );
  const parsedLiveKitUrl = liveKitUrl
    ? canonicalUrl(liveKitUrl, 'wss:', 'LIVEKIT_URL', group, issues)
    : null;
  const parsedExpectedLiveKitUrl = expectedLiveKitUrl
    ? canonicalUrl(
        expectedLiveKitUrl,
        'wss:',
        'LIVEKIT_EXPECTED_STAGING_URL',
        group,
        issues,
      )
    : null;
  if (liveKitUrl && expectedLiveKitUrl && liveKitUrl !== expectedLiveKitUrl) {
    issues.push(
      '[LiveKit] LIVEKIT_URL must exactly match LIVEKIT_EXPECTED_STAGING_URL',
    );
  }
  if (
    parsedLiveKitUrl &&
    !parsedLiveKitUrl.hostname.toLowerCase().includes('staging')
  ) {
    issues.push('[LiveKit] LIVEKIT_URL hostname must identify staging');
  }
  if (
    parsedExpectedLiveKitUrl &&
    !parsedExpectedLiveKitUrl.hostname.toLowerCase().includes('staging')
  ) {
    issues.push(
      '[LiveKit] LIVEKIT_EXPECTED_STAGING_URL hostname must identify staging',
    );
  }
  requireSecret(environment, 'LIVEKIT_API_KEY', group, 6, issues);
  requireSecret(environment, 'LIVEKIT_API_SECRET', group, 16, issues);
}

function validateProviderSeparation(
  environment: ReleaseEnvironment,
  issues: string[],
) {
  const buckets = [
    value(environment, 'S3_BUCKET_NAME') || value(environment, 'S3_BUCKET'),
    value(environment, 'S3_QUARANTINE_BUCKET'),
    value(environment, 'REKOGNITION_S3_BUCKET'),
  ]
    .filter(Boolean)
    .map((item) => item.toLowerCase());
  if (new Set(buckets).size !== buckets.length) {
    issues.push(
      '[Provider separation] public, quarantine, and moderation buckets must all differ',
    );
  }

  if (
    value(environment, 'AWS_ACCESS_KEY_ID') &&
    value(environment, 'AWS_ACCESS_KEY_ID') ===
      value(environment, 'REKOGNITION_ACCESS_KEY_ID')
  ) {
    issues.push(
      '[Provider separation] R2 and Rekognition must use separate access keys',
    );
  }
  if (
    value(environment, 'AWS_SECRET_ACCESS_KEY') &&
    value(environment, 'AWS_SECRET_ACCESS_KEY') ===
      value(environment, 'REKOGNITION_SECRET_ACCESS_KEY')
  ) {
    issues.push(
      '[Provider separation] R2 and Rekognition must use separate secret keys',
    );
  }
}

function requireValue(
  environment: ReleaseEnvironment,
  name: string,
  group: string,
  issues: string[],
): string {
  const configured = value(environment, name);
  if (!configured) {
    issues.push(`[${group}] ${name} is required`);
    return '';
  }
  if (PLACEHOLDER.test(configured)) {
    issues.push(`[${group}] ${name} must not contain a placeholder value`);
    return '';
  }
  return configured;
}

function requireSecret(
  environment: ReleaseEnvironment,
  name: string,
  group: string,
  minimumLength: number,
  issues: string[],
): string {
  const configured = requireValue(environment, name, group, issues);
  if (configured && configured.length < minimumLength) {
    issues.push(
      `[${group}] ${name} must be at least ${minimumLength} characters`,
    );
  }
  return configured;
}

function canonicalUrl(
  configured: string,
  protocol: 'https:' | 'wss:',
  name: string,
  group: string,
  issues: string[],
): URL | null {
  try {
    const parsed = new URL(configured);
    if (
      parsed.protocol !== protocol ||
      configured !== parsed.origin ||
      parsed.pathname !== '/' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      RESERVED_HOST.test(parsed.hostname)
    ) {
      issues.push(
        `[${group}] ${name} must be an exact public ${protocol.slice(0, -1).toUpperCase()} origin`,
      );
      return null;
    }
    return parsed;
  } catch {
    issues.push(
      `[${group}] ${name} must be an exact public ${protocol.slice(0, -1).toUpperCase()} origin`,
    );
    return null;
  }
}

function validateBucketName(
  configured: string,
  name: string,
  group: string,
  issues: string[],
) {
  if (
    PLACEHOLDER.test(configured) ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(configured) ||
    configured.includes('..')
  ) {
    issues.push(
      `[${group}] ${name} must be a valid non-placeholder bucket name`,
    );
  }
}

function value(environment: ReleaseEnvironment, name: string): string {
  return environment[name]?.trim() ?? '';
}

function truthy(configured: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(configured.toLowerCase());
}

function senderDomain(from: string): string {
  const angleAddress = from.match(/<([^<>]+)>$/)?.[1];
  const address = (angleAddress ?? from).trim();
  const separator = address.lastIndexOf('@');
  return separator === -1 ? '' : address.slice(separator + 1).toLowerCase();
}
