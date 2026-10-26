import { mobileProof } from './runtimeProof';

export type NetworkFailureClassification = 'network' | 'timeout' | 'dns' | 'tls' | 'unknown';
type AuthEndpointClass = 'email_verification' | 'email_verification_resend' | 'password_reset_request';
const CONNECTIVITY_TYPES = new Set(['WIFI', 'CELLULAR', 'ETHERNET', 'BLUETOOTH', 'VPN', 'WIMAX', 'OTHER', 'NONE', 'UNKNOWN']);

/** Only a coarse connection type, never IP, SSID, identifiers or raw exceptions. */
export async function recordAuthNetworkFailure(
  endpointClass: AuthEndpointClass,
  classification: NetworkFailureClassification,
  attemptCount: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let connectivityType = 'UNKNOWN';
  try {
    // Require inside this failure boundary so a missing native module cannot
    // crash app startup or turn optional diagnostics into an auth blocker.
    const { getNetworkStateAsync } = require('expo-network') as typeof import('expo-network');
    connectivityType = await Promise.race([
      getNetworkStateAsync().then((state) =>
        typeof state.type === 'string' && CONNECTIVITY_TYPES.has(state.type) ? state.type : 'UNKNOWN',
      ).catch(() => 'UNKNOWN'),
      new Promise<string>((resolve) => { timer = setTimeout(() => resolve('UNKNOWN'), 200); }),
    ]);
  } catch {
    // Diagnostics must not change authentication behavior when the native API fails.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  try {
    mobileProof('auth network failure', { endpointClass, classification, connectivityType, attemptCount });
  } catch {
    // Logging itself is best-effort and never authorizes, retries or blocks a request.
  }
}
