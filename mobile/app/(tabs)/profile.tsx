import { router } from 'expo-router';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
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
          <Text style={{ color: '#fff', fontWeight: '700' }}>Send beta feedback</Text>
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
      </View>
    </SafeAreaView>
  );
}
