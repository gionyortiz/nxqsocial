import { colors } from '@/lib/theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type ActiveLive = {
  room: string;
  title?: string | null;
  host: { username: string; displayName?: string | null };
  viewerCount?: number;
  startedAt?: string;
};

function newLiveRoom(): string {
  return `live_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function LiveScreen() {
  const { token } = useAuth();
  const [active, setActive] = useState<ActiveLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [myRoom, setMyRoom] = useState<string | null>(null);

  const HEARTBEAT_MS = 15_000;

  const openNativeHost = (room: string) => {
    router.push({ pathname: '/live-native' as any, params: { room } });
  };

  const openNativeViewer = (room: string) => {
    router.push({ pathname: '/live-native' as any, params: { room, role: 'viewer' } });
  };

  const sendHeartbeat = async (room: string) => {
    if (!token) return;
    try {
      await apiRequest(`/live/${encodeURIComponent(room)}/heartbeat`, {
        method: 'POST',
        token,
        body: { viewerCount: 0 },
      });
    } catch {
      // Keep heartbeats silent so transient network issues do not break UX.
    }
  };

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await apiRequest<ActiveLive[]>('/live/active', { token });
      setActive(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load live streams');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  useEffect(() => {
    if (!token || !myRoom) return;

    void sendHeartbeat(myRoom);
    const timer = setInterval(() => {
      void sendHeartbeat(myRoom);
    }, HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [token, myRoom]);

  const startLive = async () => {
    if (!token || starting) return;
    setStarting(true);
    try {
      const room = newLiveRoom();
      setMyRoom(room);
      setTitle('');
      // Native in-app host screen registers the session + publishes camera.
      openNativeHost(room);
      await load();
    } catch (e: any) {
      Alert.alert('Live unavailable', e?.message ?? 'Could not start live right now');
    } finally {
      setStarting(false);
    }
  };

  const endMyLive = async () => {
    if (!token || !myRoom || ending) return;
    setEnding(true);
    try {
      await apiRequest(`/live/${encodeURIComponent(myRoom)}/end`, {
        method: 'POST',
        token,
      });
      setMyRoom(null);
      Alert.alert('Live ended', 'Your live session has ended.');
      await load();
    } catch (e: any) {
      Alert.alert('End failed', e?.message ?? 'Could not end live right now');
    } finally {
      setEnding(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        >
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '900' }}>Live</Text>
          <Text style={{ color: colors.muted }}>Active broadcasts and reliable host controls.</Text>

          {myRoom ? (
            <View style={{ backgroundColor: colors.raised, borderRadius: 12, borderWidth: 1, borderColor: '#065f46', padding: 12 }}>
              <Text style={{ color: '#a7f3d0', fontWeight: '800' }}>You are LIVE</Text>
              <Text style={{ color: '#d1fae5', marginTop: 6 }}>Room: {myRoom}</Text>
              <Pressable
                onPress={endMyLive}
                disabled={ending}
                style={{ marginTop: 10, borderRadius: 10, backgroundColor: ending ? '#4b5563' : '#7f1d1d', paddingVertical: 11 }}
              >
                <Text style={{ color: colors.text, textAlign: 'center', fontWeight: '800' }}>{ending ? 'Ending…' : 'End Live'}</Text>
              </Pressable>
              <Pressable
                onPress={() => openNativeHost(myRoom)}
                style={{ marginTop: 8, borderRadius: 10, backgroundColor: '#1e3a8a', paddingVertical: 10 }}
              >
                <Text style={{ color: '#dbeafe', textAlign: 'center', fontWeight: '700' }}>Open live video</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: colors.verified, fontWeight: '800', marginBottom: 8 }}>Start a broadcast</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Live title"
              placeholderTextColor={colors.muted}
              style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.text }}
            />
            <Pressable
              onPress={startLive}
              disabled={starting || !!myRoom}
              style={{
                marginTop: 10,
                borderRadius: 10,
                backgroundColor: starting || myRoom ? '#374151' : colors.accent,
                paddingVertical: 11,
              }}
            >
              <Text style={{ color: colors.text, textAlign: 'center', fontWeight: '800' }}>
                {starting ? 'Starting…' : (myRoom ? 'Already Live' : 'Start Live')}
              </Text>
            </Pressable>
          </View>

          <Text style={{ color: colors.verified, fontWeight: '800' }}>Active now</Text>
          {error ? <Text style={{ color: '#fca5a5' }}>{error}</Text> : null}
          {!error && active.length === 0 ? <Text style={{ color: colors.muted }}>No active live broadcasts right now.</Text> : null}

          {active.map((item) => (
            <View key={item.room} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.raised }}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>{item.title || 'Live on NXQ Social'}</Text>
              <Text style={{ color: '#cbd5e1', marginTop: 4 }}>Host: @{item.host?.username || 'unknown'}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>Room: {item.room}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>Viewers: {item.viewerCount ?? 0}</Text>
              <Pressable onPress={() => openNativeViewer(item.room)} style={{ marginTop: 10, borderRadius: 10, backgroundColor: colors.raised, paddingVertical: 10 }}>
                <Text style={{ color: colors.text, textAlign: 'center', fontWeight: '700' }}>Watch live video</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
