import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { apiRequest, ApiError } from '../lib/api';
import Login from '../app/login';
import Register from '../app/register';
import Forgot from '../app/forgot-password';
import Reset from '../app/reset-password';
import Change from '../app/change-password';

jest.mock('../lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), apiRequest: jest.fn() }));
jest.mock('../components/TurnstileWidget', () => {
  const { Pressable, Text } = require('react-native');
  return { TurnstileWidget: ({ onTokenChange, onStateChange }: any) => <>
    <Pressable testID="fixture-challenge" onPress={() => { onTokenChange('fixture-challenge-token'); onStateChange('verified'); }}><Text>Fixture challenge</Text></Pressable>
    <Pressable testID="fixture-challenge-expire" onPress={() => { onTokenChange(null); onStateChange('expired'); }}><Text>Expire fixture</Text></Pressable>
  </> };
});
const password = 'Fixture-Only-123';
const login = jest.fn(); const register = jest.fn();
const change = (id: string, value: string) => fireEvent.changeText(screen.getByTestId(id), value);
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
beforeEach(() => {
  (useAuth as jest.Mock).mockReturnValue({ login, register, token: 'fixture-auth-token' });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'a'.repeat(64) });
  (apiRequest as jest.Mock).mockReset().mockResolvedValue({ message: 'ok' });
  login.mockReset().mockResolvedValue('authenticated');
  register.mockReset().mockResolvedValue('email_verification_required');
});
function fillRegistration() {
  change('register-email', 'Person@Example.com'); change('register-username', 'fixture_person');
  change('register-display-name', 'Fixture Person'); change('register-password', password); change('register-confirm-password', password);
}
test('empty login credentials never reach API', () => {
  render(<Login />); press('login-submit'); expect(login).not.toHaveBeenCalled();
  change('login-email', 'person@example.com'); press('login-submit');
  expect(screen.getByText('Enter your password.')).toBeTruthy(); expect(login).not.toHaveBeenCalled();
});
test('login preserves older short passwords and whitespace, and clears on success', async () => {
  render(<Login />); change('login-email', ' Person@Example.com '); change('login-password', ' old1 '); press('login-submit');
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)/feed'));
  expect(login).toHaveBeenCalledWith('person@example.com', ' old1 ');
  expect(screen.getByTestId('login-password').props.value).toBe('');
});
test('login routes an unverified account to verification, not feed', async () => {
  login.mockResolvedValue('email_verification_required'); render(<Login />);
  change('login-email', 'person@example.com'); change('login-password', password); press('login-submit');
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/verify-email'));
});
test('login failure keeps password for correction and opens recovery', async () => {
  login.mockRejectedValue(new ApiError({ status: 401, message: 'Unauthorized' }));
  render(<Login />); change('login-email', 'person@example.com'); change('login-password', password); press('login-submit');
  await waitFor(() => expect(screen.getByText(/email or password is incorrect/)).toBeTruthy());
  expect(screen.getByTestId('login-password').props.value).toBe(password);
  press('forgot-password-link'); expect(router.push).toHaveBeenCalledWith('/forgot-password');
});
test('repeated submit never sends overlapping login requests', async () => {
  let finish!: (value: string) => void; login.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<Login />); change('login-email', 'person@example.com'); change('login-password', password);
  press('login-submit'); press('login-submit'); fireEvent(screen.getByTestId('login-password'), 'submitEditing');
  expect(login).toHaveBeenCalledTimes(1);
  await act(async () => finish('authenticated'));
});
test('registration validates password before spending the challenge', () => {
  render(<Register />); fillRegistration(); change('register-password', 'weak'); press('register-submit');
  expect(register).not.toHaveBeenCalled(); expect(screen.getByText(/Your password needs:/)).toBeTruthy();
});
test('mismatch, missing consent and missing challenge fail closed', () => {
  render(<Register />); fillRegistration(); change('register-confirm-password', password + ' '); press('register-submit');
  expect(screen.getByText(/Re-enter the same password/)).toBeTruthy();
  change('register-confirm-password', password); press('register-submit');
  expect(screen.getByText(/Agree to the Terms/)).toBeTruthy();
  press('register-terms'); press('register-submit');
  expect(screen.getByText('Complete the security check before creating your account.')).toBeTruthy();
  expect(register).not.toHaveBeenCalled();
});
test('registration submits exact password and requires verification', async () => {
  render(<Register />); fillRegistration(); press('register-terms'); press('fixture-challenge'); press('register-submit');
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/verify-email'));
  expect(register).toHaveBeenCalledWith({ email: 'person@example.com', username: 'fixture_person', displayName: 'Fixture Person', password, turnstileToken: 'fixture-challenge-token', agreeToTerms: true });
  expect(screen.getByTestId('register-password').props.value).toBe('');
});
test('expired Turnstile does not allow signup and retry stays available', () => {
  render(<Register />); fillRegistration(); press('register-terms'); press('fixture-challenge'); press('fixture-challenge-expire'); press('register-submit');
  expect(register).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Retry security check' })).toBeTruthy();
});
test('network failure consumes challenge locally without retrying registration', async () => {
  register.mockRejectedValue(new Error('Network request failed'));
  render(<Register />); fillRegistration(); press('register-terms'); press('fixture-challenge'); press('register-submit');
  await waitFor(() => expect(screen.getByText(/could not confirm the request/)).toBeTruthy());
  press('register-submit'); expect(register).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Complete the security check before creating your account.')).toBeTruthy();
});
test('forgot-password uses generic confirmation and resend cooldown', async () => {
  render(<Forgot />); change('forgot-password-email', ' Person@Example.com '); press('forgot-password-submit');
  await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
  expect(apiRequest).toHaveBeenCalledWith('/auth/forgot-password', {
    method: 'POST',
    body: { email: 'person@example.com' },
    retryNetworkErrors: false,
    passwordResetRequestRetry: true,
    idempotencyKey: 'nxq-reset-11111111-1111-4111-8111-111111111111',
  });
  expect(screen.getByText(/If person@example.com belongs/)).toBeTruthy();
  expect(screen.getByTestId('forgot-password-submit')).toBeDisabled();
});
test('forgot-password failure never claims mail was sent', async () => {
  (apiRequest as jest.Mock).mockRejectedValue(new Error('Network request failed'));
  render(<Forgot />); change('forgot-password-email', 'person@example.com'); press('forgot-password-submit');
  await waitFor(() => expect(screen.getByText(/could not confirm/)).toBeTruthy());
  expect(screen.queryByText('Check your email')).toBeNull();
});
test('rate limit countdown honors server retry and re-enables the form', async () => {
  jest.useFakeTimers();
  (apiRequest as jest.Mock).mockRejectedValue(new ApiError({ status: 429, message: 'rate limit', retryAfterSeconds: 3 }));
  render(<Forgot />); change('forgot-password-email', 'person@example.com'); press('forgot-password-submit');
  await act(async () => {});
  expect(screen.getByText('Try again in 3s')).toBeTruthy();
  act(() => jest.advanceTimersByTime(3000));
  expect(screen.getByTestId('forgot-password-submit')).toBeEnabled();
});
test.each([{}, { token: 'bad' }, { token: ['a'.repeat(64), 'b'.repeat(64)] }])('reset rejects invalid/ambiguous links %#', (params) => {
  (useLocalSearchParams as jest.Mock).mockReturnValue(params); render(<Reset />);
  expect(screen.queryByTestId('reset-password-submit')).toBeNull(); expect(apiRequest).not.toHaveBeenCalled();
});
test('reset requires matching passwords and clears both after success', async () => {
  render(<Reset />); change('reset-password-new', password); change('reset-password-confirm', password + ' '); press('reset-password-submit');
  expect(apiRequest).not.toHaveBeenCalled(); change('reset-password-confirm', password); press('reset-password-submit');
  await waitFor(() => expect(screen.getByText('Password updated')).toBeTruthy());
  expect(screen.queryByTestId('reset-password-new')).toBeNull();
  expect(apiRequest).toHaveBeenCalledWith('/auth/reset-password', { method: 'POST', body: { token: 'a'.repeat(64), password }, retryNetworkErrors: false });
});
test('expired reset link gives a clear way to request a new one', async () => {
  (apiRequest as jest.Mock).mockRejectedValue(new ApiError({ status: 401, message: 'expired' })); render(<Reset />);
  change('reset-password-new', password); change('reset-password-confirm', password); press('reset-password-submit');
  await waitFor(() => expect(screen.getByText(/expired or has already been used/)).toBeTruthy());
  fireEvent.press(screen.getByText('Request a new reset link')); expect(router.replace).toHaveBeenCalledWith('/forgot-password');
});

