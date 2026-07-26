import { useState } from "react";
import DOMPurify from "dompurify";
import {
  Mail,
  Send,
  StickyNote,
  ArrowRightLeft,
  UserRound,
  AlertTriangle,
  Tag,
  GitMerge,
  Sparkles,
  Star,
  FileText,
  ChevronDown,
  ChevronUp,
  Paperclip,
  EyeOff,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { CSTicketEvent, TicketEventType } from "@/lib/cs-types";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  EVENT_TYPE_LABELS,
} from "@/lib/cs-types";

const EVENT_ICONS: Record<TicketEventType, typeof Mail> = {
  email_inbound: Mail,
  email_outbound: Send,
  note: StickyNote,
  status_change: ArrowRightLeft,
  assignment: UserRound,
  priority_change: AlertTriangle,
  category_change: Tag,
  tag_change: Tag,
  merge: GitMerge,
  ai_draft: Sparkles,
  csat_response: Star,
  sla_breach: AlertTriangle,
  form_submission: FileText,
};

const COMPACT_EVENTS: TicketEventType[] = [
  "status_change",
  "assignment",
  "priority_change",
  "category_change",
  "tag_change",
  "merge",
  "sla_breach",
];

function formatCompactEvent(event: CSTicketEvent): string {
  const p = event.payload;
  const actorName = event.actor
    ? `${event.actor.first_name} ${event.actor.last_name}`
    : "Järjestelmä";

  switch (event.type) {
    case "status_change": {
      const statusLabel = TICKET_STATUS_LABELS[p.new_status as keyof typeof TICKET_STATUS_LABELS] ?? p.new_status;
      const reason = p.reason as string | undefined;
      if (reason === "gmail_archived") return `Gmail-arkistointi → ${statusLabel}`;
      if (reason === "gmail_unarchived") return `Gmail-palautus → ${statusLabel}`;
      if (reason === "gmail_trashed") return `Gmail-roskakori → ${statusLabel}`;
      if (reason === "new_inbound_email") return `Uusi viesti → ${statusLabel}`;
      return `${actorName} muutti tilan: ${statusLabel}`;
    }
    case "assignment": {
      const agentId = p.assigned_agent_id as string | null;
      return agentId
        ? `${actorName} asetti vastuuhenkilön`
        : `${actorName} poisti vastuuhenkilön`;
    }
    case "priority_change":
      return `${actorName} muutti prioriteetin: ${TICKET_PRIORITY_LABELS[p.new_priority as keyof typeof TICKET_PRIORITY_LABELS] ?? p.new_priority}`;
    case "category_change":
      return `${actorName} muutti kategorian: ${p.new_category}`;
    case "tag_change":
      return `${actorName} muutti tägejä`;
    case "merge":
      return `Tiketti yhdistetty`;
    case "sla_breach":
      return `SLA ylitetty`;
    default:
      return EVENT_TYPE_LABELS[event.type] ?? event.type;
  }
}

/** Sanitize email HTML: strips <style> tags, scripts, event handlers, and cid: images */
function sanitizeEmailHtml(html: string): string {
  // Remove inline cid: images (embedded images that won't render)
  const cleaned = html.replace(/<img[^>]+src=["']cid:[^"']*["'][^>]*>/gi, "");
  return DOMPurify.sanitize(cleaned);
}

const EXPANDED_HEAD_COUNT = 3;

// Number of email/note events at the end of the thread that stay expanded
// by default. Older events collapse to header-only for easier scanning.
const AUTO_EXPAND_RECENT_COUNT = 2;

export function TicketTimeline({ events }: { events: CSTicketEvent[] }) {
  // AI drafts live in the dedicated AIDraftCard above the timeline, so we
  // filter them out here to avoid duplicating the content and bloating the
  // conversation view. The card shows the latest draft; the event rows are
  // purely storage for metrics/feedback.
  const visibleEvents = events.filter((e) => e.type !== "ai_draft");

  // Pre-compute which FullEvent rows should default to expanded.
  // Rule: only the last N email / form / note / csat events are open.
  const expandableEvents = visibleEvents.filter((e) => !COMPACT_EVENTS.includes(e.type));
  const defaultExpandedIds = new Set(
    expandableEvents.slice(-AUTO_EXPAND_RECENT_COUNT).map((e) => e.id)
  );

  // Smart collapse: if there are more than HEAD + 1 messages, auto-hide the
  // middle ones behind a "näytä X aiempaa viestiä" button. Always show the
  // first event (context) and the last N (current conversation).
  const [showAll, setShowAll] = useState(false);

  const shouldCollapse = visibleEvents.length > EXPANDED_HEAD_COUNT + 2;
  const renderedEvents = shouldCollapse && !showAll
    ? [visibleEvents[0], ...visibleEvents.slice(-EXPANDED_HEAD_COUNT)]
    : visibleEvents;
  const hiddenCount = shouldCollapse && !showAll
    ? visibleEvents.length - (EXPANDED_HEAD_COUNT + 1)
    : 0;

  return (
    <div className="space-y-3">
      {renderedEvents.map((event, idx) => {
        const node = COMPACT_EVENTS.includes(event.type) ? (
          <CompactEvent key={event.id} event={event} />
        ) : (
          <FullEvent
            key={event.id}
            event={event}
            defaultExpanded={defaultExpandedIds.has(event.id)}
          />
        );
        // Insert the "show more" button between the first event and the tail
        // when we are collapsed.
        if (shouldCollapse && !showAll && idx === 0) {
          return (
            <div key={event.id + "-wrap"}>
              {node}
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full my-3 text-center py-2 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-lg transition-colors"
              >
                Näytä {hiddenCount} aiempaa viestiä
              </button>
            </div>
          );
        }
        return node;
      })}
    </div>
  );
}

