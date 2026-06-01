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

export async function apiRequest<T>(
  path: string,
  { method = 'GET', token, body, headers = {} }: ApiOptions = {},
): Promise<T> {
  let res: Response;
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
  } catch (error) {
    if (Platform.OS === 'web') {
      throw new Error('Network/CORS error from Expo web. For full auth testing use Expo Go on iOS/Android, or allow http://localhost:8081 in backend CORS.');
    }
    throw error;
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
