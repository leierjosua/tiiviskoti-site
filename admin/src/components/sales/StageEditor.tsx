import { useState } from "react";
import { Plus, GripVertical, Trash2, Pencil, Check, X } from "lucide-react";
import { inputCls } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";

interface Stage {
  key: string;
  label: string;
  color: string;
  position: number;
  is_active: boolean;
  is_system: boolean;
  is_close_stage: boolean;
}

interface StageEditorProps {
  stages: Stage[];
  onSave: (stage: Partial<Stage> & { key: string }) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  title: string;
}

export function StageEditor({ stages, onSave, onDelete, title }: StageEditorProps) {
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ key: "", label: "", color: "#3b82f6", is_close_stage: false });

  const sorted = [...stages].sort((a, b) => a.position - b.position);

  async function handleSave() {
    if (!form.key || !form.label) return;
    try {
      await onSave({
        key: form.key,
        label: form.label,
        color: form.color,
        is_close_stage: form.is_close_stage,
        position: sorted.length,
      });
      setAdding(false);
      setForm({ key: "", label: "", color: "#3b82f6", is_close_stage: false });
      toast("Vaihe tallennettu");
    } catch {
      toast("Tallennus epäonnistui", "error");
    }
  }

  async function handleUpdate(stage: Stage) {
    try {
      await onSave({
        key: stage.key,
        label: form.label || stage.label,
        color: form.color || stage.color,
        is_close_stage: form.is_close_stage,
      });
      setEditing(null);
      toast("Vaihe päivitetty");
    } catch {
      toast("Päivitys epäonnistui", "error");
    }
  }

  async function handleDelete(key: string) {
    try {
      await onDelete(key);
      toast("Vaihe poistettu");
    } catch {
      toast("Poisto epäonnistui", "error");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          onClick={() => {
            setAdding(true);
            setForm({ key: "", label: "", color: "#3b82f6", is_close_stage: false });
          }}
          className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
        >
          <Plus className="w-3.5 h-3.5" /> Lisää vaihe
        </button>
      </div>

      <div className="space-y-1">
        {sorted.map((stage) => (
          <div
            key={stage.key}
            className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl"
          >
            <GripVertical className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            {editing === stage.key ? (
              <>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className={`${inputCls} !py-1 !text-xs flex-1`}
                />
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-6 h-6 border-0 cursor-pointer"
                />
                <button onClick={() => handleUpdate(stage)} className="text-accent hover:text-accent/80">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setEditing(null)} className="text-text-muted hover:text-text">
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="text-xs font-medium flex-1">{stage.label}</span>
                {stage.is_close_stage && (
                  <span className="text-[10px] text-text-muted">Sulkuvaihe</span>
                )}
                {stage.is_system && (
                  <span className="text-[10px] text-text-muted">Järjestelmä</span>
                )}
                <button
                  onClick={() => {
                    setEditing(stage.key);
                    setForm({ key: stage.key, label: stage.label, color: stage.color, is_close_stage: stage.is_close_stage });
                  }}
                  className="text-text-muted hover:text-text"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!stage.is_system && (
                  <button onClick={() => handleDelete(stage.key)} className="text-text-muted hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}

        {adding && (
          <div className="flex items-center gap-2 px-3 py-2 bg-accent/5 border border-accent/20 rounded-xl">
            <input
              placeholder="Avain (esim. uusi_vaihe)"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
              className={`${inputCls} !py-1 !text-xs w-32`}
            />
            <input
              placeholder="Nimi"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className={`${inputCls} !py-1 !text-xs flex-1`}
            />
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-6 h-6 border-0 cursor-pointer"
            />
            <label className="flex items-center gap-1 text-[10px] text-text-muted">
              <input
                type="checkbox"
                checked={form.is_close_stage}
                onChange={(e) => setForm({ ...form, is_close_stage: e.target.checked })}
              />
              Sulku
            </label>
            <button onClick={handleSave} className="text-accent hover:text-accent/80">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setAdding(false)} className="text-text-muted hover:text-text">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
