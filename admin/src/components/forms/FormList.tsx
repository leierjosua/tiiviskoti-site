import { useState } from "react";
import { ChevronDown, ChevronRight, Zap, FileText, ToggleLeft, ToggleRight, Plus, Mail, Bell, BellOff, X, UserCheck } from "lucide-react";
import { useContactForms, useToggleContactFormActive, useUpdateContactForm } from "@/hooks/useContactForms";
import {
  useFormAutomations,
  useCreateFormAutomation,
  useUpdateFormAutomation,
  useDeleteFormAutomation,
} from "@/hooks/useFormAutomations";
import { useConfirm } from "@/context/ConfirmContext";
import { AutomationCard } from "./AutomationCard";
import { AutomationEditor } from "./AutomationEditor";
import type { ContactForm, FormAutomation } from "@/lib/types";

export function FormList() {
  const confirm = useConfirm();
  const { data: forms, isLoading } = useContactForms();
  const toggleActive = useToggleContactFormActive();
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!forms?.length) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-8 text-center">
        <FileText className="w-10 h-10 text-text-muted/30 mx-auto mb-3" />
        <p className="text-text-muted">Ei lomakkeita</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {forms.map((form) => (
        <FormCard
          key={form.id}
          form={form}
          isExpanded={expandedFormId === form.id}
          onToggleExpand={() => setExpandedFormId(expandedFormId === form.id ? null : form.id)}
          onToggleActive={() => toggleActive.mutate({ id: form.id, is_active: !form.is_active })}
          confirm={confirm}
        />
      ))}
    </div>
  );
}

