import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Search, Upload, List, Check, FileSpreadsheet, Trash2 } from "lucide-react";
import { useSalesLeads, useBulkInsertLeads } from "@/hooks/sales/useSalesLeads";
import { useSalesCallLists, useCreateCallList, useDeleteCallList } from "@/hooks/sales/useSalesCallLists";
import { useBulkUpdateLeads, useBulkTagLeads, useBulkDeleteLeads } from "@/hooks/sales/useBulkLeadOperations";
import { useSalesTags } from "@/hooks/sales/useSalesTags";
import { useEmployees } from "@/hooks/useEmployees";
import { LeadStatusBadge } from "@/components/sales/SalesStatusBadge";
import { SellerFilter } from "@/components/sales/SellerFilter";
import { BulkActionBar } from "@/components/sales/BulkActionBar";
import { ReassignModal } from "@/components/sales/ReassignModal";
import { CsvImportModal } from "@/components/sales/CsvImportModal";
import { inputCls, selectCls } from "@/lib/constants";
import { LEAD_STATUS_LABELS } from "@/lib/sales-types";
import type { LeadStatus } from "@/lib/sales-types";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";

type Tab = "leads" | "import";

export default function LeadManagement() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("leads");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [listFilter, setListFilter] = useState<string>("");
  const [sellerFilter, setSellerFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");

  // CSV import state
  const [importOpen, setImportOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { data: leads = [], isLoading } = useSalesLeads({
    status: (statusFilter as LeadStatus) || undefined,
    callListId: listFilter || undefined,
    salespersonId: sellerFilter || undefined,
    search: search || undefined,
    tags: tagFilter ? [tagFilter] : undefined,
  });
  const { data: callLists = [], isLoading: listsLoading } = useSalesCallLists();
  const { data: tags = [] } = useSalesTags();
  const { data: sellers = [] } = useEmployees("seller");
  const bulkUpdate = useBulkUpdateLeads();
  const bulkTagMut = useBulkTagLeads();
  const createList = useCreateCallList();
  const deleteList = useDeleteCallList();
  const bulkInsert = useBulkInsertLeads();
  const bulkDelete = useBulkDeleteLeads();

  const sellerMap = useMemo(() => {
    const map = new Map<string, string>();
    sellers.forEach((s) => map.set(s.id, `${s.first_name} ${s.last_name}`));
    return map;
  }, [sellers]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  }

  async function handleReassign(salespersonId: string) {
    try {
      await bulkUpdate.mutateAsync({
        ids: Array.from(selected),
        updates: { assigned_salesperson_id: salespersonId },
      });
      toast(`${selected.size} liidiä siirretty`);
      setSelected(new Set());
      setReassignOpen(false);
    } catch {
      toast("Virhe siirrossa", "error");
    }
  }

  async function handleBulkTag() {
    if (!bulkTag) return;
    try {
      await bulkTagMut.mutateAsync({
        leadIds: Array.from(selected),
        tagNames: [bulkTag],
      });
      toast(`Tagi "${bulkTag}" lisätty ${selected.size} liidiin`);
      setSelected(new Set());
      setTagModalOpen(false);
      setBulkTag("");
    } catch {
      toast("Virhe tagauksessa", "error");
    }
  }

  async function handleBulkStatus() {
    if (!bulkStatus) return;
    try {
      await bulkUpdate.mutateAsync({
        ids: Array.from(selected),
        updates: { status: bulkStatus as LeadStatus },
      });
      toast(`${selected.size} liidin status muutettu`);
      setSelected(new Set());
      setStatusModalOpen(false);
      setBulkStatus("");
    } catch {
      toast("Virhe statuksen muutoksessa", "error");
    }
  }

  async function handleBulkDelete() {
    const ok = await confirm({
      message: `Poistetaanko ${selected.size} liidiä pysyvästi? Tätä ei voi perua.`,
      variant: "danger",
    });
    if (!ok) return;
    try {
      await bulkDelete.mutateAsync(Array.from(selected));
      toast(`${selected.size} liidiä poistettu`);
      setSelected(new Set());
    } catch {
      toast("Virhe poistossa", "error");
    }
  }

  // ─── CSV Import handlers ───

  async function handleImport(rows: Record<string, string>[], listName: string, importTag: string) {
    try {
      const list = await createList.mutateAsync({
        name: listName,
        category: importTag || "muu",
        description: null,
        lead_count: rows.length,
      });

      const inserted = await bulkInsert.mutateAsync(
        rows.map((r) => ({
          name: r.name,
          phone: r.phone,
          email: r.email,
          company: r.company,
          address: r.address,
          postcode: r.postcode,
          city: r.city,
          call_list_id: list.id,
        }))
      );

      const leadIds = inserted?.map((l) => l.id) ?? [];

      // Apply import tag (separate type so sellers can filter by it)
      if (importTag && leadIds.length > 0) {
        try {
          await bulkTagMut.mutateAsync({
            leadIds,
            tagNames: [importTag],
            tagType: "import",
          });
        } catch {
          toast("Liidit tuotu, mutta tuontitagin lisäys epäonnistui", "error");
        }
      }

      // Apply any additional normal tags
      if (selectedTags.length > 0 && leadIds.length > 0) {
        try {
          await bulkTagMut.mutateAsync({
            leadIds,
            tagNames: selectedTags,
            tagType: "normal",
          });
        } catch {
          toast("Normaalien tagien lisäys epäonnistui", "error");
        }
      }

      const allTags = [...(importTag ? [importTag] : []), ...selectedTags];
      const tagInfo = allTags.length > 0 ? ` (tagit: ${allTags.join(", ")})` : "";
      toast(`${rows.length} liidiä tuotu listaan "${listName}"${tagInfo}`);
      setSelectedTags([]);
    } catch {
      toast("Tuonti epäonnistui", "error");
    }
  }

  async function handleDeleteList(id: string, name: string) {
    const ok = await confirm({ message: `Poista lista "${name}"? Liidejä ei poisteta.`, variant: "danger" });
    if (!ok) return;
    try {
      await deleteList.mutateAsync(id);
      toast("Lista poistettu");
    } catch {
      toast("Poisto epäonnistui", "error");
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Liidien hallinta</h1>
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90"
        >
          <Upload className="w-3.5 h-3.5" /> CSV-tuonti
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-4">
        <button
          onClick={() => setTab("leads")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px ${
            tab === "leads"
              ? "border-accent text-accent"
              : "border-transparent text-text-muted hover:text-text"
          }`}
        >
          Liidit ({leads.length})
        </button>
        <button
          onClick={() => setTab("import")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px ${
            tab === "import"
              ? "border-accent text-accent"
              : "border-transparent text-text-muted hover:text-text"
          }`}
        >
          Soittolistat ({callLists.length})
        </button>
      </div>

      {tab === "leads" ? (
        <>
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
            <SellerFilter value={sellerFilter} onChange={setSellerFilter} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectCls} min-w-0 w-full sm:w-40`}>
              <option value="">Kaikki statukset</option>
              {Object.entries(LEAD_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select value={listFilter} onChange={(e) => setListFilter(e.target.value)} className={`${selectCls} min-w-0 w-full sm:w-40`}>
              <option value="">Kaikki listat</option>
              {callLists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={`${selectCls} min-w-0 w-full sm:w-44`}>
              <option value="">Kaikki tuontitagit</option>
              {tags.filter((t) => t.tag_type === "import").map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <List className="w-8 h-8 text-text-muted mb-2" />
                <p className="text-sm text-text-muted">Ei liidejä</p>
                <p className="text-xs text-text-muted mt-1">Tuo liidejä CSV-tuonnilla tai vaihda suodattimia</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-3 py-2.5 text-left">
                        <input
                          type="checkbox"
                          checked={selected.size === leads.length && leads.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-border"
                        />
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Nimi</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Puhelin</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Kaupunki</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Status</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Myyjä</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Lista</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Tagit</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Luotu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={`border-b border-border hover:bg-muted/20 cursor-pointer transition-colors ${
                          selected.has(lead.id) ? "bg-accent/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="px-4 py-2.5 font-medium" onClick={() => navigate(`/myynti/liidit/${lead.id}`)}>
                          {lead.name || "–"}
                        </td>
                        <td className="px-4 py-2.5">
                          {lead.phone ? (
                            <a href={`tel:${lead.phone}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                              {lead.phone}
                            </a>
                          ) : "–"}
                        </td>
                        <td className="px-4 py-2.5 text-text-muted" onClick={() => navigate(`/myynti/liidit/${lead.id}`)}>
                          {lead.city || "–"}
                        </td>
                        <td className="px-4 py-2.5" onClick={() => navigate(`/myynti/liidit/${lead.id}`)}>
                          <LeadStatusBadge status={lead.status} />
                        </td>
                        <td className="px-4 py-2.5 text-text-muted" onClick={() => navigate(`/myynti/liidit/${lead.id}`)}>
                          {lead.assigned_salesperson_id
                            ? sellerMap.get(lead.assigned_salesperson_id) || "–"
                            : <span className="text-amber-500">Ei myyjää</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-text-muted" onClick={() => navigate(`/myynti/liidit/${lead.id}`)}>
                          {lead.sales_call_lists?.name || "–"}
                        </td>
                        <td className="px-4 py-2.5" onClick={() => navigate(`/myynti/liidit/${lead.id}`)}>
                          <div className="flex flex-wrap gap-0.5">
                            {lead.tags_cache?.slice(0, 3).map((t) => (
                              <span key={t} className="px-1 py-0.5 rounded text-[9px] bg-blue-50 text-blue-600">{t}</span>
                            ))}
                            {(lead.tags_cache?.length || 0) > 3 && (
                              <span className="text-[9px] text-text-muted">+{lead.tags_cache.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-text-muted" onClick={() => navigate(`/myynti/liidit/${lead.id}`)}>
                          {formatDateTime(lead.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ─── Soittolistat / CSV-tuonti tab ─── */
        <div>
          {listsLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : callLists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileSpreadsheet className="w-10 h-10 text-text-muted mb-3" />
              <p className="text-sm font-medium text-text-muted">Ei soittolistoja</p>
              <p className="text-xs text-text-muted mt-1">Tuo ensimmäinen lista CSV-tiedostosta</p>
              <button
                onClick={() => setImportOpen(true)}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Tuo CSV
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {callLists.map((list) => (
                <div key={list.id} className="bg-surface border border-border rounded-2xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold">{list.name}</h3>
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600 border border-purple-200">
                        {list.category}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteList(list.id, list.name)}
                      className="p-1 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {list.description && (
                    <p className="text-xs text-text-muted mb-2">{list.description}</p>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span>{list.lead_count} liidiä</span>
                    <span>{formatDateTime(list.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onReassign={() => setReassignOpen(true)}
        onTag={() => setTagModalOpen(true)}
        onChangeStatus={() => setStatusModalOpen(true)}
        onDelete={handleBulkDelete}
      />

      {/* Reassign modal */}
      <ReassignModal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        onConfirm={handleReassign}
        count={selected.size}
        isPending={bulkUpdate.isPending}
      />

      {/* CSV Import modal */}
      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        isPending={bulkInsert.isPending || createList.isPending}
      />

      {/* Tag modal */}
      {tagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold">Lisää tagi {selected.size} liidiin</h2>
            <select value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} className={selectCls}>
              <option value="">Valitse tagi...</option>
              {tags.filter((t) => t.scope !== "opportunity").map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setTagModalOpen(false); setBulkTag(""); }} className="px-3 py-1.5 text-xs font-medium text-text-muted">
                Peruuta
              </button>
              <button
                onClick={handleBulkTag}
                disabled={!bulkTag || bulkTagMut.isPending}
                className="flex items-center gap-1 px-4 py-1.5 bg-accent text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" /> Lisää
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status modal */}
      {statusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold">Vaihda status ({selected.size} liidiä)</h2>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className={selectCls}>
              <option value="">Valitse status...</option>
              {Object.entries(LEAD_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
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
