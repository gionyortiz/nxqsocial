import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiRequest, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

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
  bg: '#060b18',
  layer: '#0a1326',
  panel: '#0e1a30',
  border: '#213a60',
  ink: '#eef4ff',
  subInk: '#8fa7cf',
  mine: '#2357d8',
  theirs: '#101d34',
};

export default function ThreadScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const params = useLocalSearchParams<{ threadId?: string; name?: string; avatar?: string; username?: string }>();
  const [text, setText] = useState('');
  const [remoteMessages, setRemoteMessages] = useState<Message[]>([]);
  const reveal = useRef(new Animated.Value(0)).current;

  const threadId = params.threadId || 'default';
  const name = params.name || 'Conversation';
  const avatar = params.avatar ? resolveMediaUrl(params.avatar) : 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=256&q=80';
  const username = params.username || 'user';

  const runReveal = () => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    const loadThread = async () => {
      if (!token || !threadId) return;
      try {
        const data = await apiRequest<{ data: ApiMessage[] }>(`/messages/conversations/${threadId}/messages`, { token });
        const mapped = (data.data || []).map((item) => ({
          id: item.id,
          mine: item.sender.id === user?.id,
          text: item.content,
          time: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
        setRemoteMessages(mapped);
        await apiRequest(`/messages/conversations/${threadId}/read`, { method: 'POST', token });
      } catch {
        setRemoteMessages([]);
      } finally {
        runReveal();
      }
    };

    loadThread();
  }, [threadId, token, user?.id]);

  const messages = useMemo(() => remoteMessages, [remoteMessages]);

  const sendMessage = async () => {
    if (!token || !threadId) return;
    const next = text.trim();
    if (!next) return;
    try {
      const sent = await apiRequest<ApiMessage>(`/messages/conversations/${threadId}/messages`, {
        method: 'POST',
        token,
        body: { content: next },
      });
      setRemoteMessages((prev) => [
        ...prev,
        {
          id: sent.id,
          mine: true,
          text: sent.content,
          time: new Date(sent.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setText('');
      runReveal();
    } catch {
      // Keep thread stable if send fails.
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PALETTE.bg }}>
      <View style={{ position: 'absolute', top: -100, right: -60, width: 230, height: 230, borderRadius: 115, backgroundColor: '#132548' }} />
      <View style={{ position: 'absolute', bottom: 160, left: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: '#102746' }} />
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
            onPress={() => router.back()}
            style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#142640' }}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color={PALETTE.ink} />
          </Pressable>
          <Image source={{ uri: avatar }} style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: '#1f2937' }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: PALETTE.ink, fontWeight: '900', fontSize: 16 }}>{name}</Text>
            <Text style={{ color: PALETTE.subInk, fontSize: 11, fontFamily: 'SpaceMono' }}>@{username}  ONLINE</Text>
          </View>
          <Pressable style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#12203a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#26466d' }}>
            <MaterialCommunityIcons name="phone-outline" size={20} color={PALETTE.ink} />
          </Pressable>
          <Pressable style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#12203a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#26466d' }}>
            <MaterialCommunityIcons name="video-outline" size={20} color={PALETTE.ink} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 14, gap: 10 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignSelf: 'center', borderRadius: 999, backgroundColor: '#10233f', borderWidth: 1, borderColor: '#213a60', paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ color: '#a7c5f3', fontFamily: 'SpaceMono', fontSize: 10 }}>SECURE NXQ THREAD</Text>
          </View>
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

        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1, borderTopColor: PALETTE.border, backgroundColor: PALETTE.layer }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#12203a', borderWidth: 1, borderColor: '#26466d', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="camera-outline" size={20} color={PALETTE.ink} />
            </Pressable>
            <View
              style={{
                flex: 1,
                backgroundColor: '#0f1a2f',
                borderWidth: 1,
                borderColor: PALETTE.border,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 10,
                paddingVertical: Platform.OS === 'ios' ? 10 : 6,
                gap: 6,
              }}
            >
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Message channel"
                placeholderTextColor={PALETTE.subInk}
                style={{ flex: 1, color: PALETTE.ink, fontSize: 16 }}
              />
              <Pressable>
                <MaterialCommunityIcons name="sticker-emoji" size={20} color={PALETTE.ink} />
              </Pressable>
              <Pressable onPress={sendMessage}>
                <MaterialCommunityIcons name="send" size={18} color={PALETTE.ink} />
              </Pressable>
            </View>
            <Pressable style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#12203a', borderWidth: 1, borderColor: '#26466d', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="microphone-outline" size={20} color={PALETTE.ink} />
            </Pressable>
            <Pressable style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#12203a', borderWidth: 1, borderColor: '#26466d', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="plus" size={22} color={PALETTE.ink} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
