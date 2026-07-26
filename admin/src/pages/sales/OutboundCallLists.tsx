import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, FileSpreadsheet, Trash2, List } from "lucide-react";
import { useSalesCallLists, useCreateCallList, useDeleteCallList } from "@/hooks/sales/useSalesCallLists";
import { useBulkInsertLeads } from "@/hooks/sales/useSalesLeads";
import { CsvImportModal } from "@/components/sales/CsvImportModal";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";

export default function OutboundCallLists() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: lists = [], isLoading } = useSalesCallLists();
  const createList = useCreateCallList();
  const deleteList = useDeleteCallList();
  const bulkInsert = useBulkInsertLeads();
  const [importOpen, setImportOpen] = useState(false);

  async function handleImport(rows: Record<string, string>[], listName: string, category: string) {
    try {
      const list = await createList.mutateAsync({
        name: listName,
        category,
        description: null,
        lead_count: rows.length,
      });

      await bulkInsert.mutateAsync(
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

      toast(`${rows.length} liidiä tuotu listaan "${listName}"`);
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
