import { X, UserCog, Tag, ArrowRightLeft, Trash2 } from "lucide-react";

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  onReassign: () => void;
  onTag?: () => void;
  onChangeStatus?: () => void;
  onDelete?: () => void;
}

export function BulkActionBar({ count, onClear, onReassign, onTag, onChangeStatus, onDelete }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-2xl shadow-2xl shadow-brand/30 animate-in slide-in-from-bottom-4">
      <span className="text-xs font-semibold mr-1">{count} valittu</span>

      <button
        onClick={onReassign}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-medium transition-colors"
      >
        <UserCog className="w-3.5 h-3.5" /> Siirrä myyjälle
      </button>

      {onTag && (
        <button
          onClick={onTag}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-medium transition-colors"
        >
          <Tag className="w-3.5 h-3.5" /> Tagaa
        </button>
      )}

      {onChangeStatus && (
        <button
          onClick={onChangeStatus}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-medium transition-colors"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" /> Vaihda status
        </button>
      )}

      {onDelete && (
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 rounded-lg text-xs font-medium transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Poista
        </button>
      )}

      <button
        onClick={onClear}
        className="ml-1 p-1.5 hover:bg-white/15 rounded-lg transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
