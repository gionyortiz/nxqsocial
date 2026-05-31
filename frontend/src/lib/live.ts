/**
 * Live streaming (Beta) helpers.
 *
 * Live is a one-broadcaster → many-viewers feature, distinct from 1:1/group
 * calls. It is gated separately from calls so it can be rolled out on its own.
 */
import { api } from '@/lib/api';

export interface ActiveLive {
  room: string;
  title: string | null;
  viewerCount: number;
  startedAt: string;
  host: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    verificationStatus: string;
  };
}

/** Tell the server a broadcast has started (creates the live session record). */
export async function startLiveSession(room: string, title?: string): Promise<void> {
  try {
    await api.post('/live/start', { room, title });
  } catch {
    /* best-effort: the broadcast still works without the record */
  }
}

/** Tell the server a broadcast has ended. */
export async function endLiveSession(room: string): Promise<void> {
  try {
    await api.post(`/live/${encodeURIComponent(room)}/end`);
  } catch {
    /* ignore */
  }
}

/** Host keepalive — refreshes the live record and reports the viewer count. */
export async function liveHeartbeat(room: string, viewerCount: number): Promise<void> {
  try {
    await api.post(`/live/${encodeURIComponent(room)}/heartbeat`, { viewerCount });
  } catch {
    /* ignore */
  }
}

/** Fetch all currently-live broadcasts. */
export async function fetchActiveLives(): Promise<ActiveLive[]> {
  try {
    const { data } = await api.get('/live/active');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Whether a given username is live right now (for profile badge). */
export async function fetchUserLive(username: string): Promise<{ room: string } | null> {
  try {
    const { data } = await api.get(`/live/user/${encodeURIComponent(username)}`);
    return data ?? null;
  } catch {
    return null;
  }
}

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
