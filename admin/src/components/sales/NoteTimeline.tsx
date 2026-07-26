import { useState } from "react";
import { MessageSquare, Send, Pencil, Trash2, Check, X } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface NoteItem {
  id: string;
  body: string;
  created_at: string;
  created_by_user_id?: string | null;
}

interface EventItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface NoteTimelineProps {
  notes: NoteItem[];
  events?: EventItem[];
  onAddNote: (body: string) => void;
  onUpdateNote?: (id: string, body: string) => void;
  onDeleteNote?: (id: string) => void;
  isPending?: boolean;
}

export function NoteTimeline({ notes, events = [], onAddNote, onUpdateNote, onDeleteNote, isPending }: NoteTimelineProps) {
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const combined = [
    ...notes.map((n) => ({ ...n, kind: "note" as const })),
    ...events.map((e) => ({ ...e, body: formatEvent(e), kind: "event" as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    onAddNote(body.trim());
    setBody("");
  }

  function startEdit(note: NoteItem) {
    setEditingId(note.id);
    setEditBody(note.body);
  }

  function saveEdit() {
    if (!editingId || !editBody.trim() || !onUpdateNote) return;
    onUpdateNote(editingId, editBody.trim());
    setEditingId(null);
    setEditBody("");
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Lisää muistiinpano..."
          className="flex-1 px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={!body.trim() || isPending}
          className="px-3 py-2 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      <div className="space-y-2">
        {combined.map((item) => (
          <div
            key={item.id}
            className={`flex gap-2.5 group ${item.kind === "event" ? "opacity-60" : ""}`}
          >
            <div className="mt-0.5">
              <MessageSquare className={`w-3.5 h-3.5 ${item.kind === "event" ? "text-text-muted" : "text-accent"}`} />
            </div>
            <div className="flex-1 min-w-0">
              {editingId === item.id ? (
                <div className="flex gap-1.5">
                  <input
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                    className="flex-1 px-2 py-1 border border-accent/40 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                    autoFocus
                  />
                  <button onClick={saveEdit} className="p-1 text-accent hover:text-accent-dark"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-text-muted hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <>
                  <p className="text-sm">{item.body}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {formatDateTime(item.created_at)}
                  </p>
                </>
              )}
            </div>
            {item.kind === "note" && editingId !== item.id && (onUpdateNote || onDeleteNote) && (
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {onUpdateNote && (
                  <button onClick={() => startEdit(item as NoteItem)} className="p-1 text-text-muted hover:text-accent transition-colors" title="Muokkaa">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
                {onDeleteNote && (
                  <button onClick={() => onDeleteNote(item.id)} className="p-1 text-text-muted hover:text-red-500 transition-colors" title="Poista">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {combined.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4">Ei muistiinpanoja</p>
        )}
      </div>
    </div>
  );
}

function formatEvent(e: EventItem): string {
  const p = e.payload;
  switch (e.type) {
    case "status_change":
      return `Status: ${p.from || "–"} → ${p.to || "–"}`;
    case "call":
      return `Soitto (${p.result || "–"})`;
    case "assignment":
      return `Siirretty myyjälle`;
    default:
      return e.type;
  }
}
