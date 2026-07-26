import { useState } from "react";
import { Inbox, Search, LayoutGrid, List, Plus } from "lucide-react";
import { useUserRole } from "@/context/UserRoleContext";
import { useSalesOpportunities, useUpdateOpportunity, useCreateOpportunity, useCreateOpportunityNote } from "@/hooks/sales/useSalesOpportunities";
import { useOpportunityStages } from "@/hooks/sales/useSalesStages";
import { KanbanBoard } from "@/components/sales/KanbanBoard";
import { NewDealPanel } from "@/components/sales/NewDealPanel";
import type { NewDealData } from "@/components/sales/NewDealPanel";
import { StageBadge } from "@/components/sales/SalesStatusBadge";
import { inputCls } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase";

type ViewMode = "kanban" | "list";

export default function SellerInbound() {
  const { employee } = useUserRole();
  const navigate = useNavigate();
  const toast = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Only show opportunities assigned to this seller
  const { data: opportunities = [], isLoading } = useSalesOpportunities({
    salespersonId: employee?.id,
    isArchived: false,
    search: search || undefined,
  });
  const { data: stages = [] } = useOpportunityStages();
  const updateOpp = useUpdateOpportunity();
  const createOpp = useCreateOpportunity();
  const createNote = useCreateOpportunityNote();

  function handleMoveOpportunity(id: string, newStatus: string) {
    updateOpp.mutate({ id, status: newStatus });
  }

  async function handleCreateDeal(data: NewDealData) {
    setCreating(true);
    try {
      // 1. Create opportunity
      const opp = await createOpp.mutateAsync({
        name: data.name || undefined,
        phone: data.phone || undefined,
        email: data.email || undefined,
        address: data.address || undefined,
        postcode: data.postcode || undefined,
        city: data.city || undefined,
        channel: data.channel || undefined,
        status: data.status || undefined,
        assigned_salesperson_id: employee?.id,
      });

      // 2. Create initial note if provided
      if (data.notes.trim()) {
        await createNote.mutateAsync({ opportunity_id: opp.id, body: data.notes.trim() });
      }

      // 3. Upload photos if any
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
      toast("Virhe diilin luonnissa", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-accent flex-shrink-0" />
          <h1 className="text-lg font-bold">Inbound-liidit</h1>
          <span className="text-xs text-text-muted">({opportunities.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" /> Uusi diili
          </button>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-2 ${viewMode === "kanban" ? "bg-accent text-white" : "text-text-muted hover:bg-muted/30"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 ${viewMode === "list" ? "bg-accent text-white" : "text-text-muted hover:bg-muted/30"}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hae..."
            className={`${inputCls} !pl-8 !py-2`}
          />
        </div>
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
          onCardClick={(opp) => navigate(`/myyja/inbound/${opp.id}`)}
        />
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Nimi</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Puhelin</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Vaihe</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Kanava</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Luotu</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opp) => {
                  const stage = stages.find((s) => s.key === opp.status);
                  return (
                    <tr
                      key={opp.id}
                      onClick={() => navigate(`/myyja/inbound/${opp.id}`)}
                      className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">{opp.name || "–"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{opp.phone || "–"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {stage ? <StageBadge label={stage.label} color={stage.color} /> : opp.status}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">{opp.channel || "–"}</td>
                      <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">{formatDateTime(opp.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
