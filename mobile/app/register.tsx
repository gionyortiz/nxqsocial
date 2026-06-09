import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service and Community Guidelines to continue.');
      return;
    }
    setLoading(true);
    try {
      await register({
        email: email.trim(),
        username: username.trim(),
        displayName: displayName.trim(),
        password,
        inviteCode: inviteCode.trim() || undefined,
      });
      router.replace('/(tabs)/feed');
    } catch (e: any) {
      setError(e?.message ?? 'Register failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>Create account</Text>
        <Text style={{ color: '#93a1bd', marginBottom: 6 }}>Join NXQ Social.</Text>

        <TextInput placeholder="Email" placeholderTextColor="#8790ab" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }} />
        <TextInput placeholder="Username" placeholderTextColor="#8790ab" autoCapitalize="none" value={username} onChangeText={setUsername} style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }} />
        <TextInput placeholder="Display name" placeholderTextColor="#8790ab" value={displayName} onChangeText={setDisplayName} style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }} />
        <TextInput placeholder="Password" placeholderTextColor="#8790ab" secureTextEntry value={password} onChangeText={setPassword} style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }} />
        <TextInput placeholder="Invite code (if required)" placeholderTextColor="#8790ab" autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode} style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }} />

        {/* EULA — required by Apple Guideline 1.2 */}
        <Pressable
          onPress={() => setAgreedToTerms((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#151d33', borderRadius: 12, padding: 14 }}
        >
          <View style={{
            width: 20, height: 20, borderRadius: 5, borderWidth: 2,
            borderColor: agreedToTerms ? '#7c3aed' : '#4b5563',
            backgroundColor: agreedToTerms ? '#7c3aed' : 'transparent',
            alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0,
          }}>
            {agreedToTerms && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
          </View>
          <Text style={{ color: '#93a1bd', fontSize: 13, flex: 1, lineHeight: 20 }}>
            I agree to the{' '}
            <Text style={{ color: '#a78bfa', fontWeight: '700' }}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={{ color: '#a78bfa', fontWeight: '700' }}>Community Guidelines</Text>
            {'. '}I understand that objectionable content and abusive behavior are not tolerated and may result in account removal.
          </Text>
        </Pressable>

        {error ? <Text style={{ color: '#fca5a5' }}>{error}</Text> : null}

        <Pressable onPress={onSubmit} disabled={loading} style={{ borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, opacity: loading ? 0.7 : 1, marginTop: 4 }}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Create account</Text>}
        </Pressable>

        <Link href="/login" asChild>
          <Pressable>
            <Text style={{ color: '#9ab0ff', textAlign: 'center', marginTop: 6 }}>Already have an account? Login</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}
