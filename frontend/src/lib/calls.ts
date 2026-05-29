import { api } from '@/lib/api';

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
  group?: boolean;
}): Promise<string> {
  const video = opts.video ?? true;
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
  return `/call/${encodeURIComponent(room)}${video ? '' : '?video=0'}`;
}
