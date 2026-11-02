"use client";
import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

type ToastType = "success" | "error" | "info" | "warning";

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

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const iconNames: Record<ToastType, IconName> = {
    success: "check-circle",
    error: "x-circle",
    info: "info",
    warning: "alert-triangle",
  };

  const colors: Record<ToastType, string> = {
    success: "rgba(16, 31, 66, 0.92)",
    error: "rgba(35, 14, 24, 0.92)",
    info: "rgba(16, 31, 66, 0.92)",
    warning: "rgba(35, 28, 14, 0.92)",
  };

  const borderColors: Record<ToastType, string> = {
    success: "#4ade80",
    error: "#ff4d4f",
    info: "#C5A03B",
    warning: "#fbbf24",
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          zIndex: 10000,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast-slide-in"
            style={{
              pointerEvents: "auto",
              background: colors[toast.type],
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: `1px solid ${borderColors[toast.type]}`,
              borderRadius: "12px",
              padding: "12px 18px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
              minWidth: "260px",
              maxWidth: "400px",
              cursor: "pointer",
            }}
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          >
            <Icon name={iconNames[toast.type]} size={18} color={borderColors[toast.type]} />
            <span style={{ color: "#F7FAFC", fontSize: "14px", fontWeight: 500 }}>
              {toast.message}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
