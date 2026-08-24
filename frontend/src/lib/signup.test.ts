import { describe, expect, it } from 'vitest';
import {
  apiErrorMessage,
  buildRegisterRequest,
  deadlineAfterSeconds,
  isTerminalVerificationError,
  maskEmail,
  normalizeVerificationCode,
  parsePendingEmailVerification,
  retryAfterSeconds,
  secondsUntil,
} from './signup';

describe('signup request boundary', () => {
  it('keeps password confirmation client-only and sends affirmative consent', () => {
    const formData = {
      email: ' Person@Example.com ',
      username: 'Person.User',
      displayName: 'Person',
      password: 'Strong_Password1!',
      confirmPassword: 'Strong_Password1!',
      agreeToTerms: true,
    };
    const request = buildRegisterRequest(formData, 'turnstile-token');

    expect(request).toEqual({
      email: 'person@example.com',
      username: 'person.user',
      displayName: 'Person',
      password: 'Strong_Password1!',
      agreeToTerms: true,
      turnstileToken: 'turnstile-token',
    });
    expect(request).not.toHaveProperty('confirmPassword');
    expect(request.agreeToTerms).toBe(true);
    expect(request).not.toHaveProperty('inviteCode');
  });
});

describe('Retry-After handling', () => {
  it('treats a numeric Retry-After header as authoritative', () => {
    const error = {
      response: {
        headers: { 'retry-after': '87' },
        data: { retryAfter: 12 },
      },
    };
    expect(retryAfterSeconds(error, 600)).toBe(87);
  });

  it('accepts Axios-style header access and HTTP dates', () => {
    const now = Date.UTC(2026, 7, 21, 12, 0, 0);
    const error = {
      response: {
        headers: { get: () => new Date(now + 45_000).toUTCString() },
      },
    };
    expect(retryAfterSeconds(error, 600, now)).toBe(45);
  });

  it('falls back to a numeric body and then the route default', () => {
    expect(retryAfterSeconds({ response: { data: { retryAfterSeconds: 31 } } }, 600)).toBe(31);
    expect(retryAfterSeconds({}, 600)).toBe(600);
  });
});

describe('verification helpers', () => {
  it('restores only complete pending verification sessions', () => {
    const valid = JSON.stringify({
      verificationToken: 'pending.jwt',
      email: 'person@example.com',
      resendAvailableAt: 1234,
      verificationCodeInvalidated: true,
    });
    expect(parsePendingEmailVerification(valid)).toEqual({
      verificationToken: 'pending.jwt',
      email: 'person@example.com',
      resendAvailableAt: 1234,
      verificationCodeInvalidated: true,
    });
    expect(parsePendingEmailVerification('{broken')).toBeNull();
    expect(parsePendingEmailVerification(JSON.stringify({ email: 'person@example.com' }))).toBeNull();
  });

  it('normalizes OTP input to exactly six ASCII digits', () => {
    expect(normalizeVerificationCode(' 12a٣34-5678 ')).toBe('123456');
  });

  it('recognizes expired pending tokens without treating a bad code as terminal', () => {
    expect(isTerminalVerificationError('EMAIL_VERIFICATION_TOKEN_EXPIRED')).toBe(true);
    expect(isTerminalVerificationError('EMAIL_VERIFICATION_TOKEN_INVALID')).toBe(true);
    expect(isTerminalVerificationError('EMAIL_ALREADY_VERIFIED')).toBe(true);
    expect(isTerminalVerificationError('EMAIL_VERIFICATION_CODE_INVALID')).toBe(false);
    expect(isTerminalVerificationError('EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED')).toBe(false);
  });

  it('masks email and computes non-negative countdowns', () => {
    expect(maskEmail('person@example.com')).toBe('pe****@example.com');
    expect(secondsUntil(10_001, 1)).toBe(10);
    expect(secondsUntil(1, 10_001)).toBe(0);
    expect(deadlineAfterSeconds(10, 1)).toBe(10_001);
  });
});

describe('API error messages', () => {
  it('renders validation arrays without leaking object formatting', () => {
    const error = { response: { data: { message: ['First problem.', 'Second problem.'] } } };
    expect(apiErrorMessage(error, 'Fallback')).toBe('First problem. Second problem.');
  });
});
