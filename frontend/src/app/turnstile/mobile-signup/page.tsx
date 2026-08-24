'use client';

import { useCallback, useState } from 'react';
import Logo from '@/components/Logo';
import { TurnstileWidget, TurnstileWidgetState } from '@/components/auth/TurnstileWidget';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';

type BridgeMessage =
  | { type: 'turnstile-ready' }
  | { type: 'turnstile-token'; token: string }
  | { type: 'turnstile-expired' }
  | { type: 'turnstile-error'; message: string };

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export default function MobileSignupTurnstilePage() {
  const [resetKey, setResetKey] = useState(0);
  const [state, setState] = useState<TurnstileWidgetState>(TURNSTILE_SITE_KEY ? 'loading' : 'unavailable');

  const postToNative = useCallback((message: BridgeMessage) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify(message));
  }, []);

  const handleToken = useCallback((token: string | null) => {
    if (token) postToNative({ type: 'turnstile-token', token });
  }, [postToNative]);

  const handleState = useCallback((nextState: TurnstileWidgetState) => {
    setState(nextState);
    if (nextState === 'ready') postToNative({ type: 'turnstile-ready' });
    if (nextState === 'expired') postToNative({ type: 'turnstile-expired' });
    if (nextState === 'error') {
      postToNative({ type: 'turnstile-error', message: 'The security challenge failed. Please try again.' });
    }
    if (nextState === 'unavailable') {
      postToNative({ type: 'turnstile-error', message: 'The security challenge is not configured.' });
    }
  }, [postToNative]);

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-gray-900">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <Logo size={56} />
        <div>
          <h1 className="text-xl font-bold">Security check</h1>
          <p className="mt-1 text-sm text-gray-500">Complete this check to create your NXQ Social account.</p>
        </div>

        <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left">
          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            resetKey={resetKey}
            onTokenChange={handleToken}
            onStateChange={handleState}
          />
        </div>

        {(state === 'expired' || state === 'error') && (
          <button
            type="button"
            onClick={() => setResetKey((key) => key + 1)}
            className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
          >
            Try security check again
          </button>
        )}
      </div>
    </main>
  );
}
