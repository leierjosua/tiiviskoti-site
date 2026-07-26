import { useState } from "react";
import { Phone, PhoneOff, Clock, ThumbsUp, ThumbsDown, Ban, CalendarPlus, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import type { SalesLead, SalesCallScript, LeadStatus } from "@/lib/sales-types";
import { LeadStatusBadge } from "./SalesStatusBadge";

interface CallInterfaceProps {
  lead: SalesLead;
  scripts: SalesCallScript[];
  onStatusChange: (status: LeadStatus) => void;
  onAddNote: (body: string) => void;
  onNext?: () => void;
}

const CALL_RESULTS: { status: LeadStatus; label: string; icon: React.ElementType; color: string }[] = [
  { status: "answered", label: "Vastasi", icon: ThumbsUp, color: "text-green-600 hover:bg-green-50" },
  { status: "no_answer", label: "Ei vastausta", icon: PhoneOff, color: "text-amber-600 hover:bg-amber-50" },
  { status: "not_interested", label: "Ei kiinnostunut", icon: ThumbsDown, color: "text-gray-600 hover:bg-gray-50" },
  { status: "qualified", label: "Kvalifioitu", icon: CalendarPlus, color: "text-blue-600 hover:bg-blue-50" },
  { status: "booked", label: "Ajanvaraus", icon: CalendarPlus, color: "text-cyan-600 hover:bg-cyan-50" },
  { status: "do_not_call", label: "Älä soita", icon: Ban, color: "text-red-600 hover:bg-red-50" },
];

export function CallInterface({ lead, scripts, onStatusChange, onAddNote, onNext }: CallInterfaceProps) {
  const [note, setNote] = useState("");
  const [scriptOpen, setScriptOpen] = useState(false);
  const [activeScript, setActiveScript] = useState<SalesCallScript | null>(scripts[0] || null);

  function handleResultClick(status: LeadStatus) {
    if (note.trim()) {
      onAddNote(note.trim());
      setNote("");
    }
    onStatusChange(status);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      {/* Lead Info Header */}
      <div className="px-4 py-3 bg-muted/30 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{lead.name || "Nimetön"}</h3>
            <div className="flex items-center gap-3 mt-0.5">
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="text-xs text-accent hover:underline flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {lead.phone}
                </a>
              )}
              {lead.city && <span className="text-xs text-text-muted">{lead.city}</span>}
            </div>
          </div>
          <LeadStatusBadge status={lead.status} />
        </div>
        {(lead.tags_cache?.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lead.tags_cache.map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Call Script */}
      {scripts.length > 0 && (
        <div className="border-b border-border">
          <button
            onClick={() => setScriptOpen(!scriptOpen)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-text-muted hover:bg-muted/20 transition-colors"
          >
            <span>Soittoskripti: {activeScript?.name || "–"}</span>
            {scriptOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {scriptOpen && (
            <div className="px-4 pb-3 space-y-2">
              {scripts.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  {scripts.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveScript(s)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        activeScript?.id === s.id
                          ? "bg-accent text-white"
                          : "bg-muted text-text-muted hover:text-text"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {activeScript && (
                <div className="text-xs leading-relaxed bg-muted/30 rounded-xl p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {activeScript.content}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Note Input */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-text-muted mt-2" />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Muistiinpano soitosta..."
            rows={2}
            className="flex-1 px-3 py-2 border border-border rounded-xl text-xs bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
          />
        </div>
      </div>

      {/* Result Buttons */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Soiton tulos</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {CALL_RESULTS.map(({ status, label, icon: Icon, color }) => (
            <button
              key={status}
              onClick={() => handleResultClick(status)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium border border-border transition-colors ${color}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        {onNext && (
          <button
            onClick={onNext}
            className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" /> Seuraava liidi
          </button>
        )}
      </div>
    </div>
  );
}
