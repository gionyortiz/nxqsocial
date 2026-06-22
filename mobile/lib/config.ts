const defaultApiBaseUrl = 'https://api.nxqsocial.com/api';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl;

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