function CompactEvent({ event }: { event: CSTicketEvent }) {
  const Icon = EVENT_ICONS[event.type] ?? ArrowRightLeft;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500">
      <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      <span className="truncate min-w-0">{formatCompactEvent(event)}</span>
      <span className="ml-auto text-gray-400 shrink-0 whitespace-nowrap">
        {formatDateTime(event.created_at)}
      </span>
    </div>
  );
}

function FullEvent({
  event,
  defaultExpanded = true,
}: {
  event: CSTicketEvent;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const Icon = EVENT_ICONS[event.type] ?? Mail;

  const isEmail =
    event.type === "email_inbound" || event.type === "email_outbound";
  const isAIDraft = event.type === "ai_draft";
  const isFormSubmission = event.type === "form_submission";
  const email = event.sales_emails;
  const attachments = email?.attachments ?? [];

  const formSlug = isFormSubmission ? (event.payload?.form_slug as string) : null;

  const senderName = isFormSubmission
    ? "Lomakelähetys"
    : isEmail
      ? event.type === "email_inbound"
        ? email?.from_name || email?.from_address || "Tuntematon"
        : "info@lasikiilto.fi"
      : event.actor
        ? `${event.actor.first_name} ${event.actor.last_name}`
        : "Järjestelmä";

  const rawHtml = isEmail ? (email?.body_html || event.body_html) : event.body_html;
  const bodyHtml = rawHtml ? (isEmail ? sanitizeEmailHtml(rawHtml) : DOMPurify.sanitize(rawHtml)) : rawHtml;

  return (
    <div
      className={`rounded-lg border ${
        isFormSubmission
          ? "border-green-200 bg-green-50/30"
          : isAIDraft
            ? "border-purple-200 bg-purple-50/50"
            : event.is_internal
              ? "border-amber-200 bg-amber-50/30"
              : event.type === "email_inbound"
                ? "border-gray-200 bg-white"
                : "border-blue-200 bg-blue-50/30"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 sm:px-4 py-2.5 cursor-pointer flex-wrap sm:flex-nowrap"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon
          className={`h-4 w-4 shrink-0 ${
            isFormSubmission
              ? "text-green-600"
              : isAIDraft
                ? "text-purple-500"
                : event.is_internal
                  ? "text-amber-500"
                  : event.type === "email_outbound"
                    ? "text-blue-500"
                    : "text-gray-400"
          }`}
        />
        <span className="text-sm font-medium text-gray-900 truncate">
          {senderName}
        </span>

        {isFormSubmission && formSlug && (
          <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
            {formSlug}
          </span>
        )}

        {isEmail && !!(email?.to_addresses || event.payload?.to) && (
          <span className="text-xs text-gray-400 truncate hidden md:inline">
            → {(email?.to_addresses ?? event.payload?.to as string[])?.join(", ")}
          </span>
        )}

        {event.is_internal && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
            <EyeOff className="h-3 w-3" />
            Sisäinen
          </span>
        )}

        {isAIDraft && (
          <span className="inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
            <Sparkles className="h-3 w-3" />
            AI-luonnos
          </span>
        )}

        {attachments.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <Paperclip className="h-3 w-3" />
            {attachments.length}
          </span>
        )}

        <span className="ml-auto text-xs text-gray-400 shrink-0">
          {formatDateTime(isEmail ? email?.date ?? event.created_at : event.created_at)}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </div>

      {/* Body */}
      {expanded && bodyHtml && (
        <div className="border-t border-gray-100 px-3 sm:px-4 py-3 overflow-hidden min-w-0">
          <div
            className="prose prose-sm max-w-none text-gray-700 overflow-x-hidden overflow-y-auto break-words
              [&_img]:!max-w-full [&_img]:h-auto
              [&_table]:!max-w-full [&_table]:!w-full [&_table]:table-fixed
              [&_td]:break-words [&_th]:break-words
              [&_div]:!max-w-full [&_pre]:overflow-x-auto"
            style={{ isolation: "isolate", overflowWrap: "anywhere", wordBreak: "break-word" }}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded"
                >
                  <Paperclip className="h-3 w-3" />
                  {att.filename}
                  <span className="text-gray-400">
                    ({Math.ceil(att.size_bytes / 1024)}KB)
                  </span>
                </span>
              ))}
            </div>
          )}
          {isFormSubmission && !!event.payload?.page_url && (
            <p className="mt-2 text-xs text-gray-400">
              Sivu: {event.payload.page_url as string}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
