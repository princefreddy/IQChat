"use client"
import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${++counterRef.current}`;
    setToasts(prev => [...prev.slice(-2), { id, message, type }]); // Max 3 toasts

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const icons: Record<ToastType, string> = {
    success: '✅',
    error: '❌',
    info: '💬',
    warning: '⚠️',
  };

  const colors: Record<ToastType, string> = {
    success: 'rgba(74, 222, 128, 0.15)',
    error: 'rgba(255, 77, 79, 0.15)',
    info: 'rgba(212, 175, 55, 0.15)',
    warning: 'rgba(251, 191, 36, 0.15)',
  };

  const borderColors: Record<ToastType, string> = {
    success: '#4ade80',
    error: '#ff4d4f',
    info: '#D4AF37',
    warning: '#fbbf24',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Stack */}
      <div style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast-slide-in"
            style={{
              pointerEvents: 'auto',
              background: colors[toast.type],
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${borderColors[toast.type]}`,
              borderRadius: '12px',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              minWidth: '280px',
              maxWidth: '400px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
          >
            <span style={{ fontSize: '18px' }}>{icons[toast.type]}</span>
            <span style={{ color: '#F7FAFC', fontSize: '14px', fontWeight: 500 }}>
              {toast.message}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
