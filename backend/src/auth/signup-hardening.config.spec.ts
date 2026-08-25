import {
  allowedTurnstileHostnames,
  signupHardeningEnabled,
  turnstileTestBypassEnabled,
} from './signup-hardening.config';

describe('signup hardening configuration', () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    SIGNUP_HARDENING_ENABLED: process.env.SIGNUP_HARDENING_ENABLED,
    TURNSTILE_TEST_BYPASS: process.env.TURNSTILE_TEST_BYPASS,
    TURNSTILE_ALLOWED_HOSTNAMES: process.env.TURNSTILE_ALLOWED_HOSTNAMES,
  };

  afterEach(() => {
    restoreEnv('NODE_ENV', original.NODE_ENV);
    restoreEnv('SIGNUP_HARDENING_ENABLED', original.SIGNUP_HARDENING_ENABLED);
    restoreEnv('TURNSTILE_TEST_BYPASS', original.TURNSTILE_TEST_BYPASS);
    restoreEnv(
      'TURNSTILE_ALLOWED_HOSTNAMES',
      original.TURNSTILE_ALLOWED_HOSTNAMES,
    );
  });

  it('defaults securely on in production and off outside production', () => {
    delete process.env.SIGNUP_HARDENING_ENABLED;
    process.env.NODE_ENV = 'production';
    expect(signupHardeningEnabled()).toBe(true);

    process.env.NODE_ENV = 'test';
    expect(signupHardeningEnabled()).toBe(false);
  });

  it('honors an explicit rollout-off flag in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SIGNUP_HARDENING_ENABLED = 'false';
    expect(signupHardeningEnabled()).toBe(false);
  });

  it('only permits the bypass in the test environment', () => {
    process.env.TURNSTILE_TEST_BYPASS = 'true';
    process.env.NODE_ENV = 'production';
    expect(turnstileTestBypassEnabled()).toBe(false);

    process.env.NODE_ENV = 'test';
    expect(turnstileTestBypassEnabled()).toBe(true);
  });

  it('normalizes the configured hostname allowlist', () => {
    process.env.TURNSTILE_ALLOWED_HOSTNAMES =
      ' NXQSocial.com., mobile.nxqsocial.com ';
    expect([...allowedTurnstileHostnames()]).toEqual([
      'nxqsocial.com',
      'mobile.nxqsocial.com',
    ]);
  });

  it('returns no allowed hostnames when the allowlist is not configured', () => {
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
    expect([...allowedTurnstileHostnames()]).toEqual([]);
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
