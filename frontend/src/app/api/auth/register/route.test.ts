import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const originalEnvironment = { ...process.env };

function registrationRequest(body: unknown) {
  return new Request('https://nxqsocial.com/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('same-origin registration route', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.nxqsocial.com/api';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnvironment };
  });

  it('forwards only the registration payload and preserves a structured API response', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ message: 'Email already exists' }),
      { status: 409, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } },
    ));
    const payload = { email: 'person@example.com', password: 'not-logged', turnstileToken: 'token' };

    const response = await POST(registrationRequest(payload));

    expect(response.status).toBe(409);
    expect(response.headers.get('retry-after')).toBe('60');
    await expect(response.json()).resolves.toEqual({ message: 'Email already exists' });
    expect(upstream).toHaveBeenCalledWith(
      'https://api.nxqsocial.com/api/auth/register',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload), redirect: 'error' }),
    );
  });

  it('returns a safe 503 response when the upstream connection fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('secret transport detail'));

    const response = await POST(registrationRequest({ email: 'person@example.com' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      statusCode: 503,
      code: 'REGISTER_UPSTREAM_UNAVAILABLE',
      message: 'Registration is temporarily unavailable. Please try again.',
    });
  });

  it('rejects oversized input before contacting the API', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    const request = new Request('https://nxqsocial.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(33 * 1024) },
      body: '{}',
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
});
