import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, FileSpreadsheet, Trash2, List, Tag } from "lucide-react";
import { useSalesCallLists, useCreateCallList, useDeleteCallList } from "@/hooks/sales/useSalesCallLists";
import { useBulkInsertLeads } from "@/hooks/sales/useSalesLeads";
import { useBulkTagLeads } from "@/hooks/sales/useBulkLeadOperations";
import { useSalesTags } from "@/hooks/sales/useSalesTags";
import { CsvImportModal } from "@/components/sales/CsvImportModal";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";

export default function LeadImport() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: lists = [], isLoading } = useSalesCallLists();
  const { data: tags = [] } = useSalesTags();
  const createList = useCreateCallList();
  const deleteList = useDeleteCallList();
  const bulkInsert = useBulkInsertLeads();
  const bulkTag = useBulkTagLeads();
  const [importOpen, setImportOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const leadTags = tags.filter((t) => t.scope !== "opportunity" && t.tag_type === "normal");

  async function handleImport(rows: Record<string, string>[], listName: string, category: string) {
    try {
      const list = await createList.mutateAsync({
        name: listName,
        category,
        description: null,
        lead_count: rows.length,
      });

      const inserted = await bulkInsert.mutateAsync(
        rows.map((r) => ({
          name: r.name,
          phone: r.phone,
          email: r.email,
          address: r.address,
          postcode: r.postcode,
          city: r.city,
          call_list_id: list.id,
        }))
      );

      // Apply selected tags to all imported leads
      if (selectedTags.length > 0 && inserted) {
        await bulkTag.mutateAsync({
          leadIds: inserted.map((l) => l.id),
          tagNames: selectedTags,
        });
      }

      const tagInfo = selectedTags.length > 0 ? ` (tagit: ${selectedTags.join(", ")})` : "";
      toast(`${rows.length} liidiä tuotu listaan "${listName}"${tagInfo}`);
      setSelectedTags([]);
    } catch {
      toast("Tuonti epäonnistui", "error");
    }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({ message: `Poista lista "${name}"? Liidejä ei poisteta.`, variant: "danger" });
    if (!ok) return;
    try {
      await deleteList.mutateAsync(id);
      toast("Lista poistettu");
    } catch {
      toast("Poisto epäonnistui", "error");
    }
  }

  function toggleTag(tagName: string) {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate("/myynti/liidit")} className="p-2 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-accent flex-shrink-0" />
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary truncate">Soittolistat & CSV-tuonti</h1>
          </div>
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" /> Tuo CSV
        </button>
      </div>

      {/* Tag selection for import */}
      {importOpen && leadTags.length > 0 && (
        <div className="mb-4 p-4 bg-surface border border-border rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-text-muted" />
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Tagaa tuotavat liidit (valinnainen)
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {leadTags.map((t) => (
              <button
                key={t.name}
                onClick={() => toggleTag(t.name)}
                className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  selectedTags.includes(t.name)
                    ? "bg-accent text-white border-accent"
                    : "bg-surface border-border text-text-muted hover:border-accent/50"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          {selectedTags.length > 0 && (
            <p className="text-[11px] text-accent mt-2">
              Tagit lisätään tuonnissa: {selectedTags.join(", ")}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <List className="w-10 h-10 text-text-muted mb-3" />
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
          {lists.map((list) => (
            <div key={list.id} className="bg-surface border border-border rounded-2xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold">{list.name}</h3>
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600 border border-purple-200">
                    {list.category}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(list.id, list.name)}
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

      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        isPending={bulkInsert.isPending || createList.isPending}
      />
    </div>
  );
}
