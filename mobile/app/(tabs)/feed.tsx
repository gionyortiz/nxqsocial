import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiRequest, PostItem, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface StoryCandidate {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isLive?: boolean;
  hasRecentPost?: boolean;
}

interface StoriesResponse {
  storyCandidates: StoryCandidate[];
}

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
  const [stories, setStories] = useState<StoryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const [feedData, storiesData] = await Promise.all([
        apiRequest<{ data: PostItem[] }>('/posts/feed?mode=FOR_YOU', { token }),
        apiRequest<StoriesResponse>('/feed/stories?take=15', { token }),
      ]);
      setItems(feedData.data || []);
      setStories(storiesData.storyCandidates || []);
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
          ListHeaderComponent={(
            <View style={{ marginBottom: 12, gap: 10 }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>For You</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                <View style={{ alignItems: 'center', width: 72 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#6366f1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151d33' }}>
                    <Text style={{ color: '#a5b4fc', fontWeight: '800' }}>You</Text>
                  </View>
                  <Text numberOfLines={1} style={{ marginTop: 6, color: '#c7d2fe', fontSize: 11 }}>Your story</Text>
                </View>

                {stories.map((story) => (
                  <View key={story.id} style={{ alignItems: 'center', width: 72 }}>
                    <View style={{ padding: 2, borderRadius: 30, backgroundColor: story.isLive ? '#ef4444' : '#8b5cf6' }}>
                      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#0b1020', padding: 2 }}>
                        {story.avatarUrl ? (
                          <Image
                            source={{ uri: resolveMediaUrl(story.avatarUrl) }}
                            style={{ width: '100%', height: '100%', borderRadius: 26 }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{ flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1f2937' }}>
                            <Text style={{ color: '#d1d5db', fontWeight: '800' }}>{story.username.slice(0, 2).toUpperCase()}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text numberOfLines={1} style={{ marginTop: 6, color: '#c7d2fe', fontSize: 11 }}>{story.username}</Text>
                    <Text style={{ marginTop: 2, color: story.isLive ? '#fca5a5' : '#a5b4fc', fontSize: 10, fontWeight: '800' }}>
                      {story.isLive ? 'LIVE' : 'NEW'}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          ListEmptyComponent={<Text style={{ color: '#93a1bd' }}>{error || 'No posts yet.'}</Text>}
          renderItem={({ item }) => <PostCard post={item} />}
        />
      )}
    </SafeAreaView>
  );
}
