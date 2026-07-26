import { createContext, useContext, useState, useCallback, useRef } from "react";

interface ConfirmCheckbox {
  label: string;
  defaultChecked?: boolean;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  checkbox?: ConfirmCheckbox;
}

interface ConfirmResult {
  confirmed: boolean;
  checkboxValue?: boolean;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmWithCheckbox: (options: ConfirmOptions) => Promise<ConfirmResult>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}

export function useConfirmWithCheckbox() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirmWithCheckbox must be used within ConfirmProvider");
  return ctx.confirmWithCheckbox;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { open: true }) | { open: false }>({ open: false });
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const checkboxCheckedRef = useRef(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const resolveWithCheckboxRef = useRef<((value: ConfirmResult) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      resolveWithCheckboxRef.current = null;
      const v = options.checkbox?.defaultChecked ?? false;
      setCheckboxChecked(v);
      checkboxCheckedRef.current = v;
      setState({ ...options, open: true });
    });
  }, []);

  const confirmWithCheckbox = useCallback((options: ConfirmOptions): Promise<ConfirmResult> => {
    return new Promise((resolve) => {
      resolveWithCheckboxRef.current = resolve;
      resolveRef.current = null;
      const v = options.checkbox?.defaultChecked ?? false;
      setCheckboxChecked(v);
      checkboxCheckedRef.current = v;
      setState({ ...options, open: true });
    });
  }, []);

  function handleClose(result: boolean) {
    if (resolveWithCheckboxRef.current) {
      resolveWithCheckboxRef.current({ confirmed: result, checkboxValue: checkboxCheckedRef.current });
      resolveWithCheckboxRef.current = null;
    }
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
    setState({ open: false });
  }

  return (
    <ConfirmContext.Provider value={{ confirm, confirmWithCheckbox }}>
      {children}
      {state.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => handleClose(false)}
          />
          {/* Modal */}
          <div className="relative bg-surface border border-border rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-150">
            {state.title && (
              <h3 className="text-base font-bold text-text-primary mb-2">{state.title}</h3>
            )}
            <p className="text-sm text-text-secondary leading-relaxed">{state.message}</p>
            {state.checkbox && (
              <label className="flex items-center gap-3 mt-4 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checkboxChecked}
                  onChange={(e) => { setCheckboxChecked(e.target.checked); checkboxCheckedRef.current = e.target.checked; }}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-sm text-text-secondary">{state.checkbox.label}</span>
              </label>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => handleClose(false)}
                className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
              >
                {state.cancelLabel || "Peruuta"}
              </button>
              <button
                onClick={() => handleClose(true)}
                autoFocus
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  state.variant === "danger"
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-accent hover:bg-accent-dark text-white"
                }`}
              >
                {state.confirmLabel || "Kyllä"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
