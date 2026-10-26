import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { apiRequest } from '@/lib/api';
import { CallInvite, isFreshCallInvite } from '@/lib/calls';
import { pauseAllMedia } from '@/lib/mediaPlayback';
import { colors } from '@/lib/theme';

export function IncomingCall({ token }: { token: string | null }) {
  const [invite, setInvite] = useState<CallInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const action = useRef(false);
  const requestSequence = useRef(0);
  const dismissed = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const inCall = pathname === '/call' || pathname === '/live-native';
  const check = useCallback(async () => {
    if (!token || inCall || AppState.currentState !== 'active' || action.current) return;
    const sequence = ++requestSequence.current;
    try {
      const next = await apiRequest<CallInvite | null>('/calls/incoming', { token });
      if (sequence !== requestSequence.current || action.current) return;
      setInvite(next && isFreshCallInvite(next) && next.room !== dismissed.current ? next : null);
    } catch { /* Do not erase a still-valid invitation on a transient network error. */ }
  }, [token, inCall]);

  useEffect(() => {
    setInvite(null); dismissed.current = null;
    return () => { requestSequence.current += 1; };
  }, [token]);
  useEffect(() => {
    if (inCall) setInvite(null);
    void check();
    const timer = setInterval(() => { void check(); }, 3000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void check(); });
    const received = Notifications.addNotificationReceivedListener(() => { void check(); });
    const response = Notifications.addNotificationResponseReceivedListener(() => { void check(); });
    // Fetch the current server invitation on startup, including cold starts
    // from a notification. A delayed push never authorizes joining a room.
    return () => { clearInterval(timer); appState.remove(); received.remove(); response.remove(); requestSequence.current += 1; };
  }, [check, inCall]);
  useEffect(() => {
    if (!invite) return;
    const timer = setTimeout(() => setInvite(null), Math.max(0, invite.createdAt + 45_000 - Date.now()));
    return () => clearTimeout(timer);
  }, [invite]);

  const respond = async (join: boolean) => {
    if (!token || !invite || action.current) return;
    action.current = true; setBusy(true); requestSequence.current += 1;
    const current = invite;
    try {
      if (join) {
        if (!isFreshCallInvite(current)) { setInvite(null); return; }
        dismissed.current = current.room; setInvite(null); pauseAllMedia();
        router.push({ pathname: '/call', params: { room: current.room } } as never);
      } else {
        await apiRequest('/calls/decline', { method: 'POST', token, body: { room: current.room } });
        dismissed.current = current.room; setInvite(null);
      }
    } catch { setInvite(null); }
    finally { action.current = false; setBusy(false); }
  };

  return <Modal visible={!!invite && !inCall} transparent animationType="fade" onRequestClose={() => void respond(false)}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.eyebrow}>{invite?.group ? 'GROUP CALL' : 'INCOMING CALL'}</Text>
      <Text style={styles.title}>{invite?.caller.displayName || invite?.caller.username}</Text>
      <Text style={styles.description}>{invite?.video ? 'Video call' : 'Voice call'}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Decline call" disabled={busy} onPress={() => void respond(false)} style={[styles.button, styles.decline]}><Text style={styles.buttonText}>Decline</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Answer call" disabled={busy} onPress={() => void respond(true)} style={styles.button}><Text style={styles.buttonText}>Answer</Text></Pressable>
      </View>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.75)' },
  card: { padding: 24, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.accent, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 18 },
  description: { color: colors.muted, marginTop: 8, fontSize: 17 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 28 },
  button: { flex: 1, padding: 16, backgroundColor: colors.accent, borderRadius: 16, alignItems: 'center' },
  decline: { backgroundColor: '#b52e43' }, buttonText: { color: '#fff', fontWeight: '800' },
});
