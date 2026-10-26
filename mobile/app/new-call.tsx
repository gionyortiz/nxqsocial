import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { startPrivateCall } from '@/lib/calls';
import { pauseAllMedia } from '@/lib/mediaPlayback';
import { colors } from '@/lib/theme';

type Person = { id?: string; username: string; displayName: string };
export default function NewCallScreen() {
  const { token, user } = useAuth();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const starting = useRef(false);
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let current = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        let result: Person[];
        if (query.trim().length >= 2) result = await apiRequest<Person[]>(`/users/search?q=${encodeURIComponent(query.trim())}`, { token });
        else {
          const data = await apiRequest<{ data: { participant: Person | null }[] }>('/messages/conversations', { token });
          result = data.data.map((c) => c.participant).filter((p): p is Person => !!p);
        }
        if (current) setPeople(result.filter((p, i, all) => p.username !== user?.username && all.findIndex((v) => v.username === p.username) === i));
      } catch { if (current) setError('Could not load people. Check your connection and search again.'); }
      finally { if (current) setLoading(false); }
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [query, token, user?.username]);
  const toggle = (person: Person) => setSelected((prev) => {
    if (prev.some((p) => p.username === person.username)) return prev.filter((p) => p.username !== person.username);
    if (prev.length === 7) return prev;
    return [...prev, person];
  });
  const start = async (video: boolean) => {
    if (!token || starting.current || !selected.length) return;
    starting.current = true; setBusy(true);
    try {
      const room = await startPrivateCall(token, selected.map((p) => p.username), video);
      pauseAllMedia(); router.replace({ pathname: '/call', params: { room } } as never);
    } catch (e) { Alert.alert('Could not start call', e instanceof Error ? e.message : 'Please try again.'); }
    finally { starting.current = false; setBusy(false); }
  };
  return <SafeAreaView style={styles.fill}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={26} color={colors.text} /></Pressable><Text style={styles.title}>Call your people</Text></View>
    <Text style={styles.description}>Choose up to 7 people for a voice or video call.</Text>
    <TextInput accessibilityLabel="Search people to call" placeholder="Search by username" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={styles.search} />
    <View style={styles.selected}>{selected.map((p) => <Pressable key={p.username} accessibilityRole="button" accessibilityLabel={`Remove ${p.displayName || p.username}`} onPress={() => toggle(p)} style={styles.chip}><Text style={styles.chipText}>{p.displayName || p.username} ×</Text></Pressable>)}</View>
    {loading ? <ActivityIndicator color={colors.accent} /> : null}
    {error ? <Text style={styles.description}>{error}</Text> : null}
    <FlatList data={people} keyExtractor={(p) => p.username} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20 }} renderItem={({ item }) => {
      const chosen = selected.some((p) => p.username === item.username);
      return <Pressable accessibilityRole="checkbox" accessibilityLabel={item.displayName || item.username} accessibilityState={{ checked: chosen, disabled: !chosen && selected.length === 7 }} disabled={!chosen && selected.length === 7} onPress={() => toggle(item)} style={styles.person}>
        <View style={styles.avatar}><Text style={styles.initial}>{(item.displayName || item.username).slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.personName}>{item.displayName || item.username}</Text><Text style={styles.muted}>@{item.username}</Text></View><MaterialCommunityIcons name={chosen ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} color={chosen ? colors.accent : colors.muted} size={26} />
      </Pressable>;
    }} ListEmptyComponent={!loading ? <Text style={styles.muted}>Search for a family member’s NXQ username to invite them.</Text> : null} />
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" disabled={busy || !selected.length} onPress={() => void start(false)} style={[styles.button, (busy || !selected.length) && styles.disabled]}><MaterialCommunityIcons name="phone" size={22} color="#fff" /><Text style={styles.chipText}>Voice call</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || !selected.length} onPress={() => void start(true)} style={[styles.button, (busy || !selected.length) && styles.disabled]}><MaterialCommunityIcons name="video" size={22} color="#fff" /><Text style={styles.chipText}>Video call</Text></Pressable>
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background }, header: { flexDirection: 'row', gap: 16, padding: 22, alignItems: 'center' }, title: { color: colors.text, fontSize: 25, fontWeight: '800' },
  description: { color: colors.muted, marginHorizontal: 22, marginBottom: 16 }, search: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginHorizontal: 20 },
  selected: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 20 }, chip: { backgroundColor: '#563079', padding: 10, borderRadius: 14 }, chipText: { color: '#fff', fontWeight: '700' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, avatar: { backgroundColor: colors.raised, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.text, fontSize: 20, fontWeight: '800' }, personName: { color: colors.text, fontSize: 17, fontWeight: '700' }, muted: { color: colors.muted },
  actions: { flexDirection: 'row', padding: 20, gap: 12 }, button: { flex: 1, backgroundColor: colors.accent, padding: 18, borderRadius: 18, alignItems: 'center', gap: 8 }, disabled: { opacity: 0.4 },
});
