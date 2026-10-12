import React, { createContext, useContext, useState, useCallback } from 'react';
import { Icon } from './Icon';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 4000, onClick = null) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, onClick }].slice(-3));

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (msg, onClick) => showToast(msg, 'success', 4000, onClick),
    error: (msg, onClick) => showToast(msg, 'error', 4000, onClick),
    info: (msg, onClick) => showToast(msg, 'info', 4000, onClick),
    custom: (msg, type = 'info', duration = 4000, onClick = null) => showToast(msg, type, duration, onClick)
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast container: placed safely above mobile bottom nav */}
      <div
        className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:w-96 z-50 flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            onClick={() => {
              if (t.onClick) {
                t.onClick();
                removeToast(t.id);
              }
            }}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl shadow-lg border text-sm font-medium transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              t.onClick ? 'cursor-pointer hover:shadow-xl hover:opacity-95' : ''
            } ${
              t.type === 'success'
                ? 'bg-green-50 text-green-900 border-green-200'
                : t.type === 'error'
                ? 'bg-red-50 text-red-900 border-red-200'
                : 'bg-indigo-50 text-indigo-900 border-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <Icon
                name={t.type === 'success' ? 'check' : t.type === 'error' ? 'alert-circle' : 'info'}
                className="w-5 h-5 flex-shrink-0"
              />
              <span className={`break-words ${t.onClick ? 'underline decoration-dotted underline-offset-2' : ''}`}>{t.message}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(t.id);
              }}
              className="ml-3 min-h-11 min-w-11 -mr-2 flex items-center justify-center rounded-lg opacity-60 hover:opacity-100"
              aria-label="Dismiss toast"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
