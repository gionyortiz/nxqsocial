import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { apiRequest } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Enter the email address used for your NXQ Social account.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: { email: normalizedEmail },
        retryNetworkErrors: false,
      });
      setSent(true);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to request a reset link. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 14 }}>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>Reset your password</Text>
          <Text style={{ color: '#93a1bd', lineHeight: 20 }}>
            Enter the email used for your NXQ Social account. We will send a secure reset link that expires in one hour.
          </Text>

          {sent ? (
            <View style={{ backgroundColor: '#123021', borderRadius: 12, padding: 14, gap: 8 }}>
              <Text style={{ color: '#86efac', fontSize: 18, fontWeight: '800' }}>Check your email</Text>
              <Text style={{ color: '#bbf7d0', lineHeight: 20 }}>
                If that address belongs to an NXQ Social account, a password-reset link has been sent.
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                accessibilityLabel="Account email address"
                testID="forgot-password-email"
                placeholder="Email"
                placeholderTextColor="#8790ab"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                keyboardType="email-address"
                autoComplete={Platform.OS === 'ios' ? undefined : 'email'}
                textContentType={Platform.OS === 'ios' ? 'username' : undefined}
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={onSubmit}
                returnKeyType="send"
                style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 14 }}
              />

              {error ? (
                <View style={{ backgroundColor: '#2a1620', borderColor: '#7f1d1d', borderRadius: 12, borderWidth: 1, padding: 12 }}>
                  <Text style={{ color: '#fca5a5', fontWeight: '700' }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send password reset link"
                testID="forgot-password-submit"
                onPress={onSubmit}
                disabled={loading}
                style={{
                  alignItems: 'center',
                  backgroundColor: '#6366f1',
                  borderRadius: 12,
                  justifyContent: 'center',
                  opacity: loading ? 0.7 : 1,
                  paddingVertical: 14,
                }}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '800' }}>Send reset link</Text>}
              </Pressable>
            </>
          )}

          <Link href="/login" asChild>
            <Pressable accessibilityRole="link">
              <Text style={{ color: '#9ab0ff', textAlign: 'center' }}>Back to login</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
