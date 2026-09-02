import { ReactNode } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { passwordRequirements } from '@/lib/password-policy';

export const authStyles = StyleSheet.create({
  input: { backgroundColor: '#151d33', borderColor: '#33415e', borderWidth: 1, color: '#fff', borderRadius: 14, padding: 15, fontSize: 16, minHeight: 54 },
  text: { color: '#aebbd2', lineHeight: 21 },
  link: { color: '#c4b5fd', fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
  success: { backgroundColor: '#123021', borderRadius: 14, padding: 16, gap: 8 },
});

export function AuthForm({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 40 }}>
          <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 16 }}>
            <Image source={require('../assets/images/icon.png')} accessible={false} style={{ width: 64, height: 64, borderRadius: 16, marginTop: 12 }} />
            <View style={{ gap: 8 }}>
              <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>{title}</Text>
              <Text style={authStyles.text}>{subtitle}</Text>
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 12, backgroundColor: '#301925', borderColor: '#9f4261', borderWidth: 1 }}><Text style={{ color: '#ffd0db', lineHeight: 21 }}>{message}</Text></View>;
}

export function AuthButton({ label, busy, retrySeconds = 0, disabled = false, onPress, testID }: {
  label: string; busy: boolean; retrySeconds?: number; disabled?: boolean; onPress: () => void; testID: string;
}) {
  const blocked = busy || retrySeconds > 0 || disabled;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: blocked, busy }} testID={testID} disabled={blocked} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 54, padding: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#7c3aed', opacity: blocked || pressed ? 0.65 : 1 })}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{retrySeconds > 0 ? `Try again in ${retrySeconds}s` : label}</Text>}
    </Pressable>
  );
}

export function PasswordGuidance({ password, confirmation }: { password: string; confirmation: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: '#cbd5e1', fontWeight: '700' }}>Password checklist</Text>
      {passwordRequirements(password).map((rule) => (
        <Text key={rule.id} style={{ color: password && rule.met ? '#86efac' : '#aebbd2', lineHeight: 20 }}>
          {password && rule.met ? '✓' : '○'} {rule.label}
        </Text>
      ))}
      {confirmation ? <Text accessibilityLiveRegion="polite" style={{ color: confirmation === password ? '#86efac' : '#ffd0db' }}>{confirmation === password ? '✓ Passwords match' : 'Passwords do not match yet'}</Text> : null}
      <Text style={authStyles.text}>Use a unique password. You can paste one from your password manager. Spaces are kept exactly as entered.</Text>
    </View>
  );
}
