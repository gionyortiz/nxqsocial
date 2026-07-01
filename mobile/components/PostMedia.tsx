import { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp, Text, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { MediaAsset, resolveMediaUrl } from '@/lib/api';
import { mobileProof } from '@/lib/runtimeProof';

function isVideoAsset(asset?: Pick<MediaAsset, 'url' | 'mimeType'> | null): boolean {
  if (!asset?.url) return false;
  if ((asset.mimeType || '').startsWith('video/')) return true;
  const extension = asset.url.split('?')[0].split('.').pop()?.toLowerCase();
  return ['mp4', 'mov', 'webm', 'm4v'].includes(extension || '');
}

type MediaStyle = StyleProp<ImageStyle>;

function MediaFallback({ label, style }: { label: string; style?: MediaStyle }) {
  return (
    <View style={[{ width: '100%', height: 300, backgroundColor: '#0b1020', alignItems: 'center', justifyContent: 'center' }, style as StyleProp<ViewStyle>]}>
      <MaterialCommunityIcons name="image-off-outline" size={30} color="#64748b" />
      <Text style={{ color: '#64748b', marginTop: 8, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function VideoMedia({ uri, style, shouldPlay }: { uri: string; style?: MediaStyle; shouldPlay: boolean }) {
  const [errored, setErrored] = useState(false);
  const player = useVideoPlayer(uri, (nextPlayer) => {
    nextPlayer.loop = true;
    (nextPlayer as any).muted = true;
  });

  useEffect(() => {
    mobileProof('Video component props', { component: 'VideoView', uri, shouldPlay });
    if (errored || !shouldPlay) {
      player.pause();
      return;
    }
    player.play();
    return () => {
      player.pause();
    };
  }, [errored, player, shouldPlay, uri]);

  useEffect(() => {
    const subscription = player.addListener('statusChange', (status) => {
      if ((status as any)?.error || (status as any)?.status === 'error') {
        mobileProof('Video component status error', { uri, status });
        setErrored(true);
      }
    });
    return () => subscription.remove();
  }, [player]);

  if (errored) {
    return <MediaFallback label="Could not load video" style={style} />;
  }

  return (
    <VideoView
      player={player}
      style={[{ width: '100%', height: 300, backgroundColor: '#0b1020' }, style as StyleProp<ViewStyle>]}
      contentFit="cover"
      nativeControls
    />
  );
}

export function PostMedia({ asset, style, shouldPlay = true }: { asset?: MediaAsset | null; style?: MediaStyle; shouldPlay?: boolean }) {
  const [errored, setErrored] = useState(false);
  const uri = resolveMediaUrl(asset?.thumbnailUrl || asset?.url || '');

  useEffect(() => {
    mobileProof('PostMedia render target', {
      assetId: asset?.id,
      mimeType: asset?.mimeType,
      rawUrl: asset?.url,
      resolvedUrl: uri,
      component: asset && isVideoAsset(asset) ? 'VideoView' : 'Image',
      shouldPlay,
    });
  }, [asset?.id, asset?.mimeType, asset?.url, uri, shouldPlay]);

  if (!uri || !asset || errored) {
    return <MediaFallback label="Media unavailable" style={style} />;
  }

  if (isVideoAsset(asset)) {
    return <VideoMedia uri={resolveMediaUrl(asset.url)} style={style} shouldPlay={shouldPlay} />;
  }

  return (
    <Image
      source={{ uri }}
      style={[{ width: '100%', height: 300, backgroundColor: '#0b1020' }, style]}
      resizeMode="cover"
      onError={(event) => {
        mobileProof('Image component error', { uri, error: event.nativeEvent?.error });
        setErrored(true);
      }}
    />
  );
}