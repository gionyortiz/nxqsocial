import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { apiRequest, StoryFeedAuthorGroup, StoryItem, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerMediaPauseHandler } from '@/lib/mediaPlayback';
import { mobileProof } from '@/lib/runtimeProof';

const PHOTO_DURATION_MS = 5000;
const TICK_MS = 50;

function StoryMedia({ story, paused, onDone }: { story: StoryItem; paused: boolean; onDone: () => void }) {
  const isVideo = !!story.media?.mimeType?.startsWith('video/');
  const uri = story.media ? resolveMediaUrl(story.media.url) : '';

  const player = useVideoPlayer(isVideo ? uri : null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!isVideo) return;
    if (paused) {
      player.pause();
    } else {
      player.play();
    }
  }, [paused, isVideo, player]);

  useEffect(() => {
    if (!isVideo) return;
    const sub = player.addListener('playToEnd', onDone);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, player]);

  useEffect(() => registerMediaPauseHandler(() => player.pause()), [player]);

  if (!story.media) return null;

  if (isVideo) {
    return <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="contain" nativeControls={false} />;
  }

  return <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />;
}

export default function StoryViewerScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ authorId?: string }>();

  const [loading, setLoading] = useState(true);
  const [authorGroups, setAuthorGroups] = useState<StoryFeedAuthorGroup[]>([]);
  const [authorIndex, setAuthorIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const viewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await apiRequest<{ authors: StoryFeedAuthorGroup[] }>('/stories/feed', { token });
        const groups = data.authors || [];
        setAuthorGroups(groups);
        const idx = groups.findIndex((g) => g.author.id === params.authorId);
        if (idx === -1) {
          setNotFound(true);
        } else {
          setAuthorIndex(idx);
          const firstUnseen = groups[idx].stories.findIndex((s) => !s.viewed);
          setStoryIndex(firstUnseen === -1 ? 0 : firstUnseen);
        }
      } catch (e: any) {
        mobileProof('Story viewer load error', { message: e?.message });
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, params.authorId]);

  useEffect(() => {
    if (notFound) {
      const t = setTimeout(() => router.back(), 1500);
      return () => clearTimeout(t);
    }
  }, [notFound, router]);

  const currentGroup = authorGroups[authorIndex];
  const currentStory: StoryItem | undefined = currentGroup?.stories[storyIndex];

  const goNext = () => {
    if (!currentGroup) return;
    if (storyIndex < currentGroup.stories.length - 1) {
      setStoryIndex((i) => i + 1);
      return;
    }
    if (authorIndex < authorGroups.length - 1) {
      setAuthorIndex((i) => i + 1);
      setStoryIndex(0);
      return;
    }
    router.back();
  };

  const goPrev = () => {
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1);
      return;
    }
    if (authorIndex > 0) {
      const prevGroup = authorGroups[authorIndex - 1];
      setAuthorIndex((i) => i - 1);
      setStoryIndex(Math.max(0, prevGroup.stories.length - 1));
    }
  };

  useEffect(() => {
    if (!currentStory || !token) return;
    setProgress(0);

    if (!viewedRef.current.has(currentStory.id)) {
      viewedRef.current.add(currentStory.id);
      apiRequest(`/stories/${currentStory.id}/view`, { method: 'POST', token }).catch(() => {});
    }

    const isVideo = !!currentStory.media?.mimeType?.startsWith('video/');
    const durationMs = isVideo
      ? Math.min(60, currentStory.media?.durationSec ?? 15) * 1000
      : PHOTO_DURATION_MS;

    const interval = setInterval(() => {
      if (pausedRef.current) return;
      setProgress((p) => {
        const next = p + TICK_MS / durationMs;
        if (next >= 1) {
          clearInterval(interval);
          goNext();
          return 1;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStory?.id, token]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  if (notFound || !currentGroup || !currentStory) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#94a3b8' }}>This story is no longer available.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1 }}>
        <StoryMedia story={currentStory} paused={paused} onDone={goNext} />

        <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 4 }}>
          {currentGroup.stories.map((s, i) => (
            <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
              <View
                style={{
                  height: '100%',
                  width: `${(i < storyIndex ? 1 : i === storyIndex ? progress : 0) * 100}%`,
                  backgroundColor: '#fff',
                }}
              />
            </View>
          ))}
        </View>

        <View style={{ position: 'absolute', top: 22, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {currentGroup.author.avatarUrl ? (
              <Image source={{ uri: resolveMediaUrl(currentGroup.author.avatarUrl) }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ color: '#d1d5db', fontWeight: '800', fontSize: 12 }}>{currentGroup.author.username.slice(0, 2).toUpperCase()}</Text>
            )}
          </View>
          <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }} numberOfLines={1}>{currentGroup.author.username}</Text>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={{ position: 'absolute', inset: 0, flexDirection: 'row' }}>
          <Pressable style={{ width: '30%' }} onPress={goPrev} />
          <Pressable
            style={{ width: '40%' }}
            onPressIn={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          />
          <Pressable style={{ width: '30%' }} onPress={goNext} />
        </View>

        {currentStory.caption ? (
          <View style={{ position: 'absolute', bottom: 24, left: 12, right: 12 }}>
            <Text style={{ color: '#fff', fontSize: 14 }}>{currentStory.caption}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
