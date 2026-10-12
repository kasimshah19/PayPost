import { useEffect, useRef } from 'react';

/**
 * Executes a callback at a fixed interval while enabled and document is visible.
 * Automatically pauses when document.visibilityState is 'hidden'
 * and triggers immediately once upon becoming visible again.
 * Prevents overlapping async invocations and never throws.
 *
 * Supports both signatures:
 * - usePolling(callback, { intervalMs, enabled })
 * - usePolling(callback, intervalMs, enabled)
 */
export function usePolling(callback, optionsOrInterval = 5000, enabledArg = true) {
  let intervalMs = 5000;
  let enabled = true;

  if (typeof optionsOrInterval === 'object' && optionsOrInterval !== null) {
    intervalMs = optionsOrInterval.intervalMs ?? 5000;
    enabled = optionsOrInterval.enabled ?? true;
  } else if (typeof optionsOrInterval === 'number') {
    intervalMs = optionsOrInterval;
    enabled = Boolean(enabledArg);
  }

  const savedCallback = useRef(callback);
  const isExecutingRef = useRef(false);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !intervalMs || intervalMs <= 0) return;

    let timerId = null;

    const executeSafe = async () => {
      if (isExecutingRef.current) return;
      if (!savedCallback.current) return;
      try {
        isExecutingRef.current = true;
        await savedCallback.current();
      } catch {
        // Polling callback errors are suppressed to prevent crashes
      } finally {
        isExecutingRef.current = false;
      }
    };

    const tick = () => {
      if (document.visibilityState === 'visible') {
        executeSafe();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Immediate tick on returning to the tab
        executeSafe();
        // Restart interval
        clearInterval(timerId);
        timerId = setInterval(tick, intervalMs);
      } else {
        // Pause timer while tab is in background
        clearInterval(timerId);
      }
    };

    if (document.visibilityState === 'visible') {
      timerId = setInterval(tick, intervalMs);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
