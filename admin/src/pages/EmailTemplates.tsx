import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { Mail, FileText, Pencil, Trash2, Save, X, Plus, RotateCcw, ChevronDown, Paperclip, Copy, Send, Eye, Edit3 } from "lucide-react";
import { useAllEmailTemplates, useUpdateEmailTemplate, useCreateEmailTemplate, useDeleteEmailTemplate, useResetTemplateToDefault, useAddTemplateAttachment, useRemoveTemplateAttachment } from "@/hooks/sales/useSalesEmails";
import TiptapEditor from "@/components/email/TiptapEditor";
import { inputCls } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useEmployees } from "@/hooks/useEmployees";
import { useUserRole } from "@/context/UserRoleContext";
import type { SalesEmailTemplate } from "@/lib/sales-types";
import { formatEmailHtml } from "@/lib/email-styles";

const CATEGORY_LABELS: Record<string, string> = {
  booking: "Varaukset",
  contract: "Sopimukset",
  contact: "Yhteydenotot",
  sales: "Myynti",
  offer: "Tarjoukset",
  automation: "Automaatiot",
};

const CATEGORY_SENDER: Record<string, { sender: string; signature: string }> = {
  booking: { sender: "Lasikiilto (info@lasikiilto.fi)", signature: "Ei" },
  contract: { sender: "Lasikiilto (info@lasikiilto.fi)", signature: "Yrityksen" },
  contact: { sender: "Lasikiilto (info@lasikiilto.fi)", signature: "Ei" },
  sales: { sender: "Myyjän nimi", signature: "Myyjän" },
  offer: { sender: "Myyjän nimi", signature: "Myyjän" },
  automation: { sender: "Myyjän nimi", signature: "Myyjän" },
};

const CATEGORY_ORDER = ["booking", "contract", "contact", "sales", "offer", "automation"];

const PREVIEW_VARS: Record<string, string> = {
  customer_name: "Matti Meikäläinen",
  installer_name: "Ville Asentaja",
  service_name: "ILP huoltopesu",
  booking_date: "ke 15.3.2026",
  time_slot: "10:00",
  address: "Esimerkkikatu 12, 00100 Helsinki",
  postal_code: "00100",
  phone: "040 123 4567",
  booking_number: "1234",
  price: "280,00 €",
  duration: "1 h 30 min",
  notes: "Pihalla koira, soittakaa ennen tuloa.",
  customer_first_name: "Matti",
  seller_name: "Mikael Björkbacka",
  offer_link: "https://lasikiilto.fi/tarjous/esimerkki",
  validity_days: "14",
  contract_number: "5678",
  frequency: "2 kertaa vuodessa",
  visit_months: "Touko, Marras",
  start_date: "1.1.2026",
  end_date: "31.12.2026",
  signing_url: "#",
  info_rows: '<table style="width:100%"><tr><td style="color:#888;font-size:13px;padding:8px 0;border-bottom:1px solid #f3f4f6">Palvelu</td><td style="font-weight:600;font-size:14px;padding:8px 0;border-bottom:1px solid #f3f4f6">ILP huoltopesu</td></tr></table><table style="width:100%"><tr><td style="color:#888;font-size:13px;padding:8px 0;border-bottom:1px solid #f3f4f6">Ajankohta</td><td style="font-weight:600;font-size:14px;padding:8px 0;border-bottom:1px solid #f3f4f6">ke 15.3.2026 klo 10:00</td></tr></table>',
  notes_section: '<div style="background:#f8fafb;border-left:4px solid #1e3a8a;border-radius:0 8px 8px 0;padding:16px;margin-bottom:20px"><p style="color:#1e3a8a;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin:0 0 6px">Lisätiedot</p><p style="color:#374151;font-size:14px;margin:0">Pihalla koira, soittakaa ennen tuloa.</p></div>',
  receipt_rows: '<table style="width:100%"><tr><td style="font-size:14px;color:#374151;padding:8px 0;border-bottom:1px solid #f3f4f6">ILP huoltopesu</td><td style="text-align:right;font-weight:600;font-size:14px;padding:8px 0;border-bottom:1px solid #f3f4f6">280,00 €</td></tr></table>',
  line_items_section: "",
};

