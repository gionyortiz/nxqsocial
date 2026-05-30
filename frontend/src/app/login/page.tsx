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
import Logo from '@/components/Logo';

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
      const { data: res } = await api.post('/auth/login', data);
      setAuth(res.user, res.access_token);
      router.push('/feed');
    } catch (err: any) {
      setServerError(err.response?.data?.message ?? 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size={72} />
          </div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 bg-clip-text text-transparent">
            NXQ Social
          </h1>
          <p className="text-gray-500 mt-2 text-sm">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
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
              <Link href="/forgot-password" className="text-xs text-purple-600 font-medium hover:underline">
                Forgot password?
              </Link>
            </div>

            {serverError && (
              <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-xl">{serverError}</p>
            )}

            <Button type="submit" loading={isSubmitting} size="lg" className="w-full mt-2">
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-purple-600 font-semibold hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
