import { useState, useRef, useMemo, useEffect } from "react";
import { Send, X, Paperclip, Pen, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSendEmail, useEmailSignature, useUpdateEmailSignature, useEmailTemplates } from "@/hooks/sales/useSalesEmails";
import type { SalesEmailTemplate } from "@/lib/sales-types";
import type { Employee } from "@/lib/types";
import { useToast } from "@/context/ToastContext";

import TiptapEditor from "./TiptapEditor";
import TemplateManager from "./TemplateManager";
import { fileToBase64, formatFileSize } from "./email-utils";

export interface ComposeState {
  mode: "new" | "reply" | "forward";
  to: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  threadId?: string;
}

export default function ComposeModal({ state, onClose, senderEmail, senderName, employeeId, employee, category }: {
  state: ComposeState;
  onClose: () => void;
  senderEmail: string;
  senderName: string;
  employeeId?: string;
  employee?: Employee | null;
  category?: string;
}) {
  const [to, setTo] = useState(state.to);
  const [cc, setCc] = useState(state.cc || "");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(state.subject);
  const [body, setBody] = useState(state.body);
  const [showCc, setShowCc] = useState(!!state.cc);
  const [showBcc, setShowBcc] = useState(false);
  const [showSignatureEditor, setShowSignatureEditor] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<{ file: File; base64: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendMutation = useSendEmail();
  const toast = useToast();
  const { data: signature } = useEmailSignature(employeeId, employee);
  const updateSignature = useUpdateEmailSignature();
  const [sigDraft, setSigDraft] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const { data: allTemplates } = useEmailTemplates(employeeId);
  const templates = useMemo(() => {
    if (!allTemplates) return allTemplates;
    if (!category) return allTemplates;
    return allTemplates.filter((t) => t.category === category);
  }, [allTemplates, category]);
  const [editorKey, setEditorKey] = useState(0);

  const initialContent = useMemo(() => {
    const bodyPart = state.body || "";
    if (signature) {
      return `${bodyPart}<p></p><p></p>${signature}`;
    }
    return bodyPart;
  }, [state.body, signature]);

  async function applyTemplate(tpl: SalesEmailTemplate) {
    if (tpl.subject_template) setSubject(tpl.subject_template);
    setBody(tpl.body_template);
    setEditorKey((k) => k + 1);
    if (tpl.email_template_attachments && tpl.email_template_attachments.length > 0) {
      const newAttachments: { file: File; base64: string }[] = [];
      for (const att of tpl.email_template_attachments) {
        if (att.quote_template_id || !att.storage_path) continue;
        const { data } = await supabase.storage
          .from("email-template-attachments")
          .download(att.storage_path);
        if (data) {
          const file = new File([data], att.filename, { type: att.mime_type });
          const base64 = await fileToBase64(file);
          newAttachments.push({ file, base64 });
        }
      }
      if (newAttachments.length > 0) setAttachments((prev) => [...prev, ...newAttachments]);
    }
    setShowTemplates(false);
  }

  // Contact autocomplete
  const [toSuggestions, setToSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (to.length < 2 || to.includes(",")) { setShowSuggestions(false); return; }
    const lastPart = to.split(",").pop()?.trim() || "";
    if (lastPart.length < 2) { setShowSuggestions(false); return; }
    supabase
      .from("sales_emails")
      .select("from_address, from_name")
      .ilike("from_address", `%${lastPart}%`)
      .limit(5)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const unique = [...new Set(data.map((d: { from_address: string }) => d.from_address))];
          setToSuggestions(unique as string[]);
          setShowSuggestions(true);
        } else {
          setShowSuggestions(false);
        }
      });
  }, [to]);

  async function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast(`Tiedosto "${file.name}" on liian suuri (max 25 MB)`);
        continue;
      }
      const base64 = await fileToBase64(file);
      setAttachments((prev) => [...prev, { file, base64 }]);
    }
    e.target.value = "";
  }

  async function handleSend() {
    if (!to.trim() || !subject.trim()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const toList = to.split(",").map((t) => t.trim()).filter(Boolean);
    const ccList = cc ? cc.split(",").map((c) => c.trim()).filter(Boolean) : [];
    const bccList = bcc ? bcc.split(",").map((b) => b.trim()).filter(Boolean) : [];
    const invalidEmails = [...toList, ...ccList, ...bccList].filter((e) => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      toast(`Virheellinen sähköpostiosoite: ${invalidEmails[0]}`);
      return;
    }

    setSending(true);

    try {
      await sendMutation.mutateAsync({
        to: toList,
        cc: ccList.length > 0 ? ccList : undefined,
        bcc: bccList.length > 0 ? bccList : undefined,
        subject,
        body_html: body || "<p></p>",
        sender_email: senderEmail,
        sender_name: senderName,
        in_reply_to: state.inReplyTo,
        thread_id: state.threadId,
        employee_id: employeeId,
        attachments: attachments.length > 0
          ? attachments.map((a) => ({ filename: a.file.name, base64: a.base64, mimeType: a.file.type || "application/octet-stream" }))
          : undefined,
      });
      onClose();
    } catch (err) {
      console.error("Send failed:", err);
      toast("Viestin lähetys epäonnistui");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] md:max-h-[85vh] flex flex-col mx-auto sm:mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">
            {state.mode === "reply" ? "Vastaa" : state.mode === "forward" ? "Välitä" : "Uusi sähköposti"}
          </h3>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fields */}
        <div className="px-4 py-2 space-y-1 border-b border-border">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted shrink-0 text-xs">Lähettäjä</span>
            <span className="text-text-primary font-medium text-xs">{senderEmail}</span>
          </div>
          <div className="flex items-center gap-2 text-sm relative">
            <span className="text-text-muted shrink-0 text-xs">Vastaanottaja</span>
            <input
              className="flex-1 py-1 text-sm outline-none"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onFocus={() => to.length >= 2 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="email@esimerkki.fi"
            />
            {!showCc && (
              <button type="button" onClick={() => setShowCc(true)} className="text-[10px] text-accent">Cc</button>
            )}
            {!showBcc && (
              <button type="button" onClick={() => setShowBcc(true)} className="text-[10px] text-accent">Bcc</button>
            )}
            {showSuggestions && toSuggestions.length > 0 && (
              <div className="absolute left-0 sm:left-20 top-full bg-white border border-border rounded-lg shadow-lg py-1 w-full sm:w-64 z-10">
                {toSuggestions.map((s) => (
                  <button type="button"
                    key={s}
                    onMouseDown={() => {
                      const parts = to.split(",");
                      parts[parts.length - 1] = s;
                      setTo(parts.join(", ") + ", ");
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-secondary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showCc && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted w-20 text-xs">Kopio</span>
              <input className="flex-1 py-1 text-sm outline-none" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="email@esimerkki.fi" />
            </div>
          )}
          {showBcc && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted w-20 text-xs">Piilokopio</span>
              <input className="flex-1 py-1 text-sm outline-none" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="email@esimerkki.fi" />
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted w-20 text-xs">Aihe</span>
            <input className="flex-1 py-1 text-sm outline-none" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Aihe" />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <TiptapEditor
            key={editorKey}
            content={editorKey > 0 ? `${body}<p></p><p></p>${signature || ""}` : initialContent}
            placeholder="Kirjoita viestisi..."
            onChange={(html) => setBody(html)}
          />
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="px-4 py-2 border-t border-border flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-bg-secondary rounded-lg text-xs">
                <Paperclip className="w-3 h-3 text-text-muted" />
                <span className="truncate max-w-[150px]">{att.file.name}</span>
                <span className="text-text-muted">{formatFileSize(att.file.size)}</span>
                <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-text-muted hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Signature editor */}
        {showSignatureEditor && (
          <div className="px-4 py-3 border-t border-border space-y-2">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Muokkaa allekirjoitusta</p>
            <TiptapEditor
              content={sigDraft || signature || ""}
              placeholder="Kirjoita allekirjoituksesi..."
              onChange={(html) => setSigDraft(html)}
              autofocus={false}
            />
            <div className="flex gap-2">
              <button type="button"
                onClick={async () => {
                  if (employeeId) {
                    await updateSignature.mutateAsync({ employeeId, html: sigDraft });
                  }
                  setShowSignatureEditor(false);
                }}
                className="text-[10px] px-3 py-1 rounded-lg bg-accent text-white"
              >
                Tallenna
              </button>
              <button type="button" onClick={() => setShowSignatureEditor(false)} className="text-[10px] px-3 py-1 rounded-lg border border-border text-text-muted">
                Peruuta
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <button type="button"
              onClick={handleSend}
              disabled={sending || !to.trim()}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
            >
              {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline">{sending ? "Lähetetään..." : "Lähetä"}</span>
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary" title="Liitä tiedosto">
              <Paperclip className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleAttach} />
            <button type="button" onClick={() => { setSigDraft(signature || ""); setShowSignatureEditor(!showSignatureEditor); }} className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary" title="Muokkaa allekirjoitusta">
              <Pen className="w-4 h-4" />
            </button>
            {/* Template picker */}
            <div className="relative">
              <button type="button"
                onClick={() => setShowTemplates(!showTemplates)}
                className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary"
                title="Sähköpostipohjat"
              >
                <FileText className="w-4 h-4" />
              </button>
              {showTemplates && (
                <div className="absolute left-0 sm:left-0 bottom-full mb-1 bg-white border border-border rounded-xl shadow-lg py-1 w-[calc(100vw-3rem)] sm:w-64 max-w-64 z-20 max-h-72 overflow-y-auto">
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Sähköpostipohjat</span>
                    <button type="button"
                      onClick={() => { setShowTemplates(false); setShowTemplateManager(true); }}
                      className="text-[10px] text-accent font-medium hover:underline"
                    >
                      Hallitse
                    </button>
                  </div>
                  {templates && templates.length > 0 ? (
                    templates.map((tpl) => (
                      <button type="button"
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl)}
                        className="w-full text-left px-3 py-2 hover:bg-bg-secondary transition-colors"
                      >
                        <p className="text-xs font-medium text-text-primary truncate">{tpl.name}</p>
                        {tpl.subject_template && (
                          <p className="text-[10px] text-text-muted truncate">{tpl.subject_template}</p>
                        )}
                        {tpl.email_template_attachments && tpl.email_template_attachments.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Paperclip className="w-2.5 h-2.5 text-text-muted" />
                            <span className="text-[9px] text-text-muted">{tpl.email_template_attachments.length} liitettä</span>
                          </div>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-center">
                      <p className="text-xs text-text-muted">Ei pohjia vielä</p>
                      <button type="button"
                        onClick={() => { setShowTemplates(false); setShowTemplateManager(true); }}
                        className="text-xs text-accent mt-1 hover:underline"
                      >
                        Luo ensimmäinen pohja
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text-primary">
            Hylkää
          </button>
        </div>

        {/* Template manager modal */}
        {showTemplateManager && employeeId && (
          <TemplateManager
            employeeId={employeeId}
            onClose={() => setShowTemplateManager(false)}
            category={category}
          />
        )}
      </div>
    </div>
  );
}
