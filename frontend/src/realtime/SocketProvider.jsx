import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { getToastConfig } from './eventToast';
import { getSocketUrl } from './socketUrl';

export const SocketContext = createContext({
  connected: false,
  status: 'offline', // 'connecting' | 'live' | 'reconnecting' | 'offline'
  subscribe: () => () => {},
  triggerResync: () => {}
});

export function SocketProvider({ children }) {
  const { token, user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('offline');

  const socketRef = useRef(null);
  const listenersRef = useRef(new Map()); // eventName -> Set of callback functions
  const hasConnectedOnceRef = useRef(false);
  const hiddenTimeRef = useRef(null);

  // Trigger internal resync for all components
  const triggerResync = useCallback(() => {
    const resyncListeners = listenersRef.current.get('resync');
    if (resyncListeners) {
      resyncListeners.forEach((fn) => {
        try { fn(); } catch (err) { console.error('[SocketProvider] Error in resync listener:', err); }
      });
    }
  }, []);

  // Dispatch incoming socket event to subscribers
  const dispatchEvent = useCallback((eventName, payload) => {
    // 1. Show toast if applicable
    if (payload && payload.showToast) {
      const config = getToastConfig(eventName, payload, user?.role);
      if (config) {
        const onClick = config.link ? () => navigate(config.link) : null;
        if (config.type === 'success') {
          toast.success(config.message, onClick);
        } else if (config.type === 'error') {
          toast.error(config.message, onClick);
        } else {
          toast.info(config.message, onClick);
        }
      }
    }

    // 2. Notify subscribed components
    const listeners = listenersRef.current.get(eventName);
    if (listeners) {
      listeners.forEach((fn) => {
        try { fn(payload); } catch (err) { console.error(`[SocketProvider] Error in listener for ${eventName}:`, err); }
      });
    }
  }, [user?.role, toast, navigate]);

  // Subscribe helper for hooks
  const subscribe = useCallback((eventNames, handler) => {
    const names = Array.isArray(eventNames) ? eventNames : [eventNames];
    names.forEach((name) => {
      if (!listenersRef.current.has(name)) {
        listenersRef.current.set(name, new Set());
      }
      listenersRef.current.get(name).add(handler);
    });

    return () => {
      names.forEach((name) => {
        const set = listenersRef.current.get(name);
        if (set) {
          set.delete(handler);
          if (set.size === 0) {
            listenersRef.current.delete(name);
          }
        }
      });
    };
  }, []);

  // Manage connection lifecycle
  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      setStatus('offline');
      hasConnectedOnceRef.current = false;
      return;
    }

    const socketUrl = getSocketUrl(import.meta.env);
    if (!socketUrl) {
      console.warn('PayPost: VITE_SOCKET_URL / VITE_API_URL is not set, real-time is off');
      setConnected(false);
      setStatus('offline');
      return;
    }

    setStatus('connecting');

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      path: '/socket.io'
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setStatus('live');

      // Resync on reconnect after initial connection
      if (hasConnectedOnceRef.current) {
        triggerResync();
      } else {
        hasConnectedOnceRef.current = true;
      }
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') {
        // the disconnection was initiated by the server, reconnect manually if not unauth
        setStatus('offline');
      } else {
        // the socket is attempting to reconnect
        setStatus('reconnecting');
      }
    });

    socket.on('connect_error', (err) => {
      const msg = err?.message || '';
      if (msg.includes('Unauthorized')) {
        // Server rejected handshake with Unauthorized -> stop reconnecting and logout
        socket.disconnect();
        setStatus('offline');
        logout();
      } else {
        setStatus('reconnecting');
      }
    });

    // Register wildcards/known business events on the underlying socket
    const businessEvents = [
      'application:changed',
      'submission:changed',
      'campaign:changed',
      'discover:changed',
      'wallet:changed',
      'withdrawal:changed',
      'notification:changed'
    ];

    businessEvents.forEach((evt) => {
      socket.on(evt, (payload) => {
        dispatchEvent(evt, payload);
      });
    });

    // Cleanup on unmount or token change
    return () => {
      businessEvents.forEach((evt) => socket.off(evt));
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, logout, triggerResync, dispatchEvent]);

  // Window online/offline and Visibility change (>30s hidden -> resync)
  useEffect(() => {
    const handleOnline = () => {
      triggerResync();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenTimeRef.current = Date.now();
      } else {
        const lastHidden = hiddenTimeRef.current;
        hiddenTimeRef.current = null;
        if (lastHidden && Date.now() - lastHidden > 30000) {
          triggerResync();
        }
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerResync]);

  const value = {
    connected,
    status,
    subscribe,
    triggerResync
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
