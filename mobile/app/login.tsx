import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/feed');
    } catch (e: any) {
      setError(e?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 14 }}>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>NXQ Social</Text>
        <Text style={{ color: '#93a1bd', marginBottom: 8 }}>Trust-first social for verified humans.</Text>

        <TextInput
          placeholder="Email"
          placeholderTextColor="#8790ab"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor="#8790ab"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }}
        />

        {error ? <Text style={{ color: '#fca5a5' }}>{error}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={loading}
          style={{
            borderRadius: 12,
            backgroundColor: '#6366f1',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Login</Text>}
        </Pressable>

        <Link href="/register" asChild>
          <Pressable>
            <Text style={{ color: '#9ab0ff', textAlign: 'center', marginTop: 6 }}>New here? Create an account</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}
