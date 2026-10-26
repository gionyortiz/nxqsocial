import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PHOTO_LOOKS, PhotoLook, applyPhotoLook } from '@/lib/photoLooks';
import { colors } from '@/lib/theme';
import type { PhotoLooksProps } from './PhotoLooks';

export function PhotoLooks({ uri, disabled, onBusy, onChange }: PhotoLooksProps) {
  const [look, setLook] = useState<PhotoLook>('original');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const select = (next: PhotoLook) => {
    if (busy || disabled) return;
    const id = ++generation.current;
    setLook(next); setError(false);
    if (next === 'original') { onChange(null); return; }
    setBusy(true); onBusy(true);
    const image = new Image();
    const finish = () => { if (id === generation.current) { setBusy(false); onBusy(false); } };
    image.onerror = () => { if (id === generation.current) { setError(true); setLook('original'); onChange(null); finish(); } };
    image.onload = () => {
      if (id !== generation.current) return;
      try {
        const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyPhotoLook(pixels.data, canvas.width, canvas.height, next); ctx.putImageData(pixels, 0, 0);
        onChange({ uri: canvas.toDataURL('image/jpeg', 0.9), width: canvas.width, height: canvas.height });
      } catch { setError(true); setLook('original'); onChange(null); }
      finish();
    };
    image.src = uri;
  };
  return <View style={{ gap: 12, paddingVertical: 12 }}>
    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>Photo looks{busy ? ' · Applying…' : ''}</Text>
    <ScrollView horizontal contentContainerStyle={{ gap: 12 }}>
      {PHOTO_LOOKS.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Photo look: ${item.label}`} accessibilityState={{ selected: item.id === look }} disabled={busy || disabled} onPress={() => select(item.id)} style={{ alignItems: 'center', gap: 6 }}>
        <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: item.color, borderColor: '#fff', borderWidth: item.id === look ? 3 : 0 }} />
        <Text style={{ color: item.id === look ? '#fff' : colors.muted, fontSize: 12 }}>{item.label}</Text>
      </Pressable>)}
    </ScrollView>
    {look === 'glow' ? <Text style={{ color: colors.muted, fontSize: 12 }}>A gentle all-over softening and glow. Your features stay yours.</Text> : null}
    {error ? <Text style={{ color: '#fca5a5' }}>Could not apply this look. Original selected.</Text> : null}
  </View>;
}
