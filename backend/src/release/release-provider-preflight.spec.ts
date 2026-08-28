import {
  formatReleaseProviderPreflightSuccess,
  ReleaseProviderPreflightError,
  validateFullStagingReleaseProviders,
} from './release-provider-preflight';
import { NXQ_SOCIAL_STAGING_TARGET } from './staging-target';

const validEnvironment = () => ({
  RAILWAY_PROJECT_ID: NXQ_SOCIAL_STAGING_TARGET.railway.projectId,
  RAILWAY_ENVIRONMENT_ID: NXQ_SOCIAL_STAGING_TARGET.railway.environmentId,
  RAILWAY_ENVIRONMENT_NAME: NXQ_SOCIAL_STAGING_TARGET.railway.environmentName,
  APP_BASE_URL: NXQ_SOCIAL_STAGING_TARGET.application.frontendOrigin,
  FRONTEND_URL: NXQ_SOCIAL_STAGING_TARGET.application.frontendOrigin,
  API_BASE_URL: NXQ_SOCIAL_STAGING_TARGET.application.apiBaseUrl,
  S3_ENDPOINT: NXQ_SOCIAL_STAGING_TARGET.resources.r2Endpoint,
  S3_BUCKET: NXQ_SOCIAL_STAGING_TARGET.resources.publicBucket,
  S3_QUARANTINE_BUCKET: NXQ_SOCIAL_STAGING_TARGET.resources.quarantineBucket,
  S3_PUBLIC_BASE_URL: NXQ_SOCIAL_STAGING_TARGET.resources.publicMediaOrigin,
  AWS_ACCESS_KEY_ID: 'r2_access_key_123456789',
  AWS_SECRET_ACCESS_KEY: 'r2_secret_key_1234567890123456789',
  AWS_REGION: 'auto',
  MEDIA_MODERATION_PROVIDER: 'staging-mock',
  RESEND_API_KEY: 're_staging_1234567890',
  EMAIL_FROM: 'NXQ Social Staging <staging@mail.nxqsocial.com>',
  SIGNUP_HARDENING_ENABLED: 'true',
  TURNSTILE_SECRET_KEY: 'turnstile_secret_1234567890',
  TURNSTILE_ALLOWED_HOSTNAMES: 'staging.nxqsocial.com',
  STRIPE_SECRET_KEY: 'sk_test_12345678901234567890',
  STRIPE_WEBHOOK_SECRET: 'whsec_12345678901234567890',
  LIVEKIT_URL: 'wss://nxq-staging.livekit.cloud',
  LIVEKIT_EXPECTED_STAGING_URL: 'wss://nxq-staging.livekit.cloud',
  LIVEKIT_API_KEY: 'livekit_staging_key',
  LIVEKIT_API_SECRET: 'livekit_staging_secret_123456',
});

