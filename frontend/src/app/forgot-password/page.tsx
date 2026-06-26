'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Logo from '@/components/Logo';

const schema = z.object({ email: z.string().email('Invalid email') });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      await api.post('/auth/forgot-password', data);
      setSent(true);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setServerError(message ?? 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size={72} />
          </div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 bg-clip-text text-transparent">
            Forgot password?
          </h1>
          <p className="text-gray-500 mt-2 text-sm">We&apos;ll email you a link to reset it</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} className="text-green-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Check your email</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                If that email is registered, we&apos;ve sent a password reset link. It expires in 1 hour.
              </p>
              <Link href="/login" className="inline-block mt-6 text-sm text-purple-600 font-semibold hover:underline">
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  error={errors.email?.message}
                  {...register('email')}
                />

                {serverError && (
                  <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-xl">{serverError}</p>
                )}

                <Button type="submit" loading={isSubmitting} size="lg" className="w-full mt-2">
                  Send reset link
                </Button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                Remembered it?{' '}
                <Link href="/login" className="text-purple-600 font-semibold hover:underline">
                  Back to login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
