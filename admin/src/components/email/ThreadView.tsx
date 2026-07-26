import { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Mail,
  Tag,
  Archive,
  Trash2,
  CheckCircle2,
  Briefcase,
  Loader2,
  ChevronDown,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  X,
  Send,
  UserPlus,
} from "lucide-react";
import {
  useArchiveThread,
  useTrashThread,
  useMarkRead,
  useModifyLabel,
  useSendEmail,
  useEmailSignature,
  useContactPhotos,
  emailToColor,
  useCreateDealFromThread,
} from "@/hooks/sales/useSalesEmails";
import type { SalesEmail, GmailLabel } from "@/lib/sales-types";
import type { Employee } from "@/lib/types";
import type { CSTicket, CSTicketEvent } from "@/lib/cs-types";
import { formatDateTime } from "@/lib/utils";
import TiptapEditor from "./TiptapEditor";
import MessageAttachments from "./MessageAttachments";
import EmailBodyWithCid from "./EmailBodyWithCid";
import { useToast } from "@/context/ToastContext";
import { formatEmailHtml, COMPANY_EMAIL } from "@/lib/email-styles";
import { fileToBase64, formatFileSize } from "./email-utils";
// CS components (lazy-loaded to avoid circular deps for SellerEmail)
import { TicketStatusBadge } from "@/components/customer-service/TicketStatusBadge";
import { TicketPriorityBadge } from "@/components/customer-service/TicketPriorityBadge";
import { SLAIndicator } from "@/components/customer-service/SLAIndicator";
import { TicketSidebar } from "@/components/customer-service/TicketSidebar";
import { CustomerContextPanel } from "@/components/customer-service/CustomerContextPanel";
import { TicketTimeline } from "@/components/customer-service/TicketTimeline";
import { TicketReplyComposer } from "@/components/customer-service/TicketReplyComposer";
import { AIDraftCard } from "@/components/customer-service/AIDraftCard";
import { useAssignTicket } from "@/hooks/customer-service/useTicketDetail";

