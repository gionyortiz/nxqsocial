import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { PasswordField } from '@/components/PasswordField';
import { AuthButton, AuthError, AuthForm, authStyles } from '@/components/AuthForm';
import { AuthLegal } from '@/components/AuthLegal';
import { emailError } from '@/lib/password-policy';
import { useAuthSubmit } from '@/lib/use-auth-submit';

export default function LoginScreen() {
  const { login } = useAuth();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const form = useAuthSubmit('login');

  const onSubmit = () => {
    const invalidEmail = emailError(email);
    if (invalidEmail) return form.setError(invalidEmail);
    // Existing passwords remain exact; do not apply today's strength policy.
    if (!password) { passwordRef.current?.focus(); return form.setError('Enter your password.'); }
    void form.run(async () => {
      const outcome = await login(email.trim().toLowerCase(), password);
      setPassword('');
      router.replace(outcome === 'email_verification_required' ? '/verify-email' : '/(tabs)/feed');
    });
  };

  return <AuthForm title="Welcome back" subtitle="Sign in to NXQ Social. Your password stays private and is never saved as plain text by this app.">
    {notice === 'email-already-verified' ? <View style={authStyles.success}><Text style={{ color: '#bbf7d0' }}>Your email is verified. Sign in to continue.</Text></View> : null}
    <Text style={authStyles.text}>Email address</Text>
    <TextInput accessibilityLabel="Email address" testID="login-email" placeholder="name@example.com" placeholderTextColor="#8790ab"
      autoCapitalize="none" autoCorrect={false} spellCheck={false} keyboardType="email-address"
      autoComplete={Platform.OS === 'ios' ? undefined : 'email'} textContentType={Platform.OS === 'ios' ? 'username' : undefined}
      value={email} onChangeText={setEmail} editable={!form.busy} returnKeyType="next" submitBehavior="submit"
      onSubmitEditing={() => passwordRef.current?.focus()} style={authStyles.input} />
    <PasswordField label="Password" accessibilityLabel="Password" testID="login-password" inputRef={passwordRef} disableAutofill
      value={password} onChangeText={setPassword} editable={!form.busy} returnKeyType="go" onSubmitEditing={onSubmit} />
    <Pressable accessibilityRole="link" testID="forgot-password-link" accessibilityLabel="Forgot password" onPress={() => router.push('/forgot-password')}>
      <Text style={[authStyles.link, { textAlign: 'right' }]}>Forgot password?</Text>
    </Pressable>
    <AuthError message={form.error} />
    <AuthButton label="Sign in" testID="login-submit" busy={form.busy} retrySeconds={form.retrySeconds} onPress={onSubmit} />
    <Pressable accessibilityRole="link" onPress={() => router.push('/register')}><Text style={authStyles.link}>New here? Create an account</Text></Pressable>
    <AuthLegal />
  </AuthForm>;
}
