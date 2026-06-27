import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiRequest, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Conversation = {
  id: string;
  name: string;
  username: string;
  avatar: string;
  preview: string;
  time: string;
  unread: number;
  online?: boolean;
};

type ApiConversation = {
  id: string;
  participant: {
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  } | null;
  lastMessage: {
    content: string;
    createdAt: string;
  } | null;
  unreadCount: number;
};

type UserResult = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
};

const PALETTE = {
  bg: '#060b18',
  panel: '#0b1428',
  panelAlt: '#101d34',
  border: '#203758',
  ink: '#ecf3ff',
  subInk: '#8fa7cf',
  accent: '#21d4fd',
  accent2: '#4f46e5',
  unread: '#3b82f6',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function MessagesScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<Conversation[]>([]);
  const [foundUsers, setFoundUsers] = useState<UserResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;

  const runReveal = () => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start();
  };

  const normalizeUsername = (value: string) => value.trim().replace(/^@+/, '');

  const loadInbox = async () => {
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const response = await apiRequest<{ data: ApiConversation[] }>('/messages/conversations', { token });
      const next = (response.data || []).map((conversation) => ({
        id: conversation.id,
        name: conversation.participant?.displayName || 'Unknown',
        username: conversation.participant?.username || 'unknown',
        avatar: resolveMediaUrl(conversation.participant?.avatarUrl || ''),
        preview: conversation.lastMessage?.content || 'Start conversation',
        time: conversation.lastMessage?.createdAt ? timeAgo(conversation.lastMessage.createdAt) : 'now',
        unread: conversation.unreadCount || 0,
        online: false,
      }));
      setItems(next);
      runReveal();
    } catch {
      setItems([]);
      runReveal();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const searchUsers = async (value: string) => {
    if (!token) return;
    const q = value.trim();
    if (q.length < 2) {
      setFoundUsers([]);
      setSearchingUsers(false);
      return;
    }
    try {
      setSearchingUsers(true);
      const users = await apiRequest<UserResult[]>(`/users/search?q=${encodeURIComponent(q)}`, { token });
      setFoundUsers(Array.isArray(users) ? users.slice(0, 8) : []);
    } catch {
      setFoundUsers([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(query);
    }, 260);
    return () => clearTimeout(timer);
  }, [query, token]);

  const openThread = (item: Conversation) => {
    const params = new URLSearchParams({
      name: item.name,
      avatar: item.avatar,
      username: item.username,
    });
    router.push((`/messages/${item.id}?${params.toString()}`) as never);
  };

  const createConversation = async () => {
    if (!token || creating) return;
    const username = normalizeUsername(targetUsername);
    if (!username) {
      Alert.alert('Start conversation', 'Enter a username first.');
      return;
    }

    if (user?.username && username.toLowerCase() === user.username.toLowerCase()) {
      Alert.alert('Start conversation', 'You cannot start a chat with yourself.');
      return;
    }

    try {
      setCreating(true);
      const created = await apiRequest<{ id: string }>('/messages/conversations', {
        method: 'POST',
        token,
        body: { participantUsername: username },
      });
      setCreateOpen(false);
      setTargetUsername('');
      await loadInbox();
      router.push((`/messages/${created.id}?username=${encodeURIComponent(username)}&name=${encodeURIComponent(username)}`) as never);
    } catch (error: any) {
      const message = String(error?.message || 'Please try again.');
      if (message.toLowerCase().includes('cannot message yourself')) {
        Alert.alert('Could not start chat', 'You cannot start a chat with yourself.');
      } else if (message.toLowerCase().includes('user not found')) {
        Alert.alert('Could not start chat', 'User not found. Check the username and try again.');
      } else {
        Alert.alert('Could not start chat', message);
      }
    } finally {
      setCreating(false);
    }
  };

  const createConversationForUser = async (candidate: UserResult) => {
    if (!token || creating) return;
    if (user?.username && candidate.username.toLowerCase() === user.username.toLowerCase()) {
      Alert.alert('Could not start chat', 'You cannot start a chat with yourself.');
      return;
    }
    try {
      setCreating(true);
      const created = await apiRequest<{ id: string }>('/messages/conversations', {
        method: 'POST',
        token,
        body: { participantUsername: candidate.username },
      });
      await loadInbox();
      router.push((`/messages/${created.id}?username=${encodeURIComponent(candidate.username)}&name=${encodeURIComponent(candidate.displayName || candidate.username)}&avatar=${encodeURIComponent(candidate.avatarUrl || '')}`) as never);
    } catch (error: any) {
      const message = String(error?.message || 'Please try again.');
      if (message.toLowerCase().includes('cannot message yourself')) {
        Alert.alert('Could not start chat', 'You cannot start a chat with yourself.');
      } else if (message.toLowerCase().includes('user not found')) {
        Alert.alert('Could not start chat', 'User not found. Please refresh search and try again.');
      } else {
        Alert.alert('Could not start chat', message);
      }
    } finally {
      setCreating(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      item.name.toLowerCase().includes(q) || item.username.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PALETTE.bg }}>
      <View style={{ position: 'absolute', top: -120, right: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: '#132548' }} />
      <View style={{ position: 'absolute', bottom: 120, left: -70, width: 210, height: 210, borderRadius: 105, backgroundColor: '#102746' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 26 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadInbox(); }} tintColor={PALETTE.accent} />}
      >
        <View
          style={{
            borderRadius: 20,
            backgroundColor: PALETTE.panel,
            borderWidth: 1,
            borderColor: PALETTE.border,
            padding: 14,
            overflow: 'hidden',
          }}
        >
          <View style={{ position: 'absolute', top: -40, right: -10, width: 140, height: 100, borderRadius: 50, backgroundColor: '#1a2f56' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: PALETTE.subInk, fontFamily: 'SpaceMono', fontSize: 11, letterSpacing: 1.1 }}>NXQ SIGNAL</Text>
              <Text style={{ color: PALETTE.ink, fontSize: 30, fontWeight: '900', marginTop: 2 }}>Inbox Grid</Text>
              <Text style={{ color: PALETTE.subInk, marginTop: 3 }}>Priority channels and private messages</Text>
            </View>
            <Pressable
              onPress={() => setCreateOpen((prev) => !prev)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: PALETTE.panelAlt,
                borderWidth: 1,
                borderColor: '#2a4368',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name={createOpen ? 'close' : 'square-edit-outline'} size={22} color={PALETTE.ink} />
            </Pressable>
          </View>

          {createOpen ? (
            <View style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#2a4368', backgroundColor: '#0d1a30', padding: 10, gap: 8 }}>
              <Text style={{ color: PALETTE.subInk, fontSize: 12 }}>Start with username</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={targetUsername}
                  onChangeText={setTargetUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="username"
                  placeholderTextColor={PALETTE.subInk}
                  style={{ flex: 1, color: PALETTE.ink, borderWidth: 1, borderColor: '#35547f', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}
                />
                <Pressable
                  onPress={createConversation}
                  disabled={creating}
                  style={{ borderRadius: 10, backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 9, opacity: creating ? 0.7 : 1 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{creating ? '...' : 'Start'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ backgroundColor: '#12315b', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#b7d8ff', fontWeight: '800', fontSize: 11 }}>ALL {filteredItems.length}</Text>
            </View>
            <View style={{ backgroundColor: '#0e2848', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#93c5fd', fontWeight: '800', fontSize: 11 }}>UNREAD {filteredItems.filter((i) => i.unread > 0).length}</Text>
            </View>
          </View>
        </View>

        <View
          style={{
            marginTop: 14,
            borderRadius: 16,
            backgroundColor: PALETTE.panel,
            borderWidth: 1,
            borderColor: PALETTE.border,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 8,
          }}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={PALETTE.subInk} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search users or channels"
            placeholderTextColor={PALETTE.subInk}
            style={{ flex: 1, color: PALETTE.ink, fontSize: 16 }}
          />
        </View>

        {query.trim().length >= 2 ? (
          <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: PALETTE.border, backgroundColor: PALETTE.panel, padding: 10, gap: 8 }}>
            <Text style={{ color: PALETTE.subInk, fontSize: 12, fontWeight: '800' }}>People</Text>
            {searchingUsers ? <ActivityIndicator color={PALETTE.accent} /> : null}
            {!searchingUsers && foundUsers.length === 0 ? <Text style={{ color: PALETTE.subInk }}>No users found.</Text> : null}
            {foundUsers
              .filter((candidate) => !user?.username || candidate.username.toLowerCase() !== user.username.toLowerCase())
              .map((candidate) => (
              <Pressable
                key={candidate.id}
                onPress={() => createConversationForUser(candidate)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: '#2a4368', backgroundColor: '#0d1a30', padding: 8 }}
              >
                <Image source={{ uri: resolveMediaUrl(candidate.avatarUrl || '') || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=256&q=80' }} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#1f2937' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: PALETTE.ink, fontWeight: '800' }}>{candidate.displayName || candidate.username}</Text>
                  <Text style={{ color: PALETTE.subInk, fontSize: 12 }}>@{candidate.username}</Text>
                </View>
                <MaterialCommunityIcons name="message-text-outline" size={18} color={PALETTE.ink} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {loading ? (
          <View style={{ marginTop: 18, alignItems: 'center', justifyContent: 'center', paddingVertical: 28 }}>
            <ActivityIndicator color={PALETTE.accent} />
            <Text style={{ color: PALETTE.subInk, marginTop: 8 }}>Loading channels...</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 16, gap: 10 }}>
          {filteredItems.map((item, index) => (
            <Animated.View
              key={item.id}
              style={{
                opacity: reveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
                transform: [
                  {
                    translateY: reveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [18 + index * 4, 0],
                    }),
                  },
                ],
              }}
            >
              <Pressable
                onPress={() => openThread(item)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: index % 2 === 0 ? PALETTE.panel : PALETTE.panelAlt,
                  borderWidth: 1,
                  borderColor: index % 2 === 0 ? '#284a73' : '#274c6f',
                  borderRadius: 16,
                  padding: 10,
                  marginLeft: index % 2 === 0 ? 0 : 6,
                }}
              >
                <View>
                  <Image source={{ uri: item.avatar || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=256&q=80' }} style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#1f2937' }} />
                  {item.online ? <View style={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#22c55e', borderWidth: 2, borderColor: PALETTE.bg }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: PALETTE.ink, fontSize: 19, fontWeight: '900' }}>{item.name}</Text>
                  <Text numberOfLines={1} style={{ color: PALETTE.subInk, marginTop: 2, fontSize: 14 }}>{item.preview}</Text>
                  <Text style={{ color: '#7fb0f3', marginTop: 3, fontSize: 11, fontFamily: 'SpaceMono' }}>@{item.username}</Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={{ color: '#9ec4f7', fontSize: 11, fontFamily: 'SpaceMono' }}>{item.time}</Text>
                  {item.unread > 0 ? (
                    <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: PALETTE.unread, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{item.unread}</Text>
                    </View>
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#5f7cab" />
                  )}
                </View>
              </Pressable>
            </Animated.View>
          ))}

          {!loading && filteredItems.length === 0 ? (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: PALETTE.border, backgroundColor: PALETTE.panel, padding: 14 }}>
              <Text style={{ color: PALETTE.ink, fontWeight: '800' }}>No conversations yet</Text>
              <Text style={{ color: PALETTE.subInk, marginTop: 4 }}>Use search above to find a real user and start a chat.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
