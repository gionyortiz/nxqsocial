import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RELEASE_TARGETS,
  validateReleaseConfig,
} from './validate-release-config.mjs';

function validEnvironment(target = 'staging') {
  return {
    NXQ_RELEASE_TARGET: target,
    NEXT_PUBLIC_APP_URL: RELEASE_TARGETS[target].appUrl,
    NEXT_PUBLIC_API_URL: RELEASE_TARGETS[target].apiUrl,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    NEXT_PUBLIC_CALLS_ENABLED: 'true',
    NEXT_PUBLIC_LIVE_ENABLED: 'true',
  };
}

test('accepts only the exact approved staging origin pair', () => {
  assert.deepEqual(validateReleaseConfig(validEnvironment()), {
    releaseTarget: 'staging',
  });
});

test('rejects a staging build that targets production', () => {
  const environment = {
    ...validEnvironment(),
    NEXT_PUBLIC_APP_URL: RELEASE_TARGETS.production.appUrl,
    NEXT_PUBLIC_API_URL: RELEASE_TARGETS.production.apiUrl,
  };

  assert.throws(
    () => validateReleaseConfig(environment),
    /NEXT_PUBLIC_APP_URL must equal the approved staging frontend origin[\s\S]*NEXT_PUBLIC_API_URL must equal the approved staging API URL ending in \/api/,
  );
});

test('accepts only the exact approved production origin pair', () => {
  assert.deepEqual(validateReleaseConfig(validEnvironment('production')), {
    releaseTarget: 'production',
  });
});

test('fails closed when the release target is absent or unknown', () => {
  const missingTarget = validEnvironment();
  delete missingTarget.NXQ_RELEASE_TARGET;

  assert.throws(
    () => validateReleaseConfig(missingTarget),
    /NXQ_RELEASE_TARGET must explicitly equal staging or production/,
  );
  assert.throws(
    () =>
      validateReleaseConfig({
        ...validEnvironment(),
        NXQ_RELEASE_TARGET: 'preview',
      }),
    /NXQ_RELEASE_TARGET must explicitly equal staging or production/,
  );
});

test('rejects placeholder signup protection and invalid feature flags', () => {
  assert.throws(
    () =>
      validateReleaseConfig({
        ...validEnvironment(),
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '__REQUIRED__',
        NEXT_PUBLIC_CALLS_ENABLED: '1',
        NEXT_PUBLIC_LIVE_ENABLED: '',
      }),
    /NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing or still a placeholder[\s\S]*NEXT_PUBLIC_CALLS_ENABLED must be true or false[\s\S]*NEXT_PUBLIC_LIVE_ENABLED must be true or false/,
  );
});

test('failure output never includes configured URL or site-key values', () => {
  const environment = {
    ...validEnvironment(),
    NEXT_PUBLIC_APP_URL: 'https://do-not-print.example',
    NEXT_PUBLIC_API_URL: 'https://do-not-print-api.example/api',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'replace-do-not-print-site-key',
  };

  let message = '';
  try {
    validateReleaseConfig(environment);
  } catch (error) {
    message = error.message;
  }

  assert.doesNotMatch(message, /do-not-print/);
});
