import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketProvider';

/**
 * Automatically triggers background refetching upon relevant realtime events or resyncs.
 *
 * - Coalesces bursts with a 300ms debounce.
 * - Concurrency guard prevents overlapping refetch calls.
 * - Postpones refetching while document is hidden and runs immediately upon becoming visible.
 * - Respects optional filter(payload) to ignore events for different campaigns/entities.
 *
 * @param {string|string[]} eventNames - Events to listen for
 * @param {Function} refetchFn - Function that refetches REST data
 * @param {Object} [options]
 * @param {number} [options.debounceMs=300] - Debounce delay in ms
 * @param {Function} [options.filter] - Optional filter(payload) -> boolean
 */
export function useRealtimeRefetch(eventNames, refetchFn, { debounceMs = 300, filter = null } = {}) {
  const { subscribe } = useSocket();
  const refetchRef = useRef(refetchFn);
  const filterRef = useRef(filter);
  const timerRef = useRef(null);
  const isExecutingRef = useRef(false);
  const hasQueuedNextRef = useRef(false);
  const isStaleRef = useRef(false);

  useEffect(() => {
    refetchRef.current = refetchFn;
  }, [refetchFn]);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // Safe executor that guarantees non-overlapping execution
  const executeSafe = useCallback(async () => {
    if (isExecutingRef.current) {
      hasQueuedNextRef.current = true;
      return;
    }

    if (document.hidden) {
      isStaleRef.current = true;
      return;
    }

    isExecutingRef.current = true;
    isStaleRef.current = false;

    try {
      if (refetchRef.current) {
        await refetchRef.current();
      }
    } catch (err) {
      console.error('[useRealtimeRefetch] Error during background refetch:', err);
    } finally {
      isExecutingRef.current = false;
      if (hasQueuedNextRef.current) {
        hasQueuedNextRef.current = false;
        executeSafe();
      }
    }
  }, []);

  // Schedule a debounced refetch
  const scheduleRefetch = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      executeSafe();
    }, debounceMs);
  }, [debounceMs, executeSafe]);

  // Handle incoming event
  const handleEvent = useCallback((payload) => {
    if (filterRef.current && typeof filterRef.current === 'function') {
      try {
        if (!filterRef.current(payload)) {
          return;
        }
      } catch (err) {
        console.error('[useRealtimeRefetch] Error in filter evaluation:', err);
      }
    }
    scheduleRefetch();
  }, [scheduleRefetch]);

  // Visibility change listener: if marked stale while hidden, refetch upon return
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && isStaleRef.current) {
        scheduleRefetch();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [scheduleRefetch]);

  // Cleanup pending timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const eventKey = Array.isArray(eventNames) ? eventNames.join(',') : eventNames;

  // Subscribe to specified events PLUS the internal 'resync' signal
  useEffect(() => {
    const rawEvents = Array.isArray(eventNames) ? eventNames : [eventNames];
    const allEvents = Array.from(new Set([...rawEvents, 'resync']));

    const unsubscribe = subscribe(allEvents, (payload) => {
      handleEvent(payload);
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, handleEvent, eventKey]);
}
