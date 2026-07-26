import { useState, useRef } from "react";
import { Plus, X, Save, Edit3, Trash, Paperclip, FileText } from "lucide-react";
import { useEmailTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate, useAddTemplateAttachment, useRemoveTemplateAttachment } from "@/hooks/sales/useSalesEmails";
import type { SalesEmailTemplate } from "@/lib/sales-types";
import TiptapEditor from "./TiptapEditor";
import { fileToBase64, formatFileSize } from "./email-utils";

export default function TemplateManager({ employeeId, onClose, category }: { employeeId: string; onClose: () => void; category?: string }) {
  const { data: allTemplates, isLoading } = useEmailTemplates(employeeId);
  const templates = allTemplates
    ? category ? allTemplates.filter((t) => t.category === category) : allTemplates
    : undefined;
  const createMutation = useCreateEmailTemplate();
  const updateMutation = useUpdateEmailTemplate();
  const deleteMutation = useDeleteEmailTemplate();
  const addAttachmentMutation = useAddTemplateAttachment();
  const removeAttachmentMutation = useRemoveTemplateAttachment();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [subjectTpl, setSubjectTpl] = useState("");
  const [bodyTpl, setBodyTpl] = useState("");
  const [newAttachments, setNewAttachments] = useState<{ file: File; base64: string }[]>([]);
  const tplFileInputRef = useRef<HTMLInputElement>(null);

  function startCreate() {
    setEditingId(null);
    setIsCreating(true);
    setName("");
    setSubjectTpl("");
    setBodyTpl("");
    setNewAttachments([]);
  }

  function startEdit(tpl: SalesEmailTemplate) {
    setIsCreating(false);
    setEditingId(tpl.id);
    setName(tpl.name);
    setSubjectTpl(tpl.subject_template);
    setBodyTpl(tpl.body_template);
    setNewAttachments([]);
  }

  function cancelEdit() {
    setEditingId(null);
    setIsCreating(false);
  }

  async function handleSave() {
    if (!name.trim()) return;
    if (isCreating) {
      await createMutation.mutateAsync({
        name: name.trim(),
        subject_template: subjectTpl,
        body_template: bodyTpl,
        owner_salesperson_id: employeeId,
        category: category || "sales",
        attachments: newAttachments.length > 0 ? newAttachments : undefined,
      });
    } else if (editingId) {
      await updateMutation.mutateAsync({
        id: editingId,
        name: name.trim(),
        subject_template: subjectTpl,
        body_template: bodyTpl,
      });
      for (const att of newAttachments) {
        await addAttachmentMutation.mutateAsync({ templateId: editingId, file: att.file });
      }
    }
    cancelEdit();
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const base64 = await fileToBase64(file);
      setNewAttachments((prev) => [...prev, { file, base64 }]);
    }
    e.target.value = "";
  }

  const isSaving = createMutation.isPending || updateMutation.isPending || addAttachmentMutation.isPending;
  const editingTemplate = editingId ? templates?.find((t) => t.id === editingId) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] sm:max-h-[85vh] flex flex-col sm:mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Sähköpostipohjat</h3>
          <div className="flex items-center gap-2">
            {!isCreating && !editingId && (
              <button type="button" onClick={startCreate} className="flex items-center gap-1 text-xs text-accent font-medium hover:underline">
                <Plus className="w-3.5 h-3.5" /> Uusi pohja
              </button>
            )}
            <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Create / Edit form */}
          {(isCreating || editingId) && (
            <div className="p-4 border-b border-border space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Pohjan nimi</label>
                <input
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="esim. Tarjouksen lähetys"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Otsikko</label>
                <input
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent"
                  value={subjectTpl}
                  onChange={(e) => setSubjectTpl(e.target.value)}
                  placeholder="Sähköpostin otsikko"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Viesti</label>
                <div className="mt-1 border border-border rounded-lg overflow-hidden">
                  <TiptapEditor
                    content={bodyTpl}
                    placeholder="Kirjoita viestin pohja..."
                    onChange={(html) => setBodyTpl(html)}
                    autofocus={false}
                  />
                </div>
              </div>

              {/* Existing attachments (edit mode) */}
              {editingTemplate?.email_template_attachments && editingTemplate.email_template_attachments.length > 0 && (
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Tallennetut liitteet</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {editingTemplate.email_template_attachments.map((att: any) => (
                      <div key={att.id} className="flex items-center gap-1.5 px-2 py-1 bg-bg-secondary rounded-lg text-xs">
                        <Paperclip className="w-3 h-3 text-text-muted" />
                        <span className="truncate max-w-[150px]">{att.filename}</span>
                        <span className="text-text-muted">{formatFileSize(att.size_bytes)}</span>
                        <button type="button"
                          onClick={() => removeAttachmentMutation.mutate({ id: att.id, storagePath: att.storage_path })}
                          className="text-text-muted hover:text-red-500"
                          disabled={removeAttachmentMutation.isPending}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New attachments */}
              <div>
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => tplFileInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-accent font-medium hover:underline"
                  >
                    <Paperclip className="w-3 h-3" /> Lisää liite
                  </button>
                  <input ref={tplFileInputRef} type="file" multiple className="hidden" onChange={handleAttachFile} />
                </div>
                {newAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {newAttachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-lg text-xs">
                        <Paperclip className="w-3 h-3 text-text-muted" />
                        <span className="truncate max-w-[150px]">{att.file.name}</span>
                        <span className="text-text-muted">{formatFileSize(att.file.size)}</span>
                        <button type="button"
                          onClick={() => setNewAttachments((prev) => prev.filter((_, j) => j !== i))}
                          className="text-text-muted hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button type="button"
                  onClick={handleSave}
                  disabled={isSaving || !name.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
                >
                  {isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
                  {isCreating ? "Luo pohja" : "Tallenna"}
                </button>
                <button type="button" onClick={cancelEdit} className="px-4 py-1.5 border border-border rounded-lg text-xs text-text-muted hover:text-text-primary">
                  Peruuta
                </button>
              </div>
            </div>
          )}

          {/* Template list */}
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="divide-y divide-border">
              {templates.map((tpl) => (
                <div key={tpl.id} className={`px-4 py-3 ${editingId === tpl.id ? "bg-accent/5" : "hover:bg-bg-secondary/50"} transition-colors`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{tpl.name}</p>
                      {tpl.subject_template && (
                        <p className="text-xs text-text-muted mt-0.5 truncate">Aihe: {tpl.subject_template}</p>
                      )}
                      {tpl.email_template_attachments && tpl.email_template_attachments.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Paperclip className="w-3 h-3 text-text-muted" />
                          <span className="text-[10px] text-text-muted">
                            {tpl.email_template_attachments.map((a: any) => a.filename).join(", ")}
                          </span>
                        </div>
                      )}
                      {tpl.is_system && (
                        <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">Järjestelmä</span>
                      )}
                    </div>
                    {!tpl.is_system && (
                      <div className="flex items-center gap-1 ml-2">
                        <button type="button"
                          onClick={() => startEdit(tpl)}
                          className="p-1.5 text-text-muted hover:text-accent rounded-lg hover:bg-bg-secondary"
                          title="Muokkaa"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === tpl.id ? (
                          <span className="flex items-center gap-1 text-xs text-red-600">
                            <span>Poista?</span>
                            <button type="button" onClick={() => { deleteMutation.mutate(tpl.id); setConfirmDeleteId(null); }} className="px-1.5 py-0.5 bg-red-500 text-white rounded text-[10px] font-semibold hover:bg-red-600">Kyllä</button>
                            <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-1.5 py-0.5 bg-bg-secondary rounded text-[10px] hover:bg-border">Ei</button>
                          </span>
                        ) : (
                          <button type="button"
                            onClick={() => setConfirmDeleteId(tpl.id)}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 text-text-muted hover:text-red-500 rounded-lg hover:bg-bg-secondary"
                            title="Poista"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : !isCreating ? (
            <div className="p-8 text-center">
              <FileText className="w-8 h-8 text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-muted">Ei sähköpostipohjia</p>
              <button type="button" onClick={startCreate} className="text-xs text-accent mt-2 hover:underline">
                Luo ensimmäinen pohja
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
