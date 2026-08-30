'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell } from '@/components/auth/AuthShell';

const schema = z.object({
  password: z.string()
    .min(12, 'At least 12 characters')
    .regex(/[A-Z]/, 'Add an uppercase letter')
    .regex(/[a-z]/, 'Add a lowercase letter')
    .regex(/[0-9]/, 'Add a number')
    .regex(/[^A-Za-z0-9]/, 'Add a special character'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
});
type FormData = z.infer<typeof schema>;

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      await api.post('/auth/reset-password', { token, password: data.password });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setServerError(message ?? 'This reset link is invalid or has expired.');
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-bold text-slate-100 mb-1">Invalid link</h2>
        <p className="text-sm text-slate-400">This reset link is missing or broken.</p>
        <Link href="/forgot-password" className="inline-block mt-6 text-sm text-fuchsia-400 font-semibold hover:text-fuchsia-300">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={28} className="text-green-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-100 mb-1">Password changed</h2>
        <p className="text-sm text-slate-400">Redirecting you to login…</p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label="New password"
          type="password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm new password"
          type="password"
          placeholder="••••••••"
          error={errors.confirm?.message}
          {...register('confirm')}
        />

        {serverError && (
          <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl">{serverError}</p>
        )}

        <Button type="submit" loading={isSubmitting} size="lg" className="w-full mt-2">
          Reset password
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        <Link href="/login" className="text-fuchsia-400 font-semibold hover:text-fuchsia-300">
          Back to login
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 12 characters with mixed case, a number, and a symbol.">
          <Suspense fallback={<div className="text-center text-sm text-gray-400">Loading…</div>}>
            <ResetForm />
          </Suspense>
    </AuthShell>
  );
}
