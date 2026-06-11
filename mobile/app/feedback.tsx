import { useState } from 'react';
import { Alert, Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function FeedbackScreen() {
  const { token } = useAuth();
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'BUG' | 'SUGGESTION' | 'CALL_PROBLEM'>('BUG');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING'>('MEDIUM');

  const submit = async () => {
    if (!token) return;
    try {
      await apiRequest('/feedback', {
        method: 'POST',
        token,
        body: {
          type,
          severity,
          route: 'mobile',
          deviceType: 'MOBILE',
          browser: 'expo-native',
          description,
        },
      });
      setDescription('');
      Alert.alert('Thanks', 'Feedback sent to the NXQ team.');
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not submit feedback');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>Feedback</Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['BUG', 'SUGGESTION', 'CALL_PROBLEM'].map((v) => (
            <Pressable key={v} onPress={() => setType(v as any)} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, backgroundColor: type === v ? '#4f46e5' : '#1f2937' }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{v}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['LOW', 'MEDIUM', 'HIGH', 'BLOCKING'].map((v) => (
            <Pressable key={v} onPress={() => setSeverity(v as any)} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, backgroundColor: severity === v ? '#0ea5e9' : '#1f2937' }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{v}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the issue or suggestion"
          placeholderTextColor="#8790ab"
          multiline
          style={{ minHeight: 180, borderRadius: 12, backgroundColor: '#151d33', color: '#fff', padding: 12, textAlignVertical: 'top' }}
        />

        <Pressable onPress={submit} style={{ backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Send feedback</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
