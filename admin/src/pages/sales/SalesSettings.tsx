import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { SlidersHorizontal } from "lucide-react";
import { useLeadStages, useUpsertLeadStage, useDeleteLeadStage, useOpportunityStages, useUpsertOpportunityStage, useDeleteOpportunityStage } from "@/hooks/sales/useSalesStages";
import { useSalesTags, useCreateSalesTag, useDeleteSalesTag } from "@/hooks/sales/useSalesTags";
import { useSalesCallScripts, useCreateCallScript, useUpdateCallScript, useDeleteCallScript } from "@/hooks/sales/useSalesCallScripts";
import { useSalesAssignmentSettings, useUpsertAssignmentSetting } from "@/hooks/sales/useSalesAssignment";
import { useSalesCategoryTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate, useAddTemplateAttachment, useRemoveTemplateAttachment } from "@/hooks/sales/useSalesEmails";

import { useEmployees } from "@/hooks/useEmployees";
import { StageEditor } from "@/components/sales/StageEditor";
import TiptapEditor from "@/components/email/TiptapEditor";
import { inputCls, selectCls } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { Plus, Pencil, Trash2, Check, X, Save, FileText, Paperclip, ChevronDown, Edit3 } from "lucide-react";
import type { TagType, TagScope, SalesEmailTemplate } from "@/lib/sales-types";
import { supabase } from "@/lib/supabase";

type Tab = "stages" | "tags" | "scripts" | "assignment" | "email_templates" | "sync_health";

const TABS: { key: Tab; label: string }[] = [
  { key: "stages", label: "Pipeline-vaiheet" },
  { key: "tags", label: "Tagit" },
  { key: "scripts", label: "Soittoskriptit" },
  { key: "assignment", label: "Inbound-jako" },
  { key: "email_templates", label: "Sähköpostipohjat" },
  { key: "sync_health", label: "Synkronointi" },
];

export default function SalesSettings() {
  const [tab, setTab] = useState<Tab>("stages");

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <SlidersHorizontal className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Myyntiasetukset</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 sm:px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stages" && <StagesTab />}
      {tab === "tags" && <TagsTab />}
      {tab === "scripts" && <ScriptsTab />}
      {tab === "assignment" && <AssignmentTab />}
      {tab === "email_templates" && <EmailTemplatesTab />}
      {tab === "sync_health" && <SyncHealthTab />}
    </div>
  );
}

function StagesTab() {
  const { data: leadStages = [] } = useLeadStages();
  const { data: oppStages = [] } = useOpportunityStages();
  const upsertLead = useUpsertLeadStage();
  const deleteLead = useDeleteLeadStage();
  const upsertOpp = useUpsertOpportunityStage();
  const deleteOpp = useDeleteOpportunityStage();

  return (
    <div className="space-y-8 max-w-xl">
      <StageEditor
        title="Outbound (Kylmäsoitot)"
        stages={leadStages}
        onSave={(s) => upsertLead.mutateAsync(s)}
        onDelete={(k) => deleteLead.mutateAsync(k)}
      />
      <StageEditor
        title="Inbound (Myyntiputki)"
        stages={oppStages}
        onSave={(s) => upsertOpp.mutateAsync(s)}
        onDelete={(k) => deleteOpp.mutateAsync(k)}
      />
    </div>
  );
}

