import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { PhoneOutgoing, Search, Upload, List, Phone } from "lucide-react";
import { useSalesLeads, useUpdateSalesLead } from "@/hooks/sales/useSalesLeads";
import { useSalesCallLists } from "@/hooks/sales/useSalesCallLists";
import { useSalesCallScripts } from "@/hooks/sales/useSalesCallScripts";
import { useLeadStages } from "@/hooks/sales/useSalesStages";
import { LeadStatusBadge } from "@/components/sales/SalesStatusBadge";
import { CallInterface } from "@/components/sales/CallInterface";
import { inputCls, selectCls } from "@/lib/constants";
import { LEAD_STATUS_LABELS } from "@/lib/sales-types";
import type { LeadStatus } from "@/lib/sales-types";
import { formatDateTime } from "@/lib/utils";
import { useCreateLeadNote } from "@/hooks/sales/useSalesLeads";

export default function OutboundLeads() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [listFilter, setListFilter] = useState<string>("");
  const [callMode, setCallMode] = useState(false);
  const [callIndex, setCallIndex] = useState(0);

  const { data: leads = [], isLoading } = useSalesLeads({
    status: statusFilter as LeadStatus || undefined,
    callListId: listFilter || undefined,
    search: search || undefined,
  });
  const { data: callLists = [] } = useSalesCallLists();
  const { data: scripts = [] } = useSalesCallScripts();
  const { data: _stages = [] } = useLeadStages();
  const updateLead = useUpdateSalesLead();
  const createNote = useCreateLeadNote();

  const filteredLeads = useMemo(() => leads, [leads]);
  const currentLead = callMode && filteredLeads[callIndex] ? filteredLeads[callIndex] : null;

  function handleStatusChange(status: LeadStatus) {
    if (!currentLead) return;
    updateLead.mutate({ id: currentLead.id, status });
  }

  function handleNextLead() {
    if (callIndex < filteredLeads.length - 1) {
      setCallIndex(callIndex + 1);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <PhoneOutgoing className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Kylmäsoitot</h1>
          <span className="text-xs text-text-muted">({filteredLeads.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCallMode(!callMode); setCallIndex(0); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
              callMode
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-accent text-white"
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            {callMode ? "Lopeta soittaminen" : "Aloita soittaminen"}
          </button>
          <Link
            to="/myynti/liidit/listat"
            className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-xl text-xs font-medium hover:bg-muted/30 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> CSV-tuonti
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hae nimellä, puhelinnumerolla..."
            className={`${inputCls} !pl-9 !py-2.5 text-sm`}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectCls} min-w-0 w-full sm:w-40`}>
          <option value="">Kaikki statukset</option>
          {Object.entries(LEAD_STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select value={listFilter} onChange={(e) => setListFilter(e.target.value)} className={`${selectCls} min-w-0 w-full sm:w-44`}>
          <option value="">Kaikki listat</option>
          {callLists.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
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
              Soittolista ({callIndex + 1} / {filteredLeads.length})
            </p>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {filteredLeads.map((lead, i) => (
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
        /* Table View */
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <List className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-muted">Ei liidejä</p>
              <p className="text-xs text-text-muted mt-1">Tuo liidejä CSV-tuonnilla</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Nimi</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Puhelin</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Kaupunki</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Status</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Lista</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Tagit</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Luotu</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => navigate(`/myynti/liidit/${lead.id}`)}
                      className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium">{lead.name || "–"}</td>
                      <td className="px-4 py-2.5">
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                            {lead.phone}
                          </a>
                        ) : "–"}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">{lead.city || "–"}</td>
                      <td className="px-4 py-2.5"><LeadStatusBadge status={lead.status} /></td>
                      <td className="px-4 py-2.5 text-text-muted">{lead.sales_call_lists?.name || "–"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-0.5">
                          {lead.tags_cache?.slice(0, 2).map((t) => (
                            <span key={t} className="px-1 py-0.5 rounded text-[9px] bg-blue-50 text-blue-600">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">{formatDateTime(lead.created_at)}</td>
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
