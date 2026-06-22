import { router } from 'expo-router';
import { Pressable, SafeAreaView, Text, View } from 'react-native';

export default function NativeLiveWebStub() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <View style={{ maxWidth: 360, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center' }}>Native Live is iOS only</Text>
        <Text style={{ color: '#93a1bd', marginTop: 10, textAlign: 'center' }}>
          This preview is running on web. Native Live uses iPhone camera and WebRTC modules and is available in native builds only.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 18, borderRadius: 14, backgroundColor: '#4f46e5', paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '900' }}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
