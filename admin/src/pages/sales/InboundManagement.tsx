import { useState, useMemo } from "react";
import { Inbox, Plus, Search, LayoutGrid, List, Check } from "lucide-react";
import { useSalesOpportunities, useUpdateOpportunity, useCreateOpportunity, useCreateOpportunityNote } from "@/hooks/sales/useSalesOpportunities";
import { useOpportunityStages } from "@/hooks/sales/useSalesStages";
import { useBulkUpdateOpportunities } from "@/hooks/sales/useBulkLeadOperations";
import { useEmployees } from "@/hooks/useEmployees";
import { KanbanBoard } from "@/components/sales/KanbanBoard";
import { NewDealPanel } from "@/components/sales/NewDealPanel";
import type { NewDealData } from "@/components/sales/NewDealPanel";
import { StageBadge } from "@/components/sales/SalesStatusBadge";
import { SellerFilter } from "@/components/sales/SellerFilter";
import { BulkActionBar } from "@/components/sales/BulkActionBar";
import { ReassignModal } from "@/components/sales/ReassignModal";
import { inputCls, selectCls } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
// SalesOpportunity type used via hook return

type ViewMode = "kanban" | "list";

export default function InboundManagement() {
  const navigate = useNavigate();
  const toast = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");

  const { data: allOpportunities = [], isLoading } = useSalesOpportunities({
    isArchived: false,
    search: search || undefined,
    salespersonId: sellerFilter || undefined,
  });
  const { data: stages = [] } = useOpportunityStages();
  const { data: sellers = [] } = useEmployees("seller");
  const updateOpp = useUpdateOpportunity();
  const createOpp = useCreateOpportunity();
  const createNote = useCreateOpportunityNote();
  const bulkUpdate = useBulkUpdateOpportunities();

  const opportunities = allOpportunities;

  const sellerMap = useMemo(() => {
    const map = new Map<string, string>();
    sellers.forEach((s) => map.set(s.id, `${s.first_name} ${s.last_name}`));
    return map;
  }, [sellers]);

  function handleMoveOpportunity(id: string, newStatus: string) {
    updateOpp.mutate({ id, status: newStatus });
  }

  async function handleCreateDeal(data: NewDealData) {
    setCreating(true);
    try {
      const opp = await createOpp.mutateAsync({
        name: data.name || undefined,
        phone: data.phone || undefined,
        email: data.email || undefined,
        address: data.address || undefined,
        postcode: data.postcode || undefined,
        city: data.city || undefined,
        channel: data.channel || undefined,
        status: data.status || undefined,
        assigned_salesperson_id: data.assigned_salesperson_id || undefined,
      });

      if (data.notes.trim()) {
        await createNote.mutateAsync({ opportunity_id: opp.id, body: data.notes.trim() });
      }

      if (data.photos.length > 0) {
        for (const file of data.photos) {
          const ext = file.name.split(".").pop() || "jpg";
          const path = `${opp.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from("sales-opportunity-files")
            .upload(path, file);
          if (!uploadErr) {
            await supabase.from("sales_opportunity_files").insert({
              opportunity_id: opp.id,
              filename: file.name,
              bucket: "sales-opportunity-files",
              path,
              file_type: "manual",
              photo_category: "site_photo",
            });
          }
        }
      }

      setShowAddModal(false);
      toast("Diili luotu");
    } catch {
      toast("Virhe", "error");
    } finally {
      setCreating(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === opportunities.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(opportunities.map((o) => o.id)));
    }
  }

  async function handleReassign(salespersonId: string) {
    try {
      await bulkUpdate.mutateAsync({
        ids: Array.from(selected),
        updates: { assigned_salesperson_id: salespersonId },
      });
      toast(`${selected.size} diiliä siirretty`);
      setSelected(new Set());
      setReassignOpen(false);
    } catch {
      toast("Virhe siirrossa", "error");
    }
  }

  async function handleBulkStatus() {
    if (!bulkStatus) return;
    try {
      await bulkUpdate.mutateAsync({
        ids: Array.from(selected),
        updates: { status: bulkStatus },
      });
      toast(`${selected.size} diilin vaihe muutettu`);
      setSelected(new Set());
      setStatusModalOpen(false);
      setBulkStatus("");
    } catch {
      toast("Virhe vaiheen muutoksessa", "error");
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Inbound-hallinta</h1>
          <span className="text-xs text-text-muted">({opportunities.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90"
          >
            <Plus className="w-3.5 h-3.5" /> Uusi diili
          </button>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-2 sm:p-1.5 ${viewMode === "kanban" ? "bg-accent text-white" : "text-text-muted hover:bg-muted/30"}`}
            >
              <LayoutGrid className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 sm:p-1.5 ${viewMode === "list" ? "bg-accent text-white" : "text-text-muted hover:bg-muted/30"}`}
            >
              <List className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hae nimellä, puhelinnumerolla..."
            className={`${inputCls} !pl-9 !py-2.5 text-sm`}
          />
        </div>
        <SellerFilter value={sellerFilter} onChange={setSellerFilter} className="!w-48 shrink-0" />
      </div>

      <NewDealPanel
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreateDeal}
        stages={stages}
        isPending={creating}
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-60">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard
          stages={stages}
          opportunities={opportunities}
          onMoveOpportunity={handleMoveOpportunity}
          onCardClick={(opp) => navigate(`/myynti/inbound/${opp.id}`)}
        />
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-3 py-2.5 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === opportunities.length && opportunities.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Nimi</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Puhelin</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Kaupunki</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Vaihe</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Myyjä</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Kanava</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Luotu</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opp) => {
                  const stage = stages.find((s) => s.key === opp.status);
                  return (
                    <tr
                      key={opp.id}
                      className={`border-b border-border hover:bg-muted/20 cursor-pointer transition-colors ${
                        selected.has(opp.id) ? "bg-accent/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(opp.id)}
                          onChange={() => toggleSelect(opp.id)}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium" onClick={() => navigate(`/myynti/inbound/${opp.id}`)}>
                        {opp.name || "–"}
                      </td>
                      <td className="px-4 py-2.5" onClick={() => navigate(`/myynti/inbound/${opp.id}`)}>
                        {opp.phone || "–"}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted" onClick={() => navigate(`/myynti/inbound/${opp.id}`)}>
                        {opp.city || "–"}
                      </td>
                      <td className="px-4 py-2.5" onClick={() => navigate(`/myynti/inbound/${opp.id}`)}>
                        {stage ? <StageBadge label={stage.label} color={stage.color} /> : opp.status}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted" onClick={() => navigate(`/myynti/inbound/${opp.id}`)}>
                        {opp.assigned_salesperson_id
                          ? sellerMap.get(opp.assigned_salesperson_id) || "–"
                          : <span className="text-amber-500">Ei myyjää</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-text-muted" onClick={() => navigate(`/myynti/inbound/${opp.id}`)}>
                        {opp.channel || "–"}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted" onClick={() => navigate(`/myynti/inbound/${opp.id}`)}>
                        {formatDateTime(opp.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onReassign={() => setReassignOpen(true)}
        onChangeStatus={() => setStatusModalOpen(true)}
      />

      {/* Reassign modal */}
      <ReassignModal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        onConfirm={handleReassign}
        count={selected.size}
        isPending={bulkUpdate.isPending}
      />

      {/* Status modal */}
      {statusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm mx-4 sm:mx-auto p-5 space-y-3">
            <h2 className="text-sm font-semibold">Vaihda vaihe ({selected.size} diiliä)</h2>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className={selectCls}>
              <option value="">Valitse vaihe...</option>
              {stages.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setStatusModalOpen(false); setBulkStatus(""); }} className="px-3 py-1.5 text-xs font-medium text-text-muted">
                Peruuta
              </button>
              <button
                onClick={handleBulkStatus}
                disabled={!bulkStatus || bulkUpdate.isPending}
                className="flex items-center gap-1 px-4 py-1.5 bg-accent text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" /> Muuta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
