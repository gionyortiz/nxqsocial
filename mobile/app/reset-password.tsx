import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import { PasswordField } from '@/components/PasswordField';
import { apiRequest } from '@/lib/api';

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function strongPasswordError(password: string) {
  if (password.length < 12) return 'Use at least 12 characters.';
  if (!/[a-z]/.test(password)) return 'Add a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Add an uppercase letter.';
  if (!/\d/.test(password)) return 'Add a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Add a special character.';
  return null;
}

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstValue(params.token)?.trim() ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (loading) return;
    if (!token) {
      setError('This reset link is incomplete. Request a new link from the login screen.');
      return;
    }

    const passwordError = strongPasswordError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: { token, password },
        retryNetworkErrors: false,
      });
      setPassword('');
      setConfirmPassword('');
      setComplete(true);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to reset your password. Request a new link and try again.',
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
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>Choose a new password</Text>
          <Text style={{ color: '#93a1bd', lineHeight: 20 }}>
            Use at least 12 characters with uppercase, lowercase, a number, and a special character.
          </Text>

          {complete ? (
            <View style={{ backgroundColor: '#123021', borderRadius: 12, padding: 14, gap: 8 }}>
              <Text style={{ color: '#86efac', fontSize: 18, fontWeight: '800' }}>Password updated</Text>
              <Text style={{ color: '#bbf7d0' }}>You can now sign in with your new password.</Text>
            </View>
          ) : (
            <>
              <PasswordField
                accessibilityLabel="New password"
                testID="reset-password-new"
                label="New password"
                placeholder="Enter a new password"
                newPassword
                value={password}
                onChangeText={setPassword}
              />
              <PasswordField
                accessibilityLabel="Confirm new password"
                testID="reset-password-confirm"
                label="Confirm new password"
                placeholder="Re-enter your new password"
                newPassword
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onSubmitEditing={onSubmit}
                returnKeyType="go"
              />

              {error ? (
                <View style={{ backgroundColor: '#2a1620', borderColor: '#7f1d1d', borderRadius: 12, borderWidth: 1, padding: 12 }}>
                  <Text style={{ color: '#fca5a5', fontWeight: '700' }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Update password"
                testID="reset-password-submit"
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
                  : <Text style={{ color: '#fff', fontWeight: '800' }}>Update password</Text>}
              </Pressable>
            </>
          )}

          <Link href={(complete ? '/login' : '/forgot-password') as never} asChild>
            <Pressable accessibilityRole="link">
              <Text style={{ color: '#9ab0ff', textAlign: 'center' }}>
                {complete ? 'Return to login' : 'Request a new reset link'}
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
