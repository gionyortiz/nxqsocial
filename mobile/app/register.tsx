import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { PasswordField } from '@/components/PasswordField';
import { TurnstileWidget, TurnstileWidgetState } from '@/components/TurnstileWidget';
import { AuthButton, AuthError, AuthForm, PasswordGuidance, authStyles } from '@/components/AuthForm';
import { AuthLegal } from '@/components/AuthLegal';
import { emailError, newPasswordError } from '@/lib/password-policy';
import { useAuthSubmit } from '@/lib/use-auth-submit';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileState, setTurnstileState] = useState<TurnstileWidgetState>('loading');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const usernameRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);
  const form = useAuthSubmit('register');

  const onSubmit = () => {
    const invalidEmail = emailError(email);
    if (invalidEmail) return form.setError(invalidEmail);
    if (!/^[a-z0-9_.]{3,30}$/.test(username.trim().toLowerCase())) return form.setError('Use a username of 3–30 letters, numbers, underscores, or dots.');
    if (Array.from(displayName.trim()).length < 2 || Array.from(displayName.trim()).length > 50) return form.setError('Use a display name of 2–50 characters.');
    const invalidPassword = newPasswordError(password, confirmPassword);
    if (invalidPassword) return form.setError(invalidPassword);
    if (!agreedToTerms) return form.setError('Agree to the Terms of Service and Community Guidelines to continue.');
    if (!turnstileToken || turnstileState !== 'verified') return form.setError('Complete the security check before creating your account.');
    void form.run(async () => {
      try {
        const outcome = await register({ email: email.trim().toLowerCase(), username: username.trim().toLowerCase(), displayName: displayName.trim(), password, turnstileToken, agreeToTerms: true });
        setPassword(''); setConfirmPassword('');
        router.replace(outcome === 'email_verification_required' ? '/verify-email' : '/(tabs)/feed');
      } finally {
        // A challenge is single-use even if the response is lost.
        setTurnstileToken(null); setTurnstileState('loading'); setTurnstileResetKey((value) => value + 1);
      }
    });
  };

  return <AuthForm title="Create your account" subtitle="Join NXQ Social with a unique password. All password fields support manual typing and pasting.">
    <TextInput accessibilityLabel="Email address" testID="register-email" placeholder="Email address" placeholderTextColor="#8790ab" autoCapitalize="none" autoCorrect={false} spellCheck={false}
      keyboardType="email-address" value={email} onChangeText={setEmail} editable={!form.busy} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => usernameRef.current?.focus()} style={authStyles.input} />
    <TextInput ref={usernameRef} accessibilityLabel="Username" testID="register-username" placeholder="Username" placeholderTextColor="#8790ab" autoCapitalize="none" autoCorrect={false} spellCheck={false}
      value={username} onChangeText={setUsername} editable={!form.busy} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => nameRef.current?.focus()} style={authStyles.input} />
    <TextInput ref={nameRef} accessibilityLabel="Display name" testID="register-display-name" placeholder="Display name" placeholderTextColor="#8790ab" value={displayName} onChangeText={setDisplayName} editable={!form.busy}
      returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} style={authStyles.input} />
    <PasswordField inputRef={passwordRef} accessibilityLabel="Create password" testID="register-password" label="Create password" placeholder="At least 12 characters" newPassword disableAutofill
      value={password} onChangeText={setPassword} editable={!form.busy} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmationRef.current?.focus()} />
    <PasswordField inputRef={confirmationRef} accessibilityLabel="Confirm password" testID="register-confirm-password" label="Confirm password" placeholder="Re-enter your password" newPassword disableAutofill
      value={confirmPassword} onChangeText={setConfirmPassword} editable={!form.busy} returnKeyType="done" />
    <PasswordGuidance password={password} confirmation={confirmPassword} />
    <AuthLegal />
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Agree to Terms of Service and Community Guidelines" accessibilityState={{ checked: agreedToTerms, disabled: form.busy }} disabled={form.busy}
      testID="register-terms" onPress={() => setAgreedToTerms((value) => !value)} style={{ padding: 16, backgroundColor: '#151d33', borderRadius: 14 }}>
      <Text style={authStyles.text}>{agreedToTerms ? '☑' : '☐'} I agree to the Terms of Service and Community Guidelines. Abusive behavior and objectionable content are not tolerated.</Text>
    </Pressable>
    <View style={{ gap: 8 }}>
      <Text style={{ color: '#cbd5e1', fontWeight: '700' }}>Security check</Text>
      {form.retrySeconds > 0 ? <Text style={authStyles.text}>A new check will be available after the countdown.</Text> :
        <TurnstileWidget resetKey={turnstileResetKey} onTokenChange={setTurnstileToken} onStateChange={setTurnstileState} />}
      <Text style={authStyles.text}>{turnstileState === 'verified' ? 'Security check complete.' : turnstileState === 'error' || turnstileState === 'expired' ? 'The check could not complete. Retry it below.' : 'Complete the security check to continue.'}</Text>
      {form.retrySeconds === 0 && (turnstileState === 'error' || turnstileState === 'expired') ? <Pressable accessibilityRole="button" accessibilityLabel="Retry security check" disabled={form.busy} onPress={() => { setTurnstileToken(null); setTurnstileState('loading'); setTurnstileResetKey((value) => value + 1); }}><Text style={authStyles.link}>Retry security check</Text></Pressable> : null}
    </View>
    <AuthError message={form.error} />
    <AuthButton label="Create account" testID="register-submit" busy={form.busy} retrySeconds={form.retrySeconds} onPress={onSubmit} />
    <Pressable accessibilityRole="link" onPress={() => router.push('/login')}><Text style={authStyles.link}>Already have an account? Sign in</Text></Pressable>
  </AuthForm>;
}
