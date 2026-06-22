import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type UserResult = {
  id: string;
  username: string;
  displayName: string;
};

type IncomingCall = {
  room?: string;
  from?: string;
  caller?: {
    username?: string;
    displayName?: string;
  };
  video?: boolean;
  group?: boolean;
};

function newRoomId(): string {
  return `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function CallScreen() {
  const { token, user } = useAuth();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [dismissedRoom, setDismissedRoom] = useState<{ room: string; until: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedUsers = useMemo(
    () => users.filter((u) => !!selected[u.username]),
    [users, selected],
  );

  const loadUsers = async (q = '') => {
    if (!token) return;
    setError(null);
    try {
      const data = await apiRequest<UserResult[]>(`/users/search?q=${encodeURIComponent(q)}`, { token });
      setUsers((Array.isArray(data) ? data : []).filter((u) => u.username !== user?.username).slice(0, 40));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load users for calls');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const pollIncoming = async () => {
    if (!token) return;
    try {
      const data = await apiRequest<IncomingCall | null>('/calls/incoming', { token });
      if (!data?.room) {
        setIncoming(null);
        return;
      }

      if (dismissedRoom && dismissedRoom.room === data.room && Date.now() < dismissedRoom.until) {
        setIncoming(null);
        return;
      }

      setIncoming(data);
    } catch {
      // incoming polling should be silent for UX stability
    }
  };

  useEffect(() => {
    loadUsers();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    pollIncoming();
    const timer = setInterval(() => {
      pollIncoming();
    }, 7000);
    return () => clearInterval(timer);
  }, [token]);

  const toggleUser = (username: string) => {
    setSelected((prev) => ({ ...prev, [username]: !prev[username] }));
  };

  const startCall = async (video: boolean) => {
    if (!token || !selectedUsers.length) return;
    setStarting(true);
    try {
      const room = newRoomId();
      await apiRequest('/calls/ring', {
        method: 'POST',
        token,
        body: {
          room,
          targets: selectedUsers.map((u) => u.username),
          video,
          group: selectedUsers.length > 1,
        },
      });
      Alert.alert('Call invite sent', 'Recipients can now receive this call invite.');
      setSelected({});
    } catch (e: any) {
      Alert.alert('Call failed', e?.message ?? 'Could not start this call');
    } finally {
      setStarting(false);
    }
  };

  const declineIncoming = async () => {
    if (!token || declining) return;
    const room = incoming?.room;
    setDeclining(true);
    try {
      await apiRequest('/calls/decline', { method: 'POST', token });
      setIncoming(null);
    } catch {
      setIncoming(null);
    } finally {
      if (room) {
        // Hide the same invite locally for its expected TTL window in case
        // network/edge consistency causes it to appear again momentarily.
        setDismissedRoom({ room, until: Date.now() + 50_000 });
      }
      setDeclining(false);
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
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadUsers(query); pollIncoming(); }} tintColor="#8b5cf6" />}
        >
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>Call</Text>
          <Text style={{ color: '#93a1bd' }}>Start call invites and monitor incoming invites.</Text>

          {incoming ? (
            <View style={{ backgroundColor: '#1f2937', borderRadius: 12, borderWidth: 1, borderColor: '#4c1d95', padding: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Incoming {incoming.video ? 'video' : 'voice'} call</Text>
              <Text style={{ color: '#c4b5fd', marginTop: 6 }}>
                From: {incoming.caller?.displayName || incoming.caller?.username || incoming.from || 'Unknown user'}
              </Text>
              <Text style={{ color: '#93a1bd', marginTop: 6 }}>Room: {incoming.room}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => Alert.alert('Incoming call received', 'Invite detected. Join UI for active media session is restricted in this build.')} style={{ flex: 1, backgroundColor: '#374151', borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>Acknowledge</Text>
                </Pressable>
                <Pressable
                  onPress={declineIncoming}
                  disabled={declining}
                  style={{
                    flex: 1,
                    backgroundColor: declining ? '#4b5563' : '#3f1d2e',
                    borderRadius: 10,
                    padding: 10,
                    opacity: declining ? 0.8 : 1,
                  }}
                >
                  <Text style={{ color: '#fda4af', fontWeight: '700', textAlign: 'center' }}>{declining ? 'Declining…' : 'Decline'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 12 }}>
              <Text style={{ color: '#cbd5e1' }}>No incoming calls at the moment.</Text>
            </View>
          )}

          <TextInput
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              void loadUsers(value);
            }}
            placeholder="Search people for call"
            placeholderTextColor="#93a1bd"
            style={{ backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff' }}
          />

          {error ? <Text style={{ color: '#fca5a5' }}>{error}</Text> : null}

          {users.map((u) => {
            const active = !!selected[u.username];
            return (
              <Pressable key={u.id} onPress={() => toggleUser(u.username)} style={{ backgroundColor: active ? '#312e81' : '#111827', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: active ? '#6366f1' : '#1f2937' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{u.displayName}</Text>
                <Text style={{ color: '#93a1bd', marginTop: 4 }}>@{u.username}</Text>
              </Pressable>
            );
          })}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Pressable
              disabled={!selectedUsers.length || starting}
              onPress={() => startCall(false)}
              style={{ flex: 1, borderRadius: 12, backgroundColor: !selectedUsers.length || starting ? '#374151' : '#166534', paddingVertical: 12 }}
            >
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Start Voice</Text>
            </Pressable>
            <Pressable
              disabled={!selectedUsers.length || starting}
              onPress={() => startCall(true)}
              style={{ flex: 1, borderRadius: 12, backgroundColor: !selectedUsers.length || starting ? '#374151' : '#4c1d95', paddingVertical: 12 }}
            >
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Start Video</Text>
            </Pressable>
          </View>

          <Text style={{ color: '#93a1bd', fontSize: 12, marginTop: 2 }}>
            Note: this build handles invite signaling. Active media room controls may be restricted depending on account and environment settings.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
