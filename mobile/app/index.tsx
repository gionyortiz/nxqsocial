import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';

export default function IndexScreen() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1020' }}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return <Redirect href={token ? '/(tabs)/feed' : '/login'} />;
}
