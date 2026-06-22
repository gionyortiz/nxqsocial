import { API_BASE_URL } from './config';
import { Platform } from 'react-native';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
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

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
}

const NATIVE_NETWORK_RETRY_ATTEMPTS = 3;
const NATIVE_NETWORK_RETRY_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 12000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyNetworkError(error: unknown): string {
  if (!(error instanceof Error)) return `Could not connect to ${API_BASE_URL}`;
  const m = error.message.toLowerCase();
  if (m.includes('timed out') || m.includes('timeout') || error.name === 'AbortError') {
    return `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s — server may be slow or unreachable (${API_BASE_URL})`;
  }
  if (m.includes('hostname') || m.includes('host could not be found') || m.includes('dns') || m.includes('nodename nor servname')) {
    return `DNS error — cannot resolve ${API_BASE_URL}. Check your network or disable Private Relay/VPN.`;
  }
  if (m.includes('network request failed') || m.includes('fetch failed') || m.includes('load failed') || m.includes('network connection was lost')) {
    return `Network error — cannot reach ${API_BASE_URL}. Check Wi-Fi/cellular and disable iCloud Private Relay.`;
  }
  return `Could not connect to ${API_BASE_URL}: ${error.message}`;
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
  { method = 'GET', token, body, headers = {} }: ApiOptions = {},
): Promise<T> {
  let res: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= NATIVE_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
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
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const shouldRetry = (isAbort || isTransientNativeNetworkError(error)) && attempt < NATIVE_NETWORK_RETRY_ATTEMPTS;
      if (!shouldRetry) {
        throw new Error(classifyNetworkError(error));
      }

      await sleep(NATIVE_NETWORK_RETRY_DELAY_MS * attempt);
    }
  }

  if (!res) {
    throw new Error(classifyNetworkError(lastError));
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
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
  return url.startsWith('/') ? `${API_BASE_URL.replace('/api', '')}${url}` : `${API_BASE_URL.replace('/api', '')}/${url}`;
}
