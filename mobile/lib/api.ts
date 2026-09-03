import { API_BASE_URL } from './config';
import { Platform } from 'react-native';
import { mobileProof } from './runtimeProof';
import { NetworkFailureClassification, recordAuthNetworkFailure } from './network-diagnostics';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bannerUrl?: string;
  bio?: string;
  location?: string;
  website?: string;
  verificationStatus?: string;
  trustScore?: number;
}

export interface MediaAsset {
  id: string;
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
}

export interface PostItem {
  id: string;
  caption?: string;
  type: string;
  createdAt: string;
  author: User;
  media: MediaAsset[];
  isLiked: boolean;
  _count?: { likes: number; comments: number };
}

export interface StoryMedia {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}

export interface StoryItem {
  id: string;
  caption?: string | null;
  visibility: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  viewed: boolean;
  author: { id: string; username: string; displayName?: string; avatarUrl?: string | null };
  media: StoryMedia | null;
}

export interface StoryFeedAuthorGroup {
  author: { id: string; username: string; displayName?: string; avatarUrl?: string | null };
  hasUnseen: boolean;
  stories: StoryItem[];
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  retryNetworkErrors?: boolean;
  /** Restricted to native POST /auth/verify-email; at most one transport retry. */
  verificationRetry?: boolean;
}

interface ApiErrorPayload {
  statusCode?: number;
  error?: string;
  message?: string | string[];
  code?: string;
  retryAfter?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSeconds?: number;
  readonly payload?: ApiErrorPayload;

  constructor({
    status,
    message,
    code,
    retryAfterSeconds,
    payload,
  }: {
    status: number;
    message: string;
    code?: string;
    retryAfterSeconds?: number;
    payload?: ApiErrorPayload;
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.payload = payload;
  }
}

const NATIVE_NETWORK_RETRY_ATTEMPTS = 3;
const NATIVE_NETWORK_RETRY_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 12000;

export class ApiNetworkError extends Error {
  constructor(
    readonly classification: NetworkFailureClassification,
    readonly attempts: number,
  ) {
    super(classification === 'timeout'
      ? 'The connection timed out. Please try again.'
      : 'We could not complete the connection. Please try again.');
    this.name = 'ApiNetworkError';
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const deltaSeconds = Number(trimmed);
    if (Number.isSafeInteger(deltaSeconds)) return deltaSeconds;
  }

  const retryAtMs = Date.parse(trimmed);
  if (!Number.isFinite(retryAtMs)) return undefined;
  return Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
}

function apiErrorMessage(payload: ApiErrorPayload | undefined, status: number): string {
  if (Array.isArray(payload?.message)) {
    const joined = payload.message.filter((item): item is string => typeof item === 'string').join(' ');
    if (joined) return joined;
  }
  if (typeof payload?.message === 'string' && payload.message) return payload.message;
  return `Request failed (${status})`;
}

function classifyNetworkError(error: unknown): NetworkFailureClassification {
  if (!(error instanceof Error)) return 'unknown';
  const m = error.message.toLowerCase();
  if (m.includes('timed out') || m.includes('timeout') || error.name === 'AbortError') {
    return 'timeout';
  }
  if (m.includes('hostname') || m.includes('host could not be found') || m.includes('dns') || m.includes('nodename nor servname')) {
    return 'dns';
  }
  if (m.includes('ssl') || m.includes('tls') || m.includes('certificate')) return 'tls';
  if (isTransientNativeNetworkError(error)) {
    return 'network';
  }
  return 'unknown';
}

function isTransientNativeNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('network request failed')
    || message.includes('could not connect to the server')
    || message.includes('fetch failed')
    || message.includes('load failed')
    || message.includes('network connection was lost')
  );
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', token, body, headers = {}, retryNetworkErrors, verificationRetry = false }: ApiOptions = {},
): Promise<T> {
  let res: Response | null = null;
  let lastError: unknown = null;
  // Mutations are never retried implicitly: a server may commit a POST/PATCH/
  // DELETE even when the client loses the response. Callers can opt in only
  // when their operation is protected by an idempotency contract.
  const shouldRetryNetworkErrors = retryNetworkErrors ?? method === 'GET';
  const nativeVerificationRetry = verificationRetry
    && (Platform.OS === 'ios' || Platform.OS === 'android')
    && method === 'POST' && path === '/auth/verify-email';
  // A resend creates a fresh OTP: even an accidental caller opt-in must not replay it.
  const isVerificationResend = method === 'POST' && path === '/auth/resend-verification';
  const maxAttempts = isVerificationResend ? 1
    : nativeVerificationRetry ? 2 : (shouldRetryNetworkErrors ? NATIVE_NETWORK_RETRY_ATTEMPTS : 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      break;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const classification = classifyNetworkError(error);
      if (path === '/auth/verify-email' || path === '/auth/resend-verification') {
        await recordAuthNetworkFailure(
          path === '/auth/verify-email' ? 'email_verification' : 'email_verification_resend',
          classification, attempt,
        );
      }
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const retryable = nativeVerificationRetry
        ? classification !== 'unknown'
        : isAbort || isTransientNativeNetworkError(error);
      const shouldRetry = retryable && attempt < maxAttempts;
      if (!shouldRetry) {
        throw new ApiNetworkError(classification, attempt);
      }

      await sleep(NATIVE_NETWORK_RETRY_DELAY_MS * attempt);
    }
  }

  if (!res) {
    throw new ApiNetworkError(classifyNetworkError(lastError), maxAttempts);
  }

  if (!res.ok) {
    let payload: ApiErrorPayload | undefined;
    try {
      payload = await res.json() as ApiErrorPayload;
    } catch {
      // ignore
    }

    const retryAfterFromHeader = parseRetryAfter(res.headers.get('retry-after'));
    const retryAfterFromBody = typeof payload?.retryAfter === 'number' && Number.isFinite(payload.retryAfter)
      ? Math.max(0, Math.ceil(payload.retryAfter))
      : undefined;
    const retryAfterSeconds = retryAfterFromHeader ?? retryAfterFromBody;
    const message = apiErrorMessage(payload, res.status);
    // The password-change endpoint uses 401 for a wrong current password even
    // after its JWT guard passed. Preserve that valid session, not arbitrary 401s.
    const incorrectCurrentPassword = path === '/auth/change-password'
      && res.status === 401 && payload?.message === 'Your current password is incorrect.';
    if (res.status === 401 && token && !incorrectCurrentPassword) {
      unauthorizedHandler?.();
    }
    mobileProof('apiRequest failed', {
      path,
      method,
      status: res.status,
      retryAfterSeconds,
      ...(!path.startsWith('/auth/') ? { reason: message, code: payload?.code } : {}),
    });
    throw new ApiError({
      status: res.status,
      message,
      code: payload?.code,
      retryAfterSeconds,
      payload,
    });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function pingApiHealth(): Promise<{ status: string; timestamp?: string }> {
  return apiRequest<{ status: string; timestamp?: string }>('/health');
}

export function resolveMediaUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Remove only the trailing API path. A plain `.replace('/api', '')`
  // matches the hostname in `https://api.nxqsocial.com/api` first and
  // produces an invalid URL such as `https:/.nxqsocial.com/api/...`.
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, '');
  return url.startsWith('/') ? `${apiOrigin}${url}` : `${apiOrigin}/${url}`;
}
