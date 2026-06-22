import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { apiRequest, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type UserResult = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  verificationStatus?: string;
};

type ExplorePost = {
  id: string;
  caption?: string;
  media?: { url?: string; thumbnailUrl?: string }[];
  author: { id?: string; username: string; displayName: string };
};

export default function ExploreScreen() {
  const { token, user } = useAuth();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const [usersData, postsData] = await Promise.all([
        apiRequest<UserResult[]>('/users/search?q=', { token }),
        apiRequest<{ data: ExplorePost[] }>('/posts/feed?mode=FOR_YOU', { token }),
      ]);
      setUsers((Array.isArray(usersData) ? usersData : []).filter((u) => u.username !== user?.username).slice(0, 8));
      setPosts((postsData?.data || []).filter((p) => p.media?.length).slice(0, 10));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load explore content');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const runSearch = async (q: string) => {
    setQuery(q);
    if (!token) return;
    if (!q.trim()) {
      await load();
      return;
    }
    setSearching(true);
    try {
      const data = await apiRequest<UserResult[]>(`/users/search?q=${encodeURIComponent(q)}`, { token });
      setUsers((Array.isArray(data) ? data : []).filter((u) => u.username !== user?.username));
    } catch (e: any) {
      setError(e?.message ?? 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const confirmDeletePost = (postId: string) => {
    Alert.alert(
      'Delete post',
      'This will permanently delete this post.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await apiRequest(`/posts/${postId}`, { method: 'DELETE', token });
              setPosts((prev) => prev.filter((item) => item.id !== postId));
            } catch (e: any) {
              Alert.alert('Delete failed', e?.message ?? 'Could not delete post.');
            }
          },
        },
      ],
    );
  };

  const reportPost = async (post: ExplorePost, reason: 'SPAM' | 'HARASSMENT' | 'NUDITY' | 'SCAM' | 'OTHER') => {
    if (!token) return;
    try {
      await apiRequest('/reports', {
        method: 'POST',
        token,
        body: {
          reason,
          reportedPostId: post.id,
          ...(post.author.id ? { reportedUserId: post.author.id } : {}),
          description: `Reported from explore (${reason})`,
        },
      });
      Alert.alert('Thanks for reporting', 'Our trust and safety team will review this report.');
    } catch (e: any) {
      Alert.alert('Report failed', e?.message ?? 'Could not submit report.');
    }
  };

  const blockUserFromPost = async (post: ExplorePost) => {
    if (!token) return;
    const username = post.author.username;
    try {
      await apiRequest(`/users/${username}/block`, { method: 'POST', token });
      setPosts((prev) => prev.filter((item) => item.author.username !== username));
      Alert.alert('User blocked', `@${username} has been blocked and removed from explore.`);
    } catch (e: any) {
      Alert.alert('Block failed', e?.message ?? 'Could not block this user.');
    }
  };

  const openPostActions = (post: ExplorePost) => {
    const isOwnPost = post.author.username === user?.username;
    if (isOwnPost) {
      confirmDeletePost(post.id);
      return;
    }

    Alert.alert(
      `@${post.author.username}`,
      'Choose an action',
      [
        { text: 'Report: Spam', onPress: () => reportPost(post, 'SPAM') },
        { text: 'Report: Harassment', onPress: () => reportPost(post, 'HARASSMENT') },
        { text: 'Report: Nudity', onPress: () => reportPost(post, 'NUDITY') },
        { text: 'Report: Scam', onPress: () => reportPost(post, 'SCAM') },
        { text: 'Block user', style: 'destructive', onPress: () => blockUserFromPost(post) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#8b5cf6" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#8b5cf6" />}
        >
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>Explore</Text>

          <TextInput
            value={query}
            onChangeText={runSearch}
            placeholder="Search people"
            placeholderTextColor="#93a1bd"
            style={{ backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff' }}
          />

          {searching ? <ActivityIndicator color="#8b5cf6" /> : null}
          {error ? <Text style={{ color: '#fca5a5' }}>{error}</Text> : null}

          <Text style={{ color: '#c7d2fe', fontWeight: '800', marginTop: 4 }}>Suggested creators</Text>
          {users.length === 0 ? <Text style={{ color: '#93a1bd' }}>No users found.</Text> : null}
          {users.map((u) => (
            <View key={u.id} style={{ backgroundColor: '#111827', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#d1d5db', fontWeight: '800' }}>{u.username.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{u.displayName}</Text>
                <Text style={{ color: '#93a1bd' }}>@{u.username}</Text>
              </View>
            </View>
          ))}

          <Text style={{ color: '#c7d2fe', fontWeight: '800', marginTop: 8 }}>Discover posts</Text>
          {posts.length === 0 ? <Text style={{ color: '#93a1bd' }}>No discover posts yet.</Text> : null}
          {posts.map((p) => {
            const image = resolveMediaUrl(p.media?.[0]?.thumbnailUrl || p.media?.[0]?.url);
            const isOwnPost = p.author.username === user?.username;
            return (
              <View key={p.id} style={{ backgroundColor: '#111827', borderRadius: 12, padding: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{p.author.displayName}</Text>
                    <Text style={{ color: '#93a1bd' }}>@{p.author.username}</Text>
                  </View>
                  <Pressable
                    onPress={() => openPostActions(p)}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isOwnPost ? '#2a1620' : '#1f2937', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: isOwnPost ? '#fca5a5' : '#cbd5e1', fontSize: 18, fontWeight: '700' }}>⋯</Text>
                  </Pressable>
                </View>
                {image ? <Image source={{ uri: image }} style={{ width: '100%', height: 180, borderRadius: 10 }} resizeMode="cover" /> : null}
                {p.caption ? <Text style={{ color: '#e5e7eb', marginTop: 8 }}>{p.caption}</Text> : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
