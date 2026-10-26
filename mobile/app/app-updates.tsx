import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { colors } from '@/lib/theme';

export const PATCH_LABEL = 'Social update · October 21';

export default function AppUpdatesScreen() {
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Check for the latest fixes without signing out.');
  const operation = useRef(false);
  const mounted = useRef(true);
  const updateState = Updates.useUpdates();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pending = ready || updateState.isUpdatePending;
  const check = async () => {
    if (operation.current || !Updates.isEnabled) return;
    operation.current = true;
    setBusy(true);
    setMessage('Checking for an update…');
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!mounted.current) return;
      if (result.isAvailable || result.isRollBackToEmbedded) {
        setMessage('Downloading update. You can keep using NXQ.');
        const downloaded = await Updates.fetchUpdateAsync();
        if (!mounted.current) return;
        if (downloaded.isNew || downloaded.isRollBackToEmbedded) {
          setReady(true);
          setMessage('Update downloaded. Finish any call or draft before restarting.');
        } else setMessage('No new download is needed. A pending update, if shown, can be applied below.');
      } else setMessage('You have the latest update available for this app version.');
    } catch {
      if (mounted.current) setMessage('Could not check right now. Check your connection and try again.');
    } finally { operation.current = false; if (mounted.current) setBusy(false); }
  };
  const restart = async () => {
    if (operation.current || !pending) return;
    operation.current = true;
    setBusy(true);
    try { await Updates.reloadAsync(); }
    catch {
      operation.current = false;
      if (mounted.current) { setBusy(false); setMessage('Close and reopen NXQ to apply the downloaded update.'); }
    }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
      <View style={{ padding: 22, borderRadius: 24, backgroundColor: colors.surface, gap: 10 }}>
        <Text style={{ color: colors.verified, fontWeight: '800', fontSize: 12 }}>RUNNING ON THIS PHONE</Text>
        <Text style={{ color: colors.text, fontSize: 25, fontWeight: '800' }}>{PATCH_LABEL}</Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>iPhone video filters, adjustable Smooth and Glow, plus Auto-scroll, keyboard Done buttons, photo looks, and drag-to-crop editing.</Text>
        <Text selectable style={{ color: colors.text }}>App {Constants.expoConfig?.version || Updates.runtimeVersion || 'unknown'} · Build {Constants.platform?.ios?.buildNumber || Constants.platform?.android?.versionCode || 'unknown'}</Text>
        <Text selectable style={{ color: colors.muted, fontSize: 12 }}>Update: {Updates.updateId || 'Built into app'}{Updates.isEmbeddedLaunch ? ' (bundled)' : ''}</Text>
        <Text selectable style={{ color: colors.muted, fontSize: 12 }}>Channel: {Updates.channel || 'development'} · Runtime: {Updates.runtimeVersion || 'development'}</Text>
      </View>
      {Updates.isEmergencyLaunch ? <Text style={{ color: '#fbbf24' }}>NXQ recovered using a safe update. Check again below; if this keeps happening, send support the update ID above.</Text> : null}
      <Text accessibilityLiveRegion="polite" style={{ color: colors.text, lineHeight: 22 }}>{Updates.isEnabled ? message : 'Updates are unavailable in this build. Install the latest NXQ Social version from the App Store.'}</Text>
      <Pressable accessibilityRole="button" disabled={busy || !Updates.isEnabled} onPress={check}
        style={{ padding: 16, minHeight: 50, backgroundColor: colors.accent, borderRadius: 16, alignItems: 'center', opacity: busy || !Updates.isEnabled ? 0.5 : 1 }}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Check for updates</Text>}
      </Pressable>
      {pending ? <>
        <Text style={{ color: colors.muted }}>Restarting closes any call and unsaved draft. Your account stays signed in.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={restart} style={{ padding: 16, minHeight: 50, borderRadius: 16, alignItems: 'center', backgroundColor: colors.raised }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>Restart and apply update</Text>
        </Pressable>
      </> : null}
    </ScrollView>
  );
}
