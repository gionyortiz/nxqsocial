'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { AuthShell } from '@/components/auth/AuthShell';
import { trackEvent } from '@/lib/analytics';
import {
  PENDING_EMAIL_VERIFICATION_KEY,
  RegisterResponse,
  apiErrorMessage,
  buildRegisterRequest,
  deadlineAfterSeconds,
  retryAfterSeconds,
} from '@/lib/signup';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';

const schema = z.object({
  email: z.string().email('Invalid email'),
  username: z.string().min(3, 'Min 3 chars').max(30, 'Max 30 chars').regex(/^[A-Za-z0-9_.]+$/, 'Letters, numbers, _ and . only'),
  displayName: z.string().min(2, 'Min 2 chars').max(50, 'Max 50 chars'),
  password: z.string()
    .min(12, 'At least 12 characters')
    .regex(/[A-Z]/, 'Add an uppercase letter')
    .regex(/[a-z]/, 'Add a lowercase letter')
    .regex(/[0-9]/, 'Add a number')
    .regex(/[^A-Za-z0-9]/, 'Add a special character'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  agreeToTerms: z.boolean().refine((v) => v === true, { message: 'You must agree to the Terms of Service and Community Guidelines to continue.' }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [serverError, setServerError] = useState('');
  const [retryInSec, setRetryInSec] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    if (retryInSec > 0) return;
    if (!turnstileToken) {
      setServerError('Complete the security check before creating your account.');
      return;
    }
    void trackEvent('signup_started', { source: 'register_page' }, { isPublic: true });
    try {
      const { data: res } = await api.post<RegisterResponse>(
        '/auth/register',
        buildRegisterRequest(data, turnstileToken),
      );
      void trackEvent('signup_completed', { source: 'register_page' }, { isPublic: true });

      if (res.requiresEmailVerification === true) {
        if (!res.verification_token || !res.user?.email) {
          setServerError('Your account was created, but the email-verification session was incomplete. Please sign in to continue.');
          setTurnstileResetKey((key) => key + 1);
          return;
        }

        const resendAfterSeconds = res.verification?.resendAfterSeconds ?? 60;
        sessionStorage.setItem(PENDING_EMAIL_VERIFICATION_KEY, JSON.stringify({
          verificationToken: res.verification_token,
          email: res.user.email,
          resendAvailableAt: deadlineAfterSeconds(resendAfterSeconds),
        }));
        router.push('/verify-email');
        return;
      }

      // Temporary staging compatibility: the legacy backend response still
      // creates a normal authenticated session until hardening is enabled.
      if (!res.user || !res.access_token) {
        setServerError('Registration returned an incomplete session. Please try signing in.');
        setTurnstileResetKey((key) => key + 1);
        return;
      }
      setAuth(res.user, res.access_token);
      router.push('/feed');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response?.status;
      setTurnstileResetKey((key) => key + 1);
      if (status === 429) {
        const cooldown = retryAfterSeconds(err, 600);
        setServerError(`Too many signup attempts. Try again when the ${cooldown}-second cooldown ends.`);
        setRetryInSec(cooldown);
        return;
      }
      setServerError(apiErrorMessage(err, 'Registration failed'));
    }
  };

  useEffect(() => {
    if (retryInSec <= 0) return;
    const timer = setTimeout(() => setRetryInSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [retryInSec]);

  return (
    <AuthShell title="Create your account" subtitle="Join a safer, human-centered social network.">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input label="Display Name" placeholder="Your Name" error={errors.displayName?.message} {...register('displayName')} />
            <Input
              label="Username"
              placeholder="username"
              error={errors.username?.message}
              {...register('username', {
                setValueAs: (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
              })}
            />
            <Input label="Email" type="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
            <Input label="Password" type="password" placeholder="Min 12 chars, mixed case, number & symbol" error={errors.password?.message} {...register('password')} />
            <Input label="Confirm Password" type="password" placeholder="Re-enter your password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />

            {/* EULA — required by Apple Guideline 1.2 */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
              <input
                type="checkbox"
                id="agreeToTerms"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 flex-shrink-0"
                {...register('agreeToTerms')}
              />
              <label htmlFor="agreeToTerms" className="text-xs text-slate-400 leading-relaxed cursor-pointer">
                I agree to the{' '}
                <a href="/terms" target="_blank" className="text-fuchsia-400 font-semibold hover:text-fuchsia-300">Terms of Service</a>
                {' '}and{' '}
                <a href="/community-guidelines" target="_blank" className="text-fuchsia-400 font-semibold hover:text-fuchsia-300">Community Guidelines</a>.
                {' '}I understand that objectionable content and abusive behavior are not tolerated and may result in account removal.
              </label>
            </div>
            {errors.agreeToTerms && (
              <p className="text-xs text-red-500 -mt-1">{errors.agreeToTerms.message}</p>
            )}

            <TurnstileWidget
              siteKey={TURNSTILE_SITE_KEY}
              resetKey={turnstileResetKey}
              onTokenChange={setTurnstileToken}
            />

            {serverError && (
              <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl">{serverError}</p>
            )}

            <Button
              type="submit"
              loading={isSubmitting}
              size="lg"
              className="w-full mt-2"
              disabled={retryInSec > 0 || !turnstileToken || !TURNSTILE_SITE_KEY}
            >
              {retryInSec > 0 ? `Try again in ${retryInSec}s` : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-fuchsia-400 font-semibold hover:text-fuchsia-300">
              Sign in
            </Link>
          </p>
    </AuthShell>
  );
}
