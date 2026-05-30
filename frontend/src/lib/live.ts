/**
 * Live streaming (Beta) helpers.
 *
 * Live is a one-broadcaster → many-viewers feature, distinct from 1:1/group
 * calls. It is gated separately from calls so it can be rolled out on its own.
 */

/** Build a unique room id for a live broadcast. */
export function newLiveId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `live-${Date.now().toString(36)}-${rand}`;
}

/** Link to watch / host a live room. `host` opens it in broadcaster mode. */
export function liveHref(room: string, host = false): string {
  return `/live/${encodeURIComponent(room)}${host ? '?host=1' : ''}`;
}

/**
 * Whether the Live feature should be visible to a given user.
 *
 * Shown when either:
 *  - the global flag `NEXT_PUBLIC_LIVE_ENABLED` is `'true'`, or
 *  - the current user is an ADMIN (always-on for internal testing).
 *
 * Default (flag unset/false) → admin-only, so Live stays gated until tested.
 */
export function liveVisible(role?: string): boolean {
  return process.env.NEXT_PUBLIC_LIVE_ENABLED === 'true' || role === 'ADMIN';
}
