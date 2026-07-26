import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneOutgoing, Search, Phone, List } from "lucide-react";
import { useUserRole } from "@/context/UserRoleContext";
import { useSalesLeads, useUpdateSalesLead, useCreateLeadNote } from "@/hooks/sales/useSalesLeads";
import { useSalesCallScripts } from "@/hooks/sales/useSalesCallScripts";
import { LeadStatusBadge } from "@/components/sales/SalesStatusBadge";
import { CallInterface } from "@/components/sales/CallInterface";
import { inputCls, selectCls } from "@/lib/constants";
import { LEAD_STATUS_LABELS } from "@/lib/sales-types";
import type { LeadStatus } from "@/lib/sales-types";
import { formatDateTime } from "@/lib/utils";

export default function SellerOutboundLeads() {
  const { employee } = useUserRole();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [callMode, setCallMode] = useState(false);
  const [callIndex, setCallIndex] = useState(0);

  // Only show leads assigned to this seller
  const { data: leads = [], isLoading } = useSalesLeads({
    salespersonId: employee?.id,
    status: statusFilter as LeadStatus || undefined,
    search: search || undefined,
  });
  const { data: scripts = [] } = useSalesCallScripts();
  const updateLead = useUpdateSalesLead();
  const createNote = useCreateLeadNote();

  const currentLead = callMode && leads[callIndex] ? leads[callIndex] : null;

  function handleStatusChange(status: LeadStatus) {
    if (!currentLead) return;
    updateLead.mutate({ id: currentLead.id, status, last_contact_at: new Date().toISOString() });
  }

  function handleNextLead() {
    if (callIndex < leads.length - 1) {
      setCallIndex(callIndex + 1);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <PhoneOutgoing className="w-5 h-5 text-accent flex-shrink-0" />
          <h1 className="text-lg font-bold">Kylmäsoitot</h1>
          <span className="text-xs text-text-muted">({leads.length})</span>
        </div>
        <button
          onClick={() => { setCallMode(!callMode); setCallIndex(0); }}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
            callMode
              ? "bg-red-50 text-red-600 border border-red-200"
              : "bg-accent text-white"
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          {callMode ? "Lopeta soittaminen" : "Aloita soittaminen"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hae nimellä, puhelinnumerolla..."
            className={`${inputCls} !pl-8 !py-2`}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectCls} w-full sm:w-40`}>
          <option value="">Kaikki statukset</option>
          {Object.entries(LEAD_STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {callMode && currentLead ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CallInterface
            lead={currentLead}
            scripts={scripts}
            onStatusChange={handleStatusChange}
            onAddNote={(body) => createNote.mutate({ lead_id: currentLead.id, body })}
            onNext={handleNextLead}
          />
          <div className="bg-surface border border-border rounded-2xl p-4">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
              Soittolista ({callIndex + 1} / {leads.length})
            </p>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {leads.map((lead, i) => (
                <button
                  key={lead.id}
                  onClick={() => setCallIndex(i)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    i === callIndex ? "bg-accent/10 text-accent" : "hover:bg-muted/30"
                  }`}
                >
                  <span className="font-medium truncate flex-1">{lead.name || "–"}</span>
                  <LeadStatusBadge status={lead.status} />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <List className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-muted">Ei liidejä</p>
              <p className="text-xs text-text-muted mt-1">Sinulle ei ole vielä jaettu liidejä</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Nimi</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Puhelin</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Kaupunki</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Status</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Tagit</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Luotu</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => navigate(`/myyja/kylmasoitot/${lead.id}`)}
                      className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">{lead.name || "–"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                            {lead.phone}
                          </a>
                        ) : "–"}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">{lead.city || "–"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><LeadStatusBadge status={lead.status} /></td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-0.5">
                          {lead.tags_cache?.slice(0, 2).map((t) => (
                            <span key={t} className="px-1 py-0.5 rounded text-[9px] bg-blue-50 text-blue-600">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">{formatDateTime(lead.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
