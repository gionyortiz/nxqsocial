import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { PasswordField } from '@/components/PasswordField';
import { TurnstileWidget, TurnstileWidgetState } from '@/components/TurnstileWidget';
import { WEB_BASE_URL } from '@/lib/config';

const TERMS_URL = `${WEB_BASE_URL}/terms`;
const GUIDELINES_URL = `${WEB_BASE_URL}/community-guidelines`;
const PRIVACY_URL = `${WEB_BASE_URL}/privacy`;

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileState, setTurnstileState] = useState<TurnstileWidgetState>('loading');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
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

  const onSubmit = async () => {
    setError(null);
    if (loading || retryInSec > 0) return;
    if (!confirmPassword) {
      setError('Please confirm your password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service and Community Guidelines to continue.');
      return;
    }
    if (!turnstileToken) {
      setError('Complete the security check before creating your account.');
      return;
    }
    setLoading(true);
    try {
      const outcome = await register({
        email: email.trim(),
        username: username.trim(),
        displayName: displayName.trim(),
        password,
        turnstileToken,
        agreeToTerms: true,
      });
      router.replace(outcome === 'email_verification_required' ? '/verify-email' : '/(tabs)/feed');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) {
        const waitSeconds = e.retryAfterSeconds ?? 60;
        setRetryUntil(Date.now() + waitSeconds * 1000);
        setError(`Too many signup attempts. Try again in ${waitSeconds} seconds.`);
      } else if (e instanceof ApiError && e.code?.startsWith('TURNSTILE_')) {
        setError('The security check was not accepted. Complete a new check and try again.');
      } else {
        setError(e?.message ?? 'Register failed');
      }
    } finally {
      setTurnstileToken(null);
      setTurnstileState('loading');
      setTurnstileResetKey((value) => value + 1);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>Create account</Text>
        <Text style={{ color: '#93a1bd', marginBottom: 6 }}>Join NXQ Social.</Text>

        <TextInput placeholder="Email" placeholderTextColor="#8790ab" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }} />
        <TextInput placeholder="Username" placeholderTextColor="#8790ab" autoCapitalize="none" value={username} onChangeText={setUsername} style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }} />
        <TextInput placeholder="Display name" placeholderTextColor="#8790ab" value={displayName} onChangeText={setDisplayName} style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }} />
        <PasswordField label="Create password" placeholder="At least 12 characters" newPassword value={password} onChangeText={setPassword} />
        <PasswordField label="Confirm password" placeholder="Re-enter your password" newPassword value={confirmPassword} onChangeText={setConfirmPassword} />

        <View style={{ gap: 8 }}>
          <Text style={{ color: '#93a1bd', fontSize: 12, fontWeight: '700' }}>Security check</Text>
          {retryInSec > 0 ? (
            <View style={{ backgroundColor: '#151d33', borderRadius: 12, padding: 14 }}>
              <Text style={{ color: '#fbbf24', fontSize: 13 }}>
                Too many signup attempts. A new security check will be available in {retryInSec}s.
              </Text>
            </View>
          ) : (
            <TurnstileWidget
              resetKey={turnstileResetKey}
              onTokenChange={setTurnstileToken}
              onStateChange={setTurnstileState}
            />
          )}
          {retryInSec === 0 && turnstileState !== 'verified' ? (
            <Text style={{ color: turnstileState === 'error' || turnstileState === 'expired' ? '#fca5a5' : '#93a1bd', fontSize: 12 }}>
              {turnstileState === 'loading' && 'Loading the security check...'}
              {turnstileState === 'ready' && 'Complete the security check to continue.'}
              {turnstileState === 'expired' && 'The security check expired. Complete it again.'}
              {turnstileState === 'error' && 'The security check could not load. Check your connection and try again.'}
            </Text>
          ) : null}
          {turnstileState === 'verified' ? (
            <Text style={{ color: '#86efac', fontSize: 12 }}>Security check complete.</Text>
          ) : null}
        </View>

        {/* Read-before-signup links — Apple Guideline 2.1(a): must be accessible BEFORE account creation */}
        <View style={{ backgroundColor: '#10182b', borderRadius: 12, padding: 14, gap: 8 }}>
          <Text style={{ color: '#93a1bd', fontSize: 12, fontWeight: '700' }}>
            Please review before creating your account:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>
                Terms of Service
              </Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(GUIDELINES_URL)}>
              <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>
                Community Guidelines
              </Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>
                Privacy Policy
              </Text>
            </Pressable>
          </View>
        </View>

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
            <Text
              style={{ color: '#a78bfa', fontWeight: '700', textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(TERMS_URL)}
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={{ color: '#a78bfa', fontWeight: '700', textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(GUIDELINES_URL)}
            >
              Community Guidelines
            </Text>
            {'. '}I understand that objectionable content and abusive behavior are not tolerated and may result in account removal.
          </Text>
        </Pressable>

        {error ? <Text style={{ color: '#fca5a5' }}>{error}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={loading || retryInSec > 0 || !turnstileToken}
          style={{
            borderRadius: 12,
            backgroundColor: '#4f46e5',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            opacity: loading || retryInSec > 0 || !turnstileToken ? 0.55 : 1,
            marginTop: 4,
          }}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '700' }}>{retryInSec > 0 ? `Try again in ${retryInSec}s` : 'Create account'}</Text>}
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
