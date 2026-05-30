import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolve a media URL for rendering.
 * Absolute (http/https), blob: and data: URLs are returned unchanged.
 * Relative backend paths (e.g. /uploads/avatars/x.jpg) are prefixed with the
 * API origin so they load from the backend domain, not the frontend.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/api\/?$/, '');
  return `${apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
