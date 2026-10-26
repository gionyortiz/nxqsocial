import { colors } from '@/lib/theme';
import { useState } from 'react';
import { Redirect, router, Stack } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { apiRequest } from '@/lib/api';
export default function AccountSettingsScreen() {
  const {user,token,logout,loading}=useAuth();
  const [username,setUsername]=useState('');
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiRequest('/users/me', { method: 'DELETE', token: token ?? '' });
              await logout();
              router.replace('/login');
            } catch {
              Alert.alert('Error', 'Could not delete account. Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleBlockUser = (username: string) => {
    if (!username || username === user?.username) return;
    Alert.alert(
      `Block @${username}?`,
      "They won't be able to follow you, and you'll unfollow each other. You can unblock anytime in Settings.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiRequest(`/users/${username}/block`, { method: 'POST', token: token ?? '' });
              Alert.alert('Blocked', `@${username} has been blocked.`);
            } catch {
              Alert.alert('Error', 'Could not block this user. Please try again.');
            }
          },
        },
      ],
    );
  };


  if (loading) return <ActivityIndicator color={colors.accent} accessibilityLabel="Loading account"/>;
  if (!token) return <Redirect href="/login"/>;
  return <><Stack.Screen options={{title:'Account settings'}}/><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:20,paddingBottom:40}} style={{backgroundColor:colors.background}}>
    <View><Text style={{color:colors.text,fontSize:24,fontWeight:'700'}}>Your account</Text><Text style={{color:colors.muted,marginTop:6}}>{user?.email}</Text></View>
    <Pressable accessibilityRole="button" onPress={()=>router.push('/change-password')} style={{minHeight:52,justifyContent:'center',paddingHorizontal:16,backgroundColor:colors.surface,borderRadius:12}}><Text style={{color:colors.text,fontWeight:'600'}}>Password & security</Text></Pressable>
    <View style={{backgroundColor:colors.surface,borderRadius:16,padding:16,gap:12}}><Text style={{color:colors.text,fontWeight:'700'}}>Safety</Text><Text style={{color:colors.muted,lineHeight:20}}>Block an account by username. To report content, use the report action on its post or profile.</Text><TextInput accessibilityLabel="Username to block" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Username" placeholderTextColor={colors.muted} style={{color:colors.text,minHeight:48,borderWidth:1,borderColor:colors.border,borderRadius:10,paddingHorizontal:12}}/><Pressable accessibilityRole="button" onPress={()=>handleBlockUser(username.replace(/^@/,'').trim())} disabled={!username.trim()||username.replace(/^@/,'').trim()===user?.username} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.danger,fontWeight:'600'}}>Block account</Text></Pressable></View>
    <Pressable accessibilityRole="button" onPress={()=>Alert.alert('Log out?','You can sign in again at any time.',[{text:'Cancel',style:'cancel'},{text:'Log out',onPress:async()=>{await logout();router.replace('/login');}}])} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:colors.text,fontWeight:'600'}}>Log out</Text></Pressable>
    <View style={{borderTopWidth:1,borderColor:colors.border,paddingTop:20,gap:8}}><Text style={{color:colors.muted,fontSize:12}}>ACCOUNT DELETION</Text><Text style={{color:colors.muted,lineHeight:20}}>Permanently remove your account and its data.</Text><Pressable accessibilityRole="button" onPress={handleDeleteAccount} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:colors.danger,fontWeight:'600'}}>Delete account</Text></Pressable></View>
  </ScrollView></>;
}
