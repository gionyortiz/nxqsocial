import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, ApiNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${'*'.repeat(Math.max(3, localPart.length - visible.length))}@${domain}`;
}

function isInvalidVerificationSession(error: unknown): boolean {
  return error instanceof ApiError
    && (error.code === 'EMAIL_VERIFICATION_TOKEN_EXPIRED'
      || error.code === 'EMAIL_VERIFICATION_TOKEN_INVALID');
}

function isAlreadyVerified(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'EMAIL_ALREADY_VERIFIED';
}

export default function VerifyEmailScreen() {
  const {
    token,
    pendingVerification,
    verifyEmail,
    resendEmailVerification,
    markEmailVerificationCodeConsumed,
    clearPendingVerification,
  } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verifyRetryUntil, setVerifyRetryUntil] = useState(0);
  const [resendRetryUntil, setResendRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const departing = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!pendingVerification && !inFlight.current && !departing.current) {
      router.replace(token ? '/(tabs)/feed' : '/login');
    }
  }, [pendingVerification, token, verifying, resending]);

  const resendAvailableAt = Math.max(
    pendingVerification?.resendAvailableAt ?? 0,
    resendRetryUntil,
  );
  const resendInSec = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));
  const verifyRetryInSec = Math.max(0, Math.ceil((verifyRetryUntil - now) / 1000));
  const codeExpiresInSec = Math.max(
    0,
    Math.ceil(((pendingVerification?.codeExpiresAt ?? now) - now) / 1000),
  );
  const hasActiveCode = Boolean(pendingVerification?.codeSent && codeExpiresInSec > 0);
  const maskedEmail = useMemo(
    () => pendingVerification ? maskEmail(pendingVerification.user.email) : '',
    [pendingVerification],
  );

  if (!pendingVerification) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#8b5cf6" size="large" />
      </SafeAreaView>
    );
  }

  const onVerify = async () => {
    if (verifyRetryInSec > 0 || inFlight.current) return;
    setError(null);
    setNotice(null);
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code from your email.');
      return;
    }
    if (!hasActiveCode) {
      setError('Request a new verification code before continuing.');
      return;
    }

    inFlight.current = true;
    setVerifying(true);
    try {
      await verifyEmail(code);
      if (!mounted.current) return;
      departing.current = true;
      router.replace('/(tabs)/feed');
    } catch (caught: unknown) {
      if (!mounted.current) return;
      if (
        caught instanceof ApiError
        && caught.status === 429
        && caught.code === 'EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED'
      ) {
        setCode('');
        setVerifyRetryUntil(0);
        setResendRetryUntil(0);
        markEmailVerificationCodeConsumed();
        setError('That code can no longer be used. Request a new verification code.');
      } else if (isAlreadyVerified(caught)) {
        departing.current = true;
        clearPendingVerification();
        router.replace({ pathname: '/login', params: { notice: 'email-already-verified' } });
      } else if (caught instanceof ApiError && caught.status === 429) {
        const waitSeconds = caught.retryAfterSeconds ?? 60;
        setVerifyRetryUntil(Date.now() + waitSeconds * 1000);
        setError(`Too many verification attempts. Try again in ${waitSeconds} seconds.`);
      } else if (isInvalidVerificationSession(caught)) {
        departing.current = true;
        clearPendingVerification();
        router.replace('/login');
      } else if (caught instanceof ApiNetworkError) {
        setError("We couldn't confirm verification. Your email may already be verified. Return to sign in with the same account, or try again when connected.");
      } else if (caught instanceof ApiError && caught.code === 'EMAIL_VERIFICATION_CODE_INVALID') {
        setError('That code is invalid or expired. Check the latest email or request a new code.');
      } else if (caught instanceof ApiError && caught.status >= 500) {
        setError('NXQ Social is temporarily unavailable. Please try again shortly.');
      } else {
        setError("We couldn't finish verification. Check your code, or return to sign in with the same account.");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setVerifying(false);
    }
  };

  const onResend = async () => {
    if (resendInSec > 0 || inFlight.current) return;
    setError(null);
    setNotice(null);
    inFlight.current = true;
    setResending(true);
    try {
      const result = await resendEmailVerification();
      if (!mounted.current) return;
      setCode('');
      setResendRetryUntil(0);
      setNotice(`A new code was sent. It expires in ${result.expiresInMinutes} minutes.`);
    } catch (caught: unknown) {
      if (!mounted.current) return;
      if (isAlreadyVerified(caught)) {
        departing.current = true;
        clearPendingVerification();
        router.replace({ pathname: '/login', params: { notice: 'email-already-verified' } });
      } else if (caught instanceof ApiError && caught.status === 429) {
        const waitSeconds = caught.retryAfterSeconds ?? 60;
        setResendRetryUntil(Date.now() + waitSeconds * 1000);
        setError(`Please wait ${waitSeconds} seconds before requesting another code.`);
      } else if (isInvalidVerificationSession(caught)) {
        departing.current = true;
        clearPendingVerification();
        router.replace('/login');
      } else if (caught instanceof ApiNetworkError) {
        // Sending may have completed. Never generate another OTP automatically,
        // and prevent rapid manual duplicates while the customer checks email.
        setResendRetryUntil(Date.now() + 60_000);
        setError("We couldn't confirm whether a new code was sent. Check your email and wait before requesting another, or return to sign in.");
      } else {
        setError("We couldn't confirm a new code was sent. Please wait and try again.");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setResending(false);
    }
  };

  const returnToSignIn = () => {
    if (inFlight.current) return;
    departing.current = true;
    clearPendingVerification();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>Verify your email</Text>
        <Text style={{ color: '#93a1bd', fontSize: 15, lineHeight: 22 }}>
          {pendingVerification.codeSent
            ? `Enter the six-digit code sent to ${maskedEmail}. Your account stays locked until verification succeeds.`
            : `No active code is available for ${maskedEmail}. Request a new verification code below.`}
        </Text>

        <TextInput
          testID="verification-code"
          accessibilityLabel="Email verification code"
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          placeholderTextColor="#64748b"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          returnKeyType="done"
          onSubmitEditing={onVerify}
          maxLength={6}
          editable={hasActiveCode && !verifying && !resending}
          style={{
            backgroundColor: '#151d33',
            color: '#fff',
            borderRadius: 12,
            padding: 16,
            fontSize: 26,
            fontWeight: '800',
            letterSpacing: 10,
            textAlign: 'center',
            opacity: hasActiveCode ? 1 : 0.55,
          }}
        />

        <Text style={{ color: hasActiveCode ? '#93a1bd' : '#fca5a5', fontSize: 12 }}>
          {!pendingVerification.codeSent
            ? 'No active verification code is available. Request one below.'
            : codeExpiresInSec > 0
            ? `Code expires in ${Math.ceil(codeExpiresInSec / 60)} minute${Math.ceil(codeExpiresInSec / 60) === 1 ? '' : 's'}.`
            : 'This code has expired. Request a new one.'}
        </Text>

        {notice ? (
          <View style={{ backgroundColor: '#123021', borderRadius: 12, padding: 12 }}>
            <Text style={{ color: '#86efac' }}>{notice}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={{ backgroundColor: '#2a1620', borderRadius: 12, borderWidth: 1, borderColor: '#7f1d1d', padding: 12 }}>
            <Text accessibilityRole="alert" style={{ color: '#fca5a5', fontWeight: '700' }}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          testID="verify-email-submit"
          accessibilityRole="button"
          onPress={onVerify}
          disabled={verifying || resending || verifyRetryInSec > 0 || !hasActiveCode || code.length !== 6}
          style={{
            borderRadius: 12,
            backgroundColor: '#4f46e5',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            opacity: verifying || resending || verifyRetryInSec > 0 || !hasActiveCode || code.length !== 6 ? 0.55 : 1,
          }}
        >
          {verifying
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '800' }}>
              {verifyRetryInSec > 0 ? `Try again in ${verifyRetryInSec}s` : 'Verify email'}
            </Text>}
        </Pressable>

        <Pressable
          testID="resend-verification-submit"
          accessibilityRole="button"
          onPress={onResend}
          disabled={resending || verifying || resendInSec > 0}
          style={{ alignItems: 'center', paddingVertical: 10, opacity: resending || verifying || resendInSec > 0 ? 0.55 : 1 }}
        >
          {resending
            ? <ActivityIndicator color="#9ab0ff" />
            : <Text style={{ color: '#9ab0ff', fontWeight: '700' }}>
              {resendInSec > 0 ? `Resend available in ${resendInSec}s` : 'Resend verification code'}
            </Text>}
        </Pressable>

        <Pressable testID="verification-return-login" accessibilityRole="button" onPress={returnToSignIn}
          disabled={verifying || resending} style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text style={{ color: '#93a1bd', textDecorationLine: 'underline' }}>Return to sign in</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
