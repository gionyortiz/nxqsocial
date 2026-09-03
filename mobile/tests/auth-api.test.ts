import { ApiError, apiRequest, setUnauthorizedHandler } from '../lib/api';
import { authErrorMessage } from '../lib/auth-errors';
import { mobileProof } from '../lib/runtimeProof';

const response = (status: number, message: string) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => ({ message }) });
afterEach(() => setUnauthorizedHandler(null));
test('wrong current password does not sign out a valid session', async () => {
  const logout = jest.fn(); setUnauthorizedHandler(logout);
  (fetch as jest.Mock).mockResolvedValue(response(401, 'Your current password is incorrect.'));
  await expect(apiRequest('/auth/change-password', { method: 'POST', token: 'fixture-token', body: { currentPassword: 'incorrect', newPassword: 'Fixture-Only-123' } })).rejects.toBeInstanceOf(ApiError);
  expect(logout).not.toHaveBeenCalled();
});
test('expired JWT still signs out on password change', async () => {
  const logout = jest.fn(); setUnauthorizedHandler(logout);
  (fetch as jest.Mock).mockResolvedValue(response(401, 'Unauthorized'));
  await expect(apiRequest('/auth/change-password', { method: 'POST', token: 'expired-fixture' })).rejects.toBeInstanceOf(ApiError);
  expect(logout).toHaveBeenCalledTimes(1);
});
test.each(['/auth/login', '/auth/register', '/auth/reset-password', '/auth/change-password'])('never retries %s after uncertain network failure', async (path) => {
  await expect(apiRequest(path, { method: 'POST', body: { password: 'Fixture-Only-123' } })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
test('auth failures never copy provider messages or credentials into proof logs', async () => {
  (fetch as jest.Mock).mockResolvedValue({ ...response(400, ''), json: async () => ({ message: 'secret-password-and-reset-token', code: 'secret-code-token' }) });
  await expect(apiRequest('/auth/reset-password', { method: 'POST', body: { token: 'fixture-secret' } })).rejects.toThrow();
  expect(JSON.stringify((mobileProof as jest.Mock).mock.calls)).not.toMatch(/secret-password|fixture-secret|secret-code-token/);
});
test.each([400, 401, 403, 409, 429, 500])('error mapper does not echo sensitive backend content for %s', (status) => {
  const error = new ApiError({ status, message: 'secret-password-and-token' });
  for (const action of ['login', 'register', 'forgot', 'reset', 'change'] as const) {
    expect(authErrorMessage(error, action)).not.toContain('secret-password');
  }
});

test('malformed server error codes cannot crash password error rendering', () => {
  const error = new ApiError({ status: 400, message: 'fixture-error', code: 123 as unknown as string });
  expect(authErrorMessage(error, 'reset')).toBe('We could not complete this request. Check your details and try again.');
});
