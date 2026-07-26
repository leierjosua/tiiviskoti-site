import { X, Phone, Mail, MapPin, ExternalLink, User, Tag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { SalesOpportunity, SalesOpportunityStage } from "@/lib/sales-types";
import { NoteTimeline } from "./NoteTimeline";
import { StageBadge } from "./SalesStatusBadge";
import { formatDateTime, formatAddress } from "@/lib/utils";
import { useOpportunityNotes, useCreateOpportunityNote, useUpdateOpportunityNote, useDeleteOpportunityNote } from "@/hooks/sales/useSalesOpportunities";

interface DealDrawerProps {
  opportunity: SalesOpportunity | null;
  stages: SalesOpportunityStage[];
  onClose: () => void;
  onStageChange: (id: string, newStatus: string) => void;
}

export function DealDrawer({ opportunity: opp, stages, onClose, onStageChange }: DealDrawerProps) {
  const navigate = useNavigate();
  const { data: notes = [] } = useOpportunityNotes(opp?.id);
  const createNote = useCreateOpportunityNote();
  const updateNote = useUpdateOpportunityNote();
  const deleteNote = useDeleteOpportunityNote();

  if (!opp) return null;


  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:bottom-0 z-50 w-full md:max-w-md bg-surface shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-4 h-4 text-text-muted flex-shrink-0" />
            <h2 className="text-sm font-semibold truncate">{opp.name || "Nimetön"}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { onClose(); navigate(`/myynti/inbound/${opp.id}`); }}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="Avaa kokonäkymä"
            >
              <ExternalLink className="w-4 h-4 text-text-muted" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Stage */}
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Vaihe</p>
            <div className="flex flex-wrap gap-1">
              {stages.filter((s) => s.is_active).map((stage) => (
                <button
                  key={stage.key}
                  onClick={() => onStageChange(opp.id, stage.key)}
                  className={`transition-all ${opp.status === stage.key ? "ring-2 ring-offset-1 ring-accent/40 rounded-full" : "opacity-60 hover:opacity-100"}`}
                >
                  <StageBadge label={stage.label} color={stage.color} />
                </button>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Yhteystiedot</p>
            {opp.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-text-muted" />
                <a href={`tel:${opp.phone}`} className="text-xs text-accent hover:underline">{opp.phone}</a>
              </div>
            )}
            {opp.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-text-muted" />
                <a href={`mailto:${opp.email}`} className="text-xs text-accent hover:underline">{opp.email}</a>
              </div>
            )}
            {(opp.address || opp.city) && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-xs">{formatAddress(opp.address, opp.postcode, opp.city)}</span>
              </div>
            )}
          </div>

          {/* Tags */}
          {opp.tags_cache?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Tagit</p>
              <div className="flex flex-wrap gap-1">
                {opp.tags_cache.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    <Tag className="w-2.5 h-2.5" /> {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-text-muted">Kanava</span>
              <p className="font-medium">{opp.channel || "–"}</p>
            </div>
            <div>
              <span className="text-text-muted">Luotu</span>
              <p className="font-medium">{formatDateTime(opp.created_at)}</p>
            </div>
            {opp.last_contact_at && (
              <div>
                <span className="text-text-muted">Viim. kontakti</span>
                <p className="font-medium">{formatDateTime(opp.last_contact_at)}</p>
              </div>
            )}
            {opp.next_followup_at && (
              <div>
                <span className="text-text-muted">Seur. seuranta</span>
                <p className="font-medium">{formatDateTime(opp.next_followup_at)}</p>
              </div>
            )}
          </div>

          {/* Offers link */}
          {(opp.sales_offers?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Tarjoukset</p>
              {opp.sales_offers?.map((offer) => (
                <button
                  key={offer.id}
                  onClick={() => { onClose(); navigate(`/myynti/tarjoukset/${opp.id}`); }}
                  className="w-full text-left px-3 py-2 rounded-xl border border-border hover:bg-muted/30 text-xs transition-colors"
                >
                  <span className="font-medium">{offer.title || `Tarjous #${offer.offer_number || "–"}`}</span>
                  <span className="text-text-muted ml-2">{offer.total ? `${Number(offer.total).toFixed(0)} €` : ""}</span>
                </button>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Muistiinpanot</p>
            <NoteTimeline
              notes={notes}
              onAddNote={(body) => createNote.mutate({ opportunity_id: opp.id, body })}
              onUpdateNote={(id, body) => updateNote.mutate({ id, body, oppId: opp.id })}
              onDeleteNote={(id) => deleteNote.mutate({ id, oppId: opp.id })}
              isPending={createNote.isPending}
            />
          </div>
        </div>
      </div>
    </>
  );
}
