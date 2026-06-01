import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function CallsScreen() {
  const { token } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const data = await apiRequest<{ enabled: boolean; url: string | null }>('/calls/config', { token });
        setEnabled(data.enabled);
        setUrl(data.url);
      } catch (e: any) {
        setError(e?.message || 'Could not load call config');
      }
    };
    load();
  }, [token]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>Calls (Mobile)</Text>
        <Text style={{ color: '#93a1bd' }}>
          LiveKit native call integration scaffold is ready. Next step: wire @livekit/react-native and room UI.
        </Text>

        <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 12, gap: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Backend call status</Text>
          <Text style={{ color: '#c7d2fe' }}>Enabled: {enabled === null ? 'Loading...' : enabled ? 'Yes' : 'No'}</Text>
          <Text style={{ color: '#93a1bd' }}>LiveKit URL: {url || 'Not configured'}</Text>
          {error ? <Text style={{ color: '#fca5a5' }}>{error}</Text> : null}
        </View>

        <Pressable style={{ backgroundColor: '#1f2937', borderRadius: 12, padding: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Start call (placeholder)</Text>
          <Text style={{ color: '#93a1bd', marginTop: 4 }}>Will open native room in v2 integration pass.</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
