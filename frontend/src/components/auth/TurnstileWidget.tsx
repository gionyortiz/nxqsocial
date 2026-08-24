'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

export type TurnstileWidgetState = 'loading' | 'ready' | 'verified' | 'expired' | 'error' | 'unavailable';

interface TurnstileRenderOptions {
  sitekey: string;
  action: 'register';
  theme: 'light';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  'timeout-callback': () => void;
  'unsupported-callback': () => void;
  'response-field': false;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  resetKey?: number;
  onTokenChange: (token: string | null) => void;
  onStateChange?: (state: TurnstileWidgetState) => void;
}

const STATE_MESSAGES: Record<TurnstileWidgetState, string> = {
  loading: 'Loading the security check…',
  ready: 'Complete the security check to continue.',
  verified: 'Security check complete.',
  expired: 'The security check expired. Please complete it again.',
  error: 'The security check could not load. Check your connection and try again.',
  unavailable: 'Account creation is temporarily unavailable because the security check is not configured.',
};

export function TurnstileWidget({
  siteKey,
  resetKey = 0,
  onTokenChange,
  onStateChange,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const previousResetKeyRef = useRef(resetKey);
  const tokenCallbackRef = useRef(onTokenChange);
  const stateCallbackRef = useRef(onStateChange);
  const [state, setState] = useState<TurnstileWidgetState>(siteKey ? 'loading' : 'unavailable');

  useEffect(() => {
    tokenCallbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    stateCallbackRef.current = onStateChange;
  }, [onStateChange]);

  const emitState = useCallback((nextState: TurnstileWidgetState) => {
    setState(nextState);
    stateCallbackRef.current?.(nextState);
  }, []);

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile || widgetIdRef.current) return;

    try {
      const handleExpiration = () => {
        tokenCallbackRef.current(null);
        emitState('expired');
        window.setTimeout(() => {
          const widgetId = widgetIdRef.current;
          if (!widgetId || !window.turnstile) return;
          try {
            window.turnstile.reset(widgetId);
            emitState('ready');
          } catch {
            emitState('error');
          }
        }, 0);
      };

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action: 'register',
        theme: 'light',
        'response-field': false,
        callback: (token) => {
          tokenCallbackRef.current(token);
          emitState('verified');
        },
        'expired-callback': handleExpiration,
        'error-callback': () => {
          tokenCallbackRef.current(null);
          emitState('error');
        },
        'timeout-callback': handleExpiration,
        'unsupported-callback': () => {
          tokenCallbackRef.current(null);
          emitState('error');
        },
      });
      emitState('ready');
    } catch {
      tokenCallbackRef.current(null);
      emitState('error');
    }
  }, [emitState, siteKey]);

  useEffect(() => {
    if (!siteKey) {
      const timer = window.setTimeout(() => {
        tokenCallbackRef.current(null);
        stateCallbackRef.current?.('unavailable');
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const renderTimer = window.turnstile ? window.setTimeout(renderWidget, 0) : null;

    return () => {
      if (renderTimer !== null) window.clearTimeout(renderTimer);
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      widgetIdRef.current = null;
    };
  }, [emitState, renderWidget, siteKey]);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return;
    previousResetKeyRef.current = resetKey;
    const timer = window.setTimeout(() => {
      tokenCallbackRef.current(null);
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.reset(widgetId);
          emitState('ready');
        } catch {
          emitState('error');
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [emitState, resetKey]);

  if (!siteKey) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
        {STATE_MESSAGES.unavailable}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
        onError={() => {
          tokenCallbackRef.current(null);
          emitState('error');
        }}
      />
      <div ref={containerRef} className="min-h-[65px]" />
      <p
        role={state === 'error' || state === 'expired' ? 'alert' : 'status'}
        aria-live="polite"
        className={`text-xs ${state === 'verified' ? 'text-green-700' : state === 'error' || state === 'expired' ? 'text-red-600' : 'text-gray-500'}`}
      >
        {STATE_MESSAGES[state]}
      </p>
    </div>
  );
}
