import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { File, UploadType } from 'expo-file-system';
import { Track } from 'livekit-client';
import {
  LiveKitRoom,
  VideoTrack,
  useTracks,
  useParticipants,
  useLocalParticipant,
  useDataChannel,
} from '@livekit/react-native';
import { apiRequest, resolveMediaUrl } from '@/lib/api';
import { API_BASE_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';

type LiveTokenResponse = {
  token: string;
  url: string;
  room: string;
  identity: string;
};

type ChatMsg =
  | { id: string; kind: 'chat'; name: string; text: string }
  | { id: string; kind: 'photo'; name: string; url: string }
  | { id: string; kind: 'sticker'; name: string; sticker: string };

type LiveData =
  | { kind: 'chat'; id: string; name: string; text: string }
  | { kind: 'like'; id: string }
  | { kind: 'join-request'; id: string; name: string }
  | { kind: 'photo'; id: string; name: string; url: string }
  | { kind: 'sticker'; id: string; name: string; sticker: string };

const HEARTBEAT_MS = 15_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function rid() {
  return `${new Date().getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function LiveStage({
  room,
  authToken,
  isHost,
  displayName,
  initialMode,
  onClose,
}: {
  room: string;
  authToken: string | null;
  isHost: boolean;
  displayName: string;
  initialMode: 'call' | 'video';
  onClose: () => void;
}) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], {
    onlySubscribed: false,
  });
  const published = cameraTracks.filter((t) => !!t.publication);
  const hostTrack = published.find((t) => !t.participant?.isLocal) ?? published[0];
  const viewers = Math.max(0, participants.length - 1);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [likeBurst, setLikeBurst] = useState(0);
  const [camOn, setCamOn] = useState(initialMode === 'video');
  const [roomMode, setRoomMode] = useState<'call' | 'video'>(initialMode);
  const [requested, setRequested] = useState(false);
  const listRef = useRef<FlatList<ChatMsg>>(null);

  const pushMessage = (message: ChatMsg) => {
    setMessages((prev) => [...prev, message].slice(-60));
  };

  const onData = useCallback((msg: { payload: Uint8Array }) => {
    let evt: LiveData;
    try {
      evt = JSON.parse(decoder.decode(msg.payload)) as LiveData;
    } catch {
      return;
    }
    if (evt.kind === 'chat') {
      pushMessage({ id: evt.id, kind: 'chat', name: evt.name, text: evt.text });
    } else if (evt.kind === 'photo') {
      pushMessage({ id: evt.id, kind: 'photo', name: evt.name, url: evt.url });
    } else if (evt.kind === 'sticker') {
      pushMessage({ id: evt.id, kind: 'sticker', name: evt.name, sticker: evt.sticker });
    } else if (evt.kind === 'like') {
      setLikeBurst((n) => n + 1);
      setTimeout(() => setLikeBurst((n) => Math.max(0, n - 1)), 1500);
    }
  }, []);

  const { send } = useDataChannel(onData);

  const broadcast = useCallback(
    (evt: LiveData) => {
      try {
        void send(encoder.encode(JSON.stringify(evt)), { reliable: true });
      } catch {
        // ignore transient send failures
      }
    },
    [send],
  );

  useEffect(() => {
    if (!isHost || !authToken) return;
    let stopped = false;
    const beat = async () => {
      if (stopped) return;
      try {
        await apiRequest(`/live/${encodeURIComponent(room)}/heartbeat`, {
          method: 'POST',
          token: authToken,
          body: { viewerCount: viewers },
        });
      } catch {
        // keep alive on transient errors
      }
    };
    void beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [isHost, authToken, room, viewers]);

  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    const evt: LiveData = { kind: 'chat', id: rid(), name: displayName, text: text.slice(0, 240) };
    pushMessage({ id: evt.id, kind: 'chat', name: evt.name, text: evt.text });
    broadcast(evt);
    setDraft('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const sendSticker = (sticker: string) => {
    const evt: LiveData = { kind: 'sticker', id: rid(), name: displayName, sticker };
    pushMessage({ id: evt.id, kind: 'sticker', name: evt.name, sticker: evt.sticker });
    broadcast(evt);
  };

  const sendPhoto = async () => {
    if (!authToken) return;
    const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perms.granted) {
      Alert.alert('Permission needed', 'Enable photo library access to send a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    const file = new File(asset.uri);

    try {
      const createUploadRes = await fetch(`${API_BASE_URL}/media/create-upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mimeType, size: asset.fileSize ?? file.size ?? 0 }),
      });

      if (!createUploadRes.ok) {
        const message = await createUploadRes.text();
        throw new Error(message || `Could not prepare photo upload (${createUploadRes.status})`);
      }

      const uploadTarget = await createUploadRes.json() as { uploadUrl: string; mediaId: string };
      await file.upload(uploadTarget.uploadUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        mimeType,
        headers: { 'Content-Type': mimeType },
        sessionType: 'foreground',
      });

      const completeRes = await fetch(`${API_BASE_URL}/media/complete-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mediaId: uploadTarget.mediaId }),
      });

      if (!completeRes.ok) {
        const message = await completeRes.text();
        throw new Error(message || `Could not finalize photo upload (${completeRes.status})`);
      }

      const completeJson = await completeRes.json() as { url?: string | null };
      const url = completeJson.url || asset.uri;
      const evt: LiveData = { kind: 'photo', id: rid(), name: displayName, url };
      pushMessage({ id: evt.id, kind: 'photo', name: evt.name, url: evt.url });
      broadcast(evt);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      Alert.alert('Photo failed', e?.message ?? 'Could not send photo right now.');
    }
  };

  const pickSticker = () => {
    Alert.alert('Send sticker', 'Choose a sticker to send in chat.', [
      { text: '🔥', onPress: () => sendSticker('🔥') },
      { text: '❤️', onPress: () => sendSticker('❤️') },
      { text: '👏', onPress: () => sendSticker('👏') },
      { text: '😂', onPress: () => sendSticker('😂') },
      { text: '🙌', onPress: () => sendSticker('🙌') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const sendLike = () => {
    setLikeBurst((n) => n + 1);
    setTimeout(() => setLikeBurst((n) => Math.max(0, n - 1)), 1500);
    broadcast({ kind: 'like', id: rid() });
  };

  const requestJoin = async () => {
    if (requested || !authToken) return;
    setRequested(true);
    try {
      await apiRequest(`/live/${encodeURIComponent(room)}/guest-request`, {
        method: 'POST',
        token: authToken,
        body: { displayName },
      });
    } catch {
      // still show requested state; host may receive via data channel
    }
    broadcast({ kind: 'join-request', id: rid(), name: displayName });
  };

  const toggleCam = async () => {
    const next = !camOn;
    setCamOn(next);
    try {
      await localParticipant?.setCameraEnabled(next);
    } catch {
      setCamOn(!next);
    }
  };

  return (
    <View style={styles.stage}>
      {hostTrack ? (
        <VideoTrack trackRef={hostTrack as never} style={styles.video} />
      ) : (
        <View style={[styles.video, styles.center]}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.dim}>{isHost ? 'Starting camera...' : 'Waiting for broadcaster...'}</Text>
        </View>
      )}

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topRow}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.viewerPill}>
            <Text style={styles.viewerText}>👁 {viewers}</Text>
          </View>
          <Pressable
            onPress={() => {
              setRoomMode('call');
              if (camOn) {
                void toggleCam();
              }
            }}
            style={[styles.modeBtn, roomMode === 'call' && styles.modeBtnActive]}
          >
            <Text style={styles.modeBtnText}>Call</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setRoomMode('video');
              if (!camOn) void toggleCam();
            }}
            style={[styles.modeBtn, roomMode === 'video' && styles.modeBtnActive]}
          >
            <Text style={styles.modeBtnText}>Video</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} style={styles.endBtn}>
            <Text style={styles.endText}>{isHost ? 'End' : 'Leave'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {likeBurst > 0 && (
        <View style={styles.likeBurst} pointerEvents="none">
          <Text style={styles.likeBurstText}>❤️</Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomWrap}
      >
        <SafeAreaView pointerEvents="box-none">
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            style={styles.chatList}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}
            renderItem={({ item }) => (
              <View style={styles.chatBubble}>
                <Text style={styles.chatName}>{item.name} </Text>
                {item.kind === 'chat' ? <Text style={styles.chatText}>{item.text}</Text> : null}
                {item.kind === 'photo' ? <Image source={{ uri: resolveMediaUrl(item.url) }} style={styles.photoPreview} resizeMode="cover" /> : null}
                {item.kind === 'sticker' ? <Text style={styles.stickerText}>{item.sticker}</Text> : null}
              </View>
            )}
          />

          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={sendChat}
              placeholder="Add a comment..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={styles.input}
              returnKeyType="send"
            />

            <Pressable onPress={sendLike} style={styles.actionBtn}>
              <Text style={styles.actionEmoji}>🎤</Text>
            </Pressable>

            <Pressable onPress={sendPhoto} style={styles.actionBtn}>
              <Text style={styles.actionEmoji}>🖼️</Text>
            </Pressable>

            <Pressable onPress={pickSticker} style={styles.actionBtn}>
              <Text style={styles.actionEmoji}>✨</Text>
            </Pressable>

            {!isHost && (
              <Pressable onPress={requestJoin} style={[styles.actionBtn, requested && styles.actionBtnMuted]}>
                <Text style={styles.actionEmoji}>{requested ? '⏳' : '🙋'}</Text>
              </Pressable>
            )}

            <Pressable onPress={sendLike} style={styles.likeBtn}>
              <Text style={styles.actionEmoji}>❤️</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function NativeLiveScreen() {
  const { token: authToken, user } = useAuth();
  const params = useLocalSearchParams<{ room?: string; role?: string; mode?: string }>();
  const room = typeof params.room === 'string' ? params.room : '';
  const isHost = params.role !== 'viewer';
  const initialMode: 'call' | 'video' = params.mode === 'call' ? 'call' : 'video';
  const displayName = user?.displayName || user?.username || 'Guest';

  const [creds, setCreds] = useState<LiveTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (!authToken || !room) return;
      setLoading(true);
      setError(null);
      try {
        if (isHost) {
          await apiRequest('/live/start', {
            method: 'POST',
            token: authToken,
            body: { room, title: 'Live on NXQ Social' },
          });
        }
        const data = await apiRequest<LiveTokenResponse>('/calls/token', {
          method: 'POST',
          token: authToken,
          body: { room, video: isHost && initialMode === 'video', host: isHost },
        });
        if (!data?.token || !data?.url) {
          throw new Error('Live video is not configured yet.');
        }
        setCreds(data);
      } catch (e: any) {
        setError(e?.message ?? 'Could not start live.');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [authToken, room, isHost, initialMode]);

  const closeLive = async () => {
    if (isHost && authToken && room) {
      try {
        await apiRequest(`/live/${encodeURIComponent(room)}/end`, { method: 'POST', token: authToken });
      } catch {
        // best effort
      }
    } else if (authToken && room) {
      try {
        await apiRequest(`/live/${encodeURIComponent(room)}/guest-leave`, { method: 'POST', token: authToken });
      } catch {
        // best effort
      }
    }
    router.back();
  };

  if (!room) {
    return (
      <SafeAreaView style={[styles.fill, styles.center]}>
        <Text style={styles.title}>Missing live room</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
          <Text style={styles.primaryText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.fill, styles.center]}>
        <ActivityIndicator color="#8b5cf6" />
        <Text style={styles.dim}>{isHost ? 'Starting your live...' : 'Joining live...'}</Text>
      </SafeAreaView>
    );
  }

  if (error || !creds) {
    return (
      <SafeAreaView style={[styles.fill, styles.center]}>
        <Text style={styles.title}>Live unavailable</Text>
        <Text style={styles.errorText}>{error || 'Could not start live.'}</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
          <Text style={styles.primaryText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.fill}>
      <LiveKitRoom
        serverUrl={creds.url}
        token={creds.token}
        connect
        audio={isHost}
        video={isHost && initialMode === 'video'}
        options={{ adaptiveStream: true }}
        onError={(e) => setError(e?.message ?? 'Live connection error')}
      >
        <LiveStage
          room={room}
          authToken={authToken}
          isHost={isHost}
          displayName={displayName}
          initialMode={initialMode}
          onClose={closeLive}
        />
      </LiveKitRoom>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  stage: { flex: 1, backgroundColor: '#000' },
  video: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  dim: { color: '#93a1bd', marginTop: 10 },
  title: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  errorText: { color: '#fca5a5', marginTop: 10, textAlign: 'center', paddingHorizontal: 24 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 8 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#dc2626', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  viewerPill: { backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  viewerText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  modeBtn: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  modeBtnActive: { backgroundColor: '#4f46e5' },
  modeBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  endBtn: { backgroundColor: '#ef4444', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  endText: { color: '#fff', fontWeight: '900' },
  likeBurst: { position: 'absolute', right: 24, bottom: 180 },
  likeBurstText: { fontSize: 44 },
  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chatList: { maxHeight: 200 },
  chatBubble: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '85%' },
  chatName: { color: '#fca5a5', fontWeight: '800', fontSize: 12 },
  chatText: { color: '#fff', fontSize: 12, flexShrink: 1 },
  stickerText: { fontSize: 24, marginLeft: 4 },
  photoPreview: { width: 110, height: 110, borderRadius: 12, marginLeft: 6, marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 16 },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, color: '#fff' },
  actionBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  actionBtnMuted: { backgroundColor: 'rgba(245,158,11,0.4)' },
  likeBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  actionEmoji: { fontSize: 22 },
  primaryBtn: { marginTop: 18, backgroundColor: '#4f46e5', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  primaryText: { color: '#fff', fontWeight: '900' },
});
