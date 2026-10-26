import { colors } from '@/lib/theme';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, SafeAreaView, ScrollView, Share, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { apiRequest, PostItem, resolveMediaUrl } from '@/lib/api';
import { WEB_BASE_URL } from '@/lib/config';
import { PostMedia } from '@/components/PostMedia';

type ProfileData = { _count?: { posts: number; followers: number; following: number } };
export default function ProfileScreen() {
  const { user, token } = useAuth();
  const [stats, setStats] = useState<ProfileData['_count']>();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [tab, setTab] = useState<'Posts' | 'Reels' | 'Media'>('Posts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setPosts([]); setStats(undefined); setLoading(true); setError(false);
    if (!token || !user?.username) { setLoading(false); return; }
    const username = encodeURIComponent(user.username);
    Promise.all([
      apiRequest<ProfileData>(`/users/${username}`, { token }),
      apiRequest<{ data: PostItem[] }>(`/posts/user/${username}`, { token }),
    ]).then(([profile, response]) => {
      if (active) { setStats(profile._count); setPosts(response.data ?? []); }
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, user?.username, retry]));
  const shareProfile = async () => {
    const message = `Check out @${user?.username || 'nxq'} on NXQ Social\n${WEB_BASE_URL}/user/${user?.username || ''}`;
    try {
      if (Platform.OS === 'web') {
        const webNavigator = typeof navigator !== 'undefined' ? (navigator as any) : undefined;
        if (webNavigator?.share) {
          await webNavigator.share({ text: message });
          return;
        }
        if (webNavigator?.clipboard?.writeText) {
          await webNavigator.clipboard.writeText(message);
          Alert.alert('Link copied', 'Profile link copied to clipboard.');
          return;
        }
        Alert.alert('Share unavailable', 'This browser cannot open the share sheet.');
        return;
      }
      await Share.share({ message });
    } catch {
      Alert.alert('Share unavailable', 'This browser cannot open the share sheet.');
    }
  };


  const visiblePosts = posts.filter(post => tab === 'Posts' || (tab === 'Reels' ? post.type === 'VIDEO' : post.media?.length > 0));
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
    <ScrollView contentContainerStyle={{paddingBottom:28}}>
      <View style={{height:user?.bannerUrl?148:112,backgroundColor:colors.accentSoft,borderBottomWidth:1,borderColor:colors.border}}>
        {user?.bannerUrl ? <Image source={{uri:resolveMediaUrl(user.bannerUrl)}} style={{width:'100%',height:'100%'}} resizeMode="cover"/> : <View style={{padding:20}}><Text style={{color:colors.verified,fontWeight:'800',fontSize:12,letterSpacing:2}}>YOUR SPACE ON NXQ</Text></View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Account settings" onPress={()=>router.push('/account-settings' as never)} style={{position:'absolute',right:16,top:12,width:44,height:44,borderRadius:22,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="cog-outline" size={22} color={colors.text}/></Pressable>
      </View>
      <View style={{paddingHorizontal:20,marginTop:-36}}>
        <View style={{flexDirection:'row',alignItems:'flex-end',gap:14}}>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit profile photo" onPress={()=>router.push('/edit-profile')} style={{width:88,height:88,borderRadius:44,borderWidth:4,borderColor:colors.background,backgroundColor:colors.raised,overflow:'hidden',alignItems:'center',justifyContent:'center'}}>
            {user?.avatarUrl?<Image source={{uri:resolveMediaUrl(user.avatarUrl)}} style={{width:'100%',height:'100%'}}/>:<Text style={{color:colors.verified,fontSize:26,fontWeight:'700'}}>{(user?.displayName||user?.username||'NX').slice(0,2).toUpperCase()}</Text>}
          </Pressable>
          <View style={{flex:1,paddingBottom:4}}><Text style={{color:colors.text,fontSize:24,fontWeight:'800',letterSpacing:-.5}}>{user?.displayName||'Your profile'}</Text><Text style={{color:colors.muted,fontSize:13,marginTop:3}}>@{user?.username}</Text></View>
        </View>
        {!!user?.bio&&<Text style={{color:colors.text,fontSize:15,lineHeight:22,marginTop:16}}>{user.bio}</Text>}
        {!!user?.location&&<Text style={{color:colors.muted,fontSize:13,marginTop:8}}>{user.location}</Text>}
        <View style={{flexDirection:'row',paddingVertical:18,borderBottomWidth:1,borderColor:colors.border}}>
          {(['posts','followers','following'] as const).map(key=><View key={key} style={{flex:1,alignItems:'center'}}><Text style={{color:colors.text,fontSize:20,fontWeight:'700'}}>{stats?.[key]??'—'}</Text><Text style={{color:colors.muted,fontSize:12,marginTop:3}}>{key}</Text></View>)}
        </View>
        <View style={{flexDirection:'row',gap:10,marginTop:16}}>
          <Pressable accessibilityRole="button" onPress={()=>router.push('/edit-profile')} style={{flex:1,minHeight:44,borderRadius:12,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center'}}><Text style={{color:colors.onAccent,fontWeight:'700'}}>Edit profile</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={shareProfile} style={{flex:1,minHeight:44,borderRadius:12,backgroundColor:colors.raised,alignItems:'center',justifyContent:'center'}}><Text style={{color:colors.text,fontWeight:'700'}}>Share profile</Text></Pressable>
        </View>
        <View style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:14}}><MaterialCommunityIcons name="shield-check-outline" size={16} color={colors.verified}/><Text style={{color:colors.muted,fontSize:12}}>Trust score · {user?.trustScore??'Not available'}</Text></View>
        <View accessibilityRole="tablist" style={{flexDirection:'row',marginTop:18,borderBottomWidth:1,borderColor:colors.border}}>
          {(['Posts','Reels','Media'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}} onPress={()=>setTab(value)} style={{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderBottomWidth:2,borderColor:tab===value?colors.accent:'transparent'}}><Text style={{color:tab===value?colors.text:colors.muted,fontWeight:'600'}}>{value}</Text></Pressable>)}
        </View>
        {loading?<ActivityIndicator accessibilityLabel="Loading profile posts" color={colors.accent} style={{margin:28}}/>:error?<Pressable accessibilityRole="button" onPress={()=>setRetry(n=>n+1)} style={{paddingVertical:24}}><Text style={{color:colors.text}}>Couldn’t load your posts. Tap to retry.</Text></Pressable>:visiblePosts.length===0?<View style={{paddingVertical:28,gap:10}}><Text style={{color:colors.text,fontWeight:'700',fontSize:17}}>Make this space yours</Text><Text style={{color:colors.muted,lineHeight:21}}>Your {tab.toLowerCase()} will appear here. Share a moment to get started.</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/(tabs)/create')} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.verified,fontWeight:'700'}}>Create a post</Text></Pressable></View>:visiblePosts.map(post=><View key={post.id} style={{paddingVertical:18,borderBottomWidth:1,borderColor:colors.border,gap:10}}><Text style={{color:colors.muted,fontSize:12}}>{new Date(post.createdAt).toLocaleDateString()}</Text>{!!post.caption&&<Text style={{color:colors.text,fontSize:15,lineHeight:22}}>{post.caption}</Text>}{!!post.media?.[0]&&<PostMedia asset={post.media[0]} style={{height:260,borderRadius:14}} shouldPlay={false}/>}<Text style={{color:colors.muted,fontSize:12}}>{post._count?.likes??0} likes · {post._count?.comments??0} comments</Text></View>)}
      </View>
    </ScrollView>
  </SafeAreaView>;
}
