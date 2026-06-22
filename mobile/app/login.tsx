import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { API_BASE_URL, SHOW_LOGIN_DEBUG } from '@/lib/config';
import { pingApiHealth } from '@/lib/api';

const TERMS_URL = 'https://nxqsocial.com/terms';
const COMMUNITY_GUIDELINES_URL = 'https://nxqsocial.com/community-guidelines';
const PRIVACY_URL = 'https://nxqsocial.com/privacy';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingServer, setCheckingServer] = useState(false);

  const log = (msg: string) => {
    if (!SHOW_LOGIN_DEBUG) return;
    setDebugLog((prev) => [...prev.slice(-6), msg]);
  };

  const onCheckServer = async () => {
    setCheckingServer(true);
    log('Pinging ' + API_BASE_URL + '/health ...');
    try {
      const data = await pingApiHealth();
      log('✅ Server OK: ' + data.status);
    } catch (e: any) {
      log('❌ ' + (e?.message ?? 'unknown error'));
    } finally {
      setCheckingServer(false);
    }
  };

  const onSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    log(`Attempting login for: ${trimmedEmail}`);
    log(`API: ${API_BASE_URL}`);
    setLoginError(null);
    setLoading(true);
    try {
      await login(trimmedEmail, trimmedPassword);
      log('✅ Login success — redirecting');
      router.replace('/(tabs)/feed');
    } catch (e: any) {
      const message = e?.message ?? 'Unable to sign in. Please try again.';
      setLoginError(message);
      log('❌ Login error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 40 }}>NXQ Social</Text>
        <Text style={{ color: '#93a1bd', marginBottom: 4 }}>Trust-first social for verified humans.</Text>

        <View style={{ backgroundColor: '#10182b', borderRadius: 12, padding: 14, gap: 8 }}>
          <Text style={{ color: '#93a1bd', fontSize: 12, fontWeight: '700' }}>Before logging in, review:</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>Terms of Service</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(COMMUNITY_GUIDELINES_URL)}>
              <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>Community Guidelines</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>Privacy Policy</Text>
            </Pressable>
          </View>
          <Text style={{ color: '#93a1bd', fontSize: 12, lineHeight: 18 }}>
            Objectionable content and abusive users are not tolerated and may be removed.
          </Text>
        </View>

        {SHOW_LOGIN_DEBUG ? (
          <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1e3a5f' }}>
            <Text style={{ color: '#38bdf8', fontSize: 11, fontFamily: 'monospace' }}>API: {API_BASE_URL}</Text>
          </View>
        ) : null}

        <TextInput
          placeholder="Email"
          placeholderTextColor="#8790ab"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }}
        />
        <View style={{ position: 'relative', justifyContent: 'center' }}>
          <TextInput
            placeholder="Password"
            placeholderTextColor="#8790ab"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="none"
            autoComplete="off"
            value={password}
            onChangeText={setPassword}
            style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14, paddingRight: 70 }}
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            style={{ position: 'absolute', right: 14, paddingVertical: 6, paddingHorizontal: 4 }}
            hitSlop={10}
          >
            <Text style={{ color: '#9ab0ff', fontWeight: '700', fontSize: 12 }}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
          </Pressable>
        </View>
        {SHOW_LOGIN_DEBUG ? (
          <Text style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace', marginTop: -8 }}>
            Password length: {password.length} character{password.length === 1 ? '' : 's'}
          </Text>
        ) : null}

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

        {loginError ? (
          <View style={{ backgroundColor: '#2a1620', borderRadius: 12, borderWidth: 1, borderColor: '#7f1d1d', padding: 12 }}>
            <Text style={{ color: '#fca5a5', fontWeight: '700' }}>{loginError}</Text>
          </View>
        ) : null}

        {SHOW_LOGIN_DEBUG ? (
          <Pressable
            onPress={onCheckServer}
            disabled={checkingServer}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#374151',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              opacity: checkingServer ? 0.7 : 1,
            }}
          >
            {checkingServer
              ? <ActivityIndicator color="#9ab0ff" />
              : <Text style={{ color: '#9ab0ff', fontWeight: '700' }}>Test server connection</Text>}
          </Pressable>
        ) : null}

        {SHOW_LOGIN_DEBUG && debugLog.length > 0 && (
          <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#334155' }}>
            {debugLog.map((line, i) => (
              <Text key={i} style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', lineHeight: 18 }}>{line}</Text>
            ))}
          </View>
        )}

        <Link href="/register" asChild>
          <Pressable>
            <Text style={{ color: '#9ab0ff', textAlign: 'center', marginTop: 4 }}>New here? Create an account</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}