function substitutePreviewVars(html: string): string {
  return html.replace(/\{\{([\w:]+)\}\}/g, (_, key: string) => PREVIEW_VARS[key] ?? `{{${key}}}`);
}

const EMAIL_WRAPPER_CSS = `
  body { margin:0; padding:0; background:#eef1f6; font-family:'Outfit','Inter','Helvetica Neue',Arial,sans-serif; }
  .email-container { max-width:560px; margin:0 auto; padding:32px 16px; }
  .email-header { background:#1e3a8a; border-radius:16px 16px 0 0; padding:28px 32px; text-align:center; }
  .email-accent { height:3px; background:#3b82f6; }
  .email-body { background:#ffffff; padding:40px 32px; }
  .email-body p { margin:0 0 8px; line-height:1.5; font-size:14px; color:#374151; }
  .email-body p:empty { height:8px; }
  .email-footer { background:#1e3a8a; border-radius:0 0 16px 16px; padding:24px 32px; text-align:center; }
  .email-footer p { color:rgba(255,255,255,0.7); font-size:12px; margin:0 0 4px; }
  .email-footer a { color:rgba(255,255,255,0.5); text-decoration:none; }
`;

const CATEGORIES_WITH_WRAPPER = new Set(["booking", "contact", "contract"]);
const CATEGORIES_WITH_SELLER_SIG = new Set(["sales", "offer", "automation"]);
const CATEGORIES_WITH_COMPANY_SIG = new Set(["contract"]);

