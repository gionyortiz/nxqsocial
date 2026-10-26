import { colors } from '@/lib/theme';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';

export default function IndexScreen() {
  const { token, pendingVerification, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (token) return <Redirect href="/(tabs)/feed" />;
  if (pendingVerification) return <Redirect href="/verify-email" />;
  return <Redirect href="/login" />;
}
