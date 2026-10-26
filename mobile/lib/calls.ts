import { apiRequest } from './api';

export type CallMember = {
  id: string; username: string; displayName: string; avatarUrl: string | null;
  state: 'invited' | 'joined' | 'declined' | 'left';
};
export type CallSession = {
  room: string; callerId: string; video: boolean; group: boolean;
  createdAt: number; expiresAt: number; status: 'ringing' | 'active' | 'ended';
  reason?: 'no_answer' | 'declined' | 'ended' | 'expired'; members: CallMember[];
};
export type CallInvite = {
  room: string; video: boolean; group: boolean; createdAt: number;
  caller: { username: string; displayName: string; avatarUrl?: string | null };
};

export function isFreshCallInvite(invite: CallInvite, now = Date.now()) {
  return /^(?:call-|group-|dm_)[\w-]{3,110}$/.test(invite.room)
    && Number.isFinite(invite.createdAt) && now - invite.createdAt < 45_000
    && invite.createdAt <= now + 5_000;
}

export function callEndMessage(reason?: CallSession['reason']) {
  if (reason === 'no_answer') return 'No answer. Try calling again later.';
  if (reason === 'declined') return 'The call was declined.';
  if (reason === 'expired') return 'This call reached its time limit.';
  return 'The call has ended.';
}

export async function startPrivateCall(token: string, targets: string[], video: boolean) {
  const unique = [...new Set(targets.map((s) => s.trim()).filter(Boolean))];
  if (!unique.length || unique.length > 7) throw new Error('Choose between one and seven people.');
  const config = await apiRequest<{ enabled: boolean }>('/calls/config', { token });
  if (!config.enabled) throw new Error('Calling is temporarily unavailable. Please try again later.');
  const room = `${unique.length > 1 ? 'group' : 'call'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const result = await apiRequest<{ room: string; invited: string[] }>('/calls/ring', {
    method: 'POST', token, body: { room, targets: unique, video, group: unique.length > 1 },
  });
  if (!result.invited?.length) throw new Error('No one could be invited. Please try again.');
  return result.room || room;
}
