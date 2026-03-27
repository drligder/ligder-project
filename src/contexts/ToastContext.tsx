/* eslint-disable react-refresh/only-export-components -- provider + useToast */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => remove(id), DISMISS_MS);
  }, [remove]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="toast-stack fixed bottom-4 right-4 z-[200] flex max-w-sm flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-item pointer-events-auto border-2 px-3 py-2.5 shadow-md ${toastVariantClass(t.variant)}`}
            style={{ fontFamily: "'Times New Roman', serif" }}
          >
            <div className="flex gap-2 items-start justify-between">
              <p className="text-sm text-gray-900 leading-snug pr-1">{t.message}</p>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="shrink-0 text-gray-500 hover:text-gray-800 text-lg leading-none px-1"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function toastVariantClass(v: ToastVariant): string {
  switch (v) {
    case 'success':
      return 'border-green-700 bg-green-50';
    case 'error':
      return 'border-red-700 bg-red-50';
    default:
      return 'border-blue-800 bg-blue-50';
  }
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
