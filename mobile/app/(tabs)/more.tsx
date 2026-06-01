import { router } from 'expo-router';
import { Pressable, SafeAreaView, Text, View } from 'react-native';

function MenuButton({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <Text style={{ color: '#fff', fontWeight: '800' }}>{title}</Text>
      <Text style={{ color: '#93a1bd', marginTop: 4 }}>{subtitle}</Text>
    </Pressable>
  );
}

export default function MoreScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 12 }}>More</Text>

        <MenuButton
          title="Feedback"
          subtitle="Report bugs and suggest product improvements."
          onPress={() => router.push('/feedback')}
        />
        <MenuButton
          title="Calls"
          subtitle="LiveKit mobile call integration entry point."
          onPress={() => router.push('/calls')}
        />
        <MenuButton
          title="Push Notifications"
          subtitle="Structure placeholder for Expo/FCM/APNs setup."
          onPress={() => router.push('/push')}
        />
      </View>
    </SafeAreaView>
  );
}
