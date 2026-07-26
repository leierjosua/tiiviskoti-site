import { useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { useCreateLabel, useDeleteLabel, useUpdateLabel } from "@/hooks/sales/useSalesEmails";
import type { GmailLabel, EmailMailbox } from "@/lib/sales-types";
import { GMAIL_COLORS } from "./email-utils";

export default function LabelsSidebar({ labels, mailbox, selectedLabelId, userEmail, onSelectLabel }: {
  labels: GmailLabel[];
  mailbox: EmailMailbox;
  selectedLabelId: string | null;
  userEmail: string;
  onSelectLabel: (labelId: string) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColorIdx, setNewLabelColorIdx] = useState(0);
  const [newLabelParent, setNewLabelParent] = useState("");
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColorIdx, setEditColorIdx] = useState(0);
  const [editParent, setEditParent] = useState("");
  const createMutation = useCreateLabel();
  const deleteMutation = useDeleteLabel();
  const updateMutation = useUpdateLabel();

  async function handleCreate() {
    if (!newLabelName.trim()) return;
    const color = GMAIL_COLORS[newLabelColorIdx];
    const fullName = newLabelParent ? `${newLabelParent}/${newLabelName.trim()}` : newLabelName.trim();
    await createMutation.mutateAsync({
      senderEmail: userEmail,
      name: fullName,
      color: { text: color.text, background: color.bg },
    });
    setNewLabelName("");
    setNewLabelParent("");
    setShowCreate(false);
  }

  return (
    <>
      <div className="h-px bg-border my-2 mx-1" />
      <div className="flex items-center justify-between px-3 py-1">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Tunnisteet</p>
        <button type="button" onClick={() => setShowCreate(!showCreate)} className="text-text-muted hover:text-accent">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {showCreate && (
        <div className="px-2 py-1 space-y-2">
          <input
            className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-bg-secondary"
            placeholder="Tunnisteen nimi"
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <select
            className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-bg-secondary"
            value={newLabelParent}
            onChange={(e) => setNewLabelParent(e.target.value)}
          >
            <option value="">Ei ylätunnistetta</option>
            {labels.map((l: GmailLabel) => (
              <option key={l.id} value={l.name}>{l.name}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {GMAIL_COLORS.map((c, i) => (
              <button type="button"
                key={i}
                onClick={() => setNewLabelColorIdx(i)}
                className={`w-4 h-4 rounded-full ${i === newLabelColorIdx ? "ring-2 ring-accent ring-offset-1" : ""}`}
                style={{ backgroundColor: c.bg }}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => setShowCreate(false)} className="flex-1 text-[10px] py-1 rounded-lg border border-border text-text-muted">Peruuta</button>
            <button type="button" onClick={handleCreate} disabled={createMutation.isPending} className="flex-1 text-[10px] py-1 rounded-lg bg-accent text-white">
              {createMutation.isPending ? "..." : "Luo"}
            </button>
          </div>
        </div>
      )}

      {labels.map((label: GmailLabel) => {
        const displayName = label.name.includes("/") ? label.name.split("/").pop() : label.name;
        const depth = (label.name.match(/\//g) || []).length;
        return (
          <div key={label.id} className="group flex items-center relative">
            <button type="button"
              onClick={() => onSelectLabel(label.gmail_label_id)}
              className={`flex-1 flex items-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mailbox === "label" && selectedLabelId === label.gmail_label_id
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-bg-secondary"
              }`}
              style={{ paddingLeft: `${12 + depth * 12}px` }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: label.background_color || "#9ca3af" }}
              />
              {displayName}
            </button>
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setEditingLabel(editingLabel === label.gmail_label_id ? null : label.gmail_label_id); }}
              className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-primary mr-1"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            {editingLabel === label.gmail_label_id && (
              <div className="absolute right-0 mt-1 bg-white border border-border rounded-xl shadow-lg p-3 w-48 sm:w-52 z-20 space-y-2" style={{ top: "100%" }}>
                <input
                  className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-bg-secondary"
                  placeholder="Uusi nimi"
                  defaultValue={label.name.includes("/") ? label.name.split("/").pop() : label.name}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <select
                  className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-bg-secondary"
                  defaultValue={label.name.includes("/") ? label.name.split("/").slice(0, -1).join("/") : ""}
                  onChange={(e) => setEditParent(e.target.value)}
                >
                  <option value="">Ei ylätunnistetta</option>
                  {labels.filter((l: GmailLabel) => l.gmail_label_id !== label.gmail_label_id).map((l: GmailLabel) => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1">
                  {GMAIL_COLORS.map((c, i) => (
                    <button type="button"
                      key={i}
                      onClick={() => setEditColorIdx(i)}
                      className={`w-3.5 h-3.5 rounded-full ${i === editColorIdx ? "ring-2 ring-accent ring-offset-1" : ""}`}
                      style={{ backgroundColor: c.bg }}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  <button type="button"
                    onClick={async () => {
                      const baseName = editName || (label.name.includes("/") ? label.name.split("/").pop()! : label.name);
                      const fullName = editParent ? `${editParent}/${baseName}` : baseName;
                      const color = GMAIL_COLORS[editColorIdx];
                      await updateMutation.mutateAsync({
                        senderEmail: userEmail,
                        labelId: label.gmail_label_id,
                        name: fullName,
                        color: { text: color.text, background: color.bg },
                      });
                      setEditingLabel(null);
                    }}
                    className="flex-1 text-[10px] py-1 rounded-lg bg-accent text-white"
                  >
                    Tallenna
                  </button>
                  <button type="button"
                    onClick={async () => {
                      await deleteMutation.mutateAsync({ senderEmail: userEmail, labelId: label.gmail_label_id });
                      setEditingLabel(null);
                    }}
                    className="text-[10px] py-1 px-2 rounded-lg text-red-500 hover:bg-red-50 border border-red-200"
                  >
                    Poista
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