export default function ThreadView({ messages, threadId, onBack, onReply, allLabels, senderEmail, senderName, employeeId, employee, ticket, ticketEvents, onTicketUpdate, mode = "email" }: {
  messages: SalesEmail[];
  threadId: string;
  onBack: () => void;
  onReply: (msg: SalesEmail, mode?: "reply" | "reply_all" | "forward") => void;
  allLabels: GmailLabel[];
  senderEmail: string;
  senderName: string;
  employeeId?: string;
  employee?: Employee | null;
  ticket?: CSTicket | null;
  ticketEvents?: CSTicketEvent[];
  onTicketUpdate?: () => void;
  mode?: "email" | "cs";
}) {
  const isCS = mode === "cs" && !!ticket;
  const archiveMutation = useArchiveThread();
  const trashMutation = useTrashThread();
  const markReadMutation = useMarkRead();
  const modifyLabelMutation = useModifyLabel();
  const sendMutation = useSendEmail();
  const { data: signature } = useEmailSignature(employeeId, employee);
  const contactEmails = useMemo(() => messages.map((m) => m.from_address), [messages]);
  const { data: contactPhotos } = useContactPhotos(contactEmails);
  const toast = useToast();
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [inlineReply, setInlineReply] = useState<{ to: string; cc: string; subject: string; inReplyTo: string } | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<{ file: File; base64: string }[]>([]);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  function showFeedback(msg: string, _isError?: boolean) {
    setActionFeedback(msg);
    toast(msg);
    setTimeout(() => setActionFeedback(null), 2000);
  }
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ─── Create deal from thread ─────────────────────────────────────────────
  const createDealMutation = useCreateDealFromThread();
  const linkedOpportunityId = messages.find((m) => m.opportunity_id)?.opportunity_id;
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const inboundMsg = messages.find((m) => m.is_inbound);
  const [dealForm, setDealForm] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "", postcode: "", city: "", notes: "" });

  // Default expand the latest message
  const latestId = messages[messages.length - 1]?.id;

  // Auto-mark as read (once, via useEffect)
  const unreadIds = messages.filter((m) => !m.is_read).map((m) => m.id);
  const unreadKey = unreadIds.join(",");
  useEffect(() => {
    if (unreadIds.length > 0) {
      unreadIds.forEach((id) => markReadMutation.mutate({ id, read: true }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const subject = messages[0]?.subject || "(ei otsikkoa)";

  // CS mode: assign ticket mutation
  const assignTicket = useAssignTicket();

  // CS mode: interleaved timeline (emails + ticket events)
  const csTimeline = useMemo(() => {
    if (!isCS || !ticketEvents) return [];
    // Non-email events only (emails are rendered via messages list)
    return ticketEvents.filter(
      (ev) => ev.type !== "email_inbound" && ev.type !== "email_outbound"
    );
  }, [isCS, ticketEvents]);

  // CS mode: AI draft
  const latestAIDraft = useMemo(() => {
    if (!ticketEvents) return null;
    return [...ticketEvents].reverse().find((ev) => ev.type === "ai_draft") ?? null;
  }, [ticketEvents]);

  // CS mode: last inbound email event for TicketReplyComposer
  const lastInboundEvent = useMemo(() => {
    if (!ticketEvents) return null;
    return [...ticketEvents].reverse().find((ev) => ev.type === "email_inbound") ?? null;
  }, [ticketEvents]);

  // CS mode: reply body from AI draft
  const [csReplyInitialBody, setCsReplyInitialBody] = useState("");

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-3 md:px-4 py-2 md:py-3 border-b border-border flex items-center gap-2 md:gap-3">
        <button type="button" onClick={onBack} className="text-text-muted hover:text-text-primary active:scale-90 transition-all p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {isCS && (
          <span className="text-xs text-text-muted font-mono shrink-0">#{ticket.ticket_number}</span>
        )}
        <h2 className="text-xs md:text-sm font-semibold text-text-primary flex-1 truncate">{subject}</h2>
        {isCS && (
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <TicketStatusBadge status={ticket.status} />
            <span className="hidden sm:inline"><TicketPriorityBadge priority={ticket.priority} /></span>
            <span className="hidden md:inline"><SLAIndicator ticket={ticket} /></span>
            {!ticket.assigned_agent_id && employeeId && (
              <button
                type="button"
                onClick={() => assignTicket.mutate({ ticketId: ticket.id, agentId: employeeId, actorId: employeeId })}
                disabled={assignTicket.isPending}
                className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs font-medium text-accent bg-accent/10 rounded-lg hover:bg-accent/20 transition-colors disabled:opacity-50"
              >
                <UserPlus className="w-3.5 h-3.5" /> <span className="hidden md:inline">Ota hoitoon</span>
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button"
            onClick={() => {
              const allRead = messages.every((m) => m.is_read);
              messages.forEach((m) => markReadMutation.mutate({ id: m.id, read: !allRead }));
              showFeedback(allRead ? "Merkitty lukemattomaksi" : "Merkitty luetuksi");
            }}
            disabled={markReadMutation.isPending}
            className="p-1.5 rounded-lg text-text-muted hover:bg-bg-secondary active:scale-90 transition-all disabled:opacity-50"
            title={messages.every((m) => m.is_read) ? "Merkitse lukemattomaksi" : "Merkitse luetuksi"}
          >
            <Mail className="w-4 h-4" />
          </button>
          <div className="relative">
            <button type="button" onClick={() => setShowLabelPicker(!showLabelPicker)} className="p-1.5 rounded-lg text-text-muted hover:bg-bg-secondary" title="Tunnisteet">
              <Tag className="w-4 h-4" />
            </button>
            {showLabelPicker && allLabels.length > 0 && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg py-1 w-48 z-10 max-h-60 overflow-y-auto">
                {allLabels.map((label) => {
                  const hasLabel = messages.some((m) => m.labels.includes(label.gmail_label_id));
                  return (
                    <button type="button"
                      key={label.id}
                      onClick={() => {
                        const action = hasLabel ? "remove_label" : "add_label";
                        messages.forEach((m) => modifyLabelMutation.mutate({ emailId: m.id, action, labelId: label.gmail_label_id }));
                        setShowLabelPicker(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-bg-secondary text-left"
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.background_color || "#9ca3af" }} />
                      <span className="flex-1 truncate">{label.name.includes("/") ? label.name.split("/").pop() : label.name}</span>
                      {hasLabel && <span className="text-accent font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Create deal / linked badge */}
          {linkedOpportunityId ? (
            <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-medium flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" /> Liitetty kauppaan
            </span>
          ) : (
            <button type="button"
              onClick={() => {
                const nameParts = (inboundMsg?.from_name || "").split(/\s+/);
                setDealForm({
                  firstName: nameParts[0] || "",
                  lastName: nameParts.slice(1).join(" ") || "",
                  email: inboundMsg?.from_address || "",
                  phone: "", address: "", postcode: "", city: "", notes: "",
                });
                setShowCreateDeal(true);
              }}
              className="p-1.5 rounded-lg text-text-muted hover:bg-bg-secondary active:scale-90 transition-all"
              title="Luo diili"
            >
              <Briefcase className="w-4 h-4" />
            </button>
          )}
          <button type="button"
            onClick={() => { archiveMutation.mutate(threadId); showFeedback("Arkistoitu"); onBack(); }}
            disabled={archiveMutation.isPending}
            className="p-1.5 rounded-lg text-text-muted hover:bg-bg-secondary active:scale-90 transition-all disabled:opacity-50"
            title="Arkistoi"
          >
            {archiveMutation.isPending ? <div className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" /> : <Archive className="w-4 h-4" />}
          </button>
          <button type="button"
            onClick={() => { trashMutation.mutate(threadId); showFeedback("Siirretty roskakoriin"); onBack(); }}
            disabled={trashMutation.isPending}
            className="p-1.5 rounded-lg text-text-muted hover:bg-bg-secondary hover:text-red-500 active:scale-90 transition-all disabled:opacity-50"
            title="Poista"
          >
            {trashMutation.isPending ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionFeedback && (
        <div className="mx-4 mt-2 px-3 py-2 bg-accent/10 text-accent text-xs font-medium rounded-lg animate-in fade-in duration-200 text-center">
          {actionFeedback}
        </div>
      )}

      {/* Content — two-column in CS mode (stacks on mobile) */}
      <div className={`flex-1 flex overflow-hidden ${isCS ? "flex-col md:flex-row" : "flex-col"}`}>
      {/* Left: messages + reply */}
      <div className={`flex-1 overflow-y-auto p-2 md:p-4 space-y-2 md:space-y-3 ${isCS ? "min-w-0" : ""}`}>
        {/* CS: non-email events before first message */}
        {isCS && csTimeline.length > 0 && (
          <TicketTimeline events={csTimeline} />
        )}
        {messages.map((msg) => {
          const isExpanded = expandedIds.has(msg.id) || msg.id === latestId;
          return (
            <div key={msg.id} className="border border-border rounded-xl overflow-hidden">
              {/* Message header (always visible) */}
              <button type="button"
                onClick={() => toggleExpand(msg.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-secondary/50 transition-colors"
              >
                {(() => {
                  const fromAddr = msg.from_address.toLowerCase();
                  const isSelf = fromAddr === senderEmail?.toLowerCase();
                  const photoUrl = contactPhotos?.[fromAddr];
                  return photoUrl ? (
                    <img src={photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: isSelf ? "#10b981" : emailToColor(fromAddr) }}>
                      {(isSelf ? "S" : (msg.from_name || msg.from_address)[0]?.toUpperCase())}
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary truncate">
                      {msg.from_address.toLowerCase() === senderEmail?.toLowerCase() ? "Sinä" : (msg.from_name || msg.from_address)}
                    </span>
                    {msg.from_name && msg.from_address.toLowerCase() !== senderEmail?.toLowerCase() && (
                      <span className="text-[10px] text-text-muted truncate">&lt;{msg.from_address}&gt;</span>
                    )}
                    <span className="text-[10px] text-text-muted flex-shrink-0">
                      {formatDateTime(msg.date)}
                    </span>
                  </div>
                  {!isExpanded && (
                    <p className="text-xs text-text-muted truncate">{msg.snippet}</p>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {/* Expanded body */}
              {isExpanded && (
                <div className="border-t border-border">
                  <div className="px-4 py-2 text-[11px] text-text-muted bg-bg-secondary/30">
                    <span>Vastaanottaja: {msg.to_addresses.join(", ")}</span>
                    {msg.cc_addresses.length > 0 && <span className="ml-3">Kopio: {msg.cc_addresses.join(", ")}</span>}
                  </div>
                  <div className="px-4 py-4">
                    {msg.body_html ? (
                      <EmailBodyWithCid
                        bodyHtml={msg.body_html}
                        emailId={msg.id}
                        gmailMessageId={msg.gmail_message_id}
                        senderEmail={msg.is_inbound ? msg.to_addresses[0] || COMPANY_EMAIL : msg.from_address}
                        className="prose prose-sm max-w-none text-sm"
                      />
                    ) : (
                      <pre className="text-sm whitespace-pre-wrap text-text-primary">{msg.body_text}</pre>
                    )}
                  </div>
                  {/* Attachments */}
                  {msg.has_attachments && <MessageAttachments emailId={msg.id} gmailMessageId={msg.gmail_message_id} senderEmail={msg.is_inbound ? msg.to_addresses[0] || COMPANY_EMAIL : msg.from_address} bodyHtml={msg.body_html} />}
                  {/* Actions */}
                  <div className="px-3 md:px-4 py-2 border-t border-border flex flex-wrap gap-1.5 md:gap-2">
                    <button type="button"
                      onClick={() => {
                        const replyTo = msg.is_inbound ? msg.from_address : msg.to_addresses[0] || "";
                        setInlineReply({
                          to: replyTo,
                          cc: "",
                          subject: msg.subject?.startsWith("Re:") ? msg.subject : `Re: ${msg.subject || ""}`,
                          inReplyTo: msg.gmail_message_id,
                        });
                        setReplyBody("");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text-muted hover:bg-bg-secondary hover:border-accent/30 hover:text-accent active:scale-95 transition-all"
                    >
                      <Reply className="w-3.5 h-3.5" /> Vastaa
                    </button>
                    <button type="button"
                      onClick={() => {
                        const replyTo = msg.is_inbound ? msg.from_address : msg.to_addresses[0] || "";
                        const allCc = [...msg.to_addresses, ...msg.cc_addresses]
                          .filter((e) => e !== senderEmail && e !== replyTo);
                        setInlineReply({
                          to: replyTo,
                          cc: allCc.join(", "),
                          subject: msg.subject?.startsWith("Re:") ? msg.subject : `Re: ${msg.subject || ""}`,
                          inReplyTo: msg.gmail_message_id,
                        });
                        setReplyBody("");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text-muted hover:bg-bg-secondary hover:border-accent/30 hover:text-accent active:scale-95 transition-all"
                    >
                      <ReplyAll className="w-3.5 h-3.5" /> Vastaa kaikille
                    </button>
                    <button type="button"
                      onClick={() => onReply(msg, "forward")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text-muted hover:bg-bg-secondary hover:border-accent/30 hover:text-accent active:scale-95 transition-all"
                    >
                      <Forward className="w-3.5 h-3.5" /> Välitä
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Inline reply editor (email mode only) */}
        {!isCS && inlineReply && (
          <div className="border border-border rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-2 bg-bg-secondary/30 border-b border-border space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-muted shrink-0">Vastaanottaja</span>
                <input className="flex-1 py-0.5 text-xs outline-none bg-transparent" value={inlineReply.to} onChange={(e) => setInlineReply({ ...inlineReply, to: e.target.value })} />
              </div>
              {inlineReply.cc && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted w-16">Kopio</span>
                  <input className="flex-1 py-0.5 text-xs outline-none bg-transparent" value={inlineReply.cc} onChange={(e) => setInlineReply({ ...inlineReply, cc: e.target.value })} />
                </div>
              )}
            </div>
            <div className="px-2 py-2">
              <TiptapEditor
                content={signature ? `<p></p><p></p>${signature}` : ""}
                placeholder="Kirjoita vastauksesi..."
                onChange={(html) => setReplyBody(html)}
              />
            </div>
            {/* Reply attachments */}
            {replyAttachments.length > 0 && (
              <div className="px-4 py-2 border-t border-border flex flex-wrap gap-2">
                {replyAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-bg-secondary rounded-lg text-xs">
                    <Paperclip className="w-3 h-3 text-text-muted" />
                    <span className="truncate max-w-[150px]">{att.file.name}</span>
                    <span className="text-text-muted">{formatFileSize(att.file.size)}</span>
                    <button type="button" onClick={() => setReplyAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-text-muted hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="px-4 py-2 border-t border-border flex items-center gap-2">
              <button type="button"
                onClick={async () => {
                  if (!inlineReply.to.trim() || !replyBody.trim()) return;
                  setReplySending(true);
                  const fullBody = formatEmailHtml(replyBody);
                  try {
                    await sendMutation.mutateAsync({
                      to: inlineReply.to.split(",").map((t) => t.trim()).filter(Boolean),
                      cc: inlineReply.cc ? inlineReply.cc.split(",").map((c) => c.trim()).filter(Boolean) : undefined,
                      subject: inlineReply.subject,
                      body_html: fullBody,
                      sender_email: senderEmail,
                      sender_name: senderName,
                      in_reply_to: inlineReply.inReplyTo,
                      thread_id: threadId,
                      employee_id: employeeId,
                      attachments: replyAttachments.length > 0
                        ? replyAttachments.map((a) => ({ filename: a.file.name, base64: a.base64, mimeType: a.file.type || "application/octet-stream" }))
                        : undefined,
                    });
                    setInlineReply(null);
                    setReplyBody("");
                    setReplyAttachments([]);
                    showFeedback("Viesti lähetetty");
                  } catch (err) {
                    console.error("Reply failed:", err);
                    showFeedback("Viestin lähetys epäonnistui", true);
                  } finally {
                    setReplySending(false);
                  }
                }}
                disabled={replySending || !replyBody.trim()}
                className="flex items-center gap-2 px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
              >
                {replySending ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-3 h-3" />}
                Lähetä
              </button>
              <button type="button"
                onClick={() => replyFileInputRef.current?.click()}
                className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary"
                title="Liitä tiedosto"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>
              <input
                ref={replyFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
                  for (const file of files) {
                    if (file.size > MAX_FILE_SIZE) {
                      showFeedback(`Tiedosto "${file.name}" on liian suuri (max 25 MB)`);
                      continue;
                    }
                    const base64 = await fileToBase64(file);
                    setReplyAttachments((prev) => [...prev, { file, base64 }]);
                  }
                  e.target.value = "";
                }}
              />
              <button type="button" onClick={() => { setInlineReply(null); setReplyAttachments([]); }} className="text-xs text-text-muted hover:text-text-primary">
                Hylkää
              </button>
            </div>
          </div>
        )}

        {/* CS mode: AI Draft + TicketReplyComposer */}
        {isCS && ticket && (
          <>
            <AIDraftCard
              ticket={ticket}
              actorId={employeeId}
              latestAIDraft={latestAIDraft}
              onInsertDraft={(html) => {
                // Pass rich HTML straight through — the composer is now a
                // TipTap editor, so bold/lists/links/paragraphs render natively.
                setCsReplyInitialBody(html);
              }}
            />
            <TicketReplyComposer
              ticket={ticket}
              lastInboundEmail={lastInboundEvent}
              actorId={employeeId}
              initialBody={csReplyInitialBody}
              onReplySent={() => {
                setCsReplyInitialBody("");
                onTicketUpdate?.();
              }}
            />
          </>
        )}

        {/* Email mode: Quick reply bar (when no inline reply open) */}
        {!isCS && !inlineReply && messages.length > 0 && (
          <button type="button"
            onClick={() => {
              const lastMsg = messages[messages.length - 1];
              const replyTo = lastMsg.is_inbound ? lastMsg.from_address : lastMsg.to_addresses[0] || "";
              setInlineReply({
                to: replyTo,
                cc: "",
                subject: lastMsg.subject?.startsWith("Re:") ? lastMsg.subject : `Re: ${lastMsg.subject || ""}`,
                inReplyTo: lastMsg.gmail_message_id,
              });
            }}
            className="w-full border border-border rounded-xl px-4 py-3 text-sm text-text-muted text-left hover:bg-bg-secondary/50 transition-colors"
          >
            Klikkaa vastataksesi...
          </button>
        )}
      </div>

      {/* CS mode: Right sidebar */}
      {isCS && ticket && (
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border overflow-y-auto p-4 space-y-6 bg-bg-secondary/20 md:max-h-none max-h-[40vh]">
          <TicketSidebar ticket={ticket} actorId={employeeId} />
          <CustomerContextPanel ticket={ticket} />
        </div>
      )}
      </div>

      {/* Create deal modal */}
      {showCreateDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreateDeal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="text-sm font-semibold">Luo diili tästä ketjusta</h3>
              <button type="button" onClick={() => setShowCreateDeal(false)} className="text-text-muted hover:text-text-primary"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Subject as context */}
              <div className="px-3 py-2 bg-bg-secondary/50 rounded-lg text-xs text-text-muted truncate">
                <Mail className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />{subject}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Etunimi</label>
                  <input className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent" value={dealForm.firstName} onChange={(e) => setDealForm({ ...dealForm, firstName: e.target.value })} placeholder="Etunimi" autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Sukunimi</label>
                  <input className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent" value={dealForm.lastName} onChange={(e) => setDealForm({ ...dealForm, lastName: e.target.value })} placeholder="Sukunimi" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Sähköposti</label>
                <input className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent" value={dealForm.email} onChange={(e) => setDealForm({ ...dealForm, email: e.target.value })} placeholder="email@esimerkki.fi" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Puhelin</label>
                  <input className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent" value={dealForm.phone} onChange={(e) => setDealForm({ ...dealForm, phone: e.target.value })} placeholder="040 123 4567" type="tel" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Osoite</label>
                  <input className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent" value={dealForm.address} onChange={(e) => setDealForm({ ...dealForm, address: e.target.value })} placeholder="Katuosoite" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Postinumero</label>
                  <input className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent" value={dealForm.postcode} onChange={(e) => setDealForm({ ...dealForm, postcode: e.target.value })} placeholder="00100" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Kaupunki</label>
                  <input className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent" value={dealForm.city} onChange={(e) => setDealForm({ ...dealForm, city: e.target.value })} placeholder="Helsinki" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Muistiinpanot</label>
                <textarea className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-accent resize-none" rows={2} value={dealForm.notes} onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })} placeholder="Lisätiedot..." />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-border flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowCreateDeal(false)} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary rounded-lg">
                Peruuta
              </button>
              <button type="button"
                onClick={async () => {
                  if (!employeeId) return;
                  try {
                    const fullName = [dealForm.firstName, dealForm.lastName].filter(Boolean).join(" ");
                    await createDealMutation.mutateAsync({
                      threadId,
                      name: fullName || undefined,
                      email: dealForm.email || undefined,
                      phone: dealForm.phone || undefined,
                      address: dealForm.address || undefined,
                      postcode: dealForm.postcode || undefined,
                      city: dealForm.city || undefined,
                      notes: dealForm.notes || undefined,
                      assigned_salesperson_id: employeeId,
                    });
                    setShowCreateDeal(false);
                    showFeedback("Kauppa luotu");
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes("duplicate") || msg.includes("unique")) {
                      toast("Kauppa on jo luotu tästä ketjusta");
                    } else {
                      toast("Virhe luotaessa kauppaa");
                    }
                  }
                }}
                disabled={createDealMutation.isPending || (!dealForm.firstName && !dealForm.phone && !dealForm.email)}
                className="flex items-center gap-1.5 px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 disabled:opacity-50"
              >
                {createDealMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
                Luo kauppa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