function TagsTab() {
  const { data: tags = [] } = useSalesTags();
  const createTag = useCreateSalesTag();
  const deleteTag = useDeleteSalesTag();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", color: "#3b82f6", tag_type: "normal" as TagType, scope: "both" as TagScope });

  async function handleAdd() {
    if (!form.name.trim()) return;
    try {
      await createTag.mutateAsync({ ...form, position: tags.length });
      setAdding(false);
      setForm({ name: "", color: "#3b82f6", tag_type: "normal", scope: "both" });
      toast("Tagi luotu");
    } catch {
      toast("Virhe", "error");
    }
  }

  const grouped = {
    normal: tags.filter((t) => t.tag_type === "normal" || !t.tag_type),
    import: tags.filter((t) => t.tag_type === "import"),
    service: tags.filter((t) => t.tag_type === "service"),
    loss_reason: tags.filter((t) => t.tag_type === "loss_reason"),
  };

  const GROUP_LABELS: Record<string, string> = {
    normal: "Yleiset tagit",
    import: "Tuontitagit",
    service: "Palvelutagit",
    loss_reason: "Häviösyyt",
  };

  return (
    <div className="max-w-xl space-y-6">
      {(["normal", "import", "service", "loss_reason"] as const).map((type) => (
        <div key={type}>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            {GROUP_LABELS[type]}
            {type === "import" && <span className="font-normal ml-1">(luodaan CSV-tuonnissa)</span>}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {grouped[type].map((tag) => (
              <span
                key={tag.name}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border"
                style={{ backgroundColor: tag.color + "18", color: tag.color, borderColor: tag.color + "40" }}
              >
                {tag.name}
                <button
                  onClick={async () => { await deleteTag.mutateAsync(tag.name); toast("Tagi poistettu"); }}
                  className="hover:opacity-60"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {grouped[type].length === 0 && <span className="text-xs text-text-muted">Ei tageja</span>}
          </div>
        </div>
      ))}

      {adding ? (
        <div className="flex flex-wrap items-center gap-2 p-3 border border-accent/20 bg-accent/5 rounded-xl">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tagin nimi" className={`${inputCls} !py-1 !text-xs flex-1 min-w-[120px]`} />
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-8 h-8 sm:w-6 sm:h-6 border-0 cursor-pointer" />
          <select value={form.tag_type} onChange={(e) => setForm({ ...form, tag_type: e.target.value as TagType })} className={`${selectCls} !py-1 !text-xs w-28`}>
            <option value="normal">Yleinen</option>
            <option value="import">Tuontitagi</option>
            <option value="service">Palvelu</option>
            <option value="loss_reason">Häviösyy</option>
          </select>
          <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as TagScope })} className={`${selectCls} !py-1 !text-xs w-28`}>
            <option value="both">Molemmat</option>
            <option value="lead">Lead</option>
            <option value="opportunity">Opp</option>
          </select>
          <button onClick={handleAdd} className="text-accent p-1"><Check className="w-5 h-5 sm:w-4 sm:h-4" /></button>
          <button onClick={() => setAdding(false)} className="text-text-muted p-1"><X className="w-5 h-5 sm:w-4 sm:h-4" /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80">
          <Plus className="w-3.5 h-3.5" /> Lisää tagi
        </button>
      )}
    </div>
  );
}

