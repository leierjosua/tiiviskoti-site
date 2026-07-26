import { useState } from "react";
import { X, UserCog } from "lucide-react";
import { useEmployees } from "@/hooks/useEmployees";
import { selectCls } from "@/lib/constants";

interface ReassignModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (salespersonId: string) => void;
  count: number;
  isPending?: boolean;
}

export function ReassignModal({ open, onClose, onConfirm, count, isPending }: ReassignModalProps) {
  const [selected, setSelected] = useState("");
  const { data: sellers = [] } = useEmployees("seller");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm mx-3 sm:mx-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-accent" />
            <h2 className="text-sm font-semibold">Siirrä myyjälle</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-text-muted">
            Siirrä {count} valittua uudelle myyjälle
          </p>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={selectCls}
          >
            <option value="">Valitse myyjä...</option>
            {sellers.filter((s) => s.active !== false).map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text"
          >
            Peruuta
          </button>
          <button
            onClick={() => { if (selected) onConfirm(selected); }}
            disabled={!selected || isPending}
            className="px-4 py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? "Siirretään..." : "Siirrä"}
          </button>
        </div>
      </div>
    </div>
  );
}
