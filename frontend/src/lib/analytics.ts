import { api } from './api';

type TrackOptions = {
  isPublic?: boolean;
};

const SESSION_KEY = 'nxq_analytics_session_id';

function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(SESSION_KEY, sid);
  return sid;
}

export async function trackEvent(
  name: string,
  properties?: Record<string, unknown>,
  options?: TrackOptions,
): Promise<void> {
  try {
    const payload = {
      name,
      properties,
      sessionId: getSessionId(),
    };
    if (options?.isPublic) {
      await api.post('/analytics/events/public', payload);
    } else {
      await api.post('/analytics/events', payload);
    }
  } catch {
    // Best effort only — analytics must never block UX flows.
  }
}

export async function trackFirstEvent(
  name: string,
  localKey: string,
  properties?: Record<string, unknown>,
  options?: TrackOptions,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const key = `nxq_analytics_once_${localKey}`;
  if (localStorage.getItem(key) === '1') return;
  await trackEvent(name, properties, options);
  localStorage.setItem(key, '1');
}
