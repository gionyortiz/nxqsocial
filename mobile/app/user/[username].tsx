import { colors } from '@/lib/theme';
import { startPrivateCall } from '@/lib/calls';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, SafeAreaView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiRequest, PostItem, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pauseAllMedia } from '@/lib/mediaPlayback';
import { PostMedia } from '@/components/PostMedia';
import { mobileProof } from '@/lib/runtimeProof';

type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  location?: string | null;
  website?: string | null;
  verificationStatus?: string;
  trustScore?: number;
  isFollowing?: boolean;
  _count?: { posts: number; followers: number; following: number };
};

export default function UserProfileScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const params = useLocalSearchParams<{ username?: string }>();
  const username = typeof params.username === 'string' ? params.username : '';
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const activePostIdRef = useRef<string | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: PostItem }> }) => {
    const nextActivePostId = viewableItems[0]?.item?.id ?? null;
    if (nextActivePostId === activePostIdRef.current) return;
    pauseAllMedia();
    activePostIdRef.current = nextActivePostId;
    setActivePostId(nextActivePostId);
  }).current;

  const load = async () => {
    if (!token || !username) return;
    setError(null);
    try {
      const [profileData, postsData] = await Promise.all([
        apiRequest<UserProfile>(`/users/${encodeURIComponent(username)}`, { token }),
        apiRequest<{ data: PostItem[] }>(`/posts/user/${encodeURIComponent(username)}`, { token }),
      ]);
      setProfile(profileData);
      setPosts(postsData.data || []);
    } catch (e: any) {
      const message = e?.message ?? 'Could not load profile.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, username]);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => {
        setScreenFocused(false);
        pauseAllMedia();
      };
    }, []),
  );

  const toggleFollow = async () => {
    if (!token || !profile || followBusy || profile.username === user?.username) return;
    setFollowBusy(true);
    const previousFollowing = !!profile.isFollowing;
    const previousFollowers = profile._count?.followers ?? 0;
    setProfile((prev) => prev ? {
      ...prev,
      isFollowing: !previousFollowing,
      _count: prev._count ? { ...prev._count, followers: Math.max(0, previousFollowers + (previousFollowing ? -1 : 1)) } : prev._count,
    } : prev);
    try {
      const data = await apiRequest<{ following: boolean }>(`/users/${profile.username}/follow`, { method: 'POST', token });
      setProfile((prev) => prev ? {
        ...prev,
        isFollowing: !!data.following,
        _count: prev._count ? { ...prev._count, followers: Math.max(0, previousFollowers + (data.following ? 1 : 0)) } : prev._count,
      } : prev);
    } catch (e: any) {
      setProfile((prev) => prev ? {
        ...prev,
        isFollowing: previousFollowing,
        _count: prev._count ? { ...prev._count, followers: previousFollowers } : prev._count,
      } : prev);
      Alert.alert('Follow failed', e?.message ?? 'Could not update follow state.');
    } finally {
      setFollowBusy(false);
    }
  };

  const startChat = async () => {
    if (!token) { Alert.alert('Not signed in', 'Please log in first.'); return; }
    if (!profile) { Alert.alert('Profile loading', 'Please wait and try again.'); return; }
    if (profile.username === user?.username) { Alert.alert('Cannot message yourself', 'Open a chat with another user.'); return; }
    let created: { id: string };
    try {
      mobileProof('Profile Message request', { participantUsername: profile.username });
      created = await apiRequest<{ id: string }>('/messages/conversations', {
        method: 'POST',
        token,
        body: { participantUsername: profile.username },
      });
      mobileProof('Profile Message response', created);
      if (!created?.id) throw new Error('Server did not return a conversation ID.');
    } catch (e: any) {
      mobileProof('Profile Message error', { message: e?.message });
      Alert.alert('Chat unavailable', e?.message ?? 'Could not open chat right now.');
      return;
    }

    const query = new URLSearchParams({
      username: profile.username,
      name: profile.displayName || profile.username,
      avatar: profile.avatarUrl || '',
    });
    const target = `/messages/${created.id}?${query.toString()}`;
    mobileProof('Profile Message navigation', { target });
    router.push(target as never);
  };

  const callStarting = useRef(false);
  const startDirectCall = async (mode: 'call' | 'video') => {
    const target = profile?.username;
    if (!token || !target || callStarting.current || target === user?.username) return;
    callStarting.current = true;
    try {
      const room = await startPrivateCall(token, [target], mode === 'video');
      pauseAllMedia();
      router.push({ pathname: '/call', params: { room } } as never);
    } catch (e) { Alert.alert('Call unavailable', e instanceof Error ? e.message : 'Please try again.'); }
    finally { callStarting.current = false; }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#22d3ee" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScrollBeginDrag={() => {
          pauseAllMedia();
          activePostIdRef.current = null;
          setActivePostId(null);
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#22d3ee" />}
        contentContainerStyle={{ paddingBottom: 34 }}
        ListHeaderComponent={(
          <View>
            <View style={{ height: 156, backgroundColor: '#10172d', overflow: 'hidden', borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }}>
              {profile?.bannerUrl ? <Image source={{ uri: resolveMediaUrl(profile.bannerUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
              <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(12, 18, 39, 0.18)' }} />
            </View>
            {error ? (
              <Pressable onPress={() => { setError(null); void load(); }} style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>Couldn’t load this section. Tap to retry.</Text>
              </Pressable>
            ) : null}
            <View style={{ paddingHorizontal: 16, marginTop: -42 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
                <View style={{ width: 96, height: 96, borderRadius: 28, overflow: 'hidden', backgroundColor: colors.accent, borderWidth: 4, borderColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
                  {profile?.avatarUrl ? (
                    <Image source={{ uri: resolveMediaUrl(profile.avatarUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Text style={{ color: '#eef2ff', fontWeight: '900', fontSize: 28 }}>{(profile?.displayName || profile?.username || 'NX').slice(0, 2).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, paddingBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>
                      {profile?.displayName || profile?.username}
                    </Text>
                    {profile?.verificationStatus && profile.verificationStatus !== 'UNVERIFIED' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#233047', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <MaterialCommunityIcons name="check-decagram" size={13} color="#67e8f9" />
                        <Text style={{ color: '#dbeafe', fontSize: 11, fontWeight: '900' }}>Verified</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.muted, marginTop: 3, fontSize: 13 }}>@{profile?.username}</Text>
                </View>
              </View>

              {profile?.bio ? <Text style={{ color: '#e2e8f0', marginTop: 12, lineHeight: 21, fontSize: 14 }}>{profile.bio}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {profile?.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#233047', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }}>
                    <MaterialCommunityIcons name="map-marker-outline" size={14} color="#93c5fd" />
                    <Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: '700' }}>{profile.location}</Text>
                  </View>
                ) : null}
                {profile?.website ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#233047', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }}>
                    <MaterialCommunityIcons name="link-variant" size={14} color="#67e8f9" />
                    <Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: '700' }}>{profile.website}</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: '#233047' }}>
                  <Text style={{ color: colors.text, fontWeight: '900', fontSize: 17 }}>{profile?._count?.posts ?? posts.length}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>posts</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: '#233047' }}>
                  <Text style={{ color: colors.text, fontWeight: '900', fontSize: 17 }}>{profile?._count?.followers ?? 0}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>followers</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: '#233047' }}>
                  <Text style={{ color: colors.text, fontWeight: '900', fontSize: 17 }}>{profile?._count?.following ?? 0}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>following</Text>
                </View>
              </View>

              <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#233047' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.verified} />
                  <Text style={{ color: colors.verified, fontWeight: '900' }}>Trust score: {profile?.trustScore ?? 'N/A'}</Text>
                </View>
              </View>

              {profile?.username !== user?.username ? (
                <View style={{ marginTop: 14, gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={toggleFollow}
                      disabled={followBusy}
                      style={{ flex: 1, backgroundColor: profile?.isFollowing ? colors.surface : '#0ea5e9', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: profile?.isFollowing ? '#243047' : '#67e8f9' }}
                    >
                      <Text style={{ color: colors.text, fontWeight: '900', textAlign: 'center' }}>
                        {followBusy ? 'Updating...' : profile?.isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={startChat}
                      style={{ flex: 1, backgroundColor: colors.raised, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Text style={{ color: '#e2e8f0', fontWeight: '900', textAlign: 'center' }}>Message</Text>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => startDirectCall('call')}
                      style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#233047', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <MaterialCommunityIcons name="phone-outline" size={16} color="#cbd5e1" />
                      <Text style={{ color: '#cbd5e1', fontWeight: '800' }}>Call</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => startDirectCall('video')}
                      style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#233047', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <MaterialCommunityIcons name="video-outline" size={16} color="#cbd5e1" />
                      <Text style={{ color: '#cbd5e1', fontWeight: '800' }}>Video</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 }}>
                <Text style={{ color: colors.text, fontWeight: '900', fontSize: 18, letterSpacing: -0.2 }}>Posts</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{profile?._count?.posts ?? posts.length} total</Text>
              </View>
              {error ? <Text style={{ color: '#fca5a5', marginBottom: 10 }}>{error}</Text> : null}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: colors.muted, paddingHorizontal: 16 }}>No posts yet.</Text>}
        renderItem={({ item }) => {
          return (
            <View style={{ backgroundColor: colors.surface, borderRadius: 18, marginHorizontal: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#233047' }}>
              <PostMedia asset={item.media?.[0]} style={{ height: 300 }} shouldPlay={screenFocused && activePostId === item.id} />
              <View style={{ padding: 12, gap: 8 }}>
                {item.caption ? <Text style={{ color: '#e2e8f0', lineHeight: 20 }}>{item.caption}</Text> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="heart-outline" size={14} color={colors.muted} />
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{item._count?.likes ?? 0}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="comment-outline" size={14} color={colors.muted} />
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{item._count?.comments ?? 0}</Text>
                  </View>
                </View>
                <Text style={{ color: '#64748b', fontSize: 11 }}>Engagement summary</Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
