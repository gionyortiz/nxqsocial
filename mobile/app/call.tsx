import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AudioSession, LiveKitRoom, useConnectionState, useLocalParticipant, useParticipants, useTracks, VideoTrack, isTrackReference } from '@livekit/react-native';
import { mediaDevices } from '@livekit/react-native-webrtc';
import { ConnectionState, LocalVideoTrack, Track } from 'livekit-client';
import { useAuth } from '@/lib/auth';
import { apiRequest, ApiError } from '@/lib/api';
import { CallSession, callEndMessage } from '@/lib/calls';
import { colors } from '@/lib/theme';

type Credentials = { token: string; url: string };
const ROOM_OPTIONS = { adaptiveStream: { pixelDensity: 'screen' as const }, dynacast: true };

function Control({ label, icon, onPress, active, danger, disabled }: {
  label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void; active?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={onPress} style={[styles.control, active && styles.controlActive, danger && styles.danger, disabled && { opacity: 0.5 }]}>
    <MaterialCommunityIcons name={icon} color="#fff" size={25} /><Text style={styles.controlText}>{label}</Text>
  </Pressable>;
}

function CallStage({ session, onLeave, onEnd }: { session: CallSession; onLeave: () => void; onEnd?: () => void }) {
  const participants = useParticipants();
  const connection = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const [speaker, setSpeaker] = useState(session.video);
  const [changing, setChanging] = useState(false);
  const changingRef = useRef(false);

  const change = async (operation: () => Promise<unknown>) => {
    if (changingRef.current) return;
    changingRef.current = true;
    setChanging(true);
    try { await operation(); }
    catch { Alert.alert('Call control unavailable', 'Check camera and microphone permissions in Settings, then try again.'); }
    finally { changingRef.current = false; setChanging(false); }
  };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Never keep the camera publishing when the app leaves the foreground.
      if (state !== 'active') {
        if (localParticipant.isCameraEnabled) void localParticipant.setCameraEnabled(false).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [localParticipant]);

  const routeAudio = () => change(async () => {
    const next = !speaker;
    await AudioSession.selectAudioOutput(Platform.OS === 'ios' ? (next ? 'force_speaker' : 'default') : (next ? 'speaker' : 'earpiece'));
    setSpeaker(next);
  });
  const connected = connection === ConnectionState.Connected;
  const label = connection === ConnectionState.Reconnecting ? 'Reconnecting…'
    : !connected ? 'Connecting…' : participants.length > 1 ? `${participants.length} people connected`
    : session.status === 'ringing' ? 'Ringing…' : 'Waiting for others…';

  return <SafeAreaView style={styles.fill}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>NXQ {session.group ? 'GROUP CALL' : 'CALL'}</Text>
      <Text style={styles.title}>{session.group ? 'Together, wherever you are' : session.members.filter((m) => m.id !== localParticipant.identity).map((m) => m.displayName).join(', ')}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.muted}>{label}</Text>
    </View>
    <FlatList data={participants} keyExtractor={(p) => p.identity} numColumns={2} style={styles.grid} contentContainerStyle={{ padding: 8 }} renderItem={({ item }) => {
      const track = tracks.find((t) => t.participant.identity === item.identity);
      return <View style={[styles.tile, item.isSpeaking && styles.speaking]}>
        {track && isTrackReference(track) && item.isCameraEnabled ? <VideoTrack trackRef={track} style={StyleSheet.absoluteFill} />
          : <View style={styles.avatar}><Text style={styles.initial}>{(item.name || 'N').slice(0, 1).toUpperCase()}</Text></View>}
        <View style={styles.namePlate}><Text numberOfLines={1} style={styles.name}>{item.isLocal ? 'You' : item.name || 'Family member'}</Text><MaterialCommunityIcons name={item.isMicrophoneEnabled ? 'microphone' : 'microphone-off'} size={16} color="#fff" /></View>
      </View>;
    }} />
    <View style={styles.waiting}><Text style={styles.muted}>{session.members.filter((m) => m.state === 'invited').map((m) => `${m.displayName}: ringing`).join(' · ')}</Text></View>
    <View style={styles.controls}>
      <Control label={isMicrophoneEnabled ? 'Mute' : 'Unmute'} icon={isMicrophoneEnabled ? 'microphone' : 'microphone-off'} active={!isMicrophoneEnabled} disabled={changing} onPress={() => void change(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))} />
      <Control label={isCameraEnabled ? 'Camera off' : 'Camera on'} icon={isCameraEnabled ? 'video' : 'video-off'} active={isCameraEnabled} disabled={changing} onPress={() => void change(() => localParticipant.setCameraEnabled(!isCameraEnabled))} />
      <Control label={speaker ? 'Speaker on' : 'Speaker off'} icon="volume-high" active={speaker} disabled={changing} onPress={routeAudio} />
      <Control label="Flip camera" icon="camera-flip-outline" disabled={changing || !isCameraEnabled} onPress={() => void change(async () => {
        const track = localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (track instanceof LocalVideoTrack) await track.restartTrack({ facingMode: track.mediaStreamTrack.getSettings().facingMode === 'user' ? 'environment' : 'user' });
      })} />
      <Control label="Leave call" icon="phone-hangup" danger onPress={onLeave} />
    </View>
    {onEnd && session.group ? <Pressable accessibilityRole="button" onPress={() => Alert.alert('End this call?', 'Everyone will be disconnected.', [{ text: 'Cancel', style: 'cancel' }, { text: 'End for everyone', style: 'destructive', onPress: onEnd }])} style={styles.endAll}><Text style={styles.muted}>End for everyone</Text></Pressable> : null}
  </SafeAreaView>;
}

