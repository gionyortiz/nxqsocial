import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, SafeAreaView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
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

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#8b5cf6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#8b5cf6" />}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={(
          <View>
            <View style={{ height: 148, backgroundColor: '#1e1b4b' }}>
              {profile?.bannerUrl ? <Image source={{ uri: resolveMediaUrl(profile.bannerUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
            </View>
            <View style={{ padding: 16, marginTop: -38 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
                <View style={{ width: 92, height: 92, borderRadius: 46, overflow: 'hidden', backgroundColor: '#312e81', borderWidth: 4, borderColor: '#0b1020', alignItems: 'center', justifyContent: 'center' }}>
                  {profile?.avatarUrl ? (
                    <Image source={{ uri: resolveMediaUrl(profile.avatarUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Text style={{ color: '#ddd6fe', fontWeight: '900', fontSize: 26 }}>{(profile?.displayName || profile?.username || 'NX').slice(0, 2).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, paddingBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{profile?.displayName || profile?.username}</Text>
                    {profile?.verificationStatus && profile.verificationStatus !== 'UNVERIFIED' ? (
                      <Text style={{ color: '#60a5fa', fontWeight: '900' }}>Verified</Text>
                    ) : null}
                  </View>
                  <Text style={{ color: '#93a1bd', marginTop: 3 }}>@{profile?.username}</Text>
                </View>
              </View>

              {profile?.bio ? <Text style={{ color: '#e5e7eb', marginTop: 12 }}>{profile.bio}</Text> : null}
              {profile?.location ? <Text style={{ color: '#93a1bd', marginTop: 6 }}>{profile.location}</Text> : null}
              {profile?.website ? <Text style={{ color: '#a5b4fc', marginTop: 4 }}>{profile.website}</Text> : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <View style={{ flex: 1, backgroundColor: '#111827', borderRadius: 14, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>{profile?._count?.posts ?? posts.length}</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 12 }}>posts</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#111827', borderRadius: 14, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>{profile?._count?.followers ?? 0}</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 12 }}>followers</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#111827', borderRadius: 14, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>{profile?._count?.following ?? 0}</Text>
                  <Text style={{ color: '#93a1bd', fontSize: 12 }}>following</Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#111827', borderRadius: 16, padding: 14, marginTop: 14 }}>
                <Text style={{ color: '#c4b5fd', fontWeight: '900' }}>Trust score: {profile?.trustScore ?? 'N/A'}</Text>
              </View>

              {profile?.username !== user?.username ? (
                <Pressable
                  onPress={toggleFollow}
                  disabled={followBusy}
                  style={{ marginTop: 14, backgroundColor: profile?.isFollowing ? '#1f2937' : '#4f46e5', borderRadius: 14, paddingVertical: 12 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900', textAlign: 'center' }}>
                    {followBusy ? 'Updating...' : profile?.isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
              ) : null}

              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 18, marginBottom: 10 }}>Posts</Text>
              {error ? <Text style={{ color: '#fca5a5', marginBottom: 10 }}>{error}</Text> : null}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: '#93a1bd', paddingHorizontal: 16 }}>No posts yet.</Text>}
        renderItem={({ item }) => {
          const mediaUrl = resolveMediaUrl(item.media?.[0]?.thumbnailUrl || item.media?.[0]?.url);
          return (
            <View style={{ backgroundColor: '#111827', borderRadius: 18, marginHorizontal: 16, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1f2937' }}>
              {mediaUrl ? <Image source={{ uri: mediaUrl }} style={{ width: '100%', height: 300, backgroundColor: '#0b1020' }} resizeMode="cover" /> : null}
              <View style={{ padding: 12 }}>
                {item.caption ? <Text style={{ color: '#e5e7eb' }}>{item.caption}</Text> : null}
                <Text style={{ color: '#93a1bd', marginTop: 8, fontSize: 12 }}>{item._count?.likes ?? 0} likes • {item._count?.comments ?? 0} comments</Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}