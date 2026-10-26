import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors } from '@/lib/theme';
import { registerMediaPauseHandler } from '@/lib/mediaPlayback';
import { mobileProof } from '@/lib/runtimeProof';

export function ReelVideo({ uri, focused, autoScroll, onFinish }: {
  uri: string;
  focused: boolean;
  autoScroll: boolean;
  onFinish: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(true);
  const stateRef = useRef({ focused, paused, autoScroll, onFinish });
  const wasFocusedRef = useRef(false);
  const endedRef = useRef(false);
  const interruptedRef = useRef(false);
  stateRef.current = { focused, paused, autoScroll, onFinish };
  const source = useMemo(() => ({ uri, contentType: 'progressive' as const, useCaching: true }), [uri]);
  const player = useVideoPlayer(source, (p) => { p.loop = !autoScroll; });

  useEffect(() => { player.loop = !autoScroll; }, [autoScroll, player]);

  useEffect(() => {
    const justFocused = focused && !wasFocusedRef.current;
    wasFocusedRef.current = focused;
    if (justFocused) {
      endedRef.current = false;
      setEnded(false);
      player.currentTime = 0;
      if (interruptedRef.current) {
        interruptedRef.current = false;
        stateRef.current.paused = false;
        setPaused(false);
      }
    }
    if (errored || !focused || stateRef.current.paused || endedRef.current) {
      player.pause();
    } else if (player.status === 'readyToPlay') {
      player.play();
    }
    return () => player.pause();
  }, [focused, paused, errored, player]);

  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status, error }) => {
      setLoading(status === 'idle' || status === 'loading');
      if (error || status === 'error') {
        mobileProof('Reel video status error', { uri, status, error });
        setErrored(true);
        return;
      }
      const current = stateRef.current;
      if (status === 'readyToPlay' && current.focused && !current.paused && !endedRef.current) player.play();
    });
    const endSub = player.addListener('playToEnd', () => {
      const current = stateRef.current;
      if (!current.autoScroll || !current.focused || current.paused || endedRef.current) return;
      // Some players emit the completion event more than once. Advance only once per playback.
      endedRef.current = true;
      setEnded(true);
      player.pause();
      current.onFinish();
    });
    return () => { statusSub.remove(); endSub.remove(); };
  }, [player, uri]);

  useEffect(() => registerMediaPauseHandler(() => {
    player.pause();
    if (stateRef.current.focused) {
      interruptedRef.current = true;
      stateRef.current.paused = true;
      setPaused(true);
    }
  }), [player]);

  if (errored) {
    return <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' }}>
      <MaterialCommunityIcons name="video-off-outline" size={40} color="#64748b" />
      <Text style={{ color: '#64748b', marginTop: 8, fontSize: 12 }}>Could not load video</Text>
    </View>;
  }

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={ended ? 'Replay video' : paused ? 'Play video' : 'Pause video'}
    onPress={() => {
      const nextPaused = endedRef.current ? false : !stateRef.current.paused;
      if (endedRef.current) player.currentTime = 0;
      endedRef.current = false;
      interruptedRef.current = false;
      stateRef.current.paused = nextPaused;
      setEnded(false);
      setPaused(nextPaused);
      if (nextPaused) player.pause();
      else if (focused) player.play();
    }}
    style={{ width: '100%', height: '100%' }}
  >
    <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover"
      nativeControls={false} surfaceType="textureView" onFirstFrameRender={() => setLoading(false)} />
    {loading && focused && !paused && !ended && <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.text} size="large" />
    </View>}
    {(paused || ended) && <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={ended ? 'replay' : 'play'} size={36} color={colors.text} />
      </View>
    </View>}
  </Pressable>;
}
