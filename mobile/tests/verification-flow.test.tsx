import React from 'react';
import { Pressable, Text, Platform, ScrollView } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import VerifyEmail from '../app/verify-email';
import { AuthProvider, useAuth } from '../lib/auth';
import { storeAuthToken } from '../lib/secure-auth-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined), removeItem: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/secure-auth-storage', () => ({ USER_KEY: 'fixture-user', readStoredAuthToken: jest.fn().mockResolvedValue(null), clearStoredAuthSession: jest.fn().mockResolvedValue(undefined), storeAuthToken: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/push', () => ({ unregisterPushToken: jest.fn().mockResolvedValue(undefined) }));

const user = { id: 'fixture-user', email: 'person@example.com', username: 'fixture', displayName: 'Fixture' };
const verified = { verified: true, channel: 'email', access_token: 'fixture-session', user };
const response = (status: number, payload: unknown) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => payload });
let auth: ReturnType<typeof useAuth>;
function Harness() {
  auth = useAuth();
  return <>
    <Pressable testID="fixture-register" onPress={() => void auth.register({ email: user.email, username: user.username, displayName: user.displayName, password: 'Fixture-Only-123', turnstileToken: 'fixture-turnstile', agreeToTerms: true })}><Text>Begin</Text></Pressable>
    <Text testID="session-state">{auth.token ? 'authenticated' : 'locked'}</Text>
    <VerifyEmail />
  </>;
}
beforeEach(() => { jest.useFakeTimers(); jest.replaceProperty(Platform, 'OS', 'ios'); });
async function begin(resendAfterSeconds = 60) {
  (fetch as jest.Mock).mockResolvedValueOnce(response(200, {
    requiresEmailVerification: true, status: 'EMAIL_VERIFICATION_REQUIRED', verification_token: 'fixture-verification-token', user,
    verification: { required: true, sent: true, channel: 'email', expiresInMinutes: 10, resendAfterSeconds },
  }));
  render(<AuthProvider><Harness /></AuthProvider>);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('fixture-register'));
  await act(async () => {});
  (router.replace as jest.Mock).mockClear();
  expect(screen.getByTestId('verification-code')).toBeTruthy();
}
function submit() {
  fireEvent.changeText(screen.getByTestId('verification-code'), '123456');
  fireEvent.press(screen.getByTestId('verify-email-submit'));
}
const advance = async (ms = 1000) => { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); };
const requests = (route: string) => (fetch as jest.Mock).mock.calls.filter(([url]) => url.endsWith(route));

test('Back returns to sign in during the resend countdown without sending or verifying', async () => {
  await begin();
  const back = screen.getByRole('button', { name: 'Back to sign in' });
  expect(back).toBeEnabled();
  expect(screen.getByTestId('resend-verification-submit')).toBeDisabled();
  fireEvent.press(back);
  expect(auth.pendingVerification).toBeNull(); expect(auth.token).toBeNull();
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith('/login');
  expect(storeAuthToken).not.toHaveBeenCalled();
  expect(requests('/auth/verify-email')).toHaveLength(0);
  expect(requests('/auth/resend-verification')).toHaveLength(0);
  expect(fetch).toHaveBeenCalledTimes(1); // Only the synthetic registration fixture.
});

test('Back is in a fixed safe-area header, outside the scrolling verification form', async () => {
  await begin();
  expect(within(screen.getByTestId('verification-back-header')).getByRole('button', { name: 'Back to sign in' })).toBeTruthy();
  expect(within(screen.UNSAFE_getByType(ScrollView)).queryByRole('button', { name: 'Back to sign in' })).toBeNull();
});

