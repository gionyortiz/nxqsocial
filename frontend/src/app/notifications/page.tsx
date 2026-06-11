'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, MessageCircle, UserPlus, AtSign, Bell, Loader2, CheckCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';

interface NotificationActor {
  id: string;
  username: string;
  verificationStatus: string;
  profile?: { displayName?: string | null; avatarUrl?: string | null } | null;
}

interface NotificationItem {
  id: string;
  type: 'FOLLOW' | 'LIKE' | 'COMMENT' | 'MENTION';
  postId?: string | null;
  commentId?: string | null;
  read: boolean;
  createdAt: string;
  actor?: NotificationActor | null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function describe(n: NotificationItem) {
  const name = n.actor?.profile?.displayName || (n.actor ? `@${n.actor.username}` : 'Someone');
  switch (n.type) {
    case 'FOLLOW': return `${name} started following you`;
    case 'LIKE': return `${name} liked your post`;
    case 'COMMENT': return `${name} commented on your post`;
    case 'MENTION': return `${name} mentioned you`;
    default: return `${name} interacted with you`;
  }
}

function typeIcon(type: NotificationItem['type']) {
  switch (type) {
    case 'LIKE': return <Heart size={14} className="text-rose-500" fill="currentColor" />;
    case 'COMMENT': return <MessageCircle size={14} className="text-blue-500" />;
    case 'FOLLOW': return <UserPlus size={14} className="text-purple-500" />;
    case 'MENTION': return <AtSign size={14} className="text-amber-500" />;
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const { data } = await api.get('/notifications');
      setItems(data.data ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await api.post('/notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    } finally {
      setMarking(false);
    }
  };

  const open = async (n: NotificationItem) => {
    if (!n.read) {
      api.post(`/notifications/${n.id}/read`).catch(() => {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.type === 'FOLLOW' && n.actor?.username) {
      router.push(`/profile/${n.actor.username}`);
    } else if (n.postId) {
      router.push('/feed');
    }
  };

  const hasUnread = items.some((n) => !n.read);

  return (
    <AppShell>
      <div className="px-3 sm:px-4 py-4 space-y-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-600">Notifications</p>
            <h1 className="mt-1 text-2xl font-black text-gray-900">Updates and activity</h1>
          </div>
          {hasUnread && (
            <button
              onClick={markAllRead}
              disabled={marking}
              className="flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:text-purple-700 disabled:opacity-50"
            >
              <CheckCheck size={16} /> Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-purple-500" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center">
            <Bell size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-gray-900">Couldn&apos;t load notifications</p>
            <p className="mt-1 text-sm text-gray-500">Please check your connection and try again.</p>
            <button
              onClick={() => { setLoading(true); load(); }}
              className="mt-4 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center">
            <Bell size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-gray-900">No notifications yet</p>
            <p className="mt-1 text-sm text-gray-500">
              When people follow you, like your posts, or comment, you&apos;ll see it here.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  n.read ? 'border-gray-100 bg-white' : 'border-purple-100 bg-purple-50/60'
                } hover:border-purple-200`}
              >
                <div className="relative shrink-0">
                  <Avatar src={n.actor?.profile?.avatarUrl ?? null} alt={n.actor?.username ?? '?'} size="sm" />
                  <span className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow">
                    {typeIcon(n.type)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 truncate">{describe(n)}</p>
                  <p className="text-xs text-gray-400">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
