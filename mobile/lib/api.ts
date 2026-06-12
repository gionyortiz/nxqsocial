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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNativeNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('network request failed')
    || message.includes('could not connect to the server')
    || message.includes('fetch failed')
    || message.includes('load failed')
  );
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', token, body, headers = {} }: ApiOptions = {},
): Promise<T> {
  let res: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= NATIVE_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch (error) {
      lastError = error;
      if (Platform.OS === 'web') {
        throw new Error('Network/CORS error from Expo web. For full auth testing use Expo Go on iOS/Android, or allow http://localhost:8081 in backend CORS.');
      }

      const shouldRetry = isTransientNativeNetworkError(error) && attempt < NATIVE_NETWORK_RETRY_ATTEMPTS;
      if (!shouldRetry) {
        throw new Error('Could not connect to the server. Check your connection and try again.');
      }

      await sleep(NATIVE_NETWORK_RETRY_DELAY_MS * attempt);
    }
  }

  if (!res) {
    throw (lastError instanceof Error
      ? lastError
      : new Error('Could not connect to the server. Check your connection and try again.'));
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

export function resolveMediaUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url.startsWith('/') ? `${API_BASE_URL.replace('/api', '')}${url}` : `${API_BASE_URL.replace('/api', '')}/${url}`;
}
