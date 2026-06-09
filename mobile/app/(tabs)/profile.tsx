import { router } from 'expo-router';
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>Profile</Text>

        <View style={{ backgroundColor: '#111827', padding: 14, borderRadius: 14 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{user?.displayName || 'NXQ User'}</Text>
          <Text style={{ color: '#93a1bd', marginTop: 6 }}>@{user?.username || 'username'}</Text>
          <Text style={{ color: '#93a1bd', marginTop: 4 }}>{user?.email}</Text>
          <Text style={{ color: '#c4b5fd', marginTop: 10, fontWeight: '700' }}>
            Trust score: {user?.trustScore ?? 'N/A'}
          </Text>
        </View>

        <Pressable onPress={() => router.push('/feedback')} style={{ backgroundColor: '#1f2937', borderRadius: 12, padding: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Feedback</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
          style={{ backgroundColor: '#7f1d1d', borderRadius: 12, padding: 12, marginTop: 6 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Logout</Text>
        </Pressable>

        {/* Block User — shown when viewing another user's profile */}
        {user?.username && (
          <Pressable
            onPress={() => handleBlockUser(user.username!)}
            style={{ backgroundColor: '#1f1a10', borderWidth: 1, borderColor: '#b45309', borderRadius: 12, padding: 12, marginTop: 2 }}
          >
            <Text style={{ color: '#fbbf24', fontWeight: '700', textAlign: 'center' }}>Block / Report User</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleDeleteAccount}
          style={{ backgroundColor: '#1f1010', borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 12, padding: 12, marginTop: 2 }}
        >
          <Text style={{ color: '#fca5a5', fontWeight: '700', textAlign: 'center' }}>Delete Account</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
