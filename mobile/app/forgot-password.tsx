import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { apiRequest } from '@/lib/api';
import { emailError } from '@/lib/password-policy';
import { useAuthSubmit } from '@/lib/use-auth-submit';
import { AuthButton, AuthError, AuthForm, authStyles } from '@/components/AuthForm';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const form = useAuthSubmit('forgot');
  const onSubmit = () => {
    const normalizedEmail = email.trim().toLowerCase();
    const invalidEmail = emailError(normalizedEmail);
    if (invalidEmail) return form.setError(invalidEmail);
    void form.run(async () => {
      const idempotencyKey = `nxq-reset-${Crypto.randomUUID()}`;
      await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: { email: normalizedEmail },
        retryNetworkErrors: false,
        passwordResetRequestRetry: true,
        idempotencyKey,
      });
      setSentTo(normalizedEmail);
      form.startCooldown(60);
    });
  };

  return <AuthForm title="Forgot your password?" subtitle="Request a secure reset link. Use the email you registered with; the link expires after one hour.">
    {sentTo ? <View style={authStyles.success}>
      <Text style={{ color: '#86efac', fontSize: 18, fontWeight: '800' }}>Check your email</Text>
      <Text style={{ color: '#bbf7d0', lineHeight: 21 }}>If {sentTo} belongs to an NXQ Social account, a reset email will be sent. Check Spam and All Mail, and use only the newest link.</Text>
      <Pressable accessibilityRole="button" onPress={() => { setSentTo(''); form.setError(null); }}><Text style={authStyles.link}>Use a different email</Text></Pressable>
    </View> : <TextInput accessibilityLabel="Account email address" testID="forgot-password-email" placeholder="name@example.com" placeholderTextColor="#8790ab"
      autoCapitalize="none" autoCorrect={false} spellCheck={false} keyboardType="email-address" autoComplete="email"
      value={email} onChangeText={setEmail} editable={!form.busy} onSubmitEditing={onSubmit} returnKeyType="send" style={authStyles.input} />}
    <AuthError message={form.error} />
    <AuthButton label={sentTo ? 'Send a new link' : 'Send reset link'} testID="forgot-password-submit" busy={form.busy} retrySeconds={form.retrySeconds} onPress={onSubmit} />
    <Pressable accessibilityRole="link" onPress={() => router.replace('/login')}><Text style={authStyles.link}>Back to sign in</Text></Pressable>
  </AuthForm>;
}
