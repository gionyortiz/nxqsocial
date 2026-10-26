import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

// One request at a time, only while this screen is visible. Ignore late results
// after navigation, sign-out, or backgrounding; refresh immediately on return.
export function useFocusedRefresh(task: (isCurrent: () => boolean) => Promise<void>, intervalMs = 10000) {
  useFocusEffect(useCallback(() => {
    let mounted = true;
    let active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let generation = 0;
    let busy = false;
    const refresh = async () => {
      if (!mounted || !active || busy) return;
      busy = true;
      const requestGeneration = generation;
      try { await task(() => mounted && active && requestGeneration === generation); }
      finally {
        busy = false;
        if (mounted && active && requestGeneration !== generation) void refresh();
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    const subscription = AppState.addEventListener('change', state => {
      const next = state === 'active';
      if (next === active) return;
      active = next;
      generation += 1;
      if (active) void refresh();
    });
    return () => { mounted = false; generation += 1; clearInterval(timer); subscription.remove(); };
  }, [task, intervalMs]));
}
