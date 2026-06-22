import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { apiRequest } from '@/lib/api';

type NotificationItem = {
  id: string;
  type: 'FOLLOW' | 'LIKE' | 'COMMENT' | 'MENTION';
  read: boolean;
  createdAt: string;
  actor?: { username?: string; profile?: { displayName?: string | null } | null } | null;
};

function describeNotification(item: NotificationItem): string {
  const actorName = item.actor?.profile?.displayName || (item.actor?.username ? `@${item.actor.username}` : 'Someone');
  switch (item.type) {
    case 'FOLLOW':
      return `${actorName} started following you`;
    case 'LIKE':
      return `${actorName} liked your post`;
    case 'COMMENT':
      return `${actorName} commented on your post`;
    case 'MENTION':
      return `${actorName} mentioned you`;
    default:
      return `${actorName} interacted with your content`;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await apiRequest<{ data: NotificationItem[] }>('/notifications', { token });
      setItems(data?.data || []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const markAllRead = async () => {
    if (!token) return;
    try {
      await apiRequest('/notifications/read-all', { method: 'POST', token });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Keep UX stable even if mark-read fails.
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#8b5cf6" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#8b5cf6" />}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>Notifications</Text>
            <Pressable onPress={markAllRead} style={{ borderRadius: 10, borderWidth: 1, borderColor: '#334155', paddingVertical: 8, paddingHorizontal: 10 }}>
              <Text style={{ color: '#a5b4fc', fontWeight: '700' }}>Mark all read</Text>
            </Pressable>
          </View>

          {error ? <Text style={{ color: '#fca5a5' }}>{error}</Text> : null}

          {!error && items.length === 0 ? (
            <Text style={{ color: '#93a1bd' }}>No notifications yet.</Text>
          ) : null}

          {items.map((item) => (
            <View
              key={item.id}
              style={{
                backgroundColor: item.read ? '#111827' : '#1b1f3a',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: item.read ? '#1f2937' : '#312e81',
                padding: 12,
              }}
            >
              <Text style={{ color: '#e5e7eb', fontWeight: '700' }}>{describeNotification(item)}</Text>
              <Text style={{ color: '#93a1bd', marginTop: 6, fontSize: 12 }}>{timeAgo(item.createdAt)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
