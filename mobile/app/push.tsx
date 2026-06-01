import { SafeAreaView, Text, View } from 'react-native';

export default function PushScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <View style={{ padding: 16, gap: 10 }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>Push Notifications</Text>
        <Text style={{ color: '#93a1bd' }}>
          Structure placeholder for Expo Notifications + APNs + FCM token registration.
        </Text>

        <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 12, gap: 4 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Planned</Text>
          <Text style={{ color: '#c7d2fe' }}>1. Request notification permission</Text>
          <Text style={{ color: '#c7d2fe' }}>2. Register Expo/APNs/FCM device token</Text>
          <Text style={{ color: '#c7d2fe' }}>3. Save token to NXQ backend user session</Text>
          <Text style={{ color: '#c7d2fe' }}>4. Handle call + activity notifications</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
