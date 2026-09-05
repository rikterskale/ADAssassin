import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ToastKind = "ok" | "warn" | "bad" | "info";

type Toast = { id: number; kind: ToastKind; message: string };

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

let nextId = 1;

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, kind: ToastKind = "ok") => {
    const id = nextId++;
    setToasts((items) => [...items, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div className={`toast ${toast.kind}`} key={toast.id} role="status">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
