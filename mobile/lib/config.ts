const defaultApiBaseUrl = 'https://api.nxqsocial.com/api';
const defaultTurnstileMobileUrl = 'https://nxqsocial.com/turnstile/mobile-signup';
const defaultWebBaseUrl = 'https://nxqsocial.com';

export type AppVariant = 'production' | 'staging';

const rawAppVariant = process.env.EXPO_PUBLIC_APP_VARIANT ?? 'production';
if (rawAppVariant !== 'production' && rawAppVariant !== 'staging') {
  throw new Error(`Unsupported EXPO_PUBLIC_APP_VARIANT: ${rawAppVariant}`);
}

export const APP_VARIANT: AppVariant = rawAppVariant;

const RESERVED_HOSTS = ['example.com', 'example.net', 'example.org'];
const RESERVED_SUFFIXES = ['.example', '.invalid', '.localhost', '.local', '.test', '.internal'];

function isReservedOrNonPublicHost(hostname: string): boolean {
  const isReservedDomain = RESERVED_HOSTS.some(
    (reserved) => hostname === reserved || hostname.endsWith(`.${reserved}`),
  );
  const isReservedSuffix = RESERVED_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
  return hostname === 'localhost'
    || !hostname.includes('.')
    || isReservedDomain
    || isReservedSuffix
    || isIpAddress;
}

function requireStagingUrl(name: string, value: string | undefined): string {
  if (!value || value === '__REQUIRED__') {
    throw new Error(`${name} is required for the staging mobile app.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }

  const rawHostname = url.hostname.toLowerCase();
  const hostname = rawHostname.replace(/\.+$/, '');
  const hasNonCanonicalHostname = rawHostname !== hostname;
  const isProduction = hostname === 'nxqsocial.com' || hostname.endsWith('.nxqsocial.com');
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || hasNonCanonicalHostname
    || isReservedOrNonPublicHost(hostname)
    || isProduction
  ) {
    throw new Error(`${name} must be a canonical public non-production staging HTTPS URL.`);
  }

  return value.replace(/\/$/, '');
}

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const configuredTurnstileMobileUrl = process.env.EXPO_PUBLIC_TURNSTILE_MOBILE_URL;
const configuredWebBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL;

export const API_BASE_URL = APP_VARIANT === 'staging'
  ? requireStagingUrl('EXPO_PUBLIC_API_BASE_URL', configuredApiBaseUrl)
  : configuredApiBaseUrl ?? defaultApiBaseUrl;

export const WEB_BASE_URL = APP_VARIANT === 'staging'
  ? requireStagingUrl('EXPO_PUBLIC_WEB_BASE_URL', configuredWebBaseUrl)
  : (configuredWebBaseUrl ?? defaultWebBaseUrl).replace(/\/$/, '');

/**
 * Public HTTPS page that hosts the Cloudflare Turnstile widget for native apps.
 * The Turnstile secret is backend-only and must never be placed in Expo config.
 */
export const TURNSTILE_MOBILE_URL =
  APP_VARIANT === 'staging'
    ? requireStagingUrl('EXPO_PUBLIC_TURNSTILE_MOBILE_URL', configuredTurnstileMobileUrl)
    : configuredTurnstileMobileUrl ?? defaultTurnstileMobileUrl;

const rawPushEnabled = process.env.EXPO_PUBLIC_PUSH_ENABLED ?? (APP_VARIANT === 'staging' ? 'false' : 'true');
if (rawPushEnabled !== 'true' && rawPushEnabled !== 'false') {
  throw new Error(`EXPO_PUBLIC_PUSH_ENABLED must be true or false, received: ${rawPushEnabled}`);
}

export const PUSH_NOTIFICATIONS_ENABLED = rawPushEnabled === 'true';

/**
 * Mobile Live visibility flag.
 *
 * Default `false` so Live stays hidden from the reviewer/App Review path while
 * still being fully built. Set EXPO_PUBLIC_LIVE_NATIVE_ENABLED="true" in the
 * build profile env to expose More → Live (e.g. for TestFlight testing).
 *
 * This only controls visibility — it never deletes the native Live code.
 */
export const LIVE_NATIVE_ENABLED =
  (process.env.EXPO_PUBLIC_LIVE_NATIVE_ENABLED ?? 'false').toLowerCase() === 'true';

/** Hide technical login diagnostics from App Review / production by default. */
export const SHOW_LOGIN_DEBUG =
  (process.env.EXPO_PUBLIC_SHOW_LOGIN_DEBUG ?? 'false').toLowerCase() === 'true';

