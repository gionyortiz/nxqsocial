'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { api } from '@/lib/api';

/**
 * Stripe Identity return URL handler.
 * Stripe redirects here after the verification flow with ?session_id=vs_xxx.
 * The actual outcome is delivered via webhook — this page just shows a
 * friendly "we're processing" message and refreshes the user's trust score.
 */
function VerifyCompleteContent() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  const [state, setState] = useState<'processing' | 'done' | 'error'>(() =>
    sessionId ? 'processing' : 'error',
  );

  useEffect(() => {
    if (!sessionId) return;
    // Trigger a trust score refresh so UI shows updated score
    api
      .post('/trust/recalculate')
      .catch(() => {})
      .finally(() => setState('done'));
  }, [sessionId]);

  return (
    <AppShell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center px-4">
        {state === 'processing' && (
          <>
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-400 border-t-transparent" />
            <p className="text-gray-600">Processing your verification…</p>
          </>
        )}

        {state === 'done' && (
          <>
            <div className="text-5xl">🎉</div>
            <h1 className="text-2xl font-bold text-gray-900">Verification submitted!</h1>
            <p className="text-gray-500 max-w-sm">
              Stripe is reviewing your ID. This usually takes a few minutes. Your badge and trust score will
              update automatically once confirmed.
            </p>
            <button
              onClick={() => router.push('/verify')}
              className="rounded-xl bg-purple-600 px-6 py-2.5 text-white font-medium hover:bg-purple-700 transition-colors"
            >
              Back to Verify
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="text-5xl">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
            <p className="text-gray-500">We could not confirm your session. Please try again.</p>
            <button
              onClick={() => router.push('/verify')}
              className="rounded-xl bg-gray-800 px-6 py-2.5 text-white font-medium hover:bg-gray-700 transition-colors"
            >
              Back to Verify
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function VerifyCompletePage() {
  return (
    <Suspense fallback={
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-400 border-t-transparent" />
        </div>
      </AppShell>
    }>
      <VerifyCompleteContent />
    </Suspense>
  );
}
