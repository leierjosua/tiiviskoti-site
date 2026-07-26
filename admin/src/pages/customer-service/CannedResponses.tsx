import { useState } from "react";
import DOMPurify from "dompurify";
import {
  useAllCannedResponses,
  useCreateCannedResponse,
  useUpdateCannedResponse,
  useDeleteCannedResponse,
} from "@/hooks/customer-service/useCannedResponses";
import { useUserRole } from "@/context/UserRoleContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import type { CSCannedResponse } from "@/lib/cs-types";
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  Save,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from "lucide-react";

export default function CannedResponses() {
  const toast = useToast();
  const confirm = useConfirm();
  const { employee } = useUserRole();

  const { data: responses, isLoading } = useAllCannedResponses();
  const createResponse = useCreateCannedResponse();
  const updateResponse = useUpdateCannedResponse();
  const deleteResponse = useDeleteCannedResponse();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");

  function startEdit(r: CSCannedResponse) {
    setEditingId(r.id);
    setFormName(r.name);
    setFormCategory(r.category || "");
    setFormSubject(r.subject || "");
    setFormBody(r.body_html);
    setShowNew(false);
  }

  function startNew() {
    setShowNew(true);
    setEditingId(null);
    setFormName("");
    setFormCategory("");
    setFormSubject("");
    setFormBody("");
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNew(false);
  }

  function handleSave() {
    if (!formName.trim() || !formBody.trim()) return;

    if (showNew) {
      createResponse.mutate(
        {
          name: formName,
          category: formCategory || null,
          subject: formSubject || null,
          body_html: formBody,
          body_text: formBody.replace(/<[^>]*>/g, ""),
          created_by: employee?.id,
        },
        {
          onSuccess: () => {
            toast.success("Pikavastaus luotu");
            cancelEdit();
          },
          onError: (err) => toast.error(err.message),
        }
      );
    } else if (editingId) {
      updateResponse.mutate(
        {
          id: editingId,
          name: formName,
          category: formCategory || null,
          subject: formSubject || null,
          body_html: formBody,
          body_text: formBody.replace(/<[^>]*>/g, ""),
        },
        {
          onSuccess: () => {
            toast.success("Pikavastaus päivitetty");
            cancelEdit();
          },
          onError: (err) => toast.error(err.message),
        }
      );
    }
  }

  async function handleDelete(r: CSCannedResponse) {
    const ok = await confirm({
      title: "Poista pikavastaus",
      message: `Haluatko varmasti poistaa pikavastauksen "${r.name}"?`,
      confirmLabel: "Poista",
      variant: "danger",
    });
    if (!ok) return;
    deleteResponse.mutate(r.id, {
      onError: (err) => toast.error(err.message),
    });
  }

  function toggleActive(r: CSCannedResponse) {
    updateResponse.mutate({
      id: r.id,
      is_active: !r.is_active,
    });
  }

  const isPending = createResponse.isPending || updateResponse.isPending;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-gray-500 shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold">Pikavastaukset</h1>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Uusi pikavastaus
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Pikavastaukset ovat valmiita vastauspohjia, joita voit lisätä tikettien
        vastauksiin nopeasti. Käytä muuttujia:{" "}
        <code className="bg-gray-100 px-1 rounded">{"{{customer_name}}"}</code>,{" "}
        <code className="bg-gray-100 px-1 rounded">{"{{ticket_number}}"}</code>
      </p>

      {/* New / Edit form */}
      {(showNew || editingId) && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-700">
            {showNew ? "Uusi pikavastaus" : "Muokkaa pikavastausta"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nimi *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="esim. Kiitos yhteydenotosta"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Kategoria
              </label>
              <input
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="esim. yleinen, tekninen"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Aihe (valinnainen)
              </label>
              <input
                type="text"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="Korvaa tiketin aiheen"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Sisältö (HTML) *
            </label>
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
              placeholder="<p>Hei {{customer_name}},</p><p>Kiitos yhteydenotostasi...</p>"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!formName.trim() || !formBody.trim() || isPending}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isPending ? "Tallennetaan..." : "Tallenna"}
            </button>
            <button
              onClick={cancelEdit}
              className="px-4 py-1.5 text-gray-600 text-sm hover:text-gray-800"
            >
              Peruuta
            </button>
          </div>
        </div>
      )}

      {/* Response list */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
        {isLoading ? (
          <div className="space-y-0 divide-y divide-gray-100">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-4">
                <div className="h-5 w-1/2 rounded bg-gray-200 animate-pulse mb-2" />
                <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        ) : !responses?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Zap className="h-12 w-12 mb-3" />
            <p className="text-sm font-medium">Ei pikavastauksia</p>
            <p className="text-xs mt-1">
              Luo ensimmäinen pikavastaus aloittaaksesi
            </p>
          </div>
        ) : (
          responses.map((r) => (
            <div key={r.id} className="px-3 sm:px-4 py-3">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-gray-900 break-words">
                      {r.name}
                    </h3>
                    {r.category && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {r.category}
                      </span>
                    )}
                    {!r.is_active && (
                      <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                        Ei käytössä
                      </span>
                    )}
                  </div>
                  {r.subject && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Aihe: {r.subject}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                  <BarChart3 className="h-3 w-3" />
                  {r.usage_count}
                </span>
                <button
                  onClick={() =>
                    setExpandedId(expandedId === r.id ? null : r.id)
                  }
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  {expandedId === r.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => toggleActive(r)}
                  className={`text-xs px-2 py-1 rounded ${
                    r.is_active
                      ? "text-green-700 bg-green-50 hover:bg-green-100"
                      : "text-gray-500 bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  {r.is_active ? "Käytössä" : "Pois"}
                </button>
                <button
                  onClick={() => startEdit(r)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(r)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {expandedId === r.id && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div
                    className="prose prose-sm max-w-none text-gray-700"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.body_html) }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
