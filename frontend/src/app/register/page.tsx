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
import Logo from '@/components/Logo';
import { trackEvent } from '@/lib/analytics';

const schema = z.object({
  email: z.string().email('Invalid email'),
  username: z.string().min(3, 'Min 3 chars').max(30, 'Max 30 chars').regex(/^[a-z0-9_.]+$/, 'Lowercase letters, numbers, _ and . only'),
  displayName: z.string().min(2, 'Min 2 chars').max(50, 'Max 50 chars'),
  password: z.string()
    .min(12, 'At least 12 characters')
    .regex(/[A-Z]/, 'Add an uppercase letter')
    .regex(/[a-z]/, 'Add a lowercase letter')
    .regex(/[0-9]/, 'Add a number')
    .regex(/[^A-Za-z0-9]/, 'Add a special character'),
  inviteCode: z.string().optional(),
  agreeToTerms: z.boolean().refine((v) => v === true, { message: 'You must agree to the Terms of Service and Community Guidelines to continue.' }),
});
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [serverError, setServerError] = useState('');
  const [retryInSec, setRetryInSec] = useState(0);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    if (retryInSec > 0) return;
    void trackEvent('signup_started', { source: 'register_page' }, { isPublic: true });
    try {
      const { data: res } = await api.post('/auth/register', data);
      setAuth(res.user, res.access_token);
      void trackEvent('signup_completed', { source: 'register_page' }, { isPublic: true });
      router.push('/feed');
    } catch (err: any) {
      if (err?.response?.status === 429) {
        setServerError('Too many signup attempts. Please wait a few minutes and try again.');
        setRetryInSec(60);
        return;
      }
      setServerError(err.response?.data?.message ?? 'Registration failed');
    }
  };

  useEffect(() => {
    if (retryInSec <= 0) return;
    const timer = setTimeout(() => setRetryInSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [retryInSec]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size={72} />
          </div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 bg-clip-text text-transparent">
            NXQ Social
          </h1>
          <p className="text-gray-500 mt-2 text-sm">Create your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
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

            <Input label="Invite Code (optional)" placeholder="Enter your invite code" error={errors.inviteCode?.message} {...register('inviteCode')} />

            {/* EULA — required by Apple Guideline 1.2 */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <input
                type="checkbox"
                id="agreeToTerms"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 flex-shrink-0"
                {...register('agreeToTerms')}
              />
              <label htmlFor="agreeToTerms" className="text-xs text-gray-600 leading-relaxed cursor-pointer">
                I agree to the{' '}
                <a href="/terms" target="_blank" className="text-purple-600 font-semibold hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href="/community-guidelines" target="_blank" className="text-purple-600 font-semibold hover:underline">Community Guidelines</a>.
                {' '}I understand that objectionable content and abusive behavior are not tolerated and may result in account removal.
              </label>
            </div>
            {errors.agreeToTerms && (
              <p className="text-xs text-red-500 -mt-1">{errors.agreeToTerms.message}</p>
            )}

            {serverError && (
              <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-xl">{serverError}</p>
            )}

            <Button type="submit" loading={isSubmitting} size="lg" className="w-full mt-2" disabled={retryInSec > 0}>
              {retryInSec > 0 ? `Try again in ${retryInSec}s` : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-purple-600 font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
