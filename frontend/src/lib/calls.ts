import { api } from '@/lib/api';
import type { CallType } from '@/store/call';

/** Build a deterministic-ish unique room id for a call. */
export function newRoomId(prefix = 'call'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/**
 * Start a call with one or more users: rings them, then navigates the caller
 * into the room. Returns the room id.
 */
export async function startCall(opts: {
  targets: string[];
  video?: boolean;
  callType?: CallType;
  group?: boolean;
}): Promise<string> {
  const video = opts.callType ? opts.callType === 'video' : (opts.video ?? true);
  const group = opts.group ?? opts.targets.length > 1;
  const room = newRoomId(group ? 'group' : 'call');
  try {
    await api.post('/calls/ring', {
      room,
      targets: opts.targets,
      video,
      group,
    });
  } catch {
    // ringing is best-effort; the caller still joins the room
  }
  return room;
}

export function callHref(room: string, video: boolean): string {
  const type: CallType = video ? 'video' : 'voice';
  return `/call/${encodeURIComponent(room)}?type=${type}`;
}

/**
 * Whether the Call feature should be visible to a given user.
 *
 * Calls are shown when either:
 *  - the global flag `NEXT_PUBLIC_CALLS_ENABLED` is `'true'` (rollout to all
 *    users), or
 *  - the current user is an ADMIN (always-on for internal testing).
 *
 * Default (flag unset/false) → admin-only, so Round 1 stays controlled.
 */
export function callsVisible(role?: string): boolean {
  return process.env.NEXT_PUBLIC_CALLS_ENABLED === 'true' || role === 'ADMIN';
}
