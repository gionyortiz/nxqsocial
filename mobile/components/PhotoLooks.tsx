import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { PHOTO_LOOKS, PhotoLook, photoLookHtml } from '@/lib/photoLooks';
import { colors } from '@/lib/theme';

export type FilteredPhoto = { uri: string; width: number; height: number };
export type PhotoLooksProps = { uri: string; width: number; height: number; disabled: boolean;
  onChange: (photo: FilteredPhoto | null) => void; onBusy: (busy: boolean) => void };

export function PhotoLooks({ uri, width, height, disabled, onChange, onBusy }: PhotoLooksProps) {
  const [look, setLook] = useState<PhotoLook>('original');
  const [job, setJob] = useState<{ id: number; html: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const files = useRef<File[]>([]);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const base = useRef<string | null>(null);
  useEffect(() => () => {
    sequence.current++;
    if (timeout.current) clearTimeout(timeout.current);
    for (const file of files.current) { try { if (file.exists) file.delete(); } catch {} }
  }, []);
  const finish = () => { if (timeout.current) clearTimeout(timeout.current); timeout.current = null; setBusy(false); onBusy(false); setJob(null); };
  const fail = (id: number) => {
    if (id !== sequence.current) return;
    sequence.current++;
    setError(true); setLook('original'); onChange(null); finish();
  };
  const select = async (next: PhotoLook) => {
    if (disabled || busy) return;
    const id = ++sequence.current;
    setLook(next); setError(false);
    if (next === 'original') { onChange(null); return; }
    setBusy(true); onBusy(true);
    timeout.current = setTimeout(() => fail(id), 20000);
    try {
      if (!base.current) {
        const resize = Math.max(width, height) > 1280 ? [{ resize: width >= height ? { width: 1280 } : { height: 1280 } }] : [];
        const result = await ImageManipulator.manipulateAsync(uri, resize, { base64: true, compress: 0.95, format: ImageManipulator.SaveFormat.JPEG });
        if (id !== sequence.current) return;
        if (!result.base64) throw new Error('Photo unavailable');
        base.current = result.base64;
        files.current.push(new File(result.uri));
      }
      if (id === sequence.current) setJob({ id, html: photoLookHtml(base.current, next) });
    } catch { fail(id); }
  };
  const receive = (id: number, raw: string) => {
    if (id !== sequence.current) return;
    try {
      if (raw.length > 12000000) throw new Error('Photo too large');
      const data = JSON.parse(raw);
      if (!Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width < 1 || data.height < 1 || data.width > 1280 || data.height > 1280 ||
          typeof data.image !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.image)) throw new Error('Invalid result');
      const file = new File(Paths.cache, `nxq-look-${Date.now()}-${id}.jpg`);
      files.current.push(file);
      file.write(data.image.slice('data:image/jpeg;base64,'.length), { encoding: 'base64' });
      onChange({ uri: file.uri, width: data.width, height: data.height });
      sequence.current++;
      finish();
    } catch { fail(id); }
  };
  return <View style={{ gap: 12, paddingVertical: 12 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Photo looks</Text>
      {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={{ color: colors.muted, fontSize: 12 }}>Saved with your photo</Text>}
    </View>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
      {PHOTO_LOOKS.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Photo look: ${item.label}`} accessibilityState={{ selected: look === item.id, disabled: disabled || busy }} disabled={disabled || busy} onPress={() => select(item.id)} style={{ alignItems: 'center', gap: 6, minWidth: 58 }}>
        <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: item.color, borderWidth: look === item.id ? 3 : 0, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 22 }}>{item.id === 'original' ? '○' : item.id === 'glow' ? '✦' : 'Aa'}</Text></View>
        <Text style={{ color: look === item.id ? '#fff' : colors.muted, fontSize: 12 }}>{item.label}</Text>
      </Pressable>)}
    </ScrollView>
    {look === 'glow' ? <Text style={{ color: colors.muted, fontSize: 12 }}>A gentle all-over softening and glow. Your features stay yours.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: '#fca5a5' }}>Could not apply that look. Your original photo is selected. Try again.</Text> : null}
    {job ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
      <WebView key={job.id} source={{ html: job.html }} originWhitelist={['*']} javaScriptEnabled
        onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
        allowFileAccess={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
        onMessage={(event) => receive(job.id, event.nativeEvent.data)} onError={() => fail(job.id)}
        onContentProcessDidTerminate={() => fail(job.id)} onRenderProcessGone={() => fail(job.id)} />
    </View> : null}
  </View>;
}
