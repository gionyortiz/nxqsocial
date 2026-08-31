import axios, { type AxiosResponse } from 'axios';
import { api } from './api';
import type { RegisterRequest, RegisterResponse } from './signup';

export interface RegistrationResult {
  response: AxiosResponse<RegisterResponse>;
  usedSameOriginFallback: boolean;
}

export function isBrowserNetworkFailure(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response) return false;
  return error.code === 'ERR_NETWORK' || error.message === 'Network Error';
}

/**
 * Keep the normal direct API path as the primary route so client identity and
 * throttling behave exactly as before. If a browser/network blocks the API
 * subdomain, retry once through the frontend's same-origin server route.
 */
export async function registerWithNetworkFallback(
  request: RegisterRequest,
): Promise<RegistrationResult> {
  try {
    return {
      response: await api.post<RegisterResponse>('/auth/register', request),
      usedSameOriginFallback: false,
    };
  } catch (error) {
    if (!isBrowserNetworkFailure(error)) throw error;
  }

  return {
    response: await axios.post<RegisterResponse>('/api/auth/register', request, {
      headers: { 'Content-Type': 'application/json' },
      withCredentials: false,
      timeout: 20_000,
    }),
    usedSameOriginFallback: true,
  };
}
