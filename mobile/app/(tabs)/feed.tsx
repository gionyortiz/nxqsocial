import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, SafeAreaView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiRequest, PostItem, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function PostCard({ post }: { post: PostItem }) {
  const first = post.media?.[0];
  const mediaUrl = resolveMediaUrl(first?.thumbnailUrl || first?.url);
  return (
    <View style={{ backgroundColor: '#111827', borderRadius: 14, padding: 12, marginBottom: 12 }}>
      <Text style={{ color: '#fff', fontWeight: '700' }}>{post.author.displayName}</Text>
      <Text style={{ color: '#9ca3af', marginBottom: 10 }}>@{post.author.username}</Text>
      {mediaUrl ? (
        <Image source={{ uri: mediaUrl }} style={{ width: '100%', height: 220, borderRadius: 12, backgroundColor: '#0b1020' }} resizeMode="cover" />
      ) : null}
      {post.caption ? <Text style={{ color: '#e5e7eb', marginTop: 10 }}>{post.caption}</Text> : null}
      <Text style={{ color: '#93a1bd', marginTop: 8, fontSize: 12 }}>
        {post._count?.likes ?? 0} likes • {post._count?.comments ?? 0} comments
      </Text>
    </View>
  );
}

export default function FeedScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await apiRequest<{ data: PostItem[] }>('/posts/feed?mode=FOR_YOU', { token });
      setItems(data.data || []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [token]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#8b5cf6" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#8b5cf6" />}
          ListHeaderComponent={<Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 12 }}>For You</Text>}
          ListEmptyComponent={<Text style={{ color: '#93a1bd' }}>{error || 'No posts yet.'}</Text>}
          renderItem={({ item }) => <PostCard post={item} />}
        />
      )}
    </SafeAreaView>
  );
}
