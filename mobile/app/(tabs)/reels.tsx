import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Pressable, RefreshControl, SafeAreaView, Share, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  const { token, user } = useAuth();
  const [items, setItems] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await apiRequest<{ data: PostItem[] }>('/posts/reels', { token });
      setItems(data.data || []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load reels right now. Pull to refresh.');
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
      message: `${post.caption || 'Check out this reel on NXQ Social'}\nhttps://nxqsocial.com/feed?post=${post.id}`,
    });
  };

  const toggleSave = (postId: string) => {
    setSavedPostIds((prev) => ({ ...prev, [postId]: !prev[postId] }));
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
          description: `Reported from reels (${reason})`,
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
      Alert.alert('User blocked', `@${username} has been blocked and removed from your reels.`);
    } catch (e: any) {
      Alert.alert('Block failed', e?.message ?? 'Could not block this user.');
    }
  };

  const openPostActions = (post: PostItem) => {
    const isOwnPost = post.author.id === user?.id;
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
        <Text style={{ color: '#fff', textAlign: 'center' }}>{error || 'No reels yet.'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        data={items}
        pagingEnabled
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#8b5cf6" />}
        renderItem={({ item }) => {
          const src = resolveMediaUrl(item.media?.[0]?.url);
          const isOwnPost = item.author.id === user?.id;
          const deleting = deletingPostId === item.id;
          return (
            <View style={{ height: h, backgroundColor: '#000' }}>
              <ReelVideo uri={src} />
              <View style={{ position: 'absolute', top: 50, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 }}>Reels</Text>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(15,23,42,0.65)', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="tune-variant" size={22} color="#fff" />
                </View>
              </View>
              <Pressable
                onPress={() => openPostActions(item)}
                disabled={deleting}
                style={{
                  position: 'absolute',
                  top: 54,
                  right: 12,
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: isOwnPost ? '#2a1620' : 'rgba(15,23,42,0.75)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                <MaterialCommunityIcons
                  name={isOwnPost ? 'trash-can-outline' : 'dots-horizontal'}
                  size={20}
                  color={isOwnPost ? '#fca5a5' : '#fff'}
                />
              </Pressable>
              <View style={{ position: 'absolute', right: 14, bottom: 130, alignItems: 'center', gap: 18 }}>
                <Pressable onPress={() => toggleLike(item)} hitSlop={10} style={{ alignItems: 'center' }}>
                  <MaterialCommunityIcons name={item.isLiked ? 'heart' : 'heart-outline'} size={34} color={item.isLiked ? '#f43f5e' : '#fff'} />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{item._count?.likes ?? 0}</Text>
                </Pressable>
                <Pressable onPress={() => promptComment(item)} hitSlop={10} style={{ alignItems: 'center' }}>
                  <MaterialCommunityIcons name="comment-outline" size={32} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{item._count?.comments ?? 0}</Text>
                </Pressable>
                <Pressable onPress={() => sharePost(item)} hitSlop={10}>
                  <MaterialCommunityIcons name="send-outline" size={31} color="#fff" />
                </Pressable>
                <Pressable onPress={() => toggleSave(item.id)} hitSlop={10}>
                  <MaterialCommunityIcons name={savedPostIds[item.id] ? 'bookmark' : 'bookmark-outline'} size={31} color={savedPostIds[item.id] ? '#a78bfa' : '#fff'} />
                </Pressable>
              </View>
              <View style={{ position: 'absolute', left: 14, right: 84, bottom: 88 }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>@{item.author.username}</Text>
                {item.caption ? <Text numberOfLines={2} style={{ color: '#e5e7eb', marginTop: 6, fontWeight: '600' }}>{item.caption}</Text> : null}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
