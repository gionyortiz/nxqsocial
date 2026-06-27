import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Platform, Pressable, RefreshControl, SafeAreaView, Share, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { apiRequest, PostItem, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const h = Dimensions.get('window').height;

function ReelVideo({ uri, focused }: { uri: string; focused: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (focused) {
      player.currentTime = 0;
      player.play();
      return;
    }

    player.pause();
  }, [focused, player]);

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

export default function ReelsScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [items, setItems] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Record<string, boolean>>({});
  const [followedCreators, setFollowedCreators] = useState<Record<string, boolean>>({});
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<'FOR_YOU' | 'FOLLOWING'>('FOR_YOU');
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: PostItem }> }) => {
    const nextActive = viewableItems[0]?.item?.id ?? null;
    setActivePostId(nextActive);
  }).current;

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await apiRequest<{ data: PostItem[] }>(`/posts/reels?mode=${mode}`, { token });
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
  }, [token, mode]);

  useEffect(() => {
    if (items.length > 0 && !activePostId) {
      setActivePostId(items[0].id);
    }
  }, [items, activePostId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [token, mode]),
  );

  const followCreator = async (username: string) => {
    if (!token || followBusy[username] || followedCreators[username]) return;
    setFollowBusy((prev) => ({ ...prev, [username]: true }));
    try {
      const data = await apiRequest<{ following: boolean }>(`/users/${username}/follow`, {
        method: 'POST',
        token,
      });
      setFollowedCreators((prev) => ({ ...prev, [username]: !!data.following }));
    } catch (e: any) {
      Alert.alert('Follow failed', e?.message ?? 'Could not follow this creator right now.');
    } finally {
      setFollowBusy((prev) => ({ ...prev, [username]: false }));
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
    const message = `${post.caption || 'Check out this reel on NXQ Social'}\nhttps://nxqsocial.com/feed?post=${post.id}`;
    try {
      if (Platform.OS === 'web') {
        const webNavigator = typeof navigator !== 'undefined' ? (navigator as any) : undefined;
        if (webNavigator?.share) {
          await webNavigator.share({ text: message });
          return;
        }
        if (webNavigator?.clipboard?.writeText) {
          await webNavigator.clipboard.writeText(message);
          Alert.alert('Link copied', 'Share is not available in this browser, so we copied the reel link.');
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

  const openUserProfile = (username: string) => {
    router.push({ pathname: '/user/[username]', params: { username } });
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
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <Pressable
            onPress={() => setMode('FOR_YOU')}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: mode === 'FOR_YOU' ? 'rgba(99,102,241,0.95)' : 'rgba(15,23,42,0.65)',
              borderWidth: 1,
              borderColor: mode === 'FOR_YOU' ? '#818cf8' : 'rgba(148,163,184,0.35)',
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
              backgroundColor: mode === 'FOLLOWING' ? 'rgba(99,102,241,0.95)' : 'rgba(15,23,42,0.65)',
              borderWidth: 1,
              borderColor: mode === 'FOLLOWING' ? '#818cf8' : 'rgba(148,163,184,0.35)',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Following</Text>
          </Pressable>
        </View>
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '900', fontSize: 18 }}>No reels yet</Text>
        <Text style={{ color: '#93a1bd', textAlign: 'center', marginTop: 8 }}>
          {error || (mode === 'FOLLOWING' ? 'Follow more creators to unlock your Following reel stream.' : 'Start posting short videos to light up this tab.')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Pressable onPress={load} style={{ backgroundColor: '#1f2937', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Refresh</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        data={items}
        pagingEnabled
        keyExtractor={(item) => item.id}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#8b5cf6" />}
        renderItem={({ item }) => {
          const preferredVideo = item.media?.find((asset) => (asset.mimeType || '').startsWith('video/') && !!asset.url);
          const primaryAsset = preferredVideo ?? item.media?.find((asset) => !!asset.url) ?? item.media?.[0];
          const src = resolveMediaUrl(primaryAsset?.url || '');
          const fallbackImage = resolveMediaUrl(primaryAsset?.thumbnailUrl || primaryAsset?.url || '');
          const isPlayableVideo = !!src && (primaryAsset?.mimeType || '').startsWith('video/');
          const isOwnPost = item.author.id === user?.id;
          const deleting = deletingPostId === item.id;
          const focused = activePostId === item.id;
          return (
            <View style={{ height: h, backgroundColor: '#000' }}>
              {isPlayableVideo ? (
                <ReelVideo uri={src} focused={focused} />
              ) : fallbackImage ? (
                <Image source={{ uri: fallbackImage }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                  <MaterialCommunityIcons name="video-off-outline" size={34} color="#94a3b8" />
                  <Text style={{ color: '#cbd5e1', marginTop: 10, textAlign: 'center' }}>
                    Reel video is still processing. Pull to refresh in a moment.
                  </Text>
                </View>
              )}
              <View style={{ position: 'absolute', top: 50, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 }}>Reels</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Pressable
                      onPress={() => setMode('FOR_YOU')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: mode === 'FOR_YOU' ? 'rgba(99,102,241,0.95)' : 'rgba(15,23,42,0.65)',
                        borderWidth: 1,
                        borderColor: mode === 'FOR_YOU' ? '#818cf8' : 'rgba(148,163,184,0.35)',
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
                        backgroundColor: mode === 'FOLLOWING' ? 'rgba(99,102,241,0.95)' : 'rgba(15,23,42,0.65)',
                        borderWidth: 1,
                        borderColor: mode === 'FOLLOWING' ? '#818cf8' : 'rgba(148,163,184,0.35)',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Following</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(15,23,42,0.65)', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="magnify" size={22} color="#fff" />
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text onPress={() => openUserProfile(item.author.username)} style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>@{item.author.username}</Text>
                  {!followedCreators[item.author.username] && item.author.id !== user?.id && mode !== 'FOLLOWING' ? (
                    <Pressable
                      onPress={() => followCreator(item.author.username)}
                      disabled={!!followBusy[item.author.username]}
                      style={{ backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, opacity: followBusy[item.author.username] ? 0.7 : 1 }}
                    >
                      <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 11 }}>{followBusy[item.author.username] ? '...' : 'Follow'}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {item.caption ? <Text numberOfLines={2} style={{ color: '#e5e7eb', marginTop: 6, fontWeight: '600' }}>{item.caption}</Text> : null}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