function buildPreviewHtml(bodyHtml: string, category: string): string {
  const resolved = substitutePreviewVars(bodyHtml);
  const logoUrl = "https://agductixsosmzcmzalfy.supabase.co/storage/v1/object/public/public-assets/logo-email.png";

  // Build signature preview
  let signatureHtml = "";
  if (CATEGORIES_WITH_SELLER_SIG.has(category)) {
    signatureHtml = `<p></p><p>Ystävällisin terveisin,<br><strong>Mikael Björkbacka</strong><br>Lasikiilto Oy<br>0456023730<br>mikael@lasikiilto.fi</p><p><img src="${logoUrl}" alt="Lasikiilto" width="120" style="margin-top:4px;" /></p>`;
  } else if (CATEGORIES_WITH_COMPANY_SIG.has(category)) {
    signatureHtml = `<p></p><p>Ystävällisin terveisin,<br><strong>Lasikiilto.fi</strong><br>045 875 5996<br>info@lasikiilto.fi</p><p><img src="${logoUrl}" alt="Lasikiilto" width="120" style="margin-top:4px;" /></p>`;
  }

  const contentWithSig = resolved + signatureHtml;

  if (CATEGORIES_WITH_WRAPPER.has(category)) {
    // Booking/contact/contract: full Lasikiilto wrapper
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${EMAIL_WRAPPER_CSS}</style>
</head><body>
<div class="email-container">
  <div class="email-header"><img src="https://agductixsosmzcmzalfy.supabase.co/storage/v1/object/public/public-assets/logo-email-white.png" alt="Lasikiilto" width="120" /></div>
  <div class="email-accent"></div>
  <div class="email-body">${contentWithSig}</div>
  <div class="email-footer"><p>Lasikiilto Oy</p><p><a href="mailto:info@lasikiilto.fi">info@lasikiilto.fi</a> · <a href="https://lasikiilto.fi">lasikiilto.fi</a></p></div>
</div>
</body></html>`;
  }

  // Sales/offer/automation: simple formatted email (no wrapper)
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:24px; background:#f8f9fa; font-family:'Outfit','Inter',Arial,sans-serif; font-size:14px; line-height:1.5; color:#374151; }
  p { margin:0 0 8px; }
  p:empty { height:8px; }
  a { color:#1e3a8a; }
</style>
</head><body>
${contentWithSig}
</body></html>`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EmailTemplates() {
  const { data: templates = [], isLoading } = useAllEmailTemplates();
  const updateMutation = useUpdateEmailTemplate();
  const createMutation = useCreateEmailTemplate();
  const deleteMutation = useDeleteEmailTemplate();
  const resetMutation = useResetTemplateToDefault();
  const addAttachmentMutation = useAddTemplateAttachment();
  const removeAttachmentMutation = useRemoveTemplateAttachment();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subjectTpl, setSubjectTpl] = useState("");
  const [bodyTpl, setBodyTpl] = useState("");
  const [newAttachments, setNewAttachments] = useState<{ file: File; base64: string }[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { employee } = useUserRole();

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] || cat,
    templates: templates.filter((t) => t.category === cat),
  })).filter((g) => g.templates.length > 0);

  function startEdit(tpl: SalesEmailTemplate) {
    setIsCreating(false);
    setEditingId(tpl.id);
    setName(tpl.name);
    setSubjectTpl(tpl.subject_template);
    setBodyTpl(tpl.body_template);
    setNewAttachments([]);
    setExpandedId(tpl.id);
  }

  function startCreate() {
    setEditingId(null);
    setIsCreating(true);
    setName("");
    setSubjectTpl("");
    setBodyTpl("");
    setNewAttachments([]);
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

  async function handleReset(id: string) {
    try {
      await resetMutation.mutateAsync(id);
      toast("Pohja palautettu oletukseksi");
      cancelEdit();
    } catch {
      toast("Virhe palautuksessa", "error");
    }
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      setNewAttachments((prev) => [...prev, { file, base64 }]);
    }
    e.target.value = "";
  }

  function insertVariable(variable: string) {
    // Copy variable to clipboard for manual insertion
    navigator.clipboard.writeText(`{{${variable}}}`);
    toast(`{{${variable}}} kopioitu leikepöydälle`);
  }

  async function handleSendTest(tpl: SalesEmailTemplate) {
    const target = testEmail.trim() || user?.email;
    if (!target) { toast("Syötä sähköpostiosoite", "error"); return; }
    setSendingTestId(tpl.id);
    try {
      const senderInfo = CATEGORY_SENDER[tpl.category];
      const useSellerSig = senderInfo?.signature === "Myyjän";
      const useCompanySig = senderInfo?.signature === "Yrityksen";

      // Determine sender email and name based on category
      const currentEmployee = employee;
      const senderEmail = (useSellerSig && currentEmployee?.email) ? currentEmployee.email : "info@lasikiilto.fi";
      const senderName = (useSellerSig && currentEmployee) ? `${currentEmployee.first_name} ${currentEmployee.last_name}`.trim() : "Lasikiilto";

      // All templates (including booking) are rendered locally with preview
      // variables and sent as a plain "sales" email to the test address.
      // This ensures NO real booking/customer data is ever used.
      {
        // Build body with signature
        let body = substitutePreviewVars(tpl.body_template || "");

        if (useSellerSig && currentEmployee) {
          // Fetch seller signature from DB
          const { data: sigRow } = await supabase
            .from("sales_email_signatures")
            .select("signature_html")
            .eq("employee_id", currentEmployee.id)
            .maybeSingle();
          const sig = sigRow?.signature_html || defaultSignatureHtml(currentEmployee);
          body += `<p></p>${sig}`;
        } else if (useCompanySig) {
          const { data: settings } = await supabase.from("company_settings").select("company_signature_html").limit(1).single();
          const sig = settings?.company_signature_html || defaultCompanySignatureHtml();
          body += `<p></p>${sig}`;
        }

        await supabase.from("email_outbox").insert({
          type: "sales",
          sender_email: senderEmail,
          payload: {
            to: [target],
            subject: `[TESTI] ${substitutePreviewVars(tpl.subject_template || tpl.name)}`,
            body_html: formatEmailHtml(body),
            sender_name: senderName,
          },
          status: "pending",
          scheduled_at: new Date().toISOString(),
        });
      }
      toast(`Testisähköposti lähetetty: ${target}`);
    } catch {
      toast("Lähetys epäonnistui", "error");
    } finally {
      setSendingTestId(null);
    }
  }

  const editingTemplate = editingId ? templates.find((t) => t.id === editingId) : null;
  const isSaving = createMutation.isPending || updateMutation.isPending || addAttachmentMutation.isPending;

  return (
    <div className="max-w-3xl px-1">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="w-5 h-5 text-accent flex-shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary truncate">Sähköpostipohjat</h1>
        </div>
        {!isCreating && !editingId && (
          <button onClick={startCreate} className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80">
            <Plus className="w-3.5 h-3.5" /> Lisää pohja
          </button>
        )}
      </div>

      <p className="text-xs text-text-muted mb-6">
        Kaikki järjestelmän sähköpostipohjat yhdessä paikassa: varaukset, sopimukset, yhteydenotot, myynti, tarjoukset ja automaatiot. Järjestelmäpohjia ei voi poistaa, mutta niitä voi muokata ja palauttaa oletukseksi.
      </p>

      {/* Create / Edit form */}
      {(isCreating || editingId) && (
        <div className="border border-accent/20 bg-accent/5 rounded-xl p-4 space-y-3 mb-6">
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Pohjan nimi</label>
            <input
              className={`${inputCls} mt-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="esim. Varausvahvistus"
              disabled={editingTemplate?.is_system}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Otsikko</label>
            <input
              className={`${inputCls} mt-1`}
              value={subjectTpl}
              onChange={(e) => setSubjectTpl(e.target.value)}
              placeholder="Sähköpostin otsikko (tukee {{muuttujia}})"
            />
          </div>

          {/* Variable chips */}
          {editingTemplate?.available_variables && editingTemplate.available_variables.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Käytettävissä olevat muuttujat</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {editingTemplate.available_variables.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => insertVariable(v.key)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                    title={`Kopioi {{${v.key}}} leikepöydälle`}
                  >
                    <Copy className="w-2.5 h-2.5" />
                    {`{{${v.key}}}`}
                    <span className="font-sans text-blue-500 ml-0.5">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
          {editingTemplate?.email_template_attachments && editingTemplate.email_template_attachments.filter((a) => !a.quote_template_id).length > 0 && (
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
          {!editingTemplate?.is_system && (
            <div className="space-y-2">
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs text-accent font-medium hover:underline">
                <Paperclip className="w-3 h-3" /> Lisää liite
              </button>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={handleAttachFile} />
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
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1 flex-wrap">
            <button
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
            >
              {isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
              {isCreating ? "Luo pohja" : "Tallenna"}
            </button>
            {editingTemplate?.is_system && editingTemplate.default_body && (
              <button
                onClick={() => handleReset(editingTemplate.id)}
                disabled={resetMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 border border-amber-300 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-50 disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" /> Palauta oletukseksi
              </button>
            )}
            <button onClick={cancelEdit} className="px-4 py-1.5 border border-border rounded-lg text-xs text-text-muted hover:text-text-primary">
              Peruuta
            </button>
          </div>
        </div>
      )}

      {/* Template list grouped by category */}
      {isLoading ? (
        <div className="py-8 text-center">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.category}>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                {group.label}
              </h2>

              {group.templates.length > 0 ? (
                <div className="space-y-2">
                  {group.templates.map((tpl) => (
                    <div key={tpl.id} className="border border-border rounded-xl bg-surface overflow-hidden">
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-bg-secondary/50 transition-colors"
                        onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <FileText className="w-4 h-4 text-accent flex-shrink-0" />
                            <span className="text-sm font-medium truncate">{tpl.name}</span>
                            {tpl.is_system && (
                              <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-600 border border-blue-200 rounded flex-shrink-0">
                                Järjestelmä
                              </span>
                            )}
                            {tpl.email_template_attachments && tpl.email_template_attachments.filter((a) => !a.quote_template_id).length > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-text-muted flex-shrink-0">
                                <Paperclip className="w-3 h-3" /> {tpl.email_template_attachments.filter((a) => !a.quote_template_id).length}
                              </span>
                            )}
                            {CATEGORY_SENDER[tpl.category] && (
                              <>
                                <span className="hidden sm:inline-flex text-[10px] text-text-muted font-medium px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 flex-shrink-0">
                                  <Mail className="w-3 h-3 inline-block mr-0.5 -mt-0.5" />
                                  {CATEGORY_SENDER[tpl.category].sender}
                                </span>
                                <span className={`hidden sm:inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${
                                  CATEGORY_SENDER[tpl.category].signature === "Ei"
                                    ? "bg-gray-50 text-text-muted border-gray-200"
                                    : "bg-accent/10 text-accent border-accent/20"
                                }`}>
                                  <Edit3 className="w-3 h-3 inline-block mr-0.5 -mt-0.5" />
                                  {CATEGORY_SENDER[tpl.category].signature === "Ei" ? "Ei allekirjoitusta" : `${CATEGORY_SENDER[tpl.category].signature} allekirjoitus`}
                                </span>
                              </>
                            )}
                          </div>
                          {tpl.description && (
                            <p className="text-[11px] text-text-muted mt-0.5 ml-6">{tpl.description}</p>
                          )}
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
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {!tpl.is_system && (
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
                          )}
                          <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${expandedId === tpl.id ? "rotate-180" : ""}`} />
                        </div>
                      </div>

                      {/* Expanded: preview + test */}
                      {expandedId === tpl.id && editingId !== tpl.id && (
                        <div className="border-t border-border">
                          {/* Action bar */}
                          <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-bg-secondary/50 flex-wrap">
                            <button
                              onClick={() => setPreviewId(previewId === tpl.id ? null : tpl.id)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${previewId === tpl.id ? "bg-accent text-white" : "text-text-muted hover:text-accent hover:bg-accent/10"}`}
                            >
                              <Eye className="w-3 h-3" /> Esikatselu
                            </button>
                            <div className="flex-1 min-w-0" />
                            <input
                              type="email"
                              value={testEmail}
                              onChange={(e) => setTestEmail(e.target.value)}
                              placeholder={user?.email || "testi@esimerkki.fi"}
                              className="w-full sm:w-48 px-2 py-1 rounded-lg border border-border text-xs bg-white focus:outline-none focus:ring-1 focus:ring-accent/30"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSendTest(tpl); }}
                              disabled={sendingTestId === tpl.id}
                              className="flex items-center gap-1 px-3 py-1 bg-brand text-white rounded-lg text-xs font-semibold hover:bg-brand/90 disabled:opacity-50 flex-shrink-0"
                            >
                              {sendingTestId === tpl.id ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-3 h-3" />}
                              Testaa
                            </button>
                            <span className="text-[10px] text-text-muted">Lähetetään vain yllä olevaan osoitteeseen</span>
                          </div>

                          {/* Template body (always visible when expanded) */}
                          <div className="px-4 pb-3">
                            {tpl.body_template ? (
                              <div className="mt-3 text-xs font-mono bg-bg-secondary rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-text-secondary" style={{ maxHeight: 200 }}>
                                {tpl.body_template}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs text-text-muted italic">Ei sisältöä</p>
                            )}
                          </div>

                          {/* Visual preview in iframe */}
                          {previewId === tpl.id && tpl.body_template && (
                            <div className="px-4 pb-4">
                              <iframe
                                srcDoc={buildPreviewHtml(tpl.body_template, tpl.category)}
                                title="Email preview"
                                className="w-full border border-border rounded-xl bg-white"
                                style={{ height: 600 }}
                                sandbox=""
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center border border-dashed border-border rounded-xl">
                  <p className="text-xs text-text-muted">Ei pohjia</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Signatures section */}
      <SignaturesSection />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SIGNATURES SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function defaultCompanySignatureHtml(): string {
  const logoUrl = "https://agductixsosmzcmzalfy.supabase.co/storage/v1/object/public/public-assets/logo-email.png";
  return `<p>Ystävällisin terveisin,<br><strong>Lasikiilto.fi</strong><br>045 875 5996<br>info@lasikiilto.fi</p><p><img src="${logoUrl}" alt="Lasikiilto" width="120" style="margin-top:4px;" /></p>`;
}

function defaultSignatureHtml(emp: { first_name: string; last_name: string; email: string; phone?: string | null }): string {
  const logoUrl = "https://agductixsosmzcmzalfy.supabase.co/storage/v1/object/public/public-assets/logo-email.png";
  const lines = [
    "Ystävällisin terveisin,",
    `<strong>${emp.first_name} ${emp.last_name}</strong>`,
    "Lasikiilto Oy",
  ];
  if (emp.phone) lines.push(emp.phone);
  lines.push(emp.email);
  return `<p>${lines.join("<br>")}</p><p><img src="${logoUrl}" alt="Lasikiilto" width="120" style="margin-top:4px;" /></p>`;
}

function SignaturesSection() {
  const { data: employees = [] } = useEmployees();
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [companySignature, setCompanySignature] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHtml, setEditHtml] = useState("");
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyEditHtml, setCompanyEditHtml] = useState("");
  const toast = useToast();

  useEffect(() => {
    (async () => {
      const { data: sigs } = await supabase.from("sales_email_signatures").select("employee_id, signature_html");
      if (sigs) {
        const map: Record<string, string> = {};
        for (const s of sigs) map[s.employee_id] = s.signature_html;
        setSignatures(map);
      }
      const { data: settings } = await supabase.from("company_settings").select("company_signature_html").limit(1).single();
      if (settings?.company_signature_html) setCompanySignature(settings.company_signature_html);
    })();
  }, []);

  const sellers = employees.filter((e) => e.roles?.includes("seller") || e.roles?.includes("admin"));

  const saveSignature = async (employeeId: string, html: string) => {
    const { error } = await supabase.from("sales_email_signatures").upsert(
      { employee_id: employeeId, signature_html: html, updated_at: new Date().toISOString() },
      { onConflict: "employee_id" },
    );
    if (error) { toast("Tallennusvirhe", "error"); return; }
    setSignatures((prev) => ({ ...prev, [employeeId]: html }));
    setEditingId(null);
    toast("Allekirjoitus tallennettu");
  };

  const saveCompanySignature = async (html: string) => {
    const { error } = await supabase.from("company_settings").update({ company_signature_html: html }).not("id", "is", null);
    if (error) { toast("Tallennusvirhe", "error"); return; }
    setCompanySignature(html);
    setEditingCompany(false);
    toast("Yrityksen allekirjoitus tallennettu");
  };

  return (
    <div className="mt-12 space-y-6">
      <div className="border-t border-border pt-8">
        <div className="flex items-center gap-2 mb-6">
          <Edit3 className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-bold text-text-primary">Allekirjoitukset</h2>
        </div>

        {/* Company signature */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Yrityksen allekirjoitus (info@lasikiilto.fi)</h3>
          <p className="text-xs text-text-muted mb-3">Käytetään sopimussähköposteissa ja muissa yrityksen nimellä lähtevissä viesteissä.</p>
          <div className="bg-surface rounded-xl border border-border p-4">
            {editingCompany ? (
              <div className="space-y-3">
                <TiptapEditor content={companyEditHtml} onChange={setCompanyEditHtml} />
                <div className="flex gap-2">
                  <button onClick={() => saveCompanySignature(companyEditHtml)} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold"><Save size={14} /> Tallenna</button>
                  <button onClick={() => setEditingCompany(false)} className="px-3 py-1.5 text-text-muted text-xs hover:text-text">Peruuta</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="text-sm text-text-muted" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(companySignature || defaultCompanySignatureHtml()) }} />
                <button onClick={() => { setCompanyEditHtml(companySignature || defaultCompanySignatureHtml()); setEditingCompany(true); }} className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:underline"><Edit3 size={12} /> Muokkaa</button>
              </div>
            )}
          </div>
        </div>

        {/* Seller signatures */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Myyjien allekirjoitukset</h3>
          <p className="text-xs text-text-muted mb-3">Käytetään tarjous-, myynti- ja automaatiosähköposteissa jotka lähtevät myyjän nimellä.</p>
          <div className="space-y-3">
            {sellers.map((emp) => {
              const sig = signatures[emp.id] || "";
              const isEditing = editingId === emp.id;
              return (
                <div key={emp.id} className="bg-surface rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-text-primary">{emp.first_name} {emp.last_name}</span>
                      <span className="text-xs text-text-muted ml-2 hidden sm:inline">{emp.email}</span>
                      <span className="text-xs text-text-muted block sm:hidden truncate">{emp.email}</span>
                    </div>
                    {!isEditing && (
                      <button onClick={() => { setEditingId(emp.id); setEditHtml(sig || defaultSignatureHtml(emp)); }} className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:underline"><Edit3 size={12} /> Muokkaa</button>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="space-y-3">
                      <TiptapEditor content={editHtml} onChange={setEditHtml} />
                      <div className="flex gap-2">
                        <button onClick={() => saveSignature(emp.id, editHtml)} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold"><Save size={14} /> Tallenna</button>
                        <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-text-muted text-xs hover:text-text">Peruuta</button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-text-muted" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sig || defaultSignatureHtml(emp)) }} />
                  )}
                </div>
              );
            })}
            {sellers.length === 0 && <p className="text-sm text-text-muted">Ei myyjiä.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
