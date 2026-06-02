import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, SafeAreaView, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { apiRequest, PostItem, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const h = Dimensions.get('window').height;

function ReelVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      nativeControls
    />
  );
}

export default function ReelsScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const data = await apiRequest<{ data: PostItem[] }>('/posts/reels', { token });
        setItems(data.data || []);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load reels');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#8b5cf6" />
      </SafeAreaView>
    );
  }

  if (!items.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: '#fff' }}>{error || 'No reels yet.'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        data={items}
        pagingEnabled
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const src = resolveMediaUrl(item.media?.[0]?.url);
          return (
            <View style={{ height: h, backgroundColor: '#000' }}>
              <ReelVideo uri={src} />
              <View style={{ position: 'absolute', left: 12, bottom: 50 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>@{item.author.username}</Text>
                {item.caption ? <Text style={{ color: '#e5e7eb', marginTop: 6 }}>{item.caption}</Text> : null}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
