import { KeyboardDoneBar, useComposerKeyboard } from '@/components/KeyboardDoneBar';
import { colors } from '@/lib/theme';
import { startPrivateCall } from '@/lib/calls';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusedRefresh } from '@/lib/useFocusedRefresh';
import { ChatMessage, mergeMessages } from '@/lib/message-history';
import { Alert, Animated, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiRequest, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pauseAllMedia } from '@/lib/mediaPlayback';
import { mobileProof } from '@/lib/runtimeProof';

type Message = {
  id: string;
  mine: boolean;
  text: string;
  time: string;
};

type ApiMessage = {
  id: string;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
  };
};

const PALETTE = {
  bg: colors.background,
  layer: colors.surface,
  panel: '#0e1a30',
  border: colors.border,
  ink: '#eef4ff',
  subInk: colors.muted,
  mine: colors.accent,
  theirs: colors.raised,
};

export default function ThreadScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const params = useLocalSearchParams<{ threadId?: string; name?: string; avatar?: string; username?: string }>();
  const [text, setText] = useState('');
  const [remoteMessages, setRemoteMessages] = useState<ChatMessage[]>([]);
  const history = useRef<ChatMessage[]>([]);
  history.current = remoteMessages;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderBusy = useRef(false);
  const loadedOlder = useRef(false);
  const scope = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const atBottom = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const keyboard = useComposerKeyboard();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendBusy = useRef(false);
  const reveal = useRef(new Animated.Value(1)).current;

  const threadId = params.threadId || 'default';
  const name = params.name || 'Conversation';
  const avatar = params.avatar ? resolveMediaUrl(params.avatar) : null;
  const username = params.username;

  useEffect(() => {
    mobileProof('Chat screen params', { threadId, name, username, avatar });
  }, [threadId, name, username, avatar]);

  useEffect(() => {
    scope.current += 1; loadedOlder.current = false; olderBusy.current = false;
    setRemoteMessages([]); setOlderCursor(null); setText(''); setLoading(true); setLoadError(null);
    return () => { scope.current += 1; };
  }, [threadId, token]);

  const loadThread = useCallback(async (isCurrent: () => boolean) => {
    if (!token || !threadId) return;
    try {
      const page = await apiRequest<{ data: ApiMessage[]; nextCursor?: string }>(`/messages/conversations/${threadId}/messages`, { token });
      if (!isCurrent()) return;
      // After a long absence, make any gap between the latest and cached history
      // reachable through Load earlier messages, even if older pages were loaded.
      const known = new Set(history.current.map(item => item.id));
      if (known.size && page.data?.length && !page.data.some(item => known.has(item.id))) loadedOlder.current = false;
      setRemoteMessages(previous => mergeMessages(previous, page.data || []));
      if (!loadedOlder.current) setOlderCursor(page.nextCursor || null);
      setLoadError(null);
      await apiRequest(`/messages/conversations/${threadId}/read`, { method: 'POST', token });
    } catch { if (isCurrent()) setLoadError('Connection interrupted. Your messages are kept here; retry to catch up.'); }
    finally { if (isCurrent()) setLoading(false); }
  }, [token, threadId]);
  useFocusedRefresh(loadThread, 8000);

  const loadOlder = async () => {
    if (!token || !olderCursor || olderBusy.current) return;
    const currentScope = scope.current;
    olderBusy.current = true; setLoadingOlder(true); atBottom.current = false;
    try {
      const page = await apiRequest<{ data: ApiMessage[]; nextCursor?: string }>(`/messages/conversations/${threadId}/messages?cursor=${encodeURIComponent(olderCursor)}`, { token });
      if (scope.current !== currentScope) return;
      setRemoteMessages(previous => mergeMessages(previous, page.data || []));
      setOlderCursor(page.nextCursor || null); loadedOlder.current = true; setLoadError(null);
    } catch { if (scope.current === currentScope) setLoadError('Could not load earlier messages. Please retry.'); }
    finally { if (scope.current === currentScope) { olderBusy.current = false; setLoadingOlder(false); } }
  };

  const messages: Message[] = useMemo(() => remoteMessages.map(item => ({
    id: item.id, mine: item.sender.id === user?.id, text: item.content,
    time: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  })), [remoteMessages, user?.id]);

  const callStarting = useRef(false);
  const startCall = async (mode: 'call' | 'video') => {
    const target = username;
    if (!token || !target || callStarting.current || target === user?.username) return;
    callStarting.current = true;
    try {
      const room = await startPrivateCall(token, [target], mode === 'video');
      pauseAllMedia();
      router.push({ pathname: '/call', params: { room } } as never);
    } catch (e) { Alert.alert('Call unavailable', e instanceof Error ? e.message : 'Please try again.'); }
    finally { callStarting.current = false; }
  };

  const sendMessage = async () => {
    if (!token || !threadId || sendBusy.current) return;
    const next = text.trim();
    if (!next) return;
    const submittedText = text;
    const currentScope = scope.current;
    sendBusy.current = true;
    setSending(true);
    setSendError(null);
    try {
      const sent = await apiRequest<ApiMessage>(`/messages/conversations/${threadId}/messages`, {
        method: 'POST',
        token,
        body: { content: next },
      });
      if (scope.current !== currentScope) return;
      atBottom.current = true;
      setRemoteMessages(prev => mergeMessages(prev, [{ ...sent, sender: sent.sender || { id: user?.id || '' } }]));
      setText((current) => current === submittedText ? '' : current);
    } catch (e) {
      if (scope.current === currentScope) setSendError(e instanceof Error ? e.message : 'Could not send. Please try again.');
    } finally { sendBusy.current = false; setSending(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PALETTE.bg }}>
      <View style={{ position: 'absolute', top: -100, right: -60, width: 230, height: 230, borderRadius: 115, backgroundColor: '#181024' }} />
      <View style={{ position: 'absolute', bottom: 160, left: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: '#14101e' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: PALETTE.border,
            backgroundColor: PALETTE.layer,
          }}
        >
          <Pressable
            accessibilityRole="button" accessibilityLabel="Back to messages"
            onPress={() => router.back()}
            style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#142640' }}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color={PALETTE.ink} />
          </Pressable>
          {avatar ? <Image source={{ uri: avatar }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised }} /> : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontWeight: '800' }}>{name.slice(0, 2).toUpperCase()}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={{ color: PALETTE.ink, fontWeight: '900', fontSize: 16 }}>{name}</Text>
            <Text style={{ color: PALETTE.subInk, fontSize: 11, fontFamily: 'SpaceMono' }}>{username ? `@${username}` : 'NXQ Social'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Start voice call" onPress={() => startCall('call')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="phone-outline" size={20} color={PALETTE.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Start video call" onPress={() => startCall('video')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="video-outline" size={20} color={PALETTE.ink} />
          </Pressable>
        </View>

        <ScrollView
          ref={scroll}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={() => { if (atBottom.current) scroll.current?.scrollToEnd({ animated: false }); }}
          scrollEventThrottle={100}
          onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; atBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80; setAwayFromBottom(!atBottom.current); }}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 14, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <View style={{ alignSelf: 'center', borderRadius: 999, backgroundColor: '#10233f', borderWidth: 1, borderColor: '#213a60', paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ color: '#a7c5f3', fontFamily: 'SpaceMono', fontSize: 10 }}>Your conversation</Text>
          </View>
          {olderCursor ? <Pressable accessibilityRole="button" disabled={loadingOlder} onPress={loadOlder} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.accent }}>{loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}</Text></Pressable> : null}
          {loading ? <Text style={{ color: colors.muted, textAlign: 'center' }}>Loading messages…</Text> : null}
          {!loading && !loadError && !messages.length ? <Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>Say hello to start your conversation.</Text> : null}
          {messages.map((msg, index) => (
            <Animated.View
              key={msg.id}
              style={{
                alignItems: msg.mine ? 'flex-end' : 'flex-start',
                opacity: reveal,
                transform: [
                  {
                    translateY: reveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12 + index * 2, 0],
                    }),
                  },
                ],
              }}
            >
              <View
                style={{
                  maxWidth: '80%',
                  borderTopLeftRadius: msg.mine ? 18 : 6,
                  borderTopRightRadius: msg.mine ? 6 : 18,
                  borderBottomLeftRadius: 18,
                  borderBottomRightRadius: 18,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: msg.mine ? PALETTE.mine : PALETTE.theirs,
                  borderWidth: msg.mine ? 0 : 1,
                  borderColor: PALETTE.border,
                }}
              >
                <Text style={{ color: PALETTE.ink, fontSize: 15 }}>{msg.text}</Text>
              </View>
              <Text style={{ color: PALETTE.subInk, fontSize: 10, marginTop: 4, fontFamily: 'SpaceMono' }}>{msg.time}</Text>
            </Animated.View>
          ))}
        </ScrollView>

        {awayFromBottom ? <Pressable accessibilityRole="button" onPress={() => { atBottom.current = true; scroll.current?.scrollToEnd({ animated: true }); }} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: colors.accent }}>Latest messages ↓</Text></Pressable> : null}
        {loadError ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading messages" onPress={() => { const current = scope.current; void loadThread(() => scope.current === current); }} style={{ padding: 12 }}><Text accessibilityRole="alert" style={{ color: '#fca5a5' }}>{loadError}</Text></Pressable> : null}

        <KeyboardDoneBar visible={keyboard.visible} onDone={keyboard.dismiss} />
        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: PALETTE.border, backgroundColor: PALETTE.layer, gap: 8 }}>
          {sendError ? <Text accessibilityRole="alert" style={{ color: '#fca5a5' }}>{sendError}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput ref={keyboard.inputRef} onFocus={keyboard.onFocus} onBlur={keyboard.onBlur}
              value={text} onChangeText={setText} placeholder="Message…" accessibilityLabel="Message"
              returnKeyType="done" onSubmitEditing={keyboard.dismiss} maxLength={2000}
              placeholderTextColor={PALETTE.subInk}
              style={{ flex: 1, color: PALETTE.ink, fontSize: 16, backgroundColor: colors.raised, borderRadius: 24, paddingHorizontal: 18, minHeight: 48 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={sending || !text.trim()} onPress={sendMessage}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: sending || !text.trim() ? 0.4 : 1 }}>
              <MaterialCommunityIcons name={sending ? 'dots-horizontal' : 'arrow-up'} size={25} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
