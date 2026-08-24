import type { User } from '@/store/auth';

export const PENDING_EMAIL_VERIFICATION_KEY = 'nxqsocial-pending-email-verification';

export interface VerificationMetadata {
  required: boolean;
  channel: 'email';
  sent: boolean;
  expiresInMinutes: number;
  resendAfterSeconds: number;
}

export interface RegisterRequest {
  email: string;
  username: string;
  displayName: string;
  password: string;
  agreeToTerms: boolean;
  turnstileToken: string;
}

export function buildRegisterRequest(
  data: Pick<RegisterRequest, 'email' | 'username' | 'displayName' | 'password' | 'agreeToTerms'>,
  turnstileToken: string,
): RegisterRequest {
  return {
    email: data.email.trim().toLowerCase(),
    username: data.username.trim().toLowerCase(),
    displayName: data.displayName,
    password: data.password,
    agreeToTerms: data.agreeToTerms,
    turnstileToken,
  };
}

export interface RegisterResponse {
  requiresEmailVerification?: boolean;
  verification_token?: string;
  access_token?: string;
  user?: User;
  verification?: VerificationMetadata;
}

export interface VerifyEmailResponse {
  verified: true;
  channel: 'email';
  access_token: string;
  user: User;
}

export interface ResendVerificationResponse {
  sent: true;
  channel: 'email';
  expiresInMinutes: number;
  resendAfterSeconds: number;
}

export interface PendingEmailVerification {
  verificationToken: string;
  email: string;
  resendAvailableAt: number;
  verificationCodeInvalidated?: boolean;
}

interface ErrorResponseLike {
  response?: {
    data?: unknown;
    headers?: unknown;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function positiveSeconds(value: unknown): number | null {
  const seconds = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.ceil(seconds);
}

function headerValue(headers: unknown, name: string): unknown {
  const record = asRecord(headers);
  if (!record) return undefined;

  const getter = record.get;
  if (typeof getter === 'function') {
    return getter.call(headers, name);
  }

  return record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as ErrorResponseLike | null)?.response;
  const data = asRecord(response?.data);
  const message = data?.message;

  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const joined = message.filter((item): item is string => typeof item === 'string' && !!item.trim()).join(' ');
    if (joined) return joined;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function apiErrorCode(error: unknown): string | null {
  const response = (error as ErrorResponseLike | null)?.response;
  const data = asRecord(response?.data);
  return typeof data?.code === 'string' ? data.code : null;
}

export function isTerminalVerificationError(code: string | null): boolean {
  if (code === 'EMAIL_ALREADY_VERIFIED') return true;
  if (!code || !code.startsWith('EMAIL_VERIFICATION_') || code.includes('CODE')) return false;
  return code.includes('TOKEN_INVALID') || code.includes('TOKEN_EXPIRED') || code.includes('SESSION_EXPIRED');
}

export function retryAfterSeconds(error: unknown, fallback: number, now = Date.now()): number {
  const response = (error as ErrorResponseLike | null)?.response;
  const retryAfter = headerValue(response?.headers, 'retry-after');
  const numericHeader = positiveSeconds(retryAfter);
  if (numericHeader !== null) return numericHeader;

  if (typeof retryAfter === 'string') {
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt) && retryAt > now) return Math.max(1, Math.ceil((retryAt - now) / 1000));
  }

  const data = asRecord(response?.data);
  const bodySeconds = positiveSeconds(data?.retryAfter ?? data?.retryAfterSeconds);
  return bodySeconds ?? Math.max(1, Math.ceil(fallback));
}

export function parsePendingEmailVerification(raw: string | null): PendingEmailVerification | null {
  if (!raw) return null;
  try {
    const parsed = asRecord(JSON.parse(raw));
    if (
      !parsed
      || typeof parsed.verificationToken !== 'string'
      || !parsed.verificationToken.trim()
      || typeof parsed.email !== 'string'
      || !parsed.email.includes('@')
      || typeof parsed.resendAvailableAt !== 'number'
      || !Number.isFinite(parsed.resendAvailableAt)
    ) {
      return null;
    }
    return {
      verificationToken: parsed.verificationToken,
      email: parsed.email,
      resendAvailableAt: parsed.resendAvailableAt,
      verificationCodeInvalidated: parsed.verificationCodeInvalidated === true,
    };
  } catch {
    return null;
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

export function normalizeVerificationCode(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(0, 6);
}

export function secondsUntil(timestamp: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((timestamp - now) / 1000));
}

export function deadlineAfterSeconds(seconds: number, now = Date.now()): number {
  return now + Math.max(0, seconds) * 1000;
}
