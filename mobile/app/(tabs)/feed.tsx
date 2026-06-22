import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, Share, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
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
}

interface StoriesResponse {
  storyCandidates: StoryCandidate[];
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
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{post.author.displayName}</Text>
          <Text style={{ color: '#93a1bd', marginTop: 2 }}>@{post.author.username}</Text>
        </View>
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
            <Text style={{ fontWeight: '900', color: '#fff' }}>{post.author.username} </Text>
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
  const { token, user } = useAuth();
  const [items, setItems] = useState<PostItem[]>([]);
  const [stories, setStories] = useState<StoryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Record<string, boolean>>({});

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
    await Share.share({
      message: `${post.caption || 'Check out this post on NXQ Social'}\nhttps://nxqsocial.com/feed?post=${post.id}`,
    });
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

  const toggleSave = (postId: string) => {
    setSavedPostIds((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

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
            <View style={{ marginBottom: 12, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>For You</Text>
                  <Text style={{ color: '#93a1bd', marginTop: 2 }}>Fresh posts from your world</Text>
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
          renderItem={({ item }) => (
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
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