test('opening a different reset link clears the previous form and stale success', async () => {
  let finish!: (value: unknown) => void;
  (apiRequest as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const view = render(<Reset />);
  change('reset-password-new', password); change('reset-password-confirm', password); press('reset-password-submit');
  (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'b'.repeat(64) });
  view.rerender(<Reset />);
  expect(screen.getByTestId('reset-password-new').props.value).toBe('');
  expect(screen.getByTestId('reset-password-submit')).toBeEnabled();
  await act(async () => finish({ message: 'ok' }));
  expect(screen.queryByText('Password updated')).toBeNull();
  expect(screen.getByTestId('reset-password-new').props.value).toBe('');
});
test('change-password requires current password and rejects reusing it', () => {
  render(<Change />); press('change-password-submit'); expect(screen.getByText('Enter your current password.')).toBeTruthy();
  change('change-password-current', password); change('change-password-new', password); change('change-password-confirm', password); press('change-password-submit');
  expect(screen.getByText(/different from your current/)).toBeTruthy(); expect(apiRequest).not.toHaveBeenCalled();
});
test('change-password sends exact credentials and has a truthful success message', async () => {
  render(<Change />); change('change-password-current', ' old secret '); change('change-password-new', password); change('change-password-confirm', password); press('change-password-submit');
  await waitFor(() => expect(screen.getByText('Password changed')).toBeTruthy());
  expect(apiRequest).toHaveBeenCalledWith('/auth/change-password', { method: 'POST', token: 'fixture-auth-token', body: { currentPassword: ' old secret ', newPassword: password }, retryNetworkErrors: false });
  expect(screen.getByText(/does not sign out other devices/)).toBeTruthy(); expect(screen.queryByTestId('change-password-current')).toBeNull();
});
test('change-password fails closed without a session', () => {
  (useAuth as jest.Mock).mockReturnValue({ token: null }); render(<Change />);
  expect(screen.getByTestId('change-password-submit')).toBeDisabled(); expect(apiRequest).not.toHaveBeenCalled();
});
