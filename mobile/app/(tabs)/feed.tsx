import { CommentComposer } from '@/components/CommentComposer';
import { colors } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, Share, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiRequest, PostItem, resolveMediaUrl, StoryFeedAuthorGroup } from '@/lib/api';
import { LIVE_NATIVE_ENABLED, WEB_BASE_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { PostMedia } from '@/components/PostMedia';
import { mobileProof } from '@/lib/runtimeProof';
import { CreateActionSheet, CreateActionMode } from '@/components/CreateActionSheet';
import { pauseAllMedia } from '@/lib/mediaPlayback';

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
  shouldPlayMedia,
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
  shouldPlayMedia: boolean;
}) {
  const first = post.media?.[0];
  return <View style={{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:18,padding:14,marginBottom:16}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:12}}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${post.author.displayName}'s profile`} onPress={()=>onOpenAuthor(post.author.username)}>
        <Avatar src={post.author.avatarUrl} name={post.author.displayName || post.author.username} />
      </Pressable>
      <Pressable onPress={()=>onOpenAuthor(post.author.username)} style={{flex:1}}>
        <View style={{flexDirection:'row',gap:6,alignItems:'center'}}><Text numberOfLines={1} style={{color:colors.text,fontWeight:'700',fontSize:15,flexShrink:1}}>{post.author.displayName}</Text>
          {post.author.verificationStatus && !['UNVERIFIED','BASIC'].includes(post.author.verificationStatus) && <MaterialCommunityIcons name="check-decagram" size={15} color={colors.verified} />}
        </View><Text style={{color:colors.muted,fontSize:12,marginTop:3}}>@{post.author.username} · {new Date(post.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</Text>
      </Pressable>
      <Pressable accessibilityLabel="Post actions" onPress={()=>onOpenActions(post)} disabled={deleting} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="dots-horizontal" size={22} color={colors.muted} /></Pressable>
    </View>
    {post.caption ? <Text style={{color:colors.text,fontSize:15,lineHeight:23,marginBottom:14}}>{post.caption}</Text> : null}
    {first && <PostMedia asset={first} style={{height:310,borderRadius:12}} shouldPlay={shouldPlayMedia} />}
    <View style={{flexDirection:'row',alignItems:'center',gap:12,marginTop:8}}>
      <Pressable accessibilityRole="button" accessibilityLabel={post.isLiked?'Unlike post':'Like post'} accessibilityState={{selected:post.isLiked}} onPress={()=>onLike(post)} style={{minHeight:44,flexDirection:'row',gap:6,alignItems:'center'}}><MaterialCommunityIcons name={post.isLiked?'heart':'heart-outline'} size={23} color={post.isLiked?colors.danger:colors.muted} /><Text style={{color:colors.muted,fontSize:12}}>{post._count?.likes ?? 0}</Text></Pressable>
      <Pressable accessibilityLabel="Comments" onPress={()=>onComment(post)} style={{minHeight:44,flexDirection:'row',gap:6,alignItems:'center'}}><MaterialCommunityIcons name="comment-outline" size={22} color={colors.muted} /><Text style={{color:colors.muted,fontSize:12}}>{post._count?.comments ?? 0}</Text></Pressable>
      <Pressable accessibilityLabel="Share post" onPress={()=>onShare(post)} style={{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="send-outline" size={22} color={colors.muted} /></Pressable>
      <View style={{flex:1}} />
      <Pressable accessibilityLabel={saved?'Unsave post':'Save post'} accessibilityState={{selected:saved}} onPress={()=>onSave(post.id)} style={{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name={saved?'bookmark':'bookmark-outline'} size={23} color={saved?colors.verified:colors.muted} /></Pressable>
    </View>
  </View>;
}


export default function FeedScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [items, setItems] = useState<PostItem[]>([]);
  const [commentPost, setCommentPost] = useState<PostItem | null>(null);
  const [stories, setStories] = useState<StoryCandidate[]>([]);
  const [suggestedCreators, setSuggestedCreators] = useState<StoryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Record<string, boolean>>({});
  const [followedUsers, setFollowedUsers] = useState<Record<string, boolean>>({});
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<FeedMode>('FOR_YOU');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
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
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [storyFeed, setStoryFeed] = useState<StoryFeedAuthorGroup[]>([]);

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
    const request = ++loadSequence.current;
    setError(null);
    try {
      const [feedData, storiesData, storyFeedData] = await Promise.all([
        apiRequest<{ data: PostItem[] }>(`/posts/feed?mode=${mode}`, { token }),
        apiRequest<StoriesResponse>('/feed/stories?take=15', { token }).catch(() => ({ storyCandidates: [], suggestedCreators: [] })),
        apiRequest<{ authors: StoryFeedAuthorGroup[] }>('/stories/feed', { token }).catch(() => ({ authors: [] })),
      ]);
      if (request !== loadSequence.current) return;
      mobileProof('Incoming feed JSON', {
        endpoint: `/posts/feed?mode=${mode}`,
        count: feedData.data?.length ?? 0,
        firstPost: feedData.data?.[0] ?? null,
      });
      setItems(feedData.data || []);
      setStories(storiesData.storyCandidates || []);
      setSuggestedCreators(storiesData.suggestedCreators || []);
      setStoryFeed(storyFeedData.authors || []);
    } catch (e: any) {
      if (request !== loadSequence.current) return;
      const message = e?.message ?? 'Failed to load feed';
      setError(message);
    } finally {
      if (request === loadSequence.current) { setLoading(false); setRefreshing(false); }
    }
  };

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      load();
      return () => {
        loadSequence.current += 1;
        setScreenFocused(false);
        pauseAllMedia();
      };
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
    pauseAllMedia();
    setCommentPost(post);
  };

  const sharePost = async (post: PostItem) => {
    const message = `${post.caption || 'Check out this post on NXQ Social'}\n${WEB_BASE_URL}/feed?post=${post.id}`;
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
  const openCreateAction = (mode: 'photo' | 'reel' | 'live' | 'story') => {
    if (mode === 'live' && !LIVE_NATIVE_ENABLED) return;
    router.push({ pathname: '/create', params: { mode } });
  };

  const onSelectCreateMode = (mode: CreateActionMode) => {
    setShowCreateMenu(false);
    openCreateAction(mode === 'post' ? 'photo' : mode);
  };

  const openLiveRoom = (story: StoryCandidate) => {
    if (!LIVE_NATIVE_ENABLED) return;
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollBeginDrag={() => {
            pauseAllMedia();
            activePostIdRef.current = null;
            setActivePostId(null);
          }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
          ListHeaderComponent={(
            <View style={{marginBottom:16}}>
              <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
                <Text style={{color:colors.text,fontSize:22,fontWeight:'800',letterSpacing:-.7}}>NXQ Social</Text>
                <View style={{flexDirection:'row',gap:4}}>
                  <Pressable accessibilityLabel="Search creators" onPress={()=>router.push('/explore')} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="magnify" size={24} color={colors.muted} /></Pressable>
                  <Pressable accessibilityLabel="Notifications" onPress={()=>router.push('/notifications')} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="bell-outline" size={23} color={colors.muted} /></Pressable>
                  <Pressable accessibilityLabel="Open menu" onPress={()=>router.push('/(tabs)/more')} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="menu" size={24} color={colors.muted} /></Pressable>
                </View>
              </View>
              <View style={{flexDirection:'row',gap:28,borderBottomWidth:1,borderColor:colors.border,marginTop:8}}>
                {(['FOR_YOU','FOLLOWING'] as const).map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:mode===value}} onPress={()=>setMode(value)} style={{paddingVertical:14,borderBottomWidth:2,borderBottomColor:mode===value?colors.accent:'transparent'}}><Text style={{fontSize:14,fontWeight:mode===value?'700':'500',color:mode===value?colors.text:colors.muted}}>{value==='FOR_YOU'?'For you':'Following'}</Text></Pressable>)}
                <Pressable accessibilityLabel="Toggle topics" onPress={()=>setShowInsights(value=>!value)} style={{marginLeft:'auto',width:44,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="tune-variant" size={20} color={showInsights?colors.verified:colors.muted} /></Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:14,paddingVertical:16}}>
                <Pressable accessibilityLabel="Your story" onPress={()=>{const mine=storyFeed.find(group=>group.author.id===user?.id); if(mine) router.push({pathname:'/story-viewer' as never,params:{authorId:mine.author.id} as never}); else openCreateAction('story');}} style={{width:66,alignItems:'center',gap:7}}>
                  <View><Avatar src={user?.avatarUrl} name={user?.displayName || 'You'} size={62} /><View style={{position:'absolute',bottom:0,right:0,borderRadius:10,backgroundColor:colors.accent,borderWidth:2,borderColor:colors.background}}><MaterialCommunityIcons name="plus" size={16} color="white" /></View></View><Text style={{color:colors.muted,fontSize:11}}>Your story</Text>
                </Pressable>
                {storyFeed.filter(group=>group.author.id!==user?.id).map(group=><Pressable key={group.author.id} accessibilityLabel={`View ${group.author.username}'s story`} onPress={()=>router.push({pathname:'/story-viewer' as never,params:{authorId:group.author.id} as never})} style={{width:66,alignItems:'center',gap:7}}><Avatar src={group.author.avatarUrl} name={group.author.username} size={62} ring /><Text numberOfLines={1} style={{color:colors.muted,fontSize:11}}>{group.author.username}</Text></Pressable>)}
                {storyFeed.length===0 && stories.filter(person=>person.username!==user?.username).map(person=><Pressable key={person.id} onPress={()=>person.isLive?openLiveRoom(person):openUserProfile(person.username)} style={{width:66,alignItems:'center',gap:7}}><Avatar src={person.avatarUrl} name={person.displayName || person.username} size={62} ring /><Text numberOfLines={1} style={{color:colors.muted,fontSize:11}}>{person.username}</Text></Pressable>)}
                <Pressable accessibilityLabel="Discover creators" onPress={()=>router.push('/explore')} style={{width:66,alignItems:'center',gap:7}}><View style={{width:62,height:62,borderRadius:31,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="compass-outline" size={25} color={colors.verified}/></View><Text style={{color:colors.muted,fontSize:11}}>Discover</Text></Pressable>
              </ScrollView>
              <View style={{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:18,padding:12,gap:10}}>
                <Pressable accessibilityRole="button" accessibilityLabel="Create post" onPress={()=>setShowCreateMenu(true)} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:12}}><Avatar src={user?.avatarUrl} name={user?.displayName||'You'} size={38}/><Text style={{color:colors.muted,fontSize:14,flex:1}}>What's on your mind?</Text><MaterialCommunityIcons name="pencil-outline" size={20} color={colors.verified}/></Pressable>
                <View style={{flexDirection:'row',borderTopWidth:1,borderColor:colors.border,paddingTop:4}}>
                  {([{mode:'photo',label:'Photo',icon:'image-outline'},{mode:'reel',label:'Video / Reel',icon:'movie-open-play-outline'},{mode:'story',label:'Story',icon:'circle-multiple-outline'},...(LIVE_NATIVE_ENABLED?[{mode:'live',label:'Live',icon:'broadcast'}]:[])] as const).map(action=><Pressable key={action.mode} accessibilityRole="button" onPress={()=>openCreateAction(action.mode as 'photo'|'reel'|'story'|'live')} style={({pressed})=>({flex:1,minHeight:48,alignItems:'center',justifyContent:'center',gap:4,borderRadius:10,backgroundColor:pressed?colors.raised:'transparent'})}><MaterialCommunityIcons name={action.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={19} color={colors.verified}/><Text style={{color:colors.muted,fontSize:11,fontWeight:'600'}}>{action.label}</Text></Pressable>)}
                </View>
              </View>
              {liveNowCreators.length>0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:12,paddingVertical:14}}>{liveNowCreators.map(person=><Pressable key={person.id} onPress={()=>openLiveRoom(person)} style={{flexDirection:'row',alignItems:'center',gap:8}}><MaterialCommunityIcons name="broadcast" size={18} color={colors.danger}/><Text style={{color:colors.text,fontSize:13}}>{person.displayName} is live</Text></Pressable>)}</ScrollView>}
              {showInsights && <View style={{paddingVertical:16,gap:14}}><Text style={{color:colors.text,fontWeight:'700'}}>Explore your interests</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{trendingTopics.map(topic=><Pressable key={topic} onPress={()=>setSelectedTopic(value=>value===topic?null:topic)} style={{padding:10,borderRadius:20,backgroundColor:selectedTopic===topic?colors.accentSoft:colors.surface}}><Text style={{color:colors.verified}}>{topic}</Text></Pressable>)}</ScrollView><Pressable onPress={()=>router.push('/explore')}><Text style={{color:colors.verified}}>Discover more creators</Text></Pressable></View>}
            </View>
          )}
          ListEmptyComponent={(
            <View style={{ marginTop: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.raised, borderRadius: 14, padding: 14, gap: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '900', fontSize: 16 }}>{selectedTopic ? `No posts for ${selectedTopic}` : 'Your feed is quiet'}</Text>
              <Text style={{ color: colors.muted }}>
                {error || (selectedTopic ? 'Try a different trend or clear the filter.' : 'Follow creators, post your first update, and this space will populate fast.')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {selectedTopic ? (
                  <Pressable onPress={() => setSelectedTopic(null)} style={{ backgroundColor: colors.raised, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>Clear topic</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => router.push('/create')} style={{ backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>Create post</Text>
                </Pressable>
                <Pressable onPress={load} style={{ backgroundColor: colors.raised, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>Refresh feed</Text>
                </Pressable>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
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
                shouldPlayMedia={screenFocused && activePostId === item.id}
              />

            </View>
          )}
        />
      )}
      <CreateActionSheet visible={showCreateMenu} onClose={() => setShowCreateMenu(false)} onSelect={onSelectCreateMode} />
      {commentPost ? <CommentComposer key={commentPost.id} post={commentPost} token={token} onClose={() => setCommentPost(null)} onPosted={() => {
        setItems((previous) => previous.map((item) => item.id === commentPost.id ? {
          ...item, _count: { ...(item._count ?? { likes: 0, comments: 0 }), comments: (item._count?.comments ?? 0) + 1 },
        } : item));
      }} /> : null}
    </SafeAreaView>
  );
}
