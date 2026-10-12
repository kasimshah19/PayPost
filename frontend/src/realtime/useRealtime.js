import { useEffect, useRef } from 'react';
import { useSocket } from './SocketProvider';

/**
 * Subscribes to one or more Socket.IO event names.
 * Ensures no stale closure by calling the latest handler reference.
 *
 * @param {string|string[]} eventNames
 * @param {Function} handler
 */
export function useRealtime(eventNames, handler) {
  const { subscribe } = useSocket();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!eventNames || (Array.isArray(eventNames) && eventNames.length === 0)) {
      return;
    }

    const unsubscribe = subscribe(eventNames, (payload) => {
      if (handlerRef.current) {
        handlerRef.current(payload);
      }
    });

    return unsubscribe;
  }, [subscribe, Array.isArray(eventNames) ? eventNames.join(',') : eventNames]);
}