describe('validateFullStagingReleaseProviders', () => {
  it('accepts a complete isolated staging provider set', () => {
    const result = validateFullStagingReleaseProviders(validEnvironment());

    expect(result.ok).toBe(true);
    expect(result.checkedGroups).toHaveLength(6);
    expect(formatReleaseProviderPreflightSuccess(result)).toBe(
      [
        'Offline staging provider configuration validation passed.',
        'Validated declared provider groups: 6.',
        'No network calls were made and no credential values were printed.',
        'Offline validation cannot prove provider credential scope or provider-side resource ownership; provider API smoke checks are still required.',
      ].join('\n'),
    );
  });

  it('reports the complete missing-field inventory without values', () => {
    expect(() => validateFullStagingReleaseProviders({})).toThrow(
      /S3_ENDPOINT is required[\s\S]*MEDIA_MODERATION_PROVIDER must equal staging-mock[\s\S]*RESEND_API_KEY is required[\s\S]*TURNSTILE_SECRET_KEY is required[\s\S]*STRIPE_SECRET_KEY is required[\s\S]*LIVEKIT_URL is required/,
    );
  });

  it('requires Stripe test mode and disables the Turnstile bypass', () => {
    const environment = {
      ...validEnvironment(),
      STRIPE_SECRET_KEY: 'sk_live_12345678901234567890',
      TURNSTILE_TEST_BYPASS: 'true',
    };

    expect(() => validateFullStagingReleaseProviders(environment)).toThrow(
      /TURNSTILE_TEST_BYPASS must be disabled[\s\S]*STRIPE_SECRET_KEY must be a test-mode key/,
    );
  });

  it('requires the exact approved Railway staging target', () => {
    const environment = {
      ...validEnvironment(),
      RAILWAY_PROJECT_ID: 'production-project',
      RAILWAY_ENVIRONMENT_ID: 'production-environment',
      RAILWAY_ENVIRONMENT_NAME: 'production',
    };

    expect(() => validateFullStagingReleaseProviders(environment)).toThrow(
      /RAILWAY_PROJECT_ID must match the approved[\s\S]*RAILWAY_ENVIRONMENT_ID must match the approved[\s\S]*RAILWAY_ENVIRONMENT_NAME must equal staging/,
    );
  });

  it('requires the exact approved staging application origins', () => {
    const environment = {
      ...validEnvironment(),
      APP_BASE_URL: 'https://nxqsocial.com',
      FRONTEND_URL: 'https://nxqsocial.com,https://www.nxqsocial.com',
      API_BASE_URL: 'https://api.nxqsocial.com/api',
    };

    expect(() => validateFullStagingReleaseProviders(environment)).toThrow(
      /APP_BASE_URL must equal the approved NXQ Social staging frontend origin[\s\S]*FRONTEND_URL must equal the approved NXQ Social staging frontend origin only[\s\S]*API_BASE_URL must equal the approved NXQ Social staging API URL ending in \/api/,
    );
  });

  it('requires distinct public and quarantine buckets', () => {
    const environment = validEnvironment();
    environment.S3_QUARANTINE_BUCKET = environment.S3_BUCKET;

    expect(() => validateFullStagingReleaseProviders(environment)).toThrow(
      /S3_QUARANTINE_BUCKET must differ/,
    );
  });

  it('requires real canonical HTTPS/WSS provider URLs and a true R2 endpoint', () => {
    const environment = {
      ...validEnvironment(),
      S3_ENDPOINT: 'https://not-r2.nxqsocial.com/',
      S3_PUBLIC_BASE_URL: 'http://media-staging.nxqsocial.com',
      LIVEKIT_URL: 'https://nxq-staging.livekit.cloud',
    };

    expect(() => validateFullStagingReleaseProviders(environment)).toThrow(
      /S3_ENDPOINT must be an exact public HTTPS origin[\s\S]*S3_PUBLIC_BASE_URL must be an exact public HTTPS origin[\s\S]*LIVEKIT_URL must be an exact public WSS origin/,
    );
  });

  it('pins R2 to the approved NXQSocial Cloudflare account', () => {
    expect(() =>
      validateFullStagingReleaseProviders({
        ...validEnvironment(),
        S3_ENDPOINT:
          'https://ffffffffffffffffffffffffffffffff.r2.cloudflarestorage.com',
      }),
    ).toThrow(
      'S3_ENDPOINT must match the approved NXQSocial Cloudflare account',
    );
  });

  it('rejects placeholder values and a non-staging moderation provider', () => {
    const environment = validEnvironment();
    environment.RESEND_API_KEY = '__REQUIRED__';
    environment.MEDIA_MODERATION_PROVIDER = 'rekognition';

    expect(() => validateFullStagingReleaseProviders(environment)).toThrow(
      /MEDIA_MODERATION_PROVIDER must equal staging-mock[\s\S]*RESEND_API_KEY must not contain a placeholder/,
    );
  });

  it('rejects a complete production-shaped provider configuration', () => {
    const environment = {
      ...validEnvironment(),
      S3_BUCKET: 'nxqsocial-production-public',
      S3_QUARANTINE_BUCKET: 'nxqsocial-production-quarantine',
      S3_PUBLIC_BASE_URL: 'https://media.nxqsocial.com',
      EMAIL_FROM: 'NXQ Social <noreply@nxqsocial.com>',
      TURNSTILE_ALLOWED_HOSTNAMES: 'nxqsocial.com,www.nxqsocial.com',
      LIVEKIT_URL: 'wss://nxq-production.livekit.cloud',
      LIVEKIT_EXPECTED_STAGING_URL: 'wss://nxq-production.livekit.cloud',
      APP_BASE_URL: 'https://nxqsocial.com',
      FRONTEND_URL: 'https://nxqsocial.com,https://www.nxqsocial.com',
      API_BASE_URL: 'https://api.nxqsocial.com/api',
    };

    expect(() => validateFullStagingReleaseProviders(environment)).toThrow(
      /APP_BASE_URL must equal the approved NXQ Social staging frontend origin[\s\S]*FRONTEND_URL must equal the approved NXQ Social staging frontend origin only[\s\S]*API_BASE_URL must equal the approved NXQ Social staging API URL ending in \/api[\s\S]*public media bucket must match the approved staging identity[\s\S]*S3_QUARANTINE_BUCKET must match the approved staging identity[\s\S]*S3_PUBLIC_BASE_URL must match the approved staging media origin[\s\S]*EMAIL_FROM must use the approved mail\.nxqsocial\.com domain[\s\S]*TURNSTILE_ALLOWED_HOSTNAMES must equal staging\.nxqsocial\.com only[\s\S]*LIVEKIT_URL hostname must identify staging/,
    );
  });

  it('binds LiveKit to an explicit staging WSS origin', () => {
    expect(() =>
      validateFullStagingReleaseProviders({
        ...validEnvironment(),
        LIVEKIT_EXPECTED_STAGING_URL: 'wss://different-staging.livekit.cloud',
      }),
    ).toThrow('LIVEKIT_URL must exactly match LIVEKIT_EXPECTED_STAGING_URL');

    expect(() =>
      validateFullStagingReleaseProviders({
        ...validEnvironment(),
        LIVEKIT_URL: 'wss://nxq-production.livekit.cloud',
        LIVEKIT_EXPECTED_STAGING_URL: 'wss://nxq-production.livekit.cloud',
      }),
    ).toThrow('LIVEKIT_URL hostname must identify staging');
  });

  it('never includes credential values in failure output', () => {
    const secretValues = {
      r2: 'never-print-r2-secret-value',
      stripe: 'never-print-live-stripe-secret',
      liveKit: 'never-print-livekit-secret-value',
    };
    const environment = {
      ...validEnvironment(),
      AWS_SECRET_ACCESS_KEY: secretValues.r2,
      STRIPE_SECRET_KEY: secretValues.stripe,
      LIVEKIT_API_SECRET: secretValues.liveKit,
    };

    let message = '';
    try {
      validateFullStagingReleaseProviders(environment);
    } catch (error) {
      expect(error).toBeInstanceOf(ReleaseProviderPreflightError);
      message = (error as Error).message;
    }

    expect(message).toContain('STRIPE_SECRET_KEY');
    for (const secret of Object.values(secretValues)) {
      expect(message).not.toContain(secret);
    }
  });
});
