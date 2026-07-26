import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, MapPin, Pencil, Save, X } from "lucide-react";
import { useState } from "react";
import { useSalesLead, useUpdateSalesLead, useLeadNotes, useCreateLeadNote, useUpdateLeadNote, useDeleteLeadNote, useLeadEvents } from "@/hooks/sales/useSalesLeads";
import { useSalesTags } from "@/hooks/sales/useSalesTags";
import { LeadStatusBadge } from "@/components/sales/SalesStatusBadge";
import { NoteTimeline } from "@/components/sales/NoteTimeline";
import { inputCls, selectCls } from "@/lib/constants";
import { LEAD_STATUS_LABELS } from "@/lib/sales-types";
import type { LeadStatus } from "@/lib/sales-types";
import { formatDateTime, formatAddress } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";

export default function OutboundLeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: lead, isLoading } = useSalesLead(id);
  const { data: notes = [] } = useLeadNotes(id);
  const { data: events = [] } = useLeadEvents(id);
  const { data: _tags = [] } = useSalesTags();
  const updateLead = useUpdateSalesLead();
  const createNote = useCreateLeadNote();
  const updateNote = useUpdateLeadNote();
  const deleteNote = useDeleteLeadNote();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  if (isLoading || !lead) {
    return (
      <div>
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  function startEdit() {
    setForm({
      name: lead!.name || "",
      phone: lead!.phone || "",
      email: lead!.email || "",
      address: lead!.address || "",
      postcode: lead!.postcode || "",
      city: lead!.city || "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    try {
      await updateLead.mutateAsync({ id: lead!.id, ...form });
      setEditing(false);
      toast("Liidi päivitetty");
    } catch {
      toast("Virhe päivityksessä", "error");
    }
  }

  async function handleStatusChange(status: LeadStatus) {
    await updateLead.mutateAsync({ id: lead!.id, status });
    toast("Status päivitetty");
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <button onClick={() => navigate("/myynti/liidit")} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary truncate">{lead.name || "Nimetön liidi"}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <LeadStatusBadge status={lead.status} />
            {lead.sales_call_lists && (
              <span className="text-[11px] text-text-muted">{lead.sales_call_lists.name}</span>
            )}
          </div>
        </div>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <button onClick={saveEdit} className="flex items-center gap-1 px-3 py-2 bg-accent text-white rounded-xl text-xs font-medium">
              <Save className="w-3.5 h-3.5" /> Tallenna
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 text-xs font-medium text-text-muted hover:text-text">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button onClick={startEdit} className="flex items-center gap-1 px-3 py-2 border border-border rounded-xl text-xs font-medium hover:bg-muted/30">
            <Pencil className="w-3.5 h-3.5" /> Muokkaa
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Contact Info */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Yhteystiedot</h3>
            {editing ? (
              <div className="space-y-2">
                {(["name", "phone", "email", "address", "postcode", "city"] as const).map((field) => (
                  <div key={field}>
                    <label className="text-[10px] font-semibold text-text-muted uppercase">{
                      { name: "Nimi", phone: "Puhelin", email: "Sähköposti", address: "Osoite", postcode: "Postinumero", city: "Kaupunki" }[field]
                    }</label>
                    <input
                      value={form[field] || ""}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                      className={`${inputCls} !py-1.5 !text-xs`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-text-muted" />
                    <a href={`tel:${lead.phone}`} className="text-xs text-accent hover:underline">{lead.phone}</a>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-text-muted" />
                    <a href={`mailto:${lead.email}`} className="text-xs text-accent hover:underline">{lead.email}</a>
                  </div>
                )}
                {(lead.address || lead.city) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-xs">{formatAddress(lead.address, lead.postcode, lead.city)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status Change */}
          <div className="bg-surface border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Vaihda status</h3>
            <select
              value={lead.status}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              className={selectCls}
            >
              {Object.entries(LEAD_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Meta */}
          <div className="bg-surface border border-border rounded-2xl p-4 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="text-text-muted">Luotu</span><span>{formatDateTime(lead.created_at)}</span></div>
            {lead.last_contact_at && <div className="flex justify-between"><span className="text-text-muted">Viim. kontakti</span><span>{formatDateTime(lead.last_contact_at)}</span></div>}
            {lead.next_followup_at && <div className="flex justify-between"><span className="text-text-muted">Seur. seuranta</span><span>{formatDateTime(lead.next_followup_at)}</span></div>}
            <div className="flex justify-between"><span className="text-text-muted">Lähde</span><span>{lead.external_source}</span></div>
          </div>
        </div>

        {/* Right: Notes & Events */}
        <div className="lg:col-span-2">
          <div className="bg-surface border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Muistiinpanot & tapahtumat</h3>
            <NoteTimeline
              notes={notes}
              events={events}
              onAddNote={(body) => createNote.mutate({ lead_id: lead.id, body })}
              onUpdateNote={(id, body) => updateNote.mutate({ id, body, leadId: lead.id })}
              onDeleteNote={(id) => deleteNote.mutate({ id, leadId: lead.id })}
              isPending={createNote.isPending}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
