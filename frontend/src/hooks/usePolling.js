import { useEffect, useRef } from 'react';

/**
 * Executes a callback at a fixed interval while active.
 * Automatically pauses when document.visibilityState is 'hidden'
 * and triggers immediately upon becoming visible.
 *
 * @param {Function} callback - Function to run on poll
 * @param {number} delayMs - Interval in milliseconds (null or 0 to pause)
 * @param {boolean} enabled - Whether polling is currently active
 */
export function usePolling(callback, delayMs, enabled = true) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !delayMs) return;

    let timerId = null;

    const tick = () => {
      if (document.visibilityState === 'visible' && savedCallback.current) {
        savedCallback.current();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Immediate refresh on return
        if (savedCallback.current) {
          savedCallback.current();
        }
        // Restart interval
        clearInterval(timerId);
        timerId = setInterval(tick, delayMs);
      } else {
        // Pause timer while tab is in background
        clearInterval(timerId);
      }
    };

    if (document.visibilityState === 'visible') {
      timerId = setInterval(tick, delayMs);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [delayMs, enabled]);
}
