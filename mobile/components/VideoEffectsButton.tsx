import { useEffect, useRef } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { editVideo, EditedVideo, removeEditedVideo, videoEffectsAvailable } from '@/modules/nxq-video-effects';
import { colors } from '@/lib/theme';

export function VideoEffectsButton({ uri, value, disabled, onChange, onBusy }: {
  uri: string;
  value: EditedVideo | null;
  disabled: boolean;
  onChange: (video: EditedVideo | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const open = async () => {
    if (active.current || disabled) return;
    active.current = true;
    onBusy(true);
    try {
      // Always render from the original. Reopening never compounds compression or effects.
      const result = await editVideo(uri, value?.effects);
      if (!result.canceled) {
        if (mounted.current) onChange(result.uri === uri ? null : result);
        else void removeEditedVideo(result.uri);
      }
    } catch (error) {
      if (mounted.current) Alert.alert('Video effects', error instanceof Error ? error.message : 'Could not open the editor. Your original video is still selected.');
    } finally {
      active.current = false;
      if (mounted.current) onBusy(false);
    }
  };
  if (!videoEffectsAvailable) return null;
  const look = value?.effects.look;
  const parts = value ? [look && look !== 'original' ? look[0].toUpperCase() + look.slice(1) : null,
    value.effects.smooth > 0 ? 'Smooth' : null, value.effects.glow > 0 ? 'Glow' : null].filter(Boolean) : [];
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit video filters and beauty" disabled={disabled} onPress={open}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1 }}>
        <View style={{ backgroundColor: '#30203e', borderRadius: 24, padding: 12 }}><MaterialCommunityIcons name="auto-fix" size={24} color={colors.verified} /></View>
        <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>Filters & beauty</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{parts.length ? parts.join(' · ') : 'Find your look. Adjust Smooth and Glow.'}</Text></View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={colors.muted} />
      </Pressable>
      {value ? <Pressable accessibilityRole="button" accessibilityLabel="Remove video effects" disabled={disabled} onPress={() => onChange(null)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.verified, fontWeight: '700' }}>Use original video</Text>
      </Pressable> : null}
    </View>
  );
}
