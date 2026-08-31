import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { isBrowserNetworkFailure, registerWithNetworkFallback } from './registration';
import type { RegisterRequest } from './signup';

vi.mock('./api', () => ({ api: { post: vi.fn() } }));
vi.mock('axios', async (importOriginal) => {
  const original = await importOriginal<typeof import('axios')>();
  return {
    ...original,
    default: {
      ...original.default,
      isAxiosError: original.default.isAxiosError,
      post: vi.fn(),
    },
  };
});

const request: RegisterRequest = {
  email: 'person@example.com',
  username: 'person',
  displayName: 'Person',
  password: 'Strong_Password1!',
  agreeToTerms: true,
  turnstileToken: 'turnstile-token',
};

describe('registration network fallback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps a healthy registration on the direct API path', async () => {
    const response = { data: { requiresEmailVerification: true } };
    vi.mocked(api.post).mockResolvedValue(response);

    await expect(registerWithNetworkFallback(request)).resolves.toEqual({
      response,
      usedSameOriginFallback: false,
    });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('retries exactly once through same origin after an Axios network failure', async () => {
    const networkError = new axios.AxiosError('Network Error', 'ERR_NETWORK');
    const response = { data: { requiresEmailVerification: true } };
    vi.mocked(api.post).mockRejectedValue(networkError);
    vi.mocked(axios.post).mockResolvedValue(response);

    await expect(registerWithNetworkFallback(request)).resolves.toEqual({
      response,
      usedSameOriginFallback: true,
    });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith('/api/auth/register', request, expect.objectContaining({
      withCredentials: false,
    }));
  });

  it('does not hide a real API response behind the fallback', async () => {
    const responseError = new axios.AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
      data: { message: 'Email already exists' },
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
    });
    vi.mocked(api.post).mockRejectedValue(responseError);

    await expect(registerWithNetworkFallback(request)).rejects.toBe(responseError);
    expect(isBrowserNetworkFailure(responseError)).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
