import { ReelsToolbar } from '@/components/ReelsToolbar';
import { CommentComposer } from '@/components/CommentComposer';
import { colors } from '@/lib/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Image, Platform, Pressable, RefreshControl, SafeAreaView, Share, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReelVideo } from '@/components/ReelVideo';
import { apiRequest, PostItem, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pauseAllMedia } from '@/lib/mediaPlayback';
import { mobileProof } from '@/lib/runtimeProof';
import { WEB_BASE_URL } from '@/lib/config';

const AUTO_SCROLL_KEY = 'nxq.reels.autoScroll.v1';

export default function ReelsScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const [items, setItems] = useState<PostItem[]>([]);
  const [commentPost, setCommentPost] = useState<PostItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Record<string, boolean>>({});
  const [followedCreators, setFollowedCreators] = useState<Record<string, boolean>>({});
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<'FOR_YOU' | 'FOLLOWING'>('FOR_YOU');
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const preferenceChangedRef = useRef(false);
  const listRef = useRef<FlatList<PostItem>>(null);
  const advancingRef = useRef(false);
  const scrollingRef = useRef(false);
  const [reelHeight, setReelHeight] = useState(windowHeight);
  const activePostIdRef = useRef<string | null>(null);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: PostItem }> }) => {
    const nextActive = viewableItems[0]?.item?.id ?? null;
    if (nextActive === activePostIdRef.current) return;
    pauseAllMedia();
    activePostIdRef.current = nextActive;
    setActivePostId(nextActive);
  }).current;

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(AUTO_SCROLL_KEY).then((value) => {
      if (mounted && !preferenceChangedRef.current && value !== null) setAutoScroll(value === 'true');
    }).catch(() => {});
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state !== 'active') pauseAllMedia();
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const toggleAutoScroll = () => {
    preferenceChangedRef.current = true;
    const next = !autoScroll;
    setAutoScroll(next);
    AsyncStorage.setItem(AUTO_SCROLL_KEY, String(next)).catch(() => {});
  };

  const finishScrolling = () => {
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = null;
    advancingRef.current = false;
    scrollingRef.current = false;
    setScrolling(false);
  };

  const advanceReel = (postId: string) => {
    if (!autoScroll || !!commentPost || !screenFocused || AppState.currentState !== 'active' || refreshing ||
        scrollingRef.current || advancingRef.current || activePostIdRef.current !== postId) return;
    const index = items.findIndex((item) => item.id === postId);
    // Stay on the final reel and offer replay instead of jumping back to the beginning.
    if (index < 0 || index + 1 >= items.length || !listRef.current) return;
    advancingRef.current = true;
    scrollingRef.current = true;
    setScrolling(true);
    pauseAllMedia();
    try {
      listRef.current.scrollToIndex({ index: index + 1, animated: true });
      // Some platforms omit momentum-end after a programmatic scroll.
      scrollEndTimerRef.current = setTimeout(finishScrolling, 900);
    } catch {
      finishScrolling();
    }
  };

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await apiRequest<{ data: PostItem[] }>(`/posts/reels?mode=${mode}`, { token });
      mobileProof('Incoming reel JSON', {
        endpoint: `/posts/reels?mode=${mode}`,
        count: data.data?.length ?? 0,
        firstReel: data.data?.[0] ?? null,
      });
      const nextItems = data.data || [];
      setItems(nextItems);
      const currentActive = activePostIdRef.current;
      const nextActive = currentActive && nextItems.some((item) => item.id === currentActive)
        ? currentActive
        : nextItems[0]?.id ?? null;
      activePostIdRef.current = nextActive;
      setActivePostId(nextActive);
    } catch (e: any) {
      const message = e?.message ?? 'Could not load reels right now.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      load();
      return () => {
        setScreenFocused(false);
        finishScrolling();
        pauseAllMedia();
      };
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
    pauseAllMedia();
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
    pauseAllMedia();
    setCommentPost(post);
  };

  const sharePost = async (post: PostItem) => {
    pauseAllMedia();
    const message = `${post.caption || 'Check out this reel on NXQ Social'}\n${WEB_BASE_URL}/feed?post=${post.id}`;
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
    pauseAllMedia();
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

  const toolbar = <ReelsToolbar mode={mode} onMode={setMode} autoScroll={autoScroll} onToggle={toggleAutoScroll} />;
  if (loading || !items.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        {toolbar}
        <View style={{ flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {loading ? <ActivityIndicator color={colors.accent} /> : <>
            <MaterialCommunityIcons name="movie-open-play-outline" size={48} color={colors.accent} />
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>Your next favorite moment</Text>
            <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 22 }}>{error || (mode === 'FOLLOWING' ? 'Follow creators to see their videos here.' : 'Share the first reel. Your videos will appear here.')}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/create')} style={{ backgroundColor: colors.accent, borderRadius: 16, padding: 16 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Create a video</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={load} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.muted }}>Refresh</Text></Pressable>
          </>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      {toolbar}
      <FlatList
        ref={listRef}
        data={items}
        pagingEnabled
        onLayout={(event) => {
          const nextHeight = Math.max(1, Math.round(event.nativeEvent.layout.height));
          setReelHeight((current) => current === nextHeight ? current : nextHeight);
        }}
        keyExtractor={(item) => item.id}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScrollBeginDrag={() => {
          if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
          scrollingRef.current = true;
          setScrolling(true);
          pauseAllMedia();
        }}
        onMomentumScrollBegin={() => {
          if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
          scrollingRef.current = true;
          setScrolling(true);
          scrollEndTimerRef.current = setTimeout(finishScrolling, 900);
        }}
        onScrollEndDrag={() => {
          if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
          scrollEndTimerRef.current = setTimeout(finishScrolling, 180);
        }}
        onMomentumScrollEnd={finishScrolling}
        onScrollToIndexFailed={finishScrolling}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        getItemLayout={(_data, index) => ({ length: reelHeight, offset: reelHeight * index, index })}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { pauseAllMedia(); setRefreshing(true); load(); }} tintColor={colors.accent} />}
        renderItem={({ item }) => {
          const isVideoAsset = (asset: any) => {
            if (!asset?.url) return false;
            if ((asset.mimeType || '').startsWith('video/')) return true;
            // Fallback: detect by URL extension when mimeType is missing
            const ext = asset.url.split('?')[0].split('.').pop()?.toLowerCase();
            return ['mp4', 'mov', 'webm', 'm4v', 'avi'].includes(ext || '');
          };
          const preferredVideo = item.media?.find(isVideoAsset);
          const primaryAsset = preferredVideo ?? item.media?.find((asset: any) => !!asset.url) ?? item.media?.[0];
          const src = resolveMediaUrl(primaryAsset?.url || '');
          const fallbackImage = resolveMediaUrl(primaryAsset?.thumbnailUrl || primaryAsset?.url || '');
          const isPlayableVideo = !!src && isVideoAsset(primaryAsset);
          mobileProof('Reel render media values', {
            postId: item.id,
            type: item.type,
            primaryAsset,
            src,
            fallbackImage,
            isPlayableVideo,
          });
          const isOwnPost = item.author.id === user?.id;
          const deleting = deletingPostId === item.id;
          const focused = screenFocused && appActive && !commentPost && !refreshing && !scrolling && activePostId === item.id;
          return (
            <View style={{ height: reelHeight, backgroundColor: '#000' }}>
              {isPlayableVideo ? (
                <ReelVideo uri={src} focused={focused} autoScroll={autoScroll} onFinish={() => advanceReel(item.id)} />
              ) : fallbackImage ? (
                <Image source={{ uri: fallbackImage }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                  <MaterialCommunityIcons name="video-off-outline" size={34} color={colors.muted} />
                  <Text style={{ color: '#cbd5e1', marginTop: 10, textAlign: 'center' }}>
                    Reel video is still processing. Pull to refresh in a moment.
                  </Text>
                </View>
              )}
              <Pressable
                onPress={() => openPostActions(item)}
                disabled={deleting}
                style={{
                  position: 'absolute',
                  top: 12,
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
                  color={isOwnPost ? '#fca5a5' : colors.text}
                />
              </Pressable>
              <View style={{ position: 'absolute', right: 14, bottom: 100, alignItems: 'center', gap: 18 }}>
                <Pressable onPress={() => toggleLike(item)} hitSlop={10} style={{ alignItems: 'center' }}>
                  <MaterialCommunityIcons name={item.isLiked ? 'heart' : 'heart-outline'} size={34} color={item.isLiked ? '#f43f5e' : colors.text} />
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>{item._count?.likes ?? 0}</Text>
                </Pressable>
                <Pressable onPress={() => promptComment(item)} hitSlop={10} style={{ alignItems: 'center' }}>
                  <MaterialCommunityIcons name="comment-outline" size={32} color={colors.text} />
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>{item._count?.comments ?? 0}</Text>
                </Pressable>
                <Pressable onPress={() => sharePost(item)} hitSlop={10}>
                  <MaterialCommunityIcons name="send-outline" size={31} color={colors.text} />
                </Pressable>
                <Pressable onPress={() => toggleSave(item.id)} hitSlop={10}>
                  <MaterialCommunityIcons name={savedPostIds[item.id] ? 'bookmark' : 'bookmark-outline'} size={31} color={savedPostIds[item.id] ? colors.verified : colors.text} />
                </Pressable>
              </View>
              <View style={{ position: 'absolute', left: 14, right: 84, bottom: 28 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text onPress={() => openUserProfile(item.author.username)} style={{ color: colors.text, fontWeight: '900', fontSize: 16 }}>@{item.author.username}</Text>
                  {!followedCreators[item.author.username] && item.author.id !== user?.id && mode !== 'FOLLOWING' ? (
                    <Pressable
                      onPress={() => followCreator(item.author.username)}
                      disabled={!!followBusy[item.author.username]}
                      style={{ backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, opacity: followBusy[item.author.username] ? 0.7 : 1 }}
                    >
                      <Text style={{ color: colors.surface, fontWeight: '900', fontSize: 11 }}>{followBusy[item.author.username] ? '...' : 'Follow'}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {item.caption ? <Text numberOfLines={2} style={{ color: colors.text, marginTop: 6, fontWeight: '600' }}>{item.caption}</Text> : null}
              </View>
            </View>
          );
        }}
      />
      {commentPost ? <CommentComposer key={commentPost.id} post={commentPost} token={token} onClose={() => setCommentPost(null)} onPosted={() => {
        setItems((previous) => previous.map((item) => item.id === commentPost.id ? {
          ...item, _count: { ...(item._count ?? { likes: 0, comments: 0 }), comments: (item._count?.comments ?? 0) + 1 },
        } : item));
      }} /> : null}
    </SafeAreaView>
  );
}