function ScriptsTab() {
  const { data: scripts = [] } = useSalesCallScripts();
  const createScript = useCreateCallScript();
  const updateScript = useUpdateCallScript();
  const deleteScript = useDeleteCallScript();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", content: "" });

  return (
    <div className="max-w-2xl space-y-3">
      {scripts.map((script) => (
        <div key={script.id} className="border border-border rounded-xl bg-surface">
          <div className="flex items-center justify-between px-4 py-2.5">
            {editing === script.id ? (
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={`${inputCls} !py-1 !text-xs flex-1 mr-2`}
              />
            ) : (
              <span className="text-sm font-medium">{script.name}</span>
            )}
            <div className="flex items-center gap-1">
              {editing === script.id ? (
                <>
                  <button onClick={async () => {
                    await updateScript.mutateAsync({ id: script.id, name: form.name, content: form.content });
                    setEditing(null);
                    toast("Skripti päivitetty");
                  }} className="text-accent"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditing(null)} className="text-text-muted"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditing(script.id); setForm({ name: script.name, content: script.content }); }} className="text-text-muted hover:text-text"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={async () => { await deleteScript.mutateAsync(script.id); toast("Skripti poistettu"); }} className="text-text-muted hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
          </div>
          {editing === script.id ? (
            <div className="px-4 pb-3">
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={8}
                className={`${inputCls} !text-xs font-mono`}
              />
            </div>
          ) : (
            <div className="px-4 pb-3">
              <p className="text-xs text-text-muted whitespace-pre-wrap line-clamp-3">{script.content}</p>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={async () => {
          const script = await createScript.mutateAsync({ name: "Uusi skripti", content: "", service_id: null, sort_order: scripts.length });
          setEditing(script.id);
          setForm({ name: script.name, content: "" });
        }}
        className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80"
      >
        <Plus className="w-3.5 h-3.5" /> Lisää skripti
      </button>
    </div>
  );
}

function AssignmentRow({ seller, setting, onSave }: {
  seller: { id: string; first_name: string; last_name: string };
  setting?: { weekly_limit: number; priority: number; is_active: boolean; email_notifications?: boolean };
  onSave: (data: { salesperson_id: string; weekly_limit: number; priority: number; is_active: boolean; email_notifications?: boolean }) => void;
}) {
  const [weeklyLimit, setWeeklyLimit] = useState(String(setting?.weekly_limit ?? 0));
  const [priority, setPriority] = useState(String(setting?.priority ?? 100));

  useEffect(() => { setWeeklyLimit(String(setting?.weekly_limit ?? 0)); }, [setting?.weekly_limit]);
  useEffect(() => { setPriority(String(setting?.priority ?? 100)); }, [setting?.priority]);

  const base = {
    salesperson_id: seller.id,
    weekly_limit: parseInt(weeklyLimit) || 0,
    priority: parseInt(priority) || 100,
    is_active: setting?.is_active ?? true,
    email_notifications: setting?.email_notifications ?? true,
  };

  return (
    <div className="px-4 py-3 border border-border rounded-xl bg-surface">
      <p className="text-xs font-medium mb-2">{seller.first_name} {seller.last_name}</p>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-text-muted whitespace-nowrap">Viikkoraja</label>
          <input
            type="number"
            value={weeklyLimit}
            onChange={(e) => setWeeklyLimit(e.target.value)}
            onBlur={() => onSave({ ...base, weekly_limit: parseInt(weeklyLimit) || 0 })}
            className={`${inputCls} !py-1 !text-xs w-16 text-center`}
            min={0}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-text-muted whitespace-nowrap">Prioriteetti</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            onBlur={() => onSave({ ...base, priority: parseInt(priority) || 100 })}
            className={`${inputCls} !py-1 !text-xs w-16 text-center`}
            min={0}
          />
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-text-muted whitespace-nowrap">
          <input
            type="checkbox"
            checked={setting?.is_active ?? true}
            onChange={(e) => onSave({ ...base, is_active: e.target.checked })}
          />
          Aktiivinen
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-text-muted whitespace-nowrap">
          <input
            type="checkbox"
            checked={setting?.email_notifications ?? true}
            onChange={(e) => onSave({ ...base, email_notifications: e.target.checked })}
          />
          Sähköposti-ilmoitukset
        </label>
      </div>
    </div>
  );
}

function AssignmentTab() {
  const { data: settings = [] } = useSalesAssignmentSettings();
  const { data: employees = [] } = useEmployees();
  const upsert = useUpsertAssignmentSetting();

  const sellers = employees.filter((e) => e.roles.includes("seller") && e.active);

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-xs text-text-muted mb-3">Inbound-liidien automaattijako (round-robin). Prioriteetti: pienempi numero = korkeampi prioriteetti. Viikkoraja: 0 = ei rajaa.</p>

      {sellers.map((seller) => {
        const setting = settings.find((s) => s.salesperson_id === seller.id);
        return (
          <AssignmentRow
            key={seller.id}
            seller={seller}
            setting={setting}
            onSave={(data) => upsert.mutate(data)}
          />
        );
      })}

      {sellers.length === 0 && (
        <p className="text-xs text-text-muted text-center py-8">
          Ei myyjiä. Lisää ensin myyjärooli työntekijöihin.
        </p>
      )}
    </div>
  );
}

// ─── Email Templates Tab (Company-wide) ──────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EmailTemplatesTab() {
  const { data: templates = [], isLoading } = useSalesCategoryTemplates();
  const createMutation = useCreateEmailTemplate();
  const updateMutation = useUpdateEmailTemplate();
  const deleteMutation = useDeleteEmailTemplate();
  const addAttachmentMutation = useAddTemplateAttachment();
  const removeAttachmentMutation = useRemoveTemplateAttachment();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [subjectTpl, setSubjectTpl] = useState("");
  const [bodyTpl, setBodyTpl] = useState("");
  const [newAttachments, setNewAttachments] = useState<{ file: File; base64: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const tplFileRef = useRef<HTMLInputElement>(null);

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
    setExpandedId(tpl.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setIsCreating(false);
  }

  async function handleSave() {
    if (!name.trim()) return;
    try {
      if (isCreating) {
        await createMutation.mutateAsync({
          name: name.trim(),
          subject_template: subjectTpl,
          body_template: bodyTpl,
          category: "sales",
          owner_salesperson_id: null as unknown as string,
          attachments: newAttachments.length > 0 ? newAttachments : undefined,
        });
        toast("Pohja luotu");
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
        toast("Pohja päivitetty");
      }
      cancelEdit();
    } catch {
      toast("Virhe tallennuksessa", "error");
    }
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
  const editingTemplate = editingId ? templates.find((t) => t.id === editingId) : null;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          Myynnin sähköpostipohjat, jotka näkyvät kaikille myyjille. Kaikki sähköpostipohjat löytyvät kohdasta Sähköpostipohjat.
        </p>
        {!isCreating && !editingId && (
          <button onClick={startCreate} className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> Lisää pohja
          </button>
        )}
      </div>

      {/* Create / Edit form */}
      {(isCreating || editingId) && (
        <div className="border border-accent/20 bg-accent/5 rounded-xl p-4 space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Pohjan nimi</label>
            <input
              className={`${inputCls} mt-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="esim. Tarjouksen lähetys"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Otsikko</label>
            <input
              className={`${inputCls} mt-1`}
              value={subjectTpl}
              onChange={(e) => setSubjectTpl(e.target.value)}
              placeholder="Sähköpostin otsikko"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Viesti</label>
            <div className="mt-1 border border-border rounded-lg overflow-hidden bg-white">
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
                {editingTemplate.email_template_attachments.filter((att) => !att.quote_template_id).map((att) => (
                  <div key={att.id} className="flex items-center gap-1.5 px-2 py-1 border rounded-lg text-xs bg-white border-border">
                    <Paperclip className="w-3 h-3 text-text-muted" />
                    <span className="truncate max-w-[180px]">{att.filename}</span>
                    <span className="text-text-muted">{formatFileSize(att.size_bytes)}</span>
                    <button
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
          <div className="space-y-2">
            <button onClick={() => tplFileRef.current?.click()} className="flex items-center gap-1 text-xs text-accent font-medium hover:underline">
              <Paperclip className="w-3 h-3" /> Lisää liite
            </button>
            <input ref={tplFileRef} type="file" multiple className="hidden" onChange={handleAttachFile} />
            {newAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {newAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-lg text-xs">
                    <Paperclip className="w-3 h-3 text-text-muted" />
                    <span className="truncate max-w-[150px]">{att.file.name}</span>
                    <span className="text-text-muted">{formatFileSize(att.file.size)}</span>
                    <button onClick={() => setNewAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-text-muted hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
            >
              {isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
              {isCreating ? "Luo pohja" : "Tallenna"}
            </button>
            <button onClick={cancelEdit} className="px-4 py-1.5 border border-border rounded-lg text-xs text-text-muted hover:text-text-primary">
              Peruuta
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {isLoading ? (
        <div className="py-8 text-center">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : templates.length > 0 ? (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="border border-border rounded-xl bg-surface overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-bg-secondary/50 transition-colors"
                onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-accent flex-shrink-0" />
                    <span className="text-sm font-medium">{tpl.name}</span>
                    {tpl.email_template_attachments && tpl.email_template_attachments.filter((a) => !a.quote_template_id).length > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-text-muted">
                        <Paperclip className="w-3 h-3" /> {tpl.email_template_attachments.filter((a) => !a.quote_template_id).length}
                      </span>
                    )}
                  </div>
                  {tpl.subject_template && (
                    <p className="text-xs text-text-muted mt-0.5 ml-6 truncate">Aihe: {tpl.subject_template}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(tpl); }}
                    className="p-1.5 text-text-muted hover:text-accent rounded-lg hover:bg-bg-secondary"
                    title="Muokkaa"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Poistetaanko pohja?")) {
                        deleteMutation.mutate(tpl.id);
                        toast("Pohja poistettu");
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 text-text-muted hover:text-red-500 rounded-lg hover:bg-bg-secondary"
                    title="Poista"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${expandedId === tpl.id ? "rotate-180" : ""}`} />
                </div>
              </div>

              {/* Expanded preview */}
              {expandedId === tpl.id && editingId !== tpl.id && (
                <div className="px-4 pb-4 border-t border-border">
                  {tpl.body_template ? (
                    <div className="mt-3 prose prose-sm max-w-none text-xs" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(tpl.body_template) }} />
                  ) : (
                    <p className="mt-3 text-xs text-text-muted italic">Ei sisältöä</p>
                  )}
                  {tpl.email_template_attachments && tpl.email_template_attachments.filter((a) => !a.quote_template_id).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {tpl.email_template_attachments.filter((a) => !a.quote_template_id).map((att) => (
                        <div key={att.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs bg-bg-secondary">
                          <Paperclip className="w-3 h-3 text-text-muted" />
                          <span>{att.filename}</span>
                          <span className="text-text-muted">{formatFileSize(att.size_bytes)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !isCreating ? (
        <div className="py-8 text-center border border-dashed border-border rounded-xl">
          <FileText className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">Ei yrityksen sähköpostipohjia</p>
          <button onClick={startCreate} className="text-xs text-accent mt-2 hover:underline">
            Luo ensimmäinen pohja
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─── Sync Health ──────────────────────────────────────────────────────────────

function SyncHealthTab() {
  const [syncStates, setSyncStates] = useState<{
    id: string;
    email_address: string;
    last_synced_at: string | null;
    status: string;
    consecutive_failures: number;
    last_error: string | null;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetchSyncStates();
  }, []);

  async function fetchSyncStates() {
    setLoading(true);
    const { data } = await supabase
      .from("gmail_sync_state")
      .select("id, email_address, last_synced_at, status, consecutive_failures, last_error")
      .order("email_address");
    setSyncStates(data || []);
    setLoading(false);
  }

  async function handleSync(emailAddress: string, reconcile = false) {
    setSyncing(emailAddress);
    try {
      const { error } = await supabase.functions.invoke("sync-gmail", {
        body: { email_address: emailAddress, reconcile },
      });
      if (error) throw error;
      toast("Synkronointi valmis");
      await fetchSyncStates();
    } catch (err) {
      console.error("Sync failed:", err);
      toast("Synkronointi epäonnistui");
    } finally {
      setSyncing(null);
    }
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      healthy: "bg-emerald-100 text-emerald-700",
      degraded: "bg-yellow-100 text-yellow-700",
      failing: "bg-red-100 text-red-700",
    };
    const labels: Record<string, string> = {
      healthy: "OK",
      degraded: "Hidastumia",
      failing: "Virhetila",
    };
    return (
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[status] || "bg-gray-100 text-gray-600"}`}>
        {labels[status] || status}
      </span>
    );
  }

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "Ei koskaan";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Juuri nyt";
    if (mins < 60) return `${mins} min sitten`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h sitten`;
    return `${Math.floor(hours / 24)} pv sitten`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (syncStates.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-text-muted">
        Ei Gmail-synkronoitavia tilejä.
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-xs text-text-muted">Gmail-synkronoinnin tila. Push-notifikaatiot (Pub/Sub) ovat ensisijainen synkronointitapa, lisäksi CRON-varmuussynkka 5 min välein.</p>

      {syncStates.map((state) => (
        <div key={state.id} className="border border-border rounded-xl p-4 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-text-primary truncate">{state.email_address}</span>
              {statusBadge(state.status || "healthy")}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => handleSync(state.email_address)}
                disabled={syncing === state.email_address}
                className="text-xs px-3 py-1.5 sm:py-1 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {syncing === state.email_address ? "..." : "Synkkaa"}
              </button>
              <button
                onClick={() => handleSync(state.email_address, true)}
                disabled={syncing === state.email_address}
                className="text-xs px-3 py-1.5 sm:py-1 rounded-lg border border-border text-text-muted hover:text-text-primary disabled:opacity-50"
              >
                Reconcile
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
            <span>Viimeisin synkka: <strong>{timeAgo(state.last_synced_at)}</strong></span>
            {(state.consecutive_failures || 0) > 0 && (
              <span className="text-red-500">Peräkkäisiä virheitä: {state.consecutive_failures}</span>
            )}
          </div>
          {state.last_error && (
            <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 font-mono break-all">
              {state.last_error.substring(0, 300)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


