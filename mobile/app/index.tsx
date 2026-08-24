import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';

export default function IndexScreen() {
  const { token, pendingVerification, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1020' }}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (token) return <Redirect href="/(tabs)/feed" />;
  if (pendingVerification) return <Redirect href="/verify-email" />;
  return <Redirect href="/login" />;
}
