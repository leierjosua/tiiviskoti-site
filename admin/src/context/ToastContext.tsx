import { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  const fn = ctx.toast;
  return Object.assign(fn, {
    success: (message: string) => fn(message, "success"),
    error: (message: string) => fn(message, "error"),
    info: (message: string) => fn(message, "info"),
  });
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icons: Record<ToastVariant, React.ReactNode> = {
    success: <CheckCircle className="w-5 h-5 text-accent-dark flex-shrink-0" />,
    error: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />,
  };

  const bgColors: Record<ToastVariant, string> = {
    success: "bg-accent-muted border-accent/30",
    error: "bg-red-50 border-red-200",
    info: "bg-blue-50 border-blue-200",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 border rounded-xl shadow-lg animate-in slide-in-from-right fade-in duration-200 ${bgColors[t.variant]}`}
          >
            {icons[t.variant]}
            <p className="text-sm text-text-primary flex-1">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="p-1 rounded-lg hover:bg-black/5 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-text-secondary" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
