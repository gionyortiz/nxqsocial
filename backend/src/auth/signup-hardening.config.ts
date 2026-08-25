const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export function signupHardeningEnabled(): boolean {
  const configured = parseBoolean(process.env.SIGNUP_HARDENING_ENABLED);
  if (configured !== undefined) return configured;
  return process.env.NODE_ENV === 'production';
}

export function turnstileTestBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'test' &&
    parseBoolean(process.env.TURNSTILE_TEST_BYPASS) === true
  );
}

export function allowedTurnstileHostnames(): Set<string> {
  const raw = process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? '';
  return new Set(
    raw
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean),
  );
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}
