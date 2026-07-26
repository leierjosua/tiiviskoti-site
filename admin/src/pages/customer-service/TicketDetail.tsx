import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { TicketTimeline } from "@/components/customer-service/TicketTimeline";
import { TicketReplyComposer } from "@/components/customer-service/TicketReplyComposer";
import { TicketSidebar } from "@/components/customer-service/TicketSidebar";
import { CustomerContextPanel } from "@/components/customer-service/CustomerContextPanel";
import { TicketStatusBadge } from "@/components/customer-service/TicketStatusBadge";
import { TicketPriorityBadge } from "@/components/customer-service/TicketPriorityBadge";
import { SLAIndicator } from "@/components/customer-service/SLAIndicator";
import { AIDraftCard } from "@/components/customer-service/AIDraftCard";
import { SyncHealthBanner } from "@/components/customer-service/SyncHealthBanner";
import {
  useTicketDetail,
  useTicketEvents,
  useUpdateTicketStatus,
  useAssignTicket,
} from "@/hooks/customer-service/useTicketDetail";
import { useSubmitAIFeedback } from "@/hooks/customer-service/useAIDraft";
import { useUserRole } from "@/context/UserRoleContext";
import { useToast } from "@/context/ToastContext";
import { TICKET_CHANNEL_LABELS } from "@/lib/cs-types";
import type { TicketStatus } from "@/lib/cs-types";
import { ArrowLeft, Loader2, Archive, UserRound, RefreshCw } from "lucide-react";

export default function TicketDetail() {
  const { ticketNumber } = useParams<{ ticketNumber: string }>();
  const num = ticketNumber ? parseInt(ticketNumber, 10) : undefined;

  const { data: ticket, isLoading: ticketLoading } = useTicketDetail(num);
  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = useTicketEvents(ticket?.id);
  const [syncing, setSyncing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke("sync-gmail", {
        body: { email_address: "info@lasikiilto.fi" },
      });
    } catch {
      // Non-critical
    }
    await refetchEvents();
    setSyncing(false);
  }, [refetchEvents]);
  const { employee } = useUserRole();
  const toast = useToast();

  const actorId = employee?.id;

  const updateStatus = useUpdateTicketStatus();
  const assignTicket = useAssignTicket();
  const submitFeedback = useSubmitAIFeedback();

  const [composerText, setComposerText] = useState("");
  const aiDraftSourceRef = useRef<{ eventId: string; originalText: string } | null>(null);

  // Reset composer when ticket changes
  useEffect(() => {
    setComposerText("");
    aiDraftSourceRef.current = null;
  }, [ticket?.id]);

  // Find last inbound email for reply context
  const lastInboundEmail = useMemo(() => {
    if (!events) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "email_inbound" && events[i].sales_emails) {
        return events[i];
      }
    }
    return null;
  }, [events]);

  // Find latest AI draft
  const latestAIDraft = useMemo(() => {
    if (!events) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "ai_draft") return events[i];
    }
    return null;
  }, [events]);

  function handleClaim() {
    if (!actorId || !ticket) return;
    assignTicket.mutate(
      { ticketId: ticket.id, agentId: actorId, actorId },
      { onSuccess: () => toast.success("Otettu hoitoon") }
    );
  }

  function handleResolve() {
    if (!ticket) return;
    updateStatus.mutate(
      { ticketId: ticket.id, status: "resolved" as TicketStatus, actorId },
      { onSuccess: () => toast.success("Arkistoitu") }
    );
  }

  if (ticketLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-24">
        <p className="text-text-muted">Tikettiä ei löytynyt</p>
        <Link
          to="/asiakaspalvelu"
          className="text-accent hover:text-accent-dark text-sm mt-2 inline-block"
        >
          ← Takaisin tiketteihin
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SyncHealthBanner />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            to="/asiakaspalvelu"
            className="mt-1 p-1.5 rounded-xl text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-text-muted font-mono">
                #{ticket.ticket_number}
              </span>
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} />
              <SLAIndicator ticket={ticket} />
              <span className="text-xs text-text-muted">
                {TICKET_CHANNEL_LABELS[ticket.channel]}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-text-primary mt-1 break-words">
              {ticket.subject}
            </h1>
            {ticket.customer_name && (
              <p className="text-sm text-text-secondary mt-0.5 break-all">
                {ticket.customer_name}
                {ticket.customer_email && (
                  <span className="text-text-muted">
                    {" "}&lt;{ticket.customer_email}&gt;
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-2 shrink-0 ml-10 sm:ml-0">
          <button
            onClick={handleRefresh}
            disabled={syncing}
            className="p-1.5 border border-border rounded-xl text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
            title="Synkronoi Gmail & päivitä"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </button>

          {ticket.assigned_agent ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary bg-surface border border-border px-2.5 py-1.5 rounded-xl">
              <UserRound className="h-3.5 w-3.5" />
              {ticket.assigned_agent.first_name} {ticket.assigned_agent.last_name}
            </span>
          ) : actorId ? (
            <button
              onClick={handleClaim}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-accent px-3 py-1.5 rounded-xl hover:bg-accent-dark transition-colors"
            >
              <UserRound className="h-3.5 w-3.5" />
              Ota hoitoon
            </button>
          ) : null}

          {(ticket.status === "new" || ticket.status === "open") && (
            <button
              onClick={handleResolve}
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary border border-border px-3 py-1.5 rounded-xl hover:bg-surface-hover transition-colors"
            >
              <Archive className="h-3.5 w-3.5" />
              Arkistoi
            </button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: conversation */}
        <div className="flex-1 min-w-0 space-y-4">
          {eventsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : (
            <TicketTimeline events={events ?? []} />
          )}

          <AIDraftCard
            ticket={ticket}
            actorId={actorId}
            latestAIDraft={latestAIDraft}
            onInsertDraft={(html) => {
              const text = html
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
                .replace(/<\/?(p|div)[^>]*>/gi, "\n")
                .replace(/<[^>]*>/g, "")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
              setComposerText(text);
              if (latestAIDraft) {
                aiDraftSourceRef.current = {
                  eventId: latestAIDraft.id,
                  originalText: text,
                };
              }
            }}
          />

          <TicketReplyComposer
            ticket={ticket}
            lastInboundEmail={lastInboundEmail}
            actorId={actorId}
            initialBody={composerText}
            onReplySent={(sentBody) => {
              const src = aiDraftSourceRef.current;
              if (src && sentBody !== src.originalText) {
                submitFeedback.mutate({
                  ticketId: ticket.id,
                  eventId: src.eventId,
                  action: "edited",
                  editedBody: sentBody,
                  agentId: actorId,
                });
              }
              aiDraftSourceRef.current = null;
            }}
          />
        </div>

        {/* Right: sidebar — always visible on lg+ */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          <div className="bg-surface rounded-2xl border border-border p-5 lg:sticky lg:top-4">
            <TicketSidebar ticket={ticket} actorId={actorId} />
          </div>
          <div className="bg-surface rounded-2xl border border-border p-5">
            <CustomerContextPanel ticket={ticket} />
          </div>
        </div>
      </div>
    </div>
  );
}
