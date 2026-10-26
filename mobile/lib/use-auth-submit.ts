import { useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { AuthAction, authErrorMessage } from './auth-errors';

/** One in-flight request per form, with no automatic mutation retry. */
export function useAuthSubmit(action: AuthAction) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const inFlight = useRef(false);
  const retryUntil = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      setRetrySeconds(Math.max(0, Math.ceil((retryUntil.current - Date.now()) / 1000)));
    }, 1000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  const startCooldown = (seconds: number) => {
    const bounded = Number.isFinite(seconds) ? Math.max(1, Math.min(86400, Math.ceil(seconds))) : 60;
    retryUntil.current = Date.now() + bounded * 1000;
    if (mounted.current) setRetrySeconds(bounded);
  };

  const run = async (operation: () => Promise<void>, onError?: (error: unknown) => void) => {
    // The ref closes the gap before React re-renders after a double tap.
    if (inFlight.current || retryUntil.current > Date.now()) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
      return true;
    } catch (failure) {
      if (mounted.current) {
        if (failure instanceof ApiError && failure.status === 429) startCooldown(failure.retryAfterSeconds ?? 60);
        setError(authErrorMessage(failure, action));
        onError?.(failure);
      }
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return { busy, error, setError, retrySeconds, startCooldown, run };
}
