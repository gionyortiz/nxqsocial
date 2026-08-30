'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell } from '@/components/auth/AuthShell';
import {
  PENDING_EMAIL_VERIFICATION_KEY,
  RegisterResponse,
  apiErrorMessage,
  deadlineAfterSeconds,
} from '@/lib/signup';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Required'),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      const { data: res } = await api.post<RegisterResponse>('/auth/login', data);
      if (res.requiresEmailVerification === true) {
        if (!res.verification_token || !res.user?.email) {
          setServerError('Email verification is required, but the verification session was incomplete.');
          return;
        }
        const resendAfterSeconds = res.verification?.sent === false
          ? 0
          : res.verification?.resendAfterSeconds ?? 60;
        sessionStorage.setItem(PENDING_EMAIL_VERIFICATION_KEY, JSON.stringify({
          verificationToken: res.verification_token,
          email: res.user.email,
          resendAvailableAt: deadlineAfterSeconds(resendAfterSeconds),
        }));
        router.push('/verify-email');
        return;
      }
      if (!res.user || !res.access_token) {
        setServerError('Login returned an incomplete session. Please try again.');
        return;
      }
      sessionStorage.removeItem(PENDING_EMAIL_VERIFICATION_KEY);
      setAuth(res.user, res.access_token);
      router.push('/feed');
    } catch (err: unknown) {
      setServerError(apiErrorMessage(err, 'Login failed'));
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to your trusted community.">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="text-right -mt-2">
              <Link href="/forgot-password" className="text-xs text-fuchsia-400 font-semibold hover:text-fuchsia-300">
                Forgot password?
              </Link>
            </div>

            {serverError && (
              <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl">{serverError}</p>
            )}

            <Button type="submit" loading={isSubmitting} size="lg" className="w-full mt-2">
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-fuchsia-400 font-semibold hover:text-fuchsia-300">
              Sign up
            </Link>
          </p>
    </AuthShell>
  );
}