test('Back cannot interrupt an active verification and becomes available after an error', async () => {
  await begin(); let finish!: (value: unknown) => void;
  (fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  submit();
  const back = screen.getByRole('button', { name: 'Back to sign in' });
  expect(back).toBeDisabled(); fireEvent.press(back);
  expect(router.replace).not.toHaveBeenCalled(); expect(auth.pendingVerification).not.toBeNull();
  await act(async () => finish(response(400, { code: 'EMAIL_VERIFICATION_CODE_INVALID' })));
  expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeEnabled();
  expect(requests('/auth/verify-email')).toHaveLength(1);
});

test('Back cannot interrupt an active resend but is available during its new cooldown', async () => {
  await begin(0); let finish!: (value: unknown) => void;
  (fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  fireEvent.press(screen.getByTestId('resend-verification-submit'));
  const back = screen.getByRole('button', { name: 'Back to sign in' });
  expect(back).toBeDisabled(); fireEvent.press(back);
  expect(router.replace).not.toHaveBeenCalled(); expect(auth.pendingVerification).not.toBeNull();
  await act(async () => finish(response(200, { sent: true, channel: 'email', expiresInMinutes: 10, resendAfterSeconds: 60 })));
  expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeEnabled();
  expect(screen.getByTestId('resend-verification-submit')).toBeDisabled();
  expect(requests('/auth/resend-verification')).toHaveLength(1);
});

test('first connection failure then verified response signs in with one retry', async () => {
  await begin();
  (fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(response(200, verified));
  submit(); await advance();
  expect(requests('/auth/verify-email')).toHaveLength(2);
  expect(storeAuthToken).toHaveBeenCalledWith('fixture-session');
  expect(auth.token).toBe('fixture-session');
  expect(router.replace).toHaveBeenCalledWith('/(tabs)/feed');
  expect(router.replace).not.toHaveBeenCalledWith('/login');
});

test('server committed but response lost: already-verified retry clears pending and goes to login, not feed', async () => {
  await begin();
  (fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(response(409, { code: 'EMAIL_ALREADY_VERIFIED' }));
  submit(); await advance();
  expect(requests('/auth/verify-email')).toHaveLength(2);
  expect(auth.pendingVerification).toBeNull();
  expect(auth.token).toBeNull();
  expect(storeAuthToken).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/login', params: { notice: 'email-already-verified' } });
  expect(router.replace).not.toHaveBeenCalledWith('/(tabs)/feed');
});

test('invalid code is not retried and the account remains locked in the client', async () => {
  await begin();
  (fetch as jest.Mock).mockResolvedValueOnce(response(400, { code: 'EMAIL_VERIFICATION_CODE_INVALID', message: 'do not echo fixture-token' }));
  submit(); await advance();
  expect(requests('/auth/verify-email')).toHaveLength(1);
  expect(screen.getByText(/That code is invalid or expired/)).toBeTruthy();
  expect(auth.pendingVerification).not.toBeNull(); expect(auth.token).toBeNull();
  expect(storeAuthToken).not.toHaveBeenCalled(); expect(router.replace).not.toHaveBeenCalled();
  expect(screen.queryByText(/do not echo/)).toBeNull();
});

test('rate limit is not retried and the server countdown is respected', async () => {
  await begin();
  (fetch as jest.Mock).mockResolvedValueOnce(response(429, { retryAfter: 3 }));
  submit(); await advance(1);
  expect(screen.getByTestId('verify-email-submit')).toBeDisabled();
  await advance(1999); expect(screen.getByTestId('verify-email-submit')).toBeDisabled();
  await advance(1000); expect(screen.getByTestId('verify-email-submit')).toBeEnabled();
  expect(requests('/auth/verify-email')).toHaveLength(1); expect(auth.token).toBeNull();
});

test('two timeouts stop and offer truthful recovery without unlocking the account', async () => {
  await begin();
  (fetch as jest.Mock).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  submit(); await advance(26_000);
  expect(requests('/auth/verify-email')).toHaveLength(2);
  expect(screen.getByText(/We couldn't confirm verification/)).toBeTruthy();
  expect(auth.token).toBeNull(); expect(auth.pendingVerification).not.toBeNull();
  expect(storeAuthToken).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('verification-return-login'));
  expect(auth.pendingVerification).toBeNull(); expect(router.replace).toHaveBeenCalledWith('/login');
});

test('double tap, keyboard submit, and resend cannot overlap verification', async () => {
  await begin(0);
  let finish!: (value: unknown) => void;
  (fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  submit(); fireEvent.press(screen.getByTestId('verify-email-submit'));
  fireEvent(screen.getByTestId('verification-code'), 'submitEditing');
  fireEvent.press(screen.getByTestId('resend-verification-submit'));
  expect(requests('/auth/verify-email')).toHaveLength(1);
  expect(requests('/auth/resend-verification')).toHaveLength(0);
  await act(async () => finish(response(200, verified)));
});

test('uncertain resend is never replayed, never claims delivery, and applies a manual cooldown', async () => {
  await begin(0);
  (fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
  fireEvent.press(screen.getByTestId('resend-verification-submit')); await advance(1);
  expect(requests('/auth/resend-verification')).toHaveLength(1);
  expect(screen.getByText(/couldn't confirm whether a new code was sent/)).toBeTruthy();
  expect(screen.queryByText(/A new code was sent/)).toBeNull();
  expect(screen.getByTestId('resend-verification-submit')).toBeDisabled();
  await advance(59_000); expect(requests('/auth/resend-verification')).toHaveLength(1);
  await advance(1000); expect(screen.getByTestId('resend-verification-submit')).toBeEnabled();
  expect(requests('/auth/resend-verification')).toHaveLength(1);
});

test('already-verified resend sends the existing account to sign in', async () => {
  await begin(0);
  (fetch as jest.Mock).mockResolvedValueOnce(response(409, { code: 'EMAIL_ALREADY_VERIFIED' }));
  fireEvent.press(screen.getByTestId('resend-verification-submit')); await advance();
  expect(requests('/auth/resend-verification')).toHaveLength(1);
  expect(auth.pendingVerification).toBeNull(); expect(auth.token).toBeNull();
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/login', params: { notice: 'email-already-verified' } });
});

test('double resend tap cannot create overlapping OTP requests', async () => {
  await begin(0); let finish!: (value: unknown) => void;
  (fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  fireEvent.press(screen.getByTestId('resend-verification-submit'));
  fireEvent.press(screen.getByTestId('resend-verification-submit'));
  expect(requests('/auth/resend-verification')).toHaveLength(1);
  await act(async () => finish(response(200, { sent: true, channel: 'email', expiresInMinutes: 10, resendAfterSeconds: 60 })));
  expect(screen.getByText(/A new code was sent/)).toBeTruthy();
  expect(screen.getByTestId('resend-verification-submit')).toBeDisabled();
});

test('late resend response cannot restore a cleared verification session', async () => {
  await begin(0); let finish!: (value: unknown) => void;
  (fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  fireEvent.press(screen.getByTestId('resend-verification-submit'));
  act(() => auth.clearPendingVerification());
  await act(async () => finish(response(200, { sent: true, channel: 'email', expiresInMinutes: 10, resendAfterSeconds: 60 })));
  expect(auth.pendingVerification).toBeNull(); expect(auth.token).toBeNull();
  expect(router.replace).toHaveBeenCalledWith('/login');
  expect(screen.queryByText(/A new code was sent/)).toBeNull();
});

test('malformed resend success never claims a code was sent', async () => {
  await begin(0);
  (fetch as jest.Mock).mockResolvedValueOnce(response(200, { sent: false }));
  fireEvent.press(screen.getByTestId('resend-verification-submit')); await advance();
  expect(screen.queryByText(/A new code was sent/)).toBeNull();
  expect(auth.token).toBeNull(); expect(requests('/auth/resend-verification')).toHaveLength(1);
});

test.each([{ verified: false }, { ...verified, access_token: '' }, { ...verified, user: { ...user, id: 'wrong-fixture-user' } }])('incomplete or mismatched success cannot create a session %#', async (payload) => {
  await begin(); (fetch as jest.Mock).mockResolvedValueOnce(response(200, payload));
  submit(); await advance();
  expect(auth.token).toBeNull(); expect(storeAuthToken).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalledWith('/(tabs)/feed');
});

test('late verification response after clearing the session cannot sign a user in', async () => {
  await begin(); let finish!: (value: unknown) => void;
  (fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  submit(); act(() => auth.clearPendingVerification());
  await act(async () => finish(response(200, verified)));
  expect(auth.token).toBeNull(); expect(storeAuthToken).not.toHaveBeenCalled();
});

test('an expired code is blocked locally without verification or resend requests', async () => {
  await begin(); await advance(601_000);
  submit(); await advance();
  expect(requests('/auth/verify-email')).toHaveLength(0);
  expect(requests('/auth/resend-verification')).toHaveLength(0);
  expect(auth.token).toBeNull();
});
