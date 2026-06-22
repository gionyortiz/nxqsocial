import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { apiRequest } from '@/lib/api';

export default function ProfileScreen() {
  const { user, logout, token } = useAuth();

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

  const openSafetyPrompt = () => {
    Alert.prompt(
      'Block / Report User',
      'Enter the username you want to block.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: (value?: string) => handleBlockUser((value || '').replace('@', '').trim()),
        },
      ],
      'plain-text',
    );
  };

  const initials = (user?.displayName || user?.username || 'NX').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ height: 132, backgroundColor: '#1e1b4b', borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }} />
        <View style={{ paddingHorizontal: 16, marginTop: -48 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#312e81', borderWidth: 4, borderColor: '#0b1020', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#ddd6fe', fontSize: 28, fontWeight: '900' }}>{initials}</Text>
            </View>
            <View style={{ flex: 1, paddingBottom: 8 }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{user?.displayName || 'NXQ User'}</Text>
              <Text style={{ color: '#93a1bd', marginTop: 3 }}>@{user?.username || 'username'}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <View style={{ flex: 1, backgroundColor: '#111827', borderRadius: 16, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>52</Text>
              <Text style={{ color: '#93a1bd', fontSize: 12 }}>posts</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#111827', borderRadius: 16, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>365</Text>
              <Text style={{ color: '#93a1bd', fontSize: 12 }}>followers</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#111827', borderRadius: 16, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>1.5K</Text>
              <Text style={{ color: '#93a1bd', fontSize: 12 }}>following</Text>
            </View>
          </View>

          <View style={{ backgroundColor: '#111827', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#1f2937', marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="shield-check-outline" size={22} color="#a78bfa" />
              <Text style={{ color: '#c4b5fd', fontWeight: '900' }}>Trust score: {user?.trustScore ?? 'N/A'}</Text>
            </View>
            <Text style={{ color: '#93a1bd', marginTop: 8 }}>{user?.email}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable style={{ flex: 1, backgroundColor: '#2563eb', borderRadius: 14, padding: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '900', textAlign: 'center' }}>Edit profile</Text>
            </Pressable>
            <Pressable style={{ flex: 1, backgroundColor: '#1f2937', borderRadius: 14, padding: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '900', textAlign: 'center' }}>Share profile</Text>
            </Pressable>
          </View>

          <View style={{ backgroundColor: '#111827', borderRadius: 18, borderWidth: 1, borderColor: '#1f2937', marginTop: 16, padding: 14 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16, marginBottom: 10 }}>Account tools</Text>

            <Pressable
              onPress={async () => {
                await logout();
                router.replace('/login');
              }}
              style={{ backgroundColor: '#7f1d1d', borderRadius: 12, padding: 12, marginBottom: 10 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', textAlign: 'center' }}>Logout</Text>
            </Pressable>

            <Pressable
              onPress={openSafetyPrompt}
              style={{ backgroundColor: '#1f1a10', borderWidth: 1, borderColor: '#b45309', borderRadius: 12, padding: 12, marginBottom: 10 }}
            >
              <Text style={{ color: '#fbbf24', fontWeight: '800', textAlign: 'center' }}>Block / Report User</Text>
            </Pressable>

            <Pressable
              onPress={handleDeleteAccount}
              style={{ backgroundColor: '#1f1010', borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 12, padding: 12 }}
            >
              <Text style={{ color: '#fca5a5', fontWeight: '800', textAlign: 'center' }}>Delete Account</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
