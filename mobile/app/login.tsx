import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { API_BASE_URL, SHOW_LOGIN_DEBUG } from '@/lib/config';
import { ApiError, pingApiHealth } from '@/lib/api';
import { PasswordField } from '@/components/PasswordField';

const TERMS_URL = 'https://nxqsocial.com/terms';
const COMMUNITY_GUIDELINES_URL = 'https://nxqsocial.com/community-guidelines';
const PRIVACY_URL = 'https://nxqsocial.com/privacy';

export default function LoginScreen() {
  const { login } = useAuth();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingServer, setCheckingServer] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [retryInSec, setRetryInSec] = useState(0);

  useEffect(() => {
    if (!retryUntil) {
      setRetryInSec(0);
      return;
    }
    const update = () => setRetryInSec(Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);

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
    if (loading || retryInSec > 0) return;
    const trimmedEmail = email.trim().toLowerCase();
    // Passwords are exact values; trimming can make valid App Store accounts
    // fail only in newer TestFlight builds.
    const submittedPassword = password;
    log(`Attempting login for: ${trimmedEmail}`);
    log(`API: ${API_BASE_URL}`);
    setLoginError(null);
    setLoading(true);
    try {
      const outcome = await login(trimmedEmail, submittedPassword);
      log('✅ Login success — redirecting');
      router.replace(outcome === 'email_verification_required' ? '/verify-email' : '/(tabs)/feed');
    } catch (e: any) {
      const waitSeconds = e instanceof ApiError && e.status === 429
        ? e.retryAfterSeconds ?? 60
        : 0;
      if (waitSeconds > 0) setRetryUntil(Date.now() + waitSeconds * 1000);
      const message = waitSeconds > 0
        ? `Too many sign-in attempts. Try again in ${waitSeconds} seconds.`
        : e?.message ?? 'Unable to sign in. Please try again.';
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

        {notice === 'email-already-verified' ? (
          <View style={{ backgroundColor: '#123021', borderRadius: 12, padding: 12 }}>
            <Text style={{ color: '#86efac' }}>Your email is already verified. Sign in to continue.</Text>
          </View>
        ) : null}

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
        <PasswordField value={password} onChangeText={setPassword} returnKeyType="go" onSubmitEditing={onSubmit} />
        {SHOW_LOGIN_DEBUG ? (
          <Text style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace', marginTop: -8 }}>
            Password length: {password.length} character{password.length === 1 ? '' : 's'}
          </Text>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={loading || retryInSec > 0}
          style={{
            borderRadius: 12,
            backgroundColor: '#6366f1',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            opacity: loading || retryInSec > 0 ? 0.7 : 1,
          }}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '700' }}>
              {retryInSec > 0 ? `Try again in ${retryInSec}s` : 'Login'}
            </Text>}
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
