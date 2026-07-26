import { useState } from "react";
import { X, Mail, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import DOMPurify from "dompurify";
import { useEmailThread } from "@/hooks/sales/useSalesEmails";
import MessageAttachments from "@/components/email/MessageAttachments";
import type { SalesEmail } from "@/lib/sales-types";

interface Props {
  threadId: string;
  brand: string;
  onClose: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" });
}

function MessageBubble({ msg, defaultExpanded }: { msg: SalesEmail; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-secondary/50 transition-colors"
      >
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${msg.is_inbound ? "bg-green-500" : "bg-accent"}`}>
          {msg.is_inbound ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">{msg.from_name || msg.from_address}</span>
            <span className="text-xs text-text-tertiary shrink-0">{formatDate(msg.date)}</span>
          </div>
          {!expanded && <p className="text-xs text-text-secondary truncate mt-0.5">{msg.snippet}</p>}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          <div className="text-xs text-text-tertiary mt-2 mb-3">
            <span>Vastaanottajat: {msg.to_addresses.join(", ")}</span>
          </div>
          {msg.body_html ? (
            <div
              className="prose prose-sm max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.body_html) }}
            />
          ) : (
            <pre className="text-sm whitespace-pre-wrap text-text-secondary">{msg.body_text}</pre>
          )}
          {msg.has_attachments && (
            <div className="mt-3">
              <MessageAttachments
                emailId={msg.id}
                gmailMessageId={msg.gmail_message_id}
                senderEmail={msg.is_inbound ? (msg.to_addresses[0] || "info@lasikiilto.fi") : msg.from_address}
                bodyHtml={msg.body_html}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrderThreadDialog({ threadId, brand, onClose }: Props) {
  const { data: messages = [], isLoading } = useEmailThread(threadId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-accent" />
            <h2 className="text-base font-semibold text-text-primary">Tilausviestit — {brand}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-secondary transition-colors">
            <X className="w-5 h-5 text-text-tertiary" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-text-tertiary text-center py-12">Ei viestejä vielä</p>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble key={msg.id} msg={msg} defaultExpanded={i === messages.length - 1} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
