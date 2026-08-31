import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_REQUEST_BYTES = 32 * 1024;
const UPSTREAM_TIMEOUT_MS = 15_000;

function registrationEndpoint(requestUrl: string): string | null {
  const configured =
    process.env.NXQ_REGISTRATION_API_URL?.trim()
    || process.env.NEXT_PUBLIC_API_URL?.trim();
  const localOrigin = process.env.NXQ_LOCAL_API_ORIGIN?.trim() || 'http://127.0.0.1:3000';
  const base = configured || `${localOrigin.replace(/\/+$/, '')}/api`;

  try {
    const endpoint = new URL(`${base.replace(/\/+$/, '')}/auth/register`);
    const incoming = new URL(requestUrl);

    if (process.env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') return null;
    if (endpoint.origin === incoming.origin && endpoint.pathname === '/api/auth/register') return null;
    return endpoint.toString();
  } catch {
    return null;
  }
}

function unavailable(status: 503 | 504, code: string, message: string) {
  return NextResponse.json(
    { statusCode: status, code, message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { statusCode: 413, code: 'REGISTER_REQUEST_TOO_LARGE', message: 'Registration request is too large.' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { statusCode: 413, code: 'REGISTER_REQUEST_TOO_LARGE', message: 'Registration request is too large.' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
  } catch {
    return NextResponse.json(
      { statusCode: 400, code: 'REGISTER_REQUEST_INVALID', message: 'Registration request must be valid JSON.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const endpoint = registrationEndpoint(request.url);
  if (!endpoint) {
    return unavailable(503, 'REGISTER_FALLBACK_MISCONFIGURED', 'Registration is temporarily unavailable. Please try again.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: rawBody,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    const body = await upstream.text();
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    const contentType = upstream.headers.get('content-type');
    const retryAfter = upstream.headers.get('retry-after');
    if (contentType) headers.set('Content-Type', contentType);
    if (retryAfter) headers.set('Retry-After', retryAfter);

    return new Response(body, { status: upstream.status, headers });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return unavailable(504, 'REGISTER_UPSTREAM_TIMEOUT', 'Registration timed out. Please try again.');
    }
    return unavailable(503, 'REGISTER_UPSTREAM_UNAVAILABLE', 'Registration is temporarily unavailable. Please try again.');
  } finally {
    clearTimeout(timeout);
  }
}
