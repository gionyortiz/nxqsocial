import { ConfigService } from '@nestjs/config';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    TURNSTILE_TEST_BYPASS: process.env.TURNSTILE_TEST_BYPASS,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    TURNSTILE_ALLOWED_HOSTNAMES: process.env.TURNSTILE_ALLOWED_HOSTNAMES,
  };
  const originalFetch = global.fetch;
  let service: TurnstileService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.TURNSTILE_TEST_BYPASS;
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'nxqsocial.com,www.nxqsocial.com';
    service = new TurnstileService(new ConfigService());
  });

  afterEach(() => {
    restoreEnv('NODE_ENV', original.NODE_ENV);
    restoreEnv('TURNSTILE_TEST_BYPASS', original.TURNSTILE_TEST_BYPASS);
    restoreEnv('TURNSTILE_SECRET_KEY', original.TURNSTILE_SECRET_KEY);
    restoreEnv(
      'TURNSTILE_ALLOWED_HOSTNAMES',
      original.TURNSTILE_ALLOWED_HOSTNAMES,
    );
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('accepts a successful register-action response from an allowed hostname', async () => {
    const siteverifyResult = {
      success: true,
      action: 'register',
      hostname: 'NXQSocial.com.',
    };
    let requestedUrl: string | URL | Request | undefined;
    let requestOptions: RequestInit | undefined;
    global.fetch = (
      url: string | URL | Request,
      options?: RequestInit,
    ): Promise<Response> => {
      requestedUrl = url;
      requestOptions = options;
      return Promise.resolve(new Response(JSON.stringify(siteverifyResult)));
    };

    await expect(
      service.verifySignup('widget-token', '203.0.113.10'),
    ).resolves.toBeUndefined();

    expect(requestedUrl).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
    expect(requestOptions?.method).toBe('POST');
    expect(typeof requestOptions?.body).toBe('string');
    const form = new URLSearchParams(requestOptions?.body as string);
    expect(form.get('secret')).toBe('test-secret');
    expect(form.get('response')).toBe('widget-token');
    expect(form.get('remoteip')).toBe('203.0.113.10');
  });

  it.each([
    [
      'wrong action',
      { success: true, action: 'login', hostname: 'nxqsocial.com' },
    ],
    [
      'wrong hostname',
      { success: true, action: 'register', hostname: 'evil.example' },
    ],
    [
      'provider rejection',
      { success: false, action: 'register', hostname: 'nxqsocial.com' },
    ],
    ['missing action', { success: true, hostname: 'nxqsocial.com' }],
    ['missing hostname', { success: true, action: 'register' }],
  ])(
    'rejects %s with the stable invalid-token code',
    async (_label, result) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(result),
      }) as typeof fetch;

      await expectCode(
        service.verifySignup('widget-token', '203.0.113.10'),
        400,
        'TURNSTILE_INVALID',
      );
    },
  );

  it('distinguishes a missing token from unavailable server verification', async () => {
    await expectCode(
      service.verifySignup(undefined, '203.0.113.10'),
      400,
      'TURNSTILE_REQUIRED',
    );

    delete process.env.TURNSTILE_SECRET_KEY;
    await expectCode(
      service.verifySignup('widget-token', '203.0.113.10'),
      503,
      'TURNSTILE_UNAVAILABLE',
    );
  });

  it('fails closed when Cloudflare cannot be reached', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as typeof fetch;
    await expectCode(
      service.verifySignup('widget-token', '203.0.113.10'),
      503,
      'TURNSTILE_UNAVAILABLE',
    );
  });

  it('fails closed when the hostname allowlist is missing', async () => {
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;

    await expectCode(
      service.verifySignup('widget-token', '203.0.113.10'),
      503,
      'TURNSTILE_UNAVAILABLE',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when Siteverify returns a non-success HTTP status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as typeof fetch;

    await expectCode(
      service.verifySignup('widget-token', '203.0.113.10'),
      503,
      'TURNSTILE_UNAVAILABLE',
    );
  });

  it.each([
    ['a non-object body', null],
    [
      'a non-boolean success value',
      {
        success: 'true',
        action: 'register',
        hostname: 'nxqsocial.com',
      },
    ],
    [
      'a non-string action',
      { success: true, action: 1, hostname: 'nxqsocial.com' },
    ],
    [
      'a non-string hostname',
      { success: true, action: 'register', hostname: 1 },
    ],
  ])('fails closed when Siteverify returns %s', async (_label, result) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(result),
    }) as typeof fetch;

    await expectCode(
      service.verifySignup('widget-token', '203.0.113.10'),
      503,
      'TURNSTILE_UNAVAILABLE',
    );
  });

  it('rejects an oversized token without sending it to Siteverify', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;

    await expectCode(
      service.verifySignup('x'.repeat(2049), '203.0.113.10'),
      400,
      'TURNSTILE_INVALID',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose the secret or token in a verification error', async () => {
    const token = 'private-widget-token';
    process.env.TURNSTILE_SECRET_KEY = 'private-secret-key';
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as typeof fetch;

    const response = await capturedErrorResponse(
      service.verifySignup(token, '203.0.113.10'),
    );
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(process.env.TURNSTILE_SECRET_KEY);
  });

  it('allows the explicit bypass only during tests', async () => {
    process.env.TURNSTILE_TEST_BYPASS = 'true';
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    await expect(
      service.verifySignup(undefined, 'unknown'),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.NODE_ENV = 'production';
    await expectCode(
      service.verifySignup(undefined, 'unknown'),
      400,
      'TURNSTILE_REQUIRED',
    );
  });
});

async function capturedErrorResponse(promise: Promise<void>): Promise<unknown> {
  try {
    await promise;
    throw new Error('Expected Turnstile verification to fail');
  } catch (error) {
    const exception = error as { getResponse?: () => unknown };
    return exception.getResponse?.();
  }
}

async function expectCode(
  promise: Promise<void>,
  status: number,
  code: string,
) {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    const exception = error as {
      getStatus?: () => number;
      getResponse?: () => unknown;
    };
    expect(exception.getStatus?.()).toBe(status);
    expect(exception.getResponse?.()).toMatchObject({ code });
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
