import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { apiRequest } from '@/lib/api';
import { newPasswordError } from '@/lib/password-policy';
import { useAuthSubmit } from '@/lib/use-auth-submit';
import { PasswordField } from '@/components/PasswordField';
import { AuthButton, AuthError, AuthForm, PasswordGuidance, authStyles } from '@/components/AuthForm';

export default function ChangePasswordScreen() {
  const { token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [complete, setComplete] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);
  const form = useAuthSubmit('change');
  const onSubmit = () => {
    if (complete) return;
    if (!token) return form.setError('Your session has expired. Sign in again to continue.');
    if (!currentPassword) return form.setError('Enter your current password.');
    const invalidPassword = newPasswordError(password, confirmation);
    if (invalidPassword) return form.setError(invalidPassword);
    if (password === currentPassword) return form.setError('Choose a new password that is different from your current password.');
    void form.run(async () => {
      await apiRequest('/auth/change-password', { method: 'POST', token, body: { currentPassword, newPassword: password }, retryNetworkErrors: false });
      setCurrentPassword(''); setPassword(''); setConfirmation(''); setComplete(true);
    });
  };

  return <AuthForm title="Password & security" subtitle="Change your NXQ Social password. We will ask for your current password before making any changes.">
    {complete ? <View style={authStyles.success}>
      <Text style={{ color: '#86efac', fontSize: 18, fontWeight: '800' }}>Password changed</Text>
      <Text style={{ color: '#bbf7d0', lineHeight: 21 }}>Use the new password the next time you sign in. Update your password manager if you use one. This does not sign out other devices.</Text>
    </View> : <>
      <PasswordField label="Current password" accessibilityLabel="Current password" testID="change-password-current" disableAutofill value={currentPassword} onChangeText={setCurrentPassword}
        editable={!form.busy} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} />
      <PasswordField inputRef={passwordRef} label="New password" accessibilityLabel="New password" testID="change-password-new" newPassword disableAutofill
        value={password} onChangeText={setPassword} editable={!form.busy} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmationRef.current?.focus()} />
      <PasswordField inputRef={confirmationRef} label="Confirm new password" accessibilityLabel="Confirm new password" testID="change-password-confirm" newPassword disableAutofill
        value={confirmation} onChangeText={setConfirmation} editable={!form.busy} returnKeyType="go" onSubmitEditing={onSubmit} />
      <PasswordGuidance password={password} confirmation={confirmation} />
      <AuthError message={form.error} />
      <AuthButton label="Change password" testID="change-password-submit" busy={form.busy} retrySeconds={form.retrySeconds} disabled={!token} onPress={onSubmit} />
      <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')}><Text style={authStyles.link}>Forgot your current password? Request a reset</Text></Pressable>
    </>}
    <Pressable accessibilityRole="link" onPress={() => router.replace('/(tabs)/profile')}><Text style={authStyles.link}>Back to profile</Text></Pressable>
  </AuthForm>;
}
