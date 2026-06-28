import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, SafeAreaView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiRequest, PostItem, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

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
      setError(e?.message ?? 'Could not load profile.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, username]);

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
    if (!token || !profile || profile.username === user?.username) return;
    try {
      const created = await apiRequest<{ id: string }>('/messages/conversations', {
        method: 'POST',
        token,
        body: { participantUsername: profile.username },
      });
      router.push((`/messages/${created.id}?username=${encodeURIComponent(profile.username)}&name=${encodeURIComponent(profile.displayName || profile.username)}&avatar=${encodeURIComponent(profile.avatarUrl || '')}`) as never);
    } catch (e: any) {
      const message = String(e?.message ?? 'Could not open chat right now.');
      if (message.toLowerCase().includes('cannot message yourself')) {
        Alert.alert('Chat unavailable', 'You cannot start a chat with yourself.');
      } else if (message.toLowerCase().includes('user not found')) {
        Alert.alert('Chat unavailable', 'User was not found. Please refresh and try again.');
      } else {
        Alert.alert('Chat unavailable', message);
      }
    }
  };

  const startDirectCall = async (mode: 'call' | 'video') => {
    console.log('=== CALL BUTTON PRESSED ===');
    console.log('Mode:', mode);
    console.log('Token:', !!token);
    console.log('Profile:', profile?.username);
    console.log('User:', user?.username);
    
    if (!token) {
      Alert.alert('Not signed in', 'Please log in to make calls.');
      return;
    }
    if (!profile) {
      Alert.alert('Profile loading', 'Please wait for the profile to load.');
      return;
    }
    if (profile.username === user?.username) {
      Alert.alert('Cannot call yourself', 'You cannot start a call with yourself.');
      return;
    }
    
    const safePeer = profile.username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
    const safeMe = (user?.username || 'guest').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
    const room = `dm_${safeMe}_${safePeer}_${Date.now().toString(36)}`;
    
    console.log('Room:', room);
    console.log('Targets:', [profile.username]);
    console.log('Video:', mode === 'video');
    
    try {
      console.log('Sending /calls/ring request...');
      const response = await apiRequest('/calls/ring', {
        method: 'POST',
        token,
        body: {
          room,
          targets: [profile.username],
          video: mode === 'video',
          group: false,
        },
      });
      console.log('Ring response:', response);
    } catch (e: any) {
      console.error('Call ring error:', e);
      Alert.alert('Call invite failed', e?.message ?? 'Could not notify this user right now.');
      return;
    }
    
    console.log('Navigating to live-native with room:', room, 'mode:', mode);
    router.push({ pathname: '/live-native' as never, params: { room, mode } as never });
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#080f22', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#22d3ee" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#080f22' }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#22d3ee" />}
        contentContainerStyle={{ paddingBottom: 34 }}
        ListHeaderComponent={(
          <View>
            <View style={{ height: 156, backgroundColor: '#10172d', overflow: 'hidden', borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }}>
              {profile?.bannerUrl ? <Image source={{ uri: resolveMediaUrl(profile.bannerUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
              <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(12, 18, 39, 0.18)' }} />
            </View>
            <View style={{ paddingHorizontal: 16, marginTop: -42 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
                <View style={{ width: 96, height: 96, borderRadius: 28, overflow: 'hidden', backgroundColor: '#1d4ed8', borderWidth: 4, borderColor: '#080f22', alignItems: 'center', justifyContent: 'center' }}>
                  {profile?.avatarUrl ? (
                    <Image source={{ uri: resolveMediaUrl(profile.avatarUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Text style={{ color: '#eef2ff', fontWeight: '900', fontSize: 28 }}>{(profile?.displayName || profile?.username || 'NX').slice(0, 2).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, paddingBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: '#f8fafc', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>
                      {profile?.displayName || profile?.username}
                    </Text>
                    {profile?.verificationStatus && profile.verificationStatus !== 'UNVERIFIED' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#233047', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <MaterialCommunityIcons name="check-decagram" size={13} color="#67e8f9" />
                        <Text style={{ color: '#dbeafe', fontSize: 11, fontWeight: '900' }}>Verified</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: '#9fb0cb', marginTop: 3, fontSize: 13 }}>@{profile?.username}</Text>
                </View>
              </View>

              {profile?.bio ? <Text style={{ color: '#e2e8f0', marginTop: 12, lineHeight: 21, fontSize: 14 }}>{profile.bio}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {profile?.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#233047', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }}>
                    <MaterialCommunityIcons name="map-marker-outline" size={14} color="#93c5fd" />
                    <Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: '700' }}>{profile.location}</Text>
                  </View>
                ) : null}
                {profile?.website ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#233047', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }}>
                    <MaterialCommunityIcons name="link-variant" size={14} color="#67e8f9" />
                    <Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: '700' }}>{profile.website}</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <View style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: '#233047' }}>
                  <Text style={{ color: '#f8fafc', fontWeight: '900', fontSize: 17 }}>{profile?._count?.posts ?? posts.length}</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 12 }}>posts</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: '#233047' }}>
                  <Text style={{ color: '#f8fafc', fontWeight: '900', fontSize: 17 }}>{profile?._count?.followers ?? 0}</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 12 }}>followers</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: '#233047' }}>
                  <Text style={{ color: '#f8fafc', fontWeight: '900', fontSize: 17 }}>{profile?._count?.following ?? 0}</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 12 }}>following</Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#0f172a', borderRadius: 18, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#233047' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name="shield-check-outline" size={20} color="#a78bfa" />
                  <Text style={{ color: '#c4b5fd', fontWeight: '900' }}>Trust score: {profile?.trustScore ?? 'N/A'}</Text>
                </View>
              </View>

              {profile?.username !== user?.username ? (
                <View style={{ marginTop: 14, gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={toggleFollow}
                      disabled={followBusy}
                      style={{ flex: 1, backgroundColor: profile?.isFollowing ? '#111827' : '#0ea5e9', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: profile?.isFollowing ? '#243047' : '#67e8f9' }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '900', textAlign: 'center' }}>
                        {followBusy ? 'Updating...' : profile?.isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={startChat}
                      style={{ flex: 1, backgroundColor: '#1f2937', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#334155' }}
                    >
                      <Text style={{ color: '#e2e8f0', fontWeight: '900', textAlign: 'center' }}>Message</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => Alert.alert('Subscribe', 'Subscribe flow is coming soon.')}
                      style={{ flex: 1, backgroundColor: '#1f2937', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#334155' }}
                    >
                      <Text style={{ color: '#e2e8f0', fontWeight: '900', textAlign: 'center' }}>Subscribe</Text>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => startDirectCall('call')}
                      style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#233047', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <MaterialCommunityIcons name="phone-outline" size={16} color="#cbd5e1" />
                      <Text style={{ color: '#cbd5e1', fontWeight: '800' }}>Call</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => startDirectCall('video')}
                      style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#233047', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <MaterialCommunityIcons name="video-outline" size={16} color="#cbd5e1" />
                      <Text style={{ color: '#cbd5e1', fontWeight: '800' }}>Video</Text>
                    </Pressable>
                  </View>
                  <View style={{ backgroundColor: '#1a2332', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#334155' }}>
                    <Text style={{ color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace' }}>You: {user?.username || 'loading'}</Text>
                    <Text style={{ color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace' }}>Viewing: {profile?.username}</Text>
                    <Text style={{ color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace' }}>Auth: {token ? '✓' : '✗'}</Text>
                  </View>
                </View>
              ) : null}

              {/* ALWAYS-VISIBLE DEBUG TEST SECTION */}
              <View style={{ backgroundColor: '#2a3f4d', borderRadius: 8, padding: 12, marginTop: 12, marginHorizontal: 0, borderWidth: 1, borderColor: '#4a5f6d' }}>
                <Text style={{ color: '#67e8f9', fontWeight: '900', marginBottom: 8 }}>TEST: Button Response</Text>
                <Pressable
                  onPress={() => Alert.alert('SUCCESS', 'This button IS clickable! Call button issue is NOT about button responsiveness.')}
                  style={{ backgroundColor: '#0ea5e9', borderRadius: 8, padding: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900' }}>Tap Here to Test</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 }}>
                <Text style={{ color: '#f8fafc', fontWeight: '900', fontSize: 18, letterSpacing: -0.2 }}>Posts</Text>
                <Text style={{ color: '#93a1bd', fontSize: 12 }}>{profile?._count?.posts ?? posts.length} total</Text>
              </View>
              {error ? <Text style={{ color: '#fca5a5', marginBottom: 10 }}>{error}</Text> : null}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: '#93a1bd', paddingHorizontal: 16 }}>No posts yet.</Text>}
        renderItem={({ item }) => {
          const mediaUrl = resolveMediaUrl(item.media?.[0]?.thumbnailUrl || item.media?.[0]?.url);
          return (
            <View style={{ backgroundColor: '#0f172a', borderRadius: 18, marginHorizontal: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#233047' }}>
              {mediaUrl ? <Image source={{ uri: mediaUrl }} style={{ width: '100%', height: 300, backgroundColor: '#0b1020' }} resizeMode="cover" /> : null}
              <View style={{ padding: 12, gap: 8 }}>
                {item.caption ? <Text style={{ color: '#e2e8f0', lineHeight: 20 }}>{item.caption}</Text> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="heart-outline" size={14} color="#94a3b8" />
                    <Text style={{ color: '#93a1bd', fontSize: 12 }}>{item._count?.likes ?? 0}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="comment-outline" size={14} color="#94a3b8" />
                    <Text style={{ color: '#93a1bd', fontSize: 12 }}>{item._count?.comments ?? 0}</Text>
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