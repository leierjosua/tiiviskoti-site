import { Star, Paperclip } from "lucide-react";
import { useStarEmail, emailToColor } from "@/hooks/sales/useSalesEmails";
import type { EmailThread, GmailLabel } from "@/lib/sales-types";
import type { CSTicket } from "@/lib/cs-types";
import { TICKET_STATUS_COLORS, TICKET_STATUS_LABELS, TICKET_PRIORITY_DOT_COLORS } from "@/lib/cs-types";
import { formatShortDate } from "./email-utils";

export default function ThreadListItem({ thread, selected, onSelect, allLabels, senderEmail, contactPhotos, ticket }: {
  thread: EmailThread;
  selected: boolean;
  onSelect: () => void;
  allLabels: GmailLabel[];
  senderEmail?: string;
  contactPhotos?: Record<string, string>;
  ticket?: CSTicket;
}) {
  const starMutation = useStarEmail();
  const fromAddr = thread.messages[0]?.from_address?.toLowerCase() || "";
  const senderLower = senderEmail?.toLowerCase();
  const isSelf = senderLower && fromAddr === senderLower;
  const otherParticipant = thread.participants.find((p) => p.toLowerCase() !== senderLower) || thread.participants[0] || fromAddr;
  const displayName = isSelf ? (otherParticipant ? `Sinä → ${otherParticipant.split("@")[0]}` : "Sinä") : (thread.messages[0]?.from_name || fromAddr.split("@")[0]);

  // Get user labels for this thread
  const threadLabelIds = new Set(thread.messages.flatMap((m) => m.labels));
  const userLabels = allLabels.filter((l) => threadLabelIds.has(l.gmail_label_id));

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      className={`w-full text-left px-4 py-3 border-b border-border transition-colors cursor-pointer ${
        selected ? "bg-accent/5" : "hover:bg-bg-secondary"
      } ${!thread.is_read ? "bg-blue-50/50" : ""}`}
    >
      <div className="flex items-start gap-3">
        {(() => {
          const photoUrl = fromAddr && contactPhotos?.[fromAddr];
          return photoUrl ? (
            <img src={photoUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: isSelf ? "#10b981" : emailToColor(fromAddr || "") }}>
              {displayName[0]?.toUpperCase() || "?"}
            </div>
          );
        })()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className={`text-sm truncate ${!thread.is_read ? "font-bold text-text-primary" : "font-medium text-text-primary"}`}>
              {displayName}
            </span>
            <span className="text-[10px] text-text-muted flex-shrink-0 ml-2">
              {formatShortDate(thread.last_date)}
            </span>
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${!thread.is_read ? "font-semibold text-text-primary" : "text-text-muted"}`}>
            <span className="truncate">{thread.subject || "(ei otsikkoa)"}</span>
            {thread.message_count > 1 && <span className="text-text-muted font-normal shrink-0">({thread.message_count})</span>}
            {ticket && (
              <>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${TICKET_STATUS_COLORS[ticket.status]}`}>
                  {TICKET_STATUS_LABELS[ticket.status]}
                </span>
                <span className={`shrink-0 w-2 h-2 rounded-full ${TICKET_PRIORITY_DOT_COLORS[ticket.priority]}`} />
                {ticket.assigned_agent && (
                  <span className="shrink-0 w-5 h-5 rounded-full bg-accent/20 text-accent text-[9px] font-bold flex items-center justify-center" title={`${ticket.assigned_agent.first_name} ${ticket.assigned_agent.last_name}`}>
                    {ticket.assigned_agent.first_name[0]}
                  </span>
                )}
                {ticket.cs_categories && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ backgroundColor: ticket.cs_categories.color + "20", color: ticket.cs_categories.color }}>
                    {ticket.cs_categories.label}
                  </span>
                )}
              </>
            )}
          </div>
          {userLabels.length > 0 && (
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {userLabels.map((l) => (
                <span
                  key={l.id}
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: l.background_color || "#e5e7eb",
                    color: l.text_color || "#374151",
                  }}
                >
                  {l.name.includes("/") ? l.name.split("/").pop() : l.name}
                </span>
              ))}
            </div>
          )}
          <p className="text-[11px] text-text-muted truncate mt-0.5">{thread.snippet}</p>
        </div>
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <button type="button"
            onClick={(e) => { e.stopPropagation(); const msgId = thread.messages[0]?.id; if (msgId) starMutation.mutate({ id: msgId, starred: !thread.is_starred }); }}
            disabled={starMutation.isPending}
            className={`active:scale-75 transition-all ${thread.is_starred ? "text-yellow-400" : "text-gray-300 hover:text-yellow-400"}`}
          >
            <Star className="w-3.5 h-3.5" fill={thread.is_starred ? "currentColor" : "none"} />
          </button>
          {thread.has_attachments && <Paperclip className="w-3 h-3 text-text-muted" />}
        </div>
      </div>
    </div>
  );
}
