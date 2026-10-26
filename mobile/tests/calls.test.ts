import { apiRequest } from '@/lib/api';
import { callEndMessage, isFreshCallInvite, startPrivateCall } from '@/lib/calls';
jest.mock('@/lib/api', () => ({ apiRequest: jest.fn() }));
const api = apiRequest as jest.Mock;
beforeEach(() => api.mockReset());
test('does not send invitations while the provider is unavailable', async () => {
  api.mockResolvedValue({ enabled: false });
  await expect(startPrivateCall('token', ['family'], true)).rejects.toThrow('temporarily unavailable');
  expect(api).toHaveBeenCalledTimes(1);
});
test('deduplicates group targets and honors server room response', async () => {
  api.mockResolvedValueOnce({ enabled: true }).mockResolvedValueOnce({ invited: ['one', 'two'], room: 'group-server-room' });
  await expect(startPrivateCall('token', [' one ', 'two', 'one'], false)).resolves.toBe('group-server-room');
  expect(api).toHaveBeenLastCalledWith('/calls/ring', expect.objectContaining({ body: expect.objectContaining({ targets: ['one', 'two'], video: false, group: true }) }));
});
test('no targets or too many targets do not reach the network', async () => {
  await expect(startPrivateCall('token', [], true)).rejects.toThrow('Choose');
  await expect(startPrivateCall('token', Array.from({ length: 8 }, (_, i) => String(i)), true)).rejects.toThrow('Choose');
  expect(api).not.toHaveBeenCalled();
});
test('empty invitation result is not presented as ringing', async () => {
  api.mockResolvedValueOnce({ enabled: true }).mockResolvedValueOnce({ invited: [] });
  await expect(startPrivateCall('token', ['one'], true)).rejects.toThrow('No one');
});
test('stale, malformed, or future notification payloads are not accepted', () => {
  const invite = { room: 'call-family', createdAt: 100000, video: true, group: false, caller: { username: 'family', displayName: 'Family' } };
  expect(isFreshCallInvite(invite, 120000)).toBe(true);
  expect(isFreshCallInvite(invite, 145000)).toBe(false);
  expect(isFreshCallInvite(invite, 90000)).toBe(false);
  expect(isFreshCallInvite({ ...invite, room: 'live-public' }, 120000)).toBe(false);
  expect(isFreshCallInvite({ ...invite, createdAt: NaN }, 120000)).toBe(false);
});
test('explains no answer, decline, and expiry distinctly', () => {
  expect(callEndMessage('no_answer')).toContain('No answer');
  expect(callEndMessage('declined')).toContain('declined');
  expect(callEndMessage('expired')).toContain('time limit');
});
