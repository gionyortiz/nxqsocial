import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { colors } from '@/lib/theme';
export default function CallWeb() {
  return <View style={{ flex: 1, backgroundColor: colors.background, padding: 28, justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 24 }}>Open NXQ on your phone to join this call.</Text><Pressable onPress={() => router.back()} style={{ padding: 20 }}><Text style={{ color: colors.accent }}>Back</Text></Pressable></View>;
}
