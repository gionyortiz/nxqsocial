import { colors } from '@/lib/theme';
import { LIVE_NATIVE_ENABLED } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

function Row({title, icon, onPress}: {title:string; icon:keyof typeof MaterialCommunityIcons.glyphMap; onPress:()=>void}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>({minHeight:56,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:pressed?colors.raised:colors.surface})}>
    <MaterialCommunityIcons name={icon} size={21} color={colors.verified}/><Text style={{flex:1,color:colors.text,fontSize:15,fontWeight:'500'}}>{title}</Text><MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted}/>
  </Pressable>;
}
function Group({title,children}:{title:string;children:React.ReactNode}) {
  return <View style={{gap:8}}><Text style={{color:colors.muted,fontSize:11,fontWeight:'700',letterSpacing:1.2,marginLeft:4}}>{title.toUpperCase()}</Text><View style={{borderWidth:1,borderColor:colors.border,borderRadius:16,overflow:'hidden'}}>{children}</View></View>;
}
export default function MoreScreen(){
  const {user}=useAuth();
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}><ScrollView contentContainerStyle={{padding:20,paddingBottom:32,gap:22}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{color:colors.text,fontSize:28,fontWeight:'800',letterSpacing:-.6}}>More</Text><Pressable accessibilityRole="button" accessibilityLabel="Back to Home" onPress={()=>router.push('/(tabs)/feed')} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name="close" size={23} color={colors.muted}/></Pressable></View>
    <Pressable accessibilityRole="button" onPress={()=>router.push('/(tabs)/profile')} style={{flexDirection:'row',alignItems:'center',gap:12}}><Avatar src={user?.avatarUrl} name={user?.displayName||'Your profile'} size={48}/><View style={{flex:1}}><Text style={{color:colors.text,fontSize:17,fontWeight:'700'}}>{user?.displayName}</Text><Text style={{color:colors.muted,fontSize:13,marginTop:4}}>View your profile</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted}/></Pressable>
    <Group title="Communication"><Row title="Messages" icon="message-text-outline" onPress={()=>router.push('/(tabs)/messages')}/><Row title="Notifications" icon="bell-outline" onPress={()=>router.push('/notifications')}/></Group>
    {LIVE_NATIVE_ENABLED&&<Group title="Creator tools"><Row title="Live" icon="broadcast" onPress={()=>router.push('/live-native')}/></Group>}
    <Group title="Account"><Row title="Settings" icon="cog-outline" onPress={()=>router.push('/account-settings' as never)}/><Row title="Password & security" icon="lock-outline" onPress={()=>router.push('/change-password')}/></Group>
    <Group title="Support"><Row title="Feedback & help" icon="message-alert-outline" onPress={()=>router.push('/feedback')}/><Row title="App updates" icon="cellphone-arrow-down" onPress={()=>router.push('/app-updates')}/></Group>
    <Text style={{color:colors.muted,fontSize:12,textAlign:'center'}}>NXQ Social · Create. Share. Belong.</Text>
  </ScrollView></SafeAreaView>;
}