function FormCard({
  form,
  isExpanded,
  onToggleExpand,
  onToggleActive,
  confirm,
}: {
  form: ContactForm;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const { data: automations } = useFormAutomations(isExpanded ? form.id : undefined);
  const createAutomation = useCreateFormAutomation();
  const updateAutomation = useUpdateFormAutomation();
  const deleteAutomation = useDeleteFormAutomation();
  const updateForm = useUpdateContactForm();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<FormAutomation | null>(null);
  const [newEmail, setNewEmail] = useState("");

  const activeCount = automations?.filter((a) => a.is_active).length ?? 0;
  const fieldCount = form.fields?.filter((f) => !["divider", "heading", "paragraph"].includes(f.type)).length ?? 0;

  function handleEdit(auto: FormAutomation) {
    setEditingAutomation(auto);
    setEditorOpen(true);
  }

  function handleNew() {
    setEditingAutomation(null);
    setEditorOpen(true);
  }

  async function handleDelete(auto: FormAutomation) {
    if (!await confirm({ message: `Poistetaanko automaatio "${auto.name}"?`, confirmLabel: "Poista", variant: "danger" })) return;
    deleteAutomation.mutate(auto.id);
  }

  function handleSave(data: Omit<FormAutomation, "id" | "created_at" | "updated_at">) {
    if (editingAutomation) {
      updateAutomation.mutate({ id: editingAutomation.id, ...data }, {
        onSuccess: () => setEditorOpen(false),
      });
    } else {
      createAutomation.mutate(data, {
        onSuccess: () => setEditorOpen(false),
      });
    }
  }

  return (
    <>
      <div
        className={`bg-surface rounded-2xl border overflow-hidden transition-colors ${
          form.is_active ? "border-border" : "border-border/50 opacity-70"
        }`}
      >
        {/* Row */}
        <div className="flex items-center gap-3 p-4 sm:p-5">
          <button onClick={onToggleExpand} className="flex-shrink-0 text-text-muted">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <button onClick={onToggleExpand} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-text-primary truncate">{form.name}</p>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono text-text-muted bg-surface-hover">
                {form.slug}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                form.category === "sales"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-sky-50 text-sky-700"
              }`}>
                {form.category === "sales" ? "Myynti" : "Aspa"}
              </span>
              {activeCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700">
                  <Zap className="w-3 h-3" />
                  {activeCount} automaatio{activeCount !== 1 && "ta"}
                </span>
              )}
            </div>
            {form.page_urls?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {form.page_urls.map((url, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-blue-600 bg-blue-50">
                    {url}
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-text-muted mt-0.5">
              {fieldCount} kenttää
              {form.submission_count != null && ` · ${form.submission_count} vastausta`}
              {form.form_type && ` · ${form.form_type}`}
            </p>
          </button>

          <button
            onClick={onToggleActive}
            className="p-2.5 sm:p-1.5 flex-shrink-0"
            title={form.is_active ? "Poista käytöstä" : "Ota käyttöön"}
          >
            {form.is_active ? (
              <ToggleRight className="w-5 h-5 text-green-600" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-text-muted" />
            )}
          </button>
        </div>

        {/* Expanded: settings + automations */}
        {isExpanded && (
          <div className="border-t border-border px-4 sm:px-5 py-4 space-y-5">
            {/* Notification settings */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                Ilmoitusasetukset
              </h3>

              <div className="flex flex-wrap items-center gap-4">
                {/* Category */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Tyyppi:</span>
                  <select
                    value={form.category || "support"}
                    onChange={(e) =>
                      updateForm.mutate({ id: form.id, category: e.target.value as "support" | "sales" })
                    }
                    className="text-xs border border-border rounded-lg px-2 py-1.5 bg-surface"
                  >
                    <option value="support">Asiakaspalvelu</option>
                    <option value="sales">Myynti</option>
                  </select>
                </div>

                {/* Notification toggle */}
                <button
                  onClick={() =>
                    updateForm.mutate({ id: form.id, notification_enabled: !form.notification_enabled })
                  }
                  className="flex items-center gap-1.5 text-xs"
                >
                  {form.notification_enabled ? (
                    <>
                      <Bell className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-green-700 font-medium">Ilmoitus päällä</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-3.5 h-3.5 text-text-muted" />
                      <span className="text-text-muted font-medium">Ilmoitus pois</span>
                    </>
                  )}
                </button>
              </div>

              {/* Email recipients */}
              {form.notification_enabled && (form.category || "support") === "sales" ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
                  <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <p className="text-xs text-blue-700">
                    Myyntilomakkeen ilmoitus lähetetään automaattisesti osoitetulle myyjälle.
                  </p>
                </div>
              ) : form.notification_enabled ? (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    Vastaanottajat:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(form.notification_emails || []).map((email, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-blue-50 text-blue-700 border border-blue-100"
                      >
                        {email}
                        <button
                          onClick={() => {
                            const updated = form.notification_emails.filter((_, j) => j !== i);
                            updateForm.mutate({
                              id: form.id,
                              notification_emails: updated,
                            });
                          }}
                          className="text-blue-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = newEmail.trim().toLowerCase();
                      if (!trimmed || !trimmed.includes("@")) return;
                      if (form.notification_emails?.includes(trimmed)) return;
                      updateForm.mutate({
                        id: form.id,
                        notification_emails: [...(form.notification_emails || []), trimmed],
                      });
                      setNewEmail("");
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Lisää sähköposti..."
                      className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface flex-1 min-w-0 max-w-xs"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand text-white hover:bg-brand/90 transition-colors"
                    >
                      Lisää
                    </button>
                  </form>
                </div>
              ) : null}
            </div>

            {/* Automations */}
            <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                Automaatiot
              </h3>
              <button
                onClick={handleNew}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand text-white hover:bg-brand/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Uusi automaatio
              </button>
            </div>

            {!automations?.length ? (
              <p className="text-sm text-text-muted py-2">Ei automaatioita. Luo ensimmäinen!</p>
            ) : (
              <div className="space-y-2">
                {automations.map((auto) => (
                  <AutomationCard
                    key={auto.id}
                    automation={auto}
                    onEdit={() => handleEdit(auto)}
                    onDelete={() => handleDelete(auto)}
                    onToggleActive={() =>
                      updateAutomation.mutate({ id: auto.id, is_active: !auto.is_active })
                    }
                  />
                ))}
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {editorOpen && (
        <AutomationEditor
          automation={editingAutomation}
          formId={form.id}
          fields={form.fields || []}
          onSave={handleSave}
          onClose={() => setEditorOpen(false)}
          saving={createAutomation.isPending || updateAutomation.isPending}
        />
      )}
    </>
  );
}
