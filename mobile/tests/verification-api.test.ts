import { Platform } from 'react-native';
import { getNetworkStateAsync } from 'expo-network';
import { apiRequest, ApiError } from '../lib/api';
import { mobileProof } from '../lib/runtimeProof';

const fixtureBody = { verificationToken: 'fixture-private-token', code: '123456' };
const options = { method: 'POST' as const, body: fixtureBody, retryNetworkErrors: false, verificationRetry: true };
const response = (status: number, payload: unknown) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => payload });
const networkFailure = () => new TypeError('Network request failed');

beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'ios');
  (getNetworkStateAsync as jest.Mock).mockReset().mockResolvedValue({ type: 'WIFI' });
});

test('verification retries one native network failure with the exact same request', async () => {
  (fetch as jest.Mock).mockRejectedValueOnce(networkFailure()).mockResolvedValueOnce(response(200, { verified: true }));
  const result = expect(apiRequest('/auth/verify-email', options)).resolves.toEqual({ verified: true });
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect((fetch as jest.Mock).mock.calls[0][1].body).toBe((fetch as jest.Mock).mock.calls[1][1].body);
});

test('lost success followed by EMAIL_ALREADY_VERIFIED remains a typed API result', async () => {
  (fetch as jest.Mock).mockRejectedValueOnce(networkFailure()).mockResolvedValueOnce(response(409, { code: 'EMAIL_ALREADY_VERIFIED' }));
  const result = expect(apiRequest('/auth/verify-email', options)).rejects.toMatchObject({ status: 409, code: 'EMAIL_ALREADY_VERIFIED' });
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([400, 401, 403, 409, 429, 500, 503])('never retries an HTTP %s response', async (status) => {
  (fetch as jest.Mock).mockResolvedValue(response(status, { message: 'fixture server error' }));
  await expect(apiRequest('/auth/verify-email', options)).rejects.toBeInstanceOf(ApiError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('two native failures stop after exactly two attempts and preserve only safe classification', async () => {
  (fetch as jest.Mock).mockRejectedValue(networkFailure());
  const result = expect(apiRequest('/auth/verify-email', options)).rejects.toMatchObject({ name: 'ApiNetworkError', classification: 'network', attempts: 2 });
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(mobileProof).toHaveBeenCalledTimes(2);
});

test('the request timeout is bounded and permits only one verification retry', async () => {
  (fetch as jest.Mock).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  const result = expect(apiRequest('/auth/verify-email', options)).rejects.toMatchObject({ classification: 'timeout', attempts: 2 });
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each(['/auth/resend-verification', '/auth/register', '/auth/login'])('verification policy cannot enable retries for %s', async (path) => {
  (fetch as jest.Mock).mockRejectedValue(networkFailure());
  const result = expect(apiRequest(path, options)).rejects.toThrow();
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('web verification does not get native retries', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  (fetch as jest.Mock).mockRejectedValue(networkFailure());
  const result = expect(apiRequest('/auth/verify-email', options)).rejects.toThrow();
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('resend cannot be automatically retried even if a caller explicitly opts in', async () => {
  (fetch as jest.Mock).mockRejectedValue(networkFailure());
  const result = expect(apiRequest('/auth/resend-verification', { ...options, retryNetworkErrors: true })).rejects.toThrow();
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([['Could not resolve hostname', 'dns'], ['TLS certificate verification failed', 'tls']])('recognized native failure %s is classified without retaining the raw message', async (message, classification) => {
  (fetch as jest.Mock).mockRejectedValue(new TypeError(message));
  const result = expect(apiRequest('/auth/verify-email', options)).rejects.toMatchObject({ classification, attempts: 2 });
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.stringify((mobileProof as jest.Mock).mock.calls)).not.toContain(message);
});

test('unknown programming exceptions are not retried', async () => {
  (fetch as jest.Mock).mockRejectedValue(new Error('unexpected fixture failure'));
  const result = expect(apiRequest('/auth/verify-email', options)).rejects.toThrow();
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('diagnostics never include body, token, code, URL, raw error or network identifiers', async () => {
  (getNetworkStateAsync as jest.Mock).mockResolvedValue({ type: 'WIFI', ipAddress: '192.0.2.9', ssid: 'private-fixture-ssid' });
  (fetch as jest.Mock).mockRejectedValue(new Error('Network request failed https://secret.invalid/?token=fixture-private-token 123456'));
  const result = expect(apiRequest('/auth/verify-email', options)).rejects.toThrow();
  await jest.runAllTimersAsync(); await result;
  const calls = (mobileProof as jest.Mock).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(['auth network failure', { endpointClass: 'email_verification', classification: 'network', connectivityType: 'WIFI', attemptCount: 1 }]);
  expect(JSON.stringify(calls)).not.toMatch(/fixture-private-token|123456|https:|192\.0\.2|private-fixture-ssid/);
});

test('unavailable connectivity diagnostics cannot hang verification or invent a network type', async () => {
  (getNetworkStateAsync as jest.Mock).mockReturnValue(new Promise(() => {}));
  (fetch as jest.Mock).mockRejectedValue(networkFailure());
  const result = expect(apiRequest('/auth/verify-email', options)).rejects.toThrow();
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect((mobileProof as jest.Mock).mock.calls[0][1].connectivityType).toBe('UNKNOWN');
});

test('unrecognized connectivity values are omitted from diagnostics', async () => {
  (getNetworkStateAsync as jest.Mock).mockResolvedValue({ type: 'private-provider-detail' });
  (fetch as jest.Mock).mockRejectedValue(networkFailure());
  const result = expect(apiRequest('/auth/verify-email', options)).rejects.toThrow();
  await jest.runAllTimersAsync(); await result;
  expect(JSON.stringify((mobileProof as jest.Mock).mock.calls)).not.toContain('private-provider-detail');
  expect((mobileProof as jest.Mock).mock.calls[0][1].connectivityType).toBe('UNKNOWN');
});

test('a failing native connectivity API cannot prevent the verification retry', async () => {
  (getNetworkStateAsync as jest.Mock).mockRejectedValue(new Error('private native error'));
  (fetch as jest.Mock).mockRejectedValueOnce(networkFailure()).mockResolvedValueOnce(response(200, { verified: true }));
  const result = expect(apiRequest('/auth/verify-email', options)).resolves.toEqual({ verified: true });
  await jest.runAllTimersAsync(); await result;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect((mobileProof as jest.Mock).mock.calls[0][1].connectivityType).toBe('UNKNOWN');
  expect(JSON.stringify((mobileProof as jest.Mock).mock.calls)).not.toContain('private native error');
});
