import { pathToFileURL } from 'node:url';

export const RELEASE_TARGETS = Object.freeze({
  staging: Object.freeze({
    appUrl: 'https://frontend-staging-f129.up.railway.app',
    apiUrl: 'https://backend-staging-4ceb.up.railway.app/api',
  }),
  production: Object.freeze({
    appUrl: 'https://nxqsocial.com',
    apiUrl: 'https://api.nxqsocial.com/api',
  }),
});

/**
 * Validate browser-visible release configuration before `next build` embeds it.
 * Error messages intentionally contain field names and rules, never values.
 */
export function validateReleaseConfig(environment) {
  const issues = [];
  const releaseTarget = value(environment, 'NXQ_RELEASE_TARGET');
  const expected = Object.hasOwn(RELEASE_TARGETS, releaseTarget)
    ? RELEASE_TARGETS[releaseTarget]
    : undefined;

  if (!expected) {
    issues.push(
      'NXQ_RELEASE_TARGET must explicitly equal staging or production',
    );
  } else {
    if (value(environment, 'NEXT_PUBLIC_APP_URL') !== expected.appUrl) {
      issues.push(
        `NEXT_PUBLIC_APP_URL must equal the approved ${releaseTarget} frontend origin`,
      );
    }
    if (value(environment, 'NEXT_PUBLIC_API_URL') !== expected.apiUrl) {
      issues.push(
        `NEXT_PUBLIC_API_URL must equal the approved ${releaseTarget} API URL ending in /api`,
      );
    }
  }

  const siteKey = value(environment, 'NEXT_PUBLIC_TURNSTILE_SITE_KEY');
  if (
    !siteKey ||
    /(change[-_ ]?me|replace|placeholder|required|your[-_ ])/i.test(siteKey) ||
    siteKey.endsWith('...')
  ) {
    issues.push(
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing or still a placeholder',
    );
  }

  for (const name of [
    'NEXT_PUBLIC_CALLS_ENABLED',
    'NEXT_PUBLIC_LIVE_ENABLED',
  ]) {
    if (!['true', 'false'].includes(value(environment, name))) {
      issues.push(`${name} must be true or false`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Invalid frontend release configuration:\n${issues
        .map((issue) => `- ${issue}`)
        .join('\n')}`,
    );
  }

  return { releaseTarget };
}

function value(environment, name) {
  return typeof environment[name] === 'string' ? environment[name].trim() : '';
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = validateReleaseConfig(process.env);
    console.log(`Frontend ${result.releaseTarget} release configuration passed.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Validation failed.');
    process.exitCode = 1;
  }
}
