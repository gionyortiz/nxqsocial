import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, Share, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiRequest, PostItem, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface StoryCandidate {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isLive?: boolean;
  hasRecentPost?: boolean;
  liveRoom?: string | null;
}

interface StoriesResponse {
  storyCandidates: StoryCandidate[];
  suggestedCreators?: StoryCandidate[];
}

interface RankedCreator {
  username: string;
  displayName: string;
  verificationStatus?: string;
  trustScore?: number;
  engagement: number;
  score: number;
}

type FeedMode = 'FOR_YOU' | 'FOLLOWING';

const FEED_STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'your', 'just', 'more', 'into', 'about', 'what', 'when',
  'they', 'them', 'their', 'there', 'will', 'would', 'could', 'should', 'after', 'before', 'only',
  'over', 'under', 'here', 'today', 'tonight', 'check', 'post', 'reel', 'video', 'photo',
]);

function buildTrendingTopics(posts: PostItem[]) {
  const score = new Map<string, number>();
  for (const post of posts) {
    const caption = (post.caption || '').toLowerCase();
    const tags = caption.match(/#[a-z0-9_]{3,}/g) || [];
    for (const tag of tags) {
      score.set(tag, (score.get(tag) || 0) + 3);
    }

    const words = caption.match(/[a-z0-9_]{4,}/g) || [];
    for (const word of words) {
      if (FEED_STOPWORDS.has(word)) continue;
      score.set(`#${word}`, (score.get(`#${word}`) || 0) + 1);
    }
  }

  return Array.from(score.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map((entry) => entry[0]);
}

function buildTrustRankedCreators(posts: PostItem[], suggestions: StoryCandidate[], currentUsername?: string): RankedCreator[] {
  const creators = new Map<string, RankedCreator>();

  for (const post of posts) {
    if (!post.author?.username) continue;
    const current = creators.get(post.author.username);
    const engagement = (post._count?.likes || 0) + (post._count?.comments || 0);
    const verificationBoost = post.author.verificationStatus && post.author.verificationStatus !== 'UNVERIFIED' ? 20 : 0;
    const trustBase = typeof post.author.trustScore === 'number' ? post.author.trustScore : 50;
    const next: RankedCreator = {
      username: post.author.username,
      displayName: post.author.displayName || post.author.username,
      verificationStatus: post.author.verificationStatus,
      trustScore: post.author.trustScore,
      engagement: (current?.engagement || 0) + engagement,
      score: (current?.score || 0) + trustBase + verificationBoost + Math.min(engagement, 50),
    };
    creators.set(post.author.username, next);
  }

  for (const suggestion of suggestions) {
    if (!creators.has(suggestion.username)) {
      creators.set(suggestion.username, {
        username: suggestion.username,
        displayName: suggestion.displayName || suggestion.username,
        engagement: 0,
        score: 45,
      });
    }
  }

  return Array.from(creators.values())
    .filter((creator) => creator.username !== currentUsername)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function PostCard({
  post,
  isOwnPost,
  saved,
  deleting,
  onLike,
  onComment,
  onShare,
  onSave,
  onOpenActions,
  onOpenAuthor,
}: {
  post: PostItem;
  isOwnPost: boolean;
  saved: boolean;
  deleting: boolean;
  onLike: (post: PostItem) => void;
  onComment: (post: PostItem) => void;
  onShare: (post: PostItem) => void;
  onSave: (postId: string) => void;
  onOpenActions: (post: PostItem) => void;
  onOpenAuthor: (username: string) => void;
}) {
  const first = post.media?.[0];
  const mediaUrl = resolveMediaUrl(first?.thumbnailUrl || first?.url);
  const initials = (post.author.displayName || post.author.username || 'NX').slice(0, 2).toUpperCase();
  return (
    <View style={{ backgroundColor: '#111827', borderRadius: 18, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1f2937' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#312e81', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#ddd6fe', fontWeight: '900' }}>{initials}</Text>
        </View>
        <Pressable onPress={() => onOpenAuthor(post.author.username)} style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{post.author.displayName}</Text>
          <Text style={{ color: '#93a1bd', marginTop: 2 }}>@{post.author.username}</Text>
        </Pressable>
        <Pressable
          onPress={() => onOpenActions(post)}
          disabled={deleting}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isOwnPost ? '#2a1620' : '#1f2937', alignItems: 'center', justifyContent: 'center', opacity: deleting ? 0.6 : 1 }}
        >
          <MaterialCommunityIcons name={isOwnPost ? 'trash-can-outline' : 'dots-horizontal'} size={18} color={isOwnPost ? '#fca5a5' : '#cbd5e1'} />
        </Pressable>
      </View>
      {mediaUrl ? (
        <Image source={{ uri: mediaUrl }} style={{ width: '100%', height: 330, backgroundColor: '#0b1020' }} resizeMode="cover" />
      ) : null}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Pressable onPress={() => onLike(post)} hitSlop={10}>
            <MaterialCommunityIcons name={post.isLiked ? 'heart' : 'heart-outline'} size={26} color={post.isLiked ? '#f43f5e' : '#f8fafc'} />
          </Pressable>
          <Pressable onPress={() => onComment(post)} hitSlop={10}>
            <MaterialCommunityIcons name="comment-outline" size={25} color="#f8fafc" />
          </Pressable>
          <Pressable onPress={() => onShare(post)} hitSlop={10}>
            <MaterialCommunityIcons name="send-outline" size={24} color="#f8fafc" />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => onSave(post.id)} hitSlop={10}>
            <MaterialCommunityIcons name={saved ? 'bookmark' : 'bookmark-outline'} size={25} color={saved ? '#a78bfa' : '#f8fafc'} />
          </Pressable>
        </View>
        <Text style={{ color: '#f8fafc', marginTop: 8, fontWeight: '800' }}>{post._count?.likes ?? 0} likes</Text>
        {post.caption ? (
          <Text style={{ color: '#e5e7eb', marginTop: 5 }}>
            <Text onPress={() => onOpenAuthor(post.author.username)} style={{ fontWeight: '900', color: '#fff' }}>{post.author.username} </Text>
            {post.caption}
          </Text>
        ) : null}
        <Pressable onPress={() => onComment(post)} hitSlop={8}>
          <Text style={{ color: '#93a1bd', marginTop: 6, fontSize: 12 }}>View all {post._count?.comments ?? 0} comments</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [items, setItems] = useState<PostItem[]>([]);
  const [stories, setStories] = useState<StoryCandidate[]>([]);
  const [suggestedCreators, setSuggestedCreators] = useState<StoryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Record<string, boolean>>({});
  const [followedUsers, setFollowedUsers] = useState<Record<string, boolean>>({});
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<FeedMode>('FOR_YOU');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const trendingTopics = useMemo(() => buildTrendingTopics(items), [items]);
  const activeCreators = useMemo(() => new Set(items.map((item) => item.author.id)).size, [items]);
  const liveNowCreators = useMemo(() => stories.filter((story) => story.isLive), [stories]);
  const trustRankedCreators = useMemo(
    () => buildTrustRankedCreators(items, suggestedCreators, user?.username),
    [items, suggestedCreators, user?.username],
  );
  const visibleItems = useMemo(() => {
    if (!selectedTopic) return items;
    const topic = selectedTopic.toLowerCase().replace(/^#/, '');
    return items.filter((post) => (post.caption || '').toLowerCase().includes(topic));
  }, [items, selectedTopic]);

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const [feedData, storiesData] = await Promise.all([
        apiRequest<{ data: PostItem[] }>(`/posts/feed?mode=${mode}`, { token }),
        apiRequest<StoriesResponse>('/feed/stories?take=15', { token }),
      ]);
      setItems(feedData.data || []);
      setStories(storiesData.storyCandidates || []);
      setSuggestedCreators(storiesData.suggestedCreators || []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, mode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [token, mode]),
  );

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
              setDeletingPostId(postId);
              await apiRequest(`/posts/${postId}`, { method: 'DELETE', token });
              setItems((prev) => prev.filter((item) => item.id !== postId));
            } catch (e: any) {
              Alert.alert('Delete failed', e?.message ?? 'Could not delete post.');
            } finally {
              setDeletingPostId(null);
            }
          },
        },
      ],
    );
  };

  const toggleLike = async (post: PostItem) => {
    if (!token) return;
    const wasLiked = !!post.isLiked;
    const previousCount = post._count?.likes ?? 0;
    setItems((prev) => prev.map((item) => item.id === post.id ? {
      ...item,
      isLiked: !wasLiked,
      _count: { ...(item._count ?? { likes: 0, comments: 0 }), likes: Math.max(0, previousCount + (wasLiked ? -1 : 1)) },
    } : item));
    try {
      const data = await apiRequest<{ liked: boolean; count: number }>(`/posts/${post.id}/likes`, { method: 'POST', token });
      setItems((prev) => prev.map((item) => item.id === post.id ? {
        ...item,
        isLiked: data.liked,
        _count: { ...(item._count ?? { likes: 0, comments: 0 }), likes: data.count },
      } : item));
    } catch (e: any) {
      setItems((prev) => prev.map((item) => item.id === post.id ? {
        ...item,
        isLiked: wasLiked,
        _count: { ...(item._count ?? { likes: 0, comments: 0 }), likes: previousCount },
      } : item));
      Alert.alert('Like failed', e?.message ?? 'Could not update like.');
    }
  };

  const promptComment = (post: PostItem) => {
    if (Platform.OS === 'web') {
      Alert.alert('Comments on web', 'Opening the text prompt is not supported in this web runtime yet. Please comment from the mobile app build.');
      return;
    }

    Alert.prompt(
      'Add comment',
      `Reply to @${post.author.username}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Post',
          onPress: async (value?: string) => {
            const content = (value || '').trim();
            if (!content || !token) return;
            try {
              await apiRequest(`/posts/${post.id}/comments`, { method: 'POST', token, body: { content } });
              setItems((prev) => prev.map((item) => item.id === post.id ? {
                ...item,
                _count: { ...(item._count ?? { likes: 0, comments: 0 }), comments: (item._count?.comments ?? 0) + 1 },
              } : item));
            } catch (e: any) {
              Alert.alert('Comment failed', e?.message ?? 'Could not post comment.');
            }
          },
        },
      ],
      'plain-text',
    );
  };

  const sharePost = async (post: PostItem) => {
    const message = `${post.caption || 'Check out this post on NXQ Social'}\nhttps://nxqsocial.com/feed?post=${post.id}`;
    try {
      if (Platform.OS === 'web') {
        const webNavigator = typeof navigator !== 'undefined' ? (navigator as any) : undefined;
        if (webNavigator?.share) {
          await webNavigator.share({ text: message });
          return;
        }
        if (webNavigator?.clipboard?.writeText) {
          await webNavigator.clipboard.writeText(message);
          Alert.alert('Link copied', 'Share is not available in this browser, so we copied the post link.');
          return;
        }
        Alert.alert('Share unavailable', 'This browser cannot open the share sheet.');
        return;
      }

      await Share.share({ message });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      Alert.alert('Share unavailable', 'This browser cannot open the share sheet.');
    }
  };

  const reportPost = async (post: PostItem, reason: 'SPAM' | 'HARASSMENT' | 'NUDITY' | 'SCAM' | 'OTHER') => {
    if (!token) return;
    try {
      await apiRequest('/reports', {
        method: 'POST',
        token,
        body: {
          reason,
          reportedPostId: post.id,
          reportedUserId: post.author.id,
          description: `Reported from mobile feed (${reason})`,
        },
      });
      Alert.alert('Thanks for reporting', 'Our trust and safety team will review this report.');
    } catch (e: any) {
      Alert.alert('Report failed', e?.message ?? 'Could not submit report.');
    }
  };

  const blockUserFromPost = async (post: PostItem) => {
    if (!token) return;
    const username = post.author.username;
    try {
      await apiRequest(`/users/${username}/block`, { method: 'POST', token });
      setItems((prev) => prev.filter((item) => item.author.id !== post.author.id));
      Alert.alert('User blocked', `@${username} has been blocked and removed from your feed.`);
    } catch (e: any) {
      Alert.alert('Block failed', e?.message ?? 'Could not block this user.');
    }
  };

  const openPostActions = (post: PostItem) => {
    const isOwnPost = post.author.id === user?.id;
    if (isOwnPost) {
      Alert.alert(
        'Post actions',
        undefined,
        [
          { text: 'Delete post', style: 'destructive', onPress: () => confirmDeletePost(post.id) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
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

  const openUserProfile = (username: string) => {
    router.push({ pathname: '/user/[username]', params: { username } });
  };

  const openLiveRoom = (story: StoryCandidate) => {
    if (story.liveRoom) {
      router.push({ pathname: '/live-room', params: { room: story.liveRoom } });
      return;
    }
    router.push('/live');
  };

  const toggleSave = async (postId: string) => {
    if (!token) return;
    const previous = !!savedPostIds[postId];
    setSavedPostIds((prev) => ({ ...prev, [postId]: !previous }));
    try {
      const data = await apiRequest<{ saved: boolean }>(`/posts/${postId}/save`, { method: 'POST', token });
      setSavedPostIds((prev) => ({ ...prev, [postId]: !!data.saved }));
    } catch (e: any) {
      setSavedPostIds((prev) => ({ ...prev, [postId]: previous }));
      Alert.alert('Save failed', e?.message ?? 'Could not update saved state.');
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#8b5cf6" />
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#8b5cf6" />}
          ListHeaderComponent={(
            <View style={{ marginBottom: 12, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>{mode === 'FOR_YOU' ? 'For You' : 'Following'}</Text>
                  <Text style={{ color: '#93a1bd', marginTop: 2 }}>
                    {mode === 'FOR_YOU' ? 'Fresh posts from your world' : 'Latest posts from creators you follow'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Pressable
                      onPress={() => setMode('FOR_YOU')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: mode === 'FOR_YOU' ? '#4f46e5' : '#111827',
                        borderWidth: 1,
                        borderColor: mode === 'FOR_YOU' ? '#818cf8' : '#374151',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>For You</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setMode('FOLLOWING')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: mode === 'FOLLOWING' ? '#4f46e5' : '#111827',
                        borderWidth: 1,
                        borderColor: mode === 'FOLLOWING' ? '#818cf8' : '#374151',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Following</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="magnify" size={21} color="#e5e7eb" />
                  </View>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="bell-outline" size={20} color="#e5e7eb" />
                  </View>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                <View style={{ alignItems: 'center', width: 72 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#6366f1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151d33' }}>
                    <Text style={{ color: '#a5b4fc', fontWeight: '800' }}>You</Text>
                  </View>
                  <Text numberOfLines={1} style={{ marginTop: 6, color: '#c7d2fe', fontSize: 11 }}>Your story</Text>
                </View>

                {stories.map((story) => (
                  <Pressable key={story.id} onPress={() => story.isLive ? openLiveRoom(story) : openUserProfile(story.username)} style={{ alignItems: 'center', width: 72 }}>
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
                  </Pressable>
                ))}
              </ScrollView>

              <View style={{ backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', padding: 12, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#312e81', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#ddd6fe', fontWeight: '900' }}>{(user?.displayName || user?.username || 'NX').slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <Pressable
                    onPress={() => router.push('/create')}
                    style={{ flex: 1, backgroundColor: '#151d33', borderRadius: 999, borderWidth: 1, borderColor: '#28324a', paddingVertical: 10, paddingHorizontal: 14 }}
                  >
                    <Text style={{ color: '#93a1bd', fontWeight: '700' }}>What's on your mind?</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => router.push('/create')} style={{ flex: 1, borderRadius: 12, backgroundColor: '#151d33', paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="image-outline" size={16} color="#fda4af" />
                    <Text style={{ color: '#cbd5e1', fontWeight: '700', fontSize: 12 }}>Photo</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push('/create')} style={{ flex: 1, borderRadius: 12, backgroundColor: '#151d33', paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="movie-open-play-outline" size={16} color="#93c5fd" />
                    <Text style={{ color: '#cbd5e1', fontWeight: '700', fontSize: 12 }}>Reel</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push('/more')} style={{ flex: 1, borderRadius: 12, backgroundColor: '#151d33', paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="video-wireless-outline" size={16} color="#6ee7b7" />
                    <Text style={{ color: '#cbd5e1', fontWeight: '700', fontSize: 12 }}>Live</Text>
                  </Pressable>
                </View>
              </View>

              {stories.length > 0 || suggestedCreators.length > 0 ? (
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>People you may know</Text>
                    <Pressable onPress={() => router.push('/more')}>
                      <Text style={{ color: '#a5b4fc', fontWeight: '800', fontSize: 12 }}>See all</Text>
                    </Pressable>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                    {(suggestedCreators.length ? suggestedCreators : stories)
                      .filter((s) => s.username !== user?.username)
                      .slice(0, 8)
                      .map((s) => {
                        const following = !!followedUsers[s.username];
                        const busy = !!followBusy[s.username];
                        return (
                          <View key={`suggest-${s.id}`} style={{ width: 156, backgroundColor: '#111827', borderRadius: 14, borderWidth: 1, borderColor: '#1f2937', padding: 10, gap: 8 }}>
                            <Pressable onPress={() => openUserProfile(s.username)} style={{ alignItems: 'center', gap: 6 }}>
                              <View style={{ width: 54, height: 54, borderRadius: 27, overflow: 'hidden', backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' }}>
                                {s.avatarUrl ? (
                                  <Image source={{ uri: resolveMediaUrl(s.avatarUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                ) : (
                                  <Text style={{ color: '#d1d5db', fontWeight: '900' }}>{s.username.slice(0, 2).toUpperCase()}</Text>
                                )}
                              </View>
                              <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{s.displayName || s.username}</Text>
                              <Text numberOfLines={1} style={{ color: '#93a1bd', fontSize: 11 }}>@{s.username}</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => followCreator(s.username)}
                              disabled={following || busy}
                              style={{ borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: following ? '#243047' : '#4f46e5', opacity: busy ? 0.75 : 1 }}
                            >
                              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                                {following ? 'Following' : busy ? 'Following...' : 'Follow'}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={{ backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', padding: 12, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Live now</Text>
                  <Pressable onPress={() => router.push('/live')}>
                    <Text style={{ color: '#a5b4fc', fontWeight: '800', fontSize: 12 }}>Open live</Text>
                  </Pressable>
                </View>
                {liveNowCreators.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                    {liveNowCreators.map((creator) => (
                      <Pressable
                        key={`live-${creator.id}`}
                        onPress={() => openLiveRoom(creator)}
                        style={{ width: 160, backgroundColor: '#151d33', borderRadius: 14, borderWidth: 1, borderColor: '#ef4444', padding: 10, gap: 8 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' }} />
                          <Text style={{ color: '#fecaca', fontSize: 11, fontWeight: '900' }}>LIVE</Text>
                        </View>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }} numberOfLines={1}>{creator.displayName}</Text>
                        <Text style={{ color: '#93a1bd', fontSize: 11 }} numberOfLines={1}>@{creator.username}</Text>
                        <Text style={{ color: '#cbd5e1', fontSize: 11 }} numberOfLines={2}>
                          Tap to open NXQ Live and join the broadcast.
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={{ backgroundColor: '#151d33', borderRadius: 12, padding: 12, gap: 8 }}>
                    <Text style={{ color: '#e5e7eb', fontWeight: '800' }}>No live broadcasts right now</Text>
                    <Text style={{ color: '#93a1bd', fontSize: 12 }}>When someone goes live, they’ll appear here automatically.</Text>
                    <Pressable onPress={() => router.push('/live')} style={{ alignSelf: 'flex-start', backgroundColor: '#7c3aed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Open Live</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <View style={{ backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', padding: 12, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>NXQ Pulse</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 11, fontWeight: '700' }}>Blend of your network + trends</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: '#151d33', borderRadius: 12, padding: 10 }}>
                    <Text style={{ color: '#93a1bd', fontSize: 11 }}>Active creators</Text>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 4 }}>{activeCreators}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#151d33', borderRadius: 12, padding: 10 }}>
                    <Text style={{ color: '#93a1bd', fontSize: 11 }}>Story rings</Text>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 4 }}>{stories.length}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#151d33', borderRadius: 12, padding: 10 }}>
                    <Text style={{ color: '#93a1bd', fontSize: 11 }}>Fresh drops</Text>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 4 }}>{items.length}</Text>
                  </View>
                </View>
                <View>
                  <Text style={{ color: '#cbd5e1', fontWeight: '800', marginBottom: 8, fontSize: 12 }}>Trending now</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                    {(trendingTopics.length ? trendingTopics : ['#creatorlife', '#reels', '#nxqsocial'])
                      .map((topic) => {
                        const active = selectedTopic === topic;
                        return (
                          <Pressable
                            key={topic}
                            onPress={() => setSelectedTopic((prev) => (prev === topic ? null : topic))}
                            style={{
                              backgroundColor: active ? '#4f46e5' : '#0f172a',
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: active ? '#818cf8' : '#334155',
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                            }}
                          >
                            <Text style={{ color: '#c7d2fe', fontWeight: '800', fontSize: 12 }}>{topic}</Text>
                          </Pressable>
                        );
                      })}
                  </ScrollView>
                  {selectedTopic ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <Text style={{ color: '#93a1bd', fontSize: 12 }}>Showing posts for {selectedTopic}</Text>
                      <Pressable onPress={() => setSelectedTopic(null)}>
                        <Text style={{ color: '#a5b4fc', fontSize: 12, fontWeight: '800' }}>Clear</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={{ backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', padding: 12, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Trust-ranked creators</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 11, fontWeight: '700' }}>NXQ signature mix</Text>
                </View>
                {trustRankedCreators.length > 0 ? trustRankedCreators.map((creator, i) => {
                  const following = !!followedUsers[creator.username];
                  const busy = !!followBusy[creator.username];
                  return (
                    <View key={`trust-${creator.username}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#151d33', borderRadius: 12, padding: 10 }}>
                      <View style={{ width: 28, alignItems: 'center' }}>
                        <Text style={{ color: '#a5b4fc', fontWeight: '900' }}>#{i + 1}</Text>
                      </View>
                      <Pressable onPress={() => openUserProfile(creator.username)} style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }} numberOfLines={1}>{creator.displayName}</Text>
                          {creator.verificationStatus && creator.verificationStatus !== 'UNVERIFIED' ? (
                            <MaterialCommunityIcons name="check-decagram" size={14} color="#60a5fa" />
                          ) : null}
                        </View>
                        <Text style={{ color: '#93a1bd', fontSize: 11 }} numberOfLines={1}>
                          @{creator.username}  •  trust {Math.round(creator.trustScore ?? 50)}  •  engagement {creator.engagement}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => followCreator(creator.username)}
                        disabled={following || busy}
                        style={{ borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: following ? '#243047' : '#4f46e5', opacity: busy ? 0.75 : 1 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{following ? 'Following' : busy ? '...' : 'Follow'}</Text>
                      </Pressable>
                    </View>
                  );
                }) : (
                  <View style={{ backgroundColor: '#151d33', borderRadius: 12, padding: 12, gap: 8 }}>
                    <Text style={{ color: '#e5e7eb', fontWeight: '800' }}>No ranked creators yet</Text>
                    <Text style={{ color: '#93a1bd', fontSize: 12 }}>As you follow and engage more, your trust-ranked creator panel will auto-populate.</Text>
                    <Pressable onPress={() => router.push('/more')} style={{ alignSelf: 'flex-start', backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={{ color: '#e5e7eb', fontWeight: '800', fontSize: 11 }}>Find creators</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={(
            <View style={{ marginTop: 10, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937', borderRadius: 14, padding: 14, gap: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{selectedTopic ? `No posts for ${selectedTopic}` : 'Your feed is quiet'}</Text>
              <Text style={{ color: '#93a1bd' }}>
                {error || (selectedTopic ? 'Try a different trend or clear the filter.' : 'Follow creators, post your first update, and this space will populate fast.')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {selectedTopic ? (
                  <Pressable onPress={() => setSelectedTopic(null)} style={{ backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                    <Text style={{ color: '#e5e7eb', fontWeight: '800', fontSize: 12 }}>Clear topic</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => router.push('/create')} style={{ backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Create post</Text>
                </Pressable>
                <Pressable onPress={load} style={{ backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                  <Text style={{ color: '#e5e7eb', fontWeight: '800', fontSize: 12 }}>Refresh feed</Text>
                </Pressable>
              </View>
            </View>
          )}
          renderItem={({ item, index }) => (
            <View>
              <PostCard
                post={item}
                isOwnPost={item.author.id === user?.id}
                saved={!!savedPostIds[item.id]}
                deleting={deletingPostId === item.id}
                onLike={toggleLike}
                onComment={promptComment}
                onShare={sharePost}
                onSave={toggleSave}
                onOpenActions={openPostActions}
                onOpenAuthor={openUserProfile}
              />
              {(index + 1) % 2 === 0 || (items.length === 1 && index === 0) ? (
                <View style={{ backgroundColor: '#111827', borderRadius: 14, borderWidth: 1, borderColor: '#1f2937', padding: 12, marginBottom: 14, gap: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>Community momentum</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 12 }}>
                    {activeCreators} creators are active in your timeline right now.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => setMode('FOLLOWING')} style={{ backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={{ color: '#e5e7eb', fontWeight: '800', fontSize: 11 }}>See Following</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/create')} style={{ backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Create now</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
