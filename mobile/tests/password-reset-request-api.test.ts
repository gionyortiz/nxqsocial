import { Platform } from 'react-native';
import { getNetworkStateAsync } from 'expo-network';
import { ApiError, apiRequest } from '../lib/api';
import { mobileProof } from '../lib/runtimeProof';

const idempotencyKey = 'nxq-reset-11111111-1111-4111-8111-111111111111';
const options = {
  method: 'POST' as const,
  body: { email: 'person@example.test' },
  retryNetworkErrors: false,
  passwordResetRequestRetry: true,
  idempotencyKey,
};
const response = (status: number, payload: unknown) => ({
  ok: status < 400,
  status,
  headers: { get: () => null },
  json: async () => payload,
});
const networkFailure = () => new TypeError('Network request failed');

beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'ios');
  (getNetworkStateAsync as jest.Mock).mockReset().mockResolvedValue({ type: 'CELLULAR' });
});

test('password-reset request retries one native transport failure with the same idempotency key', async () => {
  (fetch as jest.Mock)
    .mockRejectedValueOnce(networkFailure())
    .mockResolvedValueOnce(response(200, { message: 'accepted' }));

  const result = expect(apiRequest('/auth/forgot-password', options)).resolves.toEqual({ message: 'accepted' });
  await jest.runAllTimersAsync();
  await result;

  expect(fetch).toHaveBeenCalledTimes(2);
  for (const call of (fetch as jest.Mock).mock.calls) {
    expect(call[1].headers).toMatchObject({ 'Idempotency-Key': idempotencyKey });
    expect(call[1].body).toBe(JSON.stringify(options.body));
  }
});

test('a generic caller header cannot replace the validated retry key', async () => {
  (fetch as jest.Mock).mockResolvedValue(response(200, { message: 'accepted' }));

  await apiRequest('/auth/forgot-password', {
    ...options,
    headers: {
      'Idempotency-Key': 'nxq-reset-22222222-2222-4222-8222-222222222222',
    },
  });

  expect((fetch as jest.Mock).mock.calls[0][1].headers).toMatchObject({
    'Idempotency-Key': idempotencyKey,
  });
});

test.each([400, 401, 403, 409, 429, 500, 503])('never retries an HTTP %s response', async (status) => {
  (fetch as jest.Mock).mockResolvedValue(response(status, { message: 'fixture server error' }));
  await expect(apiRequest('/auth/forgot-password', options)).rejects.toBeInstanceOf(ApiError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('two native failures stop after exactly two attempts with sanitized diagnostics', async () => {
  (fetch as jest.Mock).mockRejectedValue(networkFailure());
  const result = expect(apiRequest('/auth/forgot-password', options)).rejects.toMatchObject({
    name: 'ApiNetworkError',
    classification: 'network',
    attempts: 2,
  });
  await jest.runAllTimersAsync();
  await result;

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(mobileProof).toHaveBeenCalledTimes(2);
  expect((mobileProof as jest.Mock).mock.calls[0]).toEqual([
    'auth network failure',
    {
      endpointClass: 'password_reset_request',
      classification: 'network',
      connectivityType: 'CELLULAR',
      attemptCount: 1,
    },
  ]);
  expect(JSON.stringify((mobileProof as jest.Mock).mock.calls)).not.toMatch(/person@example|nxq-reset|Network request failed/);
});

test('missing or malformed idempotency keys cannot enable mutation retries', async () => {
  for (const invalidKey of [undefined, 'predictable', 'nxq-reset-not-a-uuid']) {
    (fetch as jest.Mock).mockRejectedValueOnce(networkFailure());
    const result = expect(apiRequest('/auth/forgot-password', { ...options, idempotencyKey: invalidKey })).rejects.toThrow();
    await jest.runAllTimersAsync();
    await result;
  }
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('the password-reset retry policy cannot be enabled for another endpoint', async () => {
  (fetch as jest.Mock).mockRejectedValue(networkFailure());
  const result = expect(apiRequest('/auth/reset-password', options)).rejects.toThrow();
  await jest.runAllTimersAsync();
  await result;
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('web password-reset requests do not receive native retries', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  (fetch as jest.Mock).mockRejectedValue(networkFailure());
  const result = expect(apiRequest('/auth/forgot-password', options)).rejects.toThrow();
  await jest.runAllTimersAsync();
  await result;
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('unknown programming exceptions are not retried', async () => {
  (fetch as jest.Mock).mockRejectedValue(new Error('unexpected fixture failure'));
  const result = expect(apiRequest('/auth/forgot-password', options)).rejects.toThrow();
  await jest.runAllTimersAsync();
  await result;
  expect(fetch).toHaveBeenCalledTimes(1);
});
