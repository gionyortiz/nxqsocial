import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiRequest, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type UserResult = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  verificationStatus?: string;
  trustScore?: number;
};

type ExplorePost = {
  id: string;
  caption?: string;
  media?: { url?: string; thumbnailUrl?: string }[];
  author: { id?: string; username: string; displayName: string; verificationStatus?: string };
  _count?: { likes: number; comments: number };
};

const EXPLORE_STOPWORDS = new Set(['this', 'that', 'with', 'from', 'have', 'your', 'just', 'more', 'into', 'about', 'post', 'video', 'photo']);

function buildExploreTrends(posts: ExplorePost[]) {
  const score = new Map<string, number>();
  for (const post of posts) {
    const caption = (post.caption || '').toLowerCase();
    const tags = caption.match(/#[a-z0-9_]{3,}/g) || [];
    for (const tag of tags) score.set(tag, (score.get(tag) || 0) + 3);
    const words = caption.match(/[a-z0-9_]{4,}/g) || [];
    for (const word of words) {
      if (EXPLORE_STOPWORDS.has(word)) continue;
      score.set(`#${word}`, (score.get(`#${word}`) || 0) + 1);
    }
  }
  return Array.from(score.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([topic]) => topic);
}

export default function ExploreScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followedUsers, setFollowedUsers] = useState<Record<string, boolean>>({});
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const trendingTopics = useMemo(() => buildExploreTrends(posts), [posts]);
  const visiblePosts = useMemo(() => {
    if (!selectedTopic) return posts;
    const normalized = selectedTopic.toLowerCase().replace(/^#/, '');
    return posts.filter((post) => (post.caption || '').toLowerCase().includes(normalized));
  }, [posts, selectedTopic]);

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

  const followCreator = async (username: string) => {
    if (!token || followBusy[username] || followedUsers[username]) return;
    setFollowBusy((prev) => ({ ...prev, [username]: true }));
    try {
      await apiRequest(`/users/${username}/follow`, { method: 'POST', token });
      setFollowedUsers((prev) => ({ ...prev, [username]: true }));
    } catch (e: any) {
      Alert.alert('Follow failed', e?.message ?? 'Could not follow this creator right now.');
    } finally {
      setFollowBusy((prev) => ({ ...prev, [username]: false }));
    }
  };

  const openUserProfile = (username: string) => {
    router.push({ pathname: '/user/[username]', params: { username } });
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
          <Text style={{ color: '#93a1bd' }}>Discover creators, trending topics, and standout posts across NXQ.</Text>

          <TextInput
            value={query}
            onChangeText={runSearch}
            placeholder="Search people or creators"
            placeholderTextColor="#93a1bd"
            style={{ backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff' }}
          />

          {searching ? <ActivityIndicator color="#8b5cf6" /> : null}
          {error ? <Text style={{ color: '#fca5a5' }}>{error}</Text> : null}

          <View style={{ backgroundColor: '#111827', borderRadius: 14, padding: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Trending topics</Text>
              {selectedTopic ? (
                <Pressable onPress={() => setSelectedTopic(null)}>
                  <Text style={{ color: '#a5b4fc', fontWeight: '800', fontSize: 12 }}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
              {(trendingTopics.length ? trendingTopics : ['#discover', '#creators', '#nxqsocial']).map((topic) => {
                const active = selectedTopic === topic;
                return (
                  <Pressable
                    key={topic}
                    onPress={() => setSelectedTopic((prev) => prev === topic ? null : topic)}
                    style={{ backgroundColor: active ? '#4f46e5' : '#151d33', borderRadius: 999, borderWidth: 1, borderColor: active ? '#818cf8' : '#334155', paddingHorizontal: 12, paddingVertical: 7 }}
                  >
                    <Text style={{ color: '#e0e7ff', fontWeight: '800', fontSize: 12 }}>{topic}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <Text style={{ color: '#c7d2fe', fontWeight: '800', marginTop: 4 }}>Suggested creators</Text>
          {users.length === 0 ? <Text style={{ color: '#93a1bd' }}>No users found.</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
            {users.map((u) => {
              const following = !!followedUsers[u.username];
              const busy = !!followBusy[u.username];
              return (
                <View key={u.id} style={{ width: 168, backgroundColor: '#111827', borderRadius: 14, padding: 12, gap: 10, borderWidth: 1, borderColor: '#1f2937' }}>
                  <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {u.avatarUrl ? (
                      <Image source={{ uri: resolveMediaUrl(u.avatarUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <Text style={{ color: '#d1d5db', fontWeight: '800' }}>{u.username.slice(0, 2).toUpperCase()}</Text>
                    )}
                  </View>
                  <Pressable onPress={() => openUserProfile(u.username)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: '#fff', fontWeight: '800' }} numberOfLines={1}>{u.displayName}</Text>
                      {u.verificationStatus && u.verificationStatus !== 'UNVERIFIED' ? (
                        <MaterialCommunityIcons name="check-decagram" size={14} color="#60a5fa" />
                      ) : null}
                    </View>
                    <Text style={{ color: '#93a1bd', marginTop: 3 }} numberOfLines={1}>@{u.username}</Text>
                    <Text style={{ color: '#cbd5e1', marginTop: 5, fontSize: 11 }}>Trust {Math.round(u.trustScore ?? 50)}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => followCreator(u.username)}
                    disabled={following || busy}
                    style={{ borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: following ? '#243047' : '#4f46e5', opacity: busy ? 0.75 : 1 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{following ? 'Following' : busy ? 'Following...' : 'Follow'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <Text style={{ color: '#c7d2fe', fontWeight: '800', marginTop: 8 }}>Discover posts</Text>
          {visiblePosts.length === 0 ? <Text style={{ color: '#93a1bd' }}>{selectedTopic ? `No discover posts for ${selectedTopic}.` : 'No discover posts yet.'}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
          {visiblePosts.map((p, index) => {
            const image = resolveMediaUrl(p.media?.[0]?.thumbnailUrl || p.media?.[0]?.url);
            const isOwnPost = p.author.username === user?.username;
            return (
              <View key={p.id} style={{ backgroundColor: '#111827', borderRadius: 12, padding: 10, width: '48%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Pressable onPress={() => openUserProfile(p.author.username)} style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>{p.author.displayName}</Text>
                    <Text style={{ color: '#93a1bd' }} numberOfLines={1}>@{p.author.username}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openPostActions(p)}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isOwnPost ? '#2a1620' : '#1f2937', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: isOwnPost ? '#fca5a5' : '#cbd5e1', fontSize: 18, fontWeight: '700' }}>⋯</Text>
                  </Pressable>
                </View>
                {image ? <Image source={{ uri: image }} style={{ width: '100%', height: index % 3 === 0 ? 200 : 140, borderRadius: 10 }} resizeMode="cover" /> : null}
                {p.caption ? <Text numberOfLines={3} style={{ color: '#e5e7eb', marginTop: 8 }}>{p.caption}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <Text style={{ color: '#93a1bd', fontSize: 11 }}>{p._count?.likes ?? 0} likes</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 11 }}>{p._count?.comments ?? 0} comments</Text>
                </View>
              </View>
            );
          })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
