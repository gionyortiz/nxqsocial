import { colors } from '@/lib/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusedRefresh } from '@/lib/useFocusedRefresh';
import { ActivityIndicator, Alert, Animated, Image, Keyboard, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
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
  bg: colors.background,
  panel: colors.surface,
  panelAlt: colors.raised,
  border: colors.border,
  ink: colors.text,
  subInk: colors.muted,
  accent: '#21d4fd',
  accent2: colors.accent,
  unread: colors.accent,
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

function ConversationAvatar({ uri, name, size }: { uri?: string; name: string; size: number }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || 'NX';
  if (uri) {
    return (
      <Image
        accessibilityLabel={`${name} profile photo`}
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: colors.raised }}
      />
    );
  }

  return (
    <View
      accessibilityLabel={`${name} profile initials`}
      style={{
        alignItems: 'center',
        backgroundColor: '#312e81',
        borderRadius: Math.round(size * 0.3),
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      <Text style={{ color: '#ddd6fe', fontSize: Math.max(14, Math.round(size * 0.3)), fontWeight: '900' }}>
        {initials}
      </Text>
    </View>
  );
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
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const createBusy = useRef(false);
  const inboxBusy = useRef(false);
  const scope = useRef(0);
  const reveal = useRef(new Animated.Value(1)).current;

  const normalizeUsername = (value: string) => value.trim().replace(/^@+/, '');

  const loadInbox = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (inboxBusy.current) { setRefreshing(false); return; }
    inboxBusy.current = true;
    const currentScope = scope.current;
    try {
      const response = await apiRequest<{ data: ApiConversation[] }>('/messages/conversations', { token });
      if (!isCurrent() || scope.current !== currentScope) return;
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
      setInboxError(null);
    } catch {
      if (isCurrent() && scope.current === currentScope) setInboxError('Could not refresh messages. Pull down to retry.');
    } finally {
      inboxBusy.current = false;
      if (isCurrent() && scope.current === currentScope) { setLoading(false); setRefreshing(false); }
    }
  }, [token]);

  const searchUsers = async (value: string, isCurrent: () => boolean) => {
    if (!token) return;
    const q = value.trim();
    if (q.length < 2) {
      setFoundUsers([]);
      setSearchingUsers(false);
      return;
    }
    try {
      setSearchingUsers(true);
      setSearchError(null);
      const users = await apiRequest<UserResult[]>(`/users/search?q=${encodeURIComponent(q)}`, { token });
      if (isCurrent()) setFoundUsers(Array.isArray(users) ? users.slice(0, 8) : []);
    } catch {
      if (isCurrent()) { setFoundUsers([]); setSearchError('Search unavailable. Check your connection and try again.'); }
    } finally {
      if (isCurrent()) setSearchingUsers(false);
    }
  };

  useEffect(() => {
    scope.current += 1; setItems([]); setLoading(true);
    return () => { scope.current += 1; };
  }, [token]);
  useFocusedRefresh(loadInbox, 15000);

  useEffect(() => {
    let current = true;
    setFoundUsers([]); setSearchError(null); setSearchingUsers(query.trim().length >= 2);
    const timer = setTimeout(() => {
      void searchUsers(query, () => current);
    }, 260);
    return () => { current = false; clearTimeout(timer); };
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
    if (!token || createBusy.current) return;
    const username = normalizeUsername(targetUsername);
    if (!username) {
      Alert.alert('Start conversation', 'Enter a username first.');
      return;
    }

    if (user?.username && username.toLowerCase() === user.username.toLowerCase()) {
      Alert.alert('Start conversation', 'You cannot start a chat with yourself.');
      return;
    }

    createBusy.current = true;
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
      createBusy.current = false;
      setCreating(false);
    }
  };

  const createConversationForUser = async (candidate: UserResult) => {
    if (!token || createBusy.current) return;
    if (user?.username && candidate.username.toLowerCase() === user.username.toLowerCase()) {
      Alert.alert('Could not start chat', 'You cannot start a chat with yourself.');
      return;
    }
    createBusy.current = true;
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
      createBusy.current = false;
      setCreating(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => (!unreadOnly || item.unread > 0) &&
      (!q || item.name.toLowerCase().includes(q) || item.username.toLowerCase().includes(q)));
  }, [items, query, unreadOnly]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PALETTE.bg }}>
      <View style={{ position: 'absolute', top: -120, right: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: '#132548' }} />
      <View style={{ position: 'absolute', bottom: 120, left: -70, width: 210, height: 210, borderRadius: 105, backgroundColor: '#102746' }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
              <Text style={{ color: PALETTE.subInk, fontSize: 12 }}>NXQ Social</Text>
              <Text style={{ color: PALETTE.ink, fontSize: 30, fontWeight: '900', marginTop: 2 }}>Messages</Text>
              <Text style={{ color: PALETTE.subInk, marginTop: 3 }}>Keep your people close.</Text>
            </View>
            <Pressable
              accessibilityRole="button" accessibilityLabel={createOpen ? 'Close new message' : 'New message'}
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

          <Pressable accessibilityRole="button" accessibilityLabel="New voice or group video call" onPress={() => router.push('/new-call' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginTop: 12, borderRadius: 14, backgroundColor: colors.accent }}>
            <MaterialCommunityIcons name="phone-plus" size={22} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>New call · Voice, video or group</Text>
          </Pressable>

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
                  style={{ borderRadius: 10, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 9, opacity: creating ? 0.7 : 1 }}
                >
                  <Text style={{ color: colors.text, fontWeight: '800' }}>{creating ? '...' : 'Start'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="All conversations" accessibilityState={{ selected: !unreadOnly }} onPress={() => setUnreadOnly(false)} style={{ backgroundColor: !unreadOnly ? colors.accent : colors.raised, borderRadius: 24, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>All {items.length}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Unread conversations" accessibilityState={{ selected: unreadOnly }} onPress={() => setUnreadOnly(true)} style={{ backgroundColor: unreadOnly ? colors.accent : colors.raised, borderRadius: 24, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>Unread {items.filter(i => i.unread > 0).length}</Text>
            </Pressable>
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
            placeholder="Search people or messages"
            accessibilityLabel="Search conversations and people"
            returnKeyType="done" onSubmitEditing={Keyboard.dismiss}
            placeholderTextColor={PALETTE.subInk}
            style={{ flex: 1, color: PALETTE.ink, fontSize: 16 }}
          />
        </View>

        {query.trim().length >= 2 ? (
          <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: PALETTE.border, backgroundColor: PALETTE.panel, padding: 10, gap: 8 }}>
            <Text style={{ color: PALETTE.subInk, fontSize: 12, fontWeight: '800' }}>People</Text>
            {searchingUsers ? <ActivityIndicator color={PALETTE.accent} /> : null}
            {searchError ? <Text accessibilityRole="alert" style={{ color: '#fca5a5' }}>{searchError}</Text> : null}
            {!searchingUsers && !searchError && foundUsers.length === 0 ? <Text style={{ color: PALETTE.subInk }}>No users found.</Text> : null}
            {foundUsers
              .filter((candidate) => !user?.username || candidate.username.toLowerCase() !== user.username.toLowerCase())
              .map((candidate) => (
              <Pressable
                key={candidate.id}
                onPress={() => createConversationForUser(candidate)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: '#2a4368', backgroundColor: '#0d1a30', padding: 8 }}
              >
                <ConversationAvatar
                  uri={resolveMediaUrl(candidate.avatarUrl || '')}
                  name={candidate.displayName || candidate.username}
                  size={42}
                />
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
            <Text style={{ color: PALETTE.subInk, marginTop: 8 }}>Loading messages…</Text>
          </View>
        ) : null}

        {inboxError ? <Text accessibilityRole="alert" style={{ color: '#fca5a5', marginTop: 12 }}>{inboxError}</Text> : null}
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
                }}
              >
                <View>
                  <ConversationAvatar uri={item.avatar} name={item.name} size={56} />
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
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>{item.unread}</Text>
                    </View>
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#5f7cab" />
                  )}
                </View>
              </Pressable>
            </Animated.View>
          ))}

          {!loading && !inboxError && filteredItems.length === 0 ? (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: PALETTE.border, backgroundColor: PALETTE.panel, padding: 14 }}>
              <Text style={{ color: PALETTE.ink, fontWeight: '800' }}>{unreadOnly ? 'You’re all caught up' : query ? 'No matching conversations' : 'Your people, one message away'}</Text>
              <Text style={{ color: PALETTE.subInk, marginTop: 4 }}>{unreadOnly ? 'New unread conversations will appear here.' : 'Search for a username above to start a chat.'}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
