'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import {
  PENDING_EMAIL_VERIFICATION_KEY,
  PendingEmailVerification,
  ResendVerificationResponse,
  VerifyEmailResponse,
  apiErrorCode,
  apiErrorMessage,
  deadlineAfterSeconds,
  isTerminalVerificationError,
  maskEmail,
  normalizeVerificationCode,
  parsePendingEmailVerification,
  retryAfterSeconds,
  secondsUntil,
} from '@/lib/signup';
import { useAuthStore } from '@/store/auth';

function storePendingVerification(pending: PendingEmailVerification) {
  sessionStorage.setItem(PENDING_EMAIL_VERIFICATION_KEY, JSON.stringify(pending));
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [pending, setPending] = useState<PendingEmailVerification | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [notice, setNotice] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendInSec, setResendInSec] = useState(0);
  const [verifyRetryInSec, setVerifyRetryInSec] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = parsePendingEmailVerification(sessionStorage.getItem(PENDING_EMAIL_VERIFICATION_KEY));
      setPending(restored);
      setResendInSec(restored ? secondsUntil(restored.resendAvailableAt) : 0);
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (resendInSec <= 0) return;
    const timer = window.setTimeout(() => setResendInSec((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendInSec]);

  useEffect(() => {
    if (verifyRetryInSec <= 0) return;
    const timer = window.setTimeout(() => setVerifyRetryInSec((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [verifyRetryInSec]);

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!pending) return;
    if (pending.verificationCodeInvalidated) {
      setError('That code is no longer valid. Request a new verification code to continue.');
      return;
    }
    if (!/^[0-9]{6}$/.test(code)) {
      setError('Enter the complete 6-digit verification code.');
      return;
    }
    if (verifyRetryInSec > 0) return;

    setVerifying(true);
    try {
      const { data } = await api.post<VerifyEmailResponse>('/auth/verify-email', {
        verificationToken: pending.verificationToken,
        code,
      });
      if (!data.verified || !data.access_token || !data.user) {
        setError('Email verification returned an incomplete session. Please try again.');
        return;
      }
      sessionStorage.removeItem(PENDING_EMAIL_VERIFICATION_KEY);
      setAuth(data.user, data.access_token);
      router.replace('/feed');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const errorCode = apiErrorCode(err);
      if (isTerminalVerificationError(errorCode)) {
        sessionStorage.removeItem(PENDING_EMAIL_VERIFICATION_KEY);
        setPending(null);
        setSessionError(apiErrorMessage(err, 'This verification session expired. Please start again.'));
      } else if (errorCode === 'EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED') {
        const cooldown = retryAfterSeconds(err, 60);
        const nextPending = {
          ...pending,
          verificationCodeInvalidated: true,
          resendAvailableAt: deadlineAfterSeconds(cooldown),
        };
        setPending(nextPending);
        storePendingVerification(nextPending);
        setCode('');
        setResendInSec(cooldown);
        setError(`Too many incorrect codes. Request a new code in ${cooldown} seconds.`);
      } else if (status === 429) {
        const cooldown = retryAfterSeconds(err, 60);
        setVerifyRetryInSec(cooldown);
        setError(`Too many verification attempts. Try again in ${cooldown} seconds.`);
      } else {
        setError(apiErrorMessage(err, 'Email verification failed'));
      }
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (!pending || resendInSec > 0) return;
    setError('');
    setNotice('');
    setResending(true);
    try {
      const { data } = await api.post<ResendVerificationResponse>('/auth/resend-verification', {
        verificationToken: pending.verificationToken,
      });
      const cooldown = data.resendAfterSeconds ?? 60;
      const nextPending = {
        ...pending,
        verificationCodeInvalidated: false,
        resendAvailableAt: deadlineAfterSeconds(cooldown),
      };
      setPending(nextPending);
      storePendingVerification(nextPending);
      setResendInSec(cooldown);
      setNotice(`A new code was sent. It expires in ${data.expiresInMinutes ?? 10} minutes.`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (isTerminalVerificationError(apiErrorCode(err))) {
        sessionStorage.removeItem(PENDING_EMAIL_VERIFICATION_KEY);
        setPending(null);
        setSessionError(apiErrorMessage(err, 'This verification session expired. Please start again.'));
      } else if (status === 429) {
        const cooldown = retryAfterSeconds(err, 60);
        const nextPending = { ...pending, resendAvailableAt: deadlineAfterSeconds(cooldown) };
        setPending(nextPending);
        storePendingVerification(nextPending);
        setResendInSec(cooldown);
        setError(`Please wait ${cooldown} seconds before requesting another code.`);
      } else {
        setError(apiErrorMessage(err, 'Could not resend the verification code'));
      }
    } finally {
      setResending(false);
    }
  };

  const restart = () => {
    sessionStorage.removeItem(PENDING_EMAIL_VERIFICATION_KEY);
    router.replace('/register');
  };

  if (!loaded) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50" aria-busy="true" />
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center"><Logo size={72} /></div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 bg-clip-text text-transparent">
            Verify your email
          </h1>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          {!pending ? (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-gray-600">
                {sessionError || 'This verification session is missing or expired. Create an account again, or sign in to resume verification.'}
              </p>
              <Button type="button" size="lg" onClick={restart}>Create account</Button>
              <Link href="/login" className="text-sm font-semibold text-purple-600 hover:underline">Sign in</Link>
            </div>
          ) : (
            <>
              <p className="text-center text-sm text-gray-600">
                Enter the 6-digit code sent to <span className="font-semibold text-gray-900">{maskEmail(pending.email)}</span>.
              </p>

              <form onSubmit={verify} className="mt-6 flex flex-col gap-4">
                <Input
                  label="Verification code"
                  value={code}
                  onChange={(event) => setCode(normalizeVerificationCode(event.target.value))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  className="text-center text-xl tracking-[0.35em]"
                  autoFocus
                />

                {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
                {notice && <p role="status" className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>}

                <Button
                  type="submit"
                  loading={verifying}
                  size="lg"
                  disabled={code.length !== 6 || verifyRetryInSec > 0 || pending.verificationCodeInvalidated}
                >
                  {pending.verificationCodeInvalidated
                    ? 'Request a new code'
                    : verifyRetryInSec > 0
                      ? `Try again in ${verifyRetryInSec}s`
                      : 'Verify email'}
                </Button>
              </form>

              <div className="mt-5 flex flex-col items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={resend}
                  disabled={resending || resendInSec > 0}
                  className="font-semibold text-purple-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                >
                  {resending ? 'Sending…' : resendInSec > 0 ? `Resend code in ${resendInSec}s` : 'Resend code'}
                </button>
                <button type="button" onClick={restart} className="text-gray-500 hover:text-gray-700 hover:underline">
                  Use a different email
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