export default function CallScreen() {
  const { token, user } = useAuth();
  const params = useLocalSearchParams<{ room?: string }>();
  const room = typeof params.room === 'string' ? params.room : '';
  const [session, setSession] = useState<CallSession | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<string | null>(null);
  const leaving = useRef(false);
  const didLeave = useRef(false);

  useEffect(() => {
    if (!error && !finished) return;
    leaving.current = true;
    setCredentials(null);
    void AudioSession.stopAudioSession().catch(() => {});
    if (token && room && !didLeave.current) {
      didLeave.current = true;
      void apiRequest('/calls/leave', { method: 'POST', token, body: { room } }).catch(() => {});
    }
  }, [error, finished, token, room]);

  useEffect(() => {
    if (!token || !room) { setError('Sign in and start a call from Messages.'); return; }
    let active = true;
    let audioStarted = false;
    let pollBusy = false;
    const leave = () => {
      if (didLeave.current) return;
      didLeave.current = true;
      void apiRequest('/calls/leave', { method: 'POST', token, body: { room } }).catch(() => {});
    };
    const init = async () => {
      try {
        const state = await apiRequest<CallSession>(`/calls/rooms/${encodeURIComponent(room)}`, { token });
        if (!active || leaving.current) return;
        if (state.status === 'ended') { setFinished(callEndMessage(state.reason)); return; }
        setSession(state);
        // Permission denial is surfaced before entering the room. These temporary
        // permission-check tracks are stopped even if the screen was dismissed.
        const stream = await mediaDevices.getUserMedia({ audio: true, video: state.video });
        stream.getTracks().forEach((track) => track.stop());
        if (!active || leaving.current) return;
        await AudioSession.configureAudio({ ios: { defaultOutput: 'earpiece' } });
        await AudioSession.startAudioSession(); audioStarted = true;
        if (!active || leaving.current) { await AudioSession.stopAudioSession(); return; }
        if (state.video) await AudioSession.selectAudioOutput(Platform.OS === 'ios' ? 'force_speaker' : 'speaker');
        const response = await apiRequest<Credentials>('/calls/token', { method: 'POST', token, body: { room, video: state.video } });
        if (active && !leaving.current) setCredentials(response);
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : 'Could not connect the call.'); leave(); }
      }
    };
    void init();
    const timer = setInterval(async () => {
      if (!active || leaving.current || pollBusy) return;
      pollBusy = true;
      try {
        const state = await apiRequest<CallSession>(`/calls/rooms/${encodeURIComponent(room)}`, { token });
        if (!active) return;
        setSession(state);
        if (state.status === 'ended') { leaving.current = true; setCredentials(null); setFinished(callEndMessage(state.reason)); }
      } catch (e) {
        if (active && e instanceof ApiError && (e.status === 403 || e.status === 410)) {
          leaving.current = true; setCredentials(null); setFinished('This call is no longer available.');
        }
        // LiveKit reconnects transient transport failures independently.
      }
      finally { pollBusy = false; }
    }, 3000);
    return () => { active = false; clearInterval(timer); leave(); if (audioStarted) void AudioSession.stopAudioSession().catch(() => {}); };
  }, [token, room]);

  const close = async (everyone = false) => {
    if (leaving.current) return;
    leaving.current = true;
    setCredentials(null);
    try { await apiRequest(everyone ? '/calls/end' : '/calls/leave', { method: 'POST', token, body: { room } }); didLeave.current = true; }
    catch { /* Disconnect local media even if the API cannot be reached. */ }
    finally { void AudioSession.stopAudioSession().catch(() => {}); router.back(); }
  };

  if (error || finished) return <SafeAreaView style={[styles.fill, styles.center]}>
    <MaterialCommunityIcons name="phone-hangup" size={44} color={colors.accent} />
    <Text style={styles.title}>{finished ? 'Call ended' : 'Could not join'}</Text>
    <Text style={styles.muted}>{finished || error}</Text>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.name}>Back to messages</Text></Pressable>
  </SafeAreaView>;
  if (!credentials || !session) return <SafeAreaView style={[styles.fill, styles.center]}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Preparing your call…</Text><Pressable accessibilityRole="button" onPress={() => void close()} style={styles.back}><Text style={styles.name}>Cancel</Text></Pressable></SafeAreaView>;
  return <LiveKitRoom serverUrl={credentials.url} token={credentials.token} connect audio video={session.video}
    options={ROOM_OPTIONS}
    onError={() => { setError('The call connection failed. Check your connection and microphone permissions, then try again.'); setCredentials(null); }}
    onDisconnected={() => { if (!leaving.current) { setCredentials(null); setFinished('You were disconnected from the call.'); } }}>
    <CallStage session={session} onLeave={() => void close()} onEnd={session.callerId === user?.id ? () => void close(true) : undefined} />
  </LiveKitRoom>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background }, center: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 18 },
  header: { padding: 22, gap: 8 }, eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 14 },
  grid: { flex: 1 }, tile: { flex: 1, height: 220, margin: 5, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  speaking: { borderColor: colors.accent }, avatar: { height: 76, width: 76, borderRadius: 38, backgroundColor: colors.raised, justifyContent: 'center', alignItems: 'center' },
  initial: { fontSize: 32, fontWeight: '800', color: colors.text }, namePlate: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: 'rgba(0,0,0,0.6)' },
  name: { color: '#fff', fontWeight: '700', flexShrink: 1 }, waiting: { paddingHorizontal: 22, paddingVertical: 8 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, padding: 16 },
  control: { minWidth: 88, minHeight: 72, padding: 10, borderRadius: 18, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', gap: 6 },
  controlActive: { backgroundColor: '#643698' }, danger: { backgroundColor: '#bd3048' }, controlText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  endAll: { alignItems: 'center', padding: 14 }, back: { backgroundColor: colors.accent, padding: 16, borderRadius: 16 },
});
