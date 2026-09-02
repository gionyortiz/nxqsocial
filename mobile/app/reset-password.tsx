import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { PasswordField } from '@/components/PasswordField';
import { AuthButton, AuthError, AuthForm, PasswordGuidance, authStyles } from '@/components/AuthForm';
import { apiRequest } from '@/lib/api';
import { newPasswordError } from '@/lib/password-policy';
import { useAuthSubmit } from '@/lib/use-auth-submit';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  // Never guess which duplicate token should be trusted or display its value.
  const token = typeof params.token === 'string' && /^[a-f0-9]{64}$/i.test(params.token) ? params.token : '';
  // A new link must not inherit another link's passwords, errors, or success.
  return <ResetPasswordForm key={token} token={token} />;
}

function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [complete, setComplete] = useState(false);
  const confirmationRef = useRef<TextInput>(null);
  const form = useAuthSubmit('reset');
  const onSubmit = () => {
    if (!token || complete) return;
    const invalidPassword = newPasswordError(password, confirmPassword);
    if (invalidPassword) return form.setError(invalidPassword);
    void form.run(async () => {
      await apiRequest('/auth/reset-password', { method: 'POST', body: { token, password }, retryNetworkErrors: false });
      setPassword(''); setConfirmPassword(''); setComplete(true);
    });
  };
  return <AuthForm title="Choose a new password" subtitle="Make it unique to NXQ Social. Your password is kept exactly as entered.">
    {complete ? <View style={authStyles.success}>
      <Text style={{ color: '#86efac', fontSize: 18, fontWeight: '800' }}>Password updated</Text>
      <Text style={{ color: '#bbf7d0' }}>Sign in with your new password, and update your password manager if you use one.</Text>
    </View> : !token ? <AuthError message="This reset link is incomplete or invalid. Request a new link below." /> : <>
      <PasswordField accessibilityLabel="New password" testID="reset-password-new" label="New password" newPassword disableAutofill value={password} onChangeText={setPassword}
        editable={!form.busy} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmationRef.current?.focus()} />
      <PasswordField inputRef={confirmationRef} accessibilityLabel="Confirm new password" testID="reset-password-confirm" label="Confirm new password" newPassword disableAutofill
        value={confirmPassword} onChangeText={setConfirmPassword} editable={!form.busy} onSubmitEditing={onSubmit} returnKeyType="go" />
      <PasswordGuidance password={password} confirmation={confirmPassword} />
      <AuthError message={form.error} />
      <AuthButton label="Update password" testID="reset-password-submit" busy={form.busy} retrySeconds={form.retrySeconds} onPress={onSubmit} />
    </>}
    <Pressable accessibilityRole="link" onPress={() => router.replace(complete ? '/login' : '/forgot-password')}>
      <Text style={authStyles.link}>{complete ? 'Return to sign in' : 'Request a new reset link'}</Text>
    </Pressable>
  </AuthForm>;
}
