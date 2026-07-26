/**
 * Unified Customer Service Inbox — email-driven ticket system for info@lasikiilto.fi.
 *
 * Single flow:
 *   Saapuneet (Gmail INBOX) → Odottaa asiakasta → Odottaa sisäistä → Ratkaistu
 *   + Lähetetyt / Tärkeät / Arkisto / Roskakori as secondary Gmail views
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Inbox, Send, Star, Archive, Trash2, Search, Plus, RefreshCw,
  Mail, X, Menu, Users, User, UserX, Clock, Hourglass, CheckCircle2,
} from "lucide-react";
import {
  useEmailThreads, useEmailThread, useEmailSearch,
  useGmailLabels, useContactPhotos,
} from "@/hooks/sales/useSalesEmails";
import { useTicketForThread, useTicketsForThreads } from "@/hooks/customer-service/useTicketForThread";
import { useTicketFilteredThreads } from "@/hooks/customer-service/useTicketFilteredThreads";
import { useTicketEvents } from "@/hooks/customer-service/useTicketDetail";
import { useCSCategories } from "@/hooks/customer-service/useTickets";
import { useUserRole } from "@/context/UserRoleContext";
import { useQueryClient } from "@tanstack/react-query";
import type { EmailThread, SalesEmail, EmailMailbox } from "@/lib/sales-types";
import type { TicketStatus, TicketPriority } from "@/lib/cs-types";
import { TICKET_PRIORITY_LABELS } from "@/lib/cs-types";
import { COMPANY_EMAIL } from "@/lib/email-styles";

import ThreadListItem from "@/components/email/ThreadListItem";
import ThreadView from "@/components/email/ThreadView";
import ComposeModal, { type ComposeState } from "@/components/email/ComposeModal";
import LabelsSidebar from "@/components/email/LabelsSidebar";
import { SyncHealthBanner } from "@/components/customer-service/SyncHealthBanner";
import { NotificationToggle } from "@/components/customer-service/NotificationToggle";
import { UnifiedSearchDialog } from "@/components/customer-service/UnifiedSearchDialog";
import { useNewTicketNotifications } from "@/hooks/customer-service/useNewTicketNotifications";

// ─── Sidebar item type ────────────────────────────────────────────────────────

type SidebarView =
  | "inbox"                 // Gmail INBOX — the starting point
  | "waiting_customer"      // Ticket status: waiting_customer
  | "waiting_internal"      // Ticket status: waiting_internal
  | "done"                  // Ticket status: resolved+closed
  | "sent"                  // Gmail SENT
  | "starred"               // Gmail starred
  | "archive"               // Gmail archive
  | "trash"                 // Gmail trash
  | "label";                // Gmail custom label

type CSViewMode = "mine" | "unassigned" | "all";

const TICKET_STATUS_MAP: Record<string, TicketStatus[]> = {
  waiting_customer: ["waiting_customer"],
  waiting_internal: ["waiting_internal"],
  done: ["resolved", "closed"],
};

// Which views are ticket-filtered (not raw Gmail)
function isTicketView(view: SidebarView): boolean {
  return view === "waiting_customer" || view === "waiting_internal" || view === "done";
}

export default function CompanyEmail() {
  const { employee } = useUserRole();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  useNewTicketNotifications();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [view, setView] = useState<SidebarView>("inbox");
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [composing, setComposing] = useState<ComposeState | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Deep-link support: /asiakaspalvelu?thread=<gmail_thread_id> auto-selects
  // that thread. Used by the unified search dialog and any other links.
  // The param is stripped after consumption so browser back doesn't re-fire.
  useEffect(() => {
    const threadParam = searchParams.get("thread");
    if (threadParam) {
      setSelectedThreadId(threadParam);
      searchParams.delete("thread");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // CS sub-filters (shown for ticket views + inbox)
  const [csViewMode, setCsViewMode] = useState<CSViewMode>("all");
  const [csPriority, setCsPriority] = useState<TicketPriority | "all">("all");
  const [csCategory, setCsCategory] = useState<string | "all">("all");

  const ticketView = isTicketView(view);

  // ─── Data ───────────────────────────────────────────────────────────────────
  const userEmail = COMPANY_EMAIL;

  // Gmail mailbox mapping
  const gmailMailbox: EmailMailbox = view === "label" ? "label"
    : view === "sent" ? "sent"
    : view === "starred" ? "starred"
    : view === "archive" ? "archive"
    : view === "trash" ? "trash"
    : "inbox"; // inbox is default for non-ticket views

  const { data: threads = [], isLoading: emailLoading, refetch } = useEmailThreads(
    gmailMailbox, userEmail, selectedLabelId || undefined
  );
  const { data: searchResults = [] } = useEmailSearch(searchQuery);
  const { data: threadMessages = [] } = useEmailThread(selectedThreadId || undefined);
  const { data: labels = [] } = useGmailLabels(userEmail);
  const { data: categories } = useCSCategories();

  // Agent filter for ticket views and Gmail-mailbox views are now both resolved
  // against cs_tickets.assigned_agent_id. The old emoji-label hack (reading
  // "👤Name" Gmail labels back for filtering) has been removed — the labels are
  // still mirrored to Gmail by useAssignTicket so assignment stays visible in
  // Gmail, but they are never the source of truth for the admin UI.
  const agentFilter = csViewMode === "mine" ? (employee?.id || "all")
    : csViewMode === "unassigned" ? "unassigned" : "all";

  // Ticket-filtered threads (for waiting_customer / waiting_internal / done)
  const { data: csFilteredData, isLoading: csLoading } = useTicketFilteredThreads(
    ticketView ? {
      status: TICKET_STATUS_MAP[view] ?? "all",
      priority: csPriority,
      category: csCategory,
      assigned_agent_id: agentFilter,
      search: searchQuery.length >= 2 ? searchQuery : undefined,
    } : { status: "all" } // not used when !ticketView
  );

  // For inbox + other Gmail views: enrich threads with ticket data
  const emailThreadIds = useMemo(() => threads.map((t) => t.thread_id), [threads]);
  const { data: emailTicketMap } = useTicketsForThreads(!ticketView ? emailThreadIds : []);

  // Decide which threads to display
  const isSearching = searchQuery.length >= 2;
  const rawDisplayThreads = isSearching && !ticketView
    ? searchResults
    : ticketView
      ? (csFilteredData?.threads ?? [])
      : threads;

  // Apply DB-level agent + priority + category filters for non-ticket views.
  // Ticket views (waiting_customer etc.) are already filtered at the DB level
  // by useTicketFilteredThreads, so they skip this block entirely.
  const displayThreads = useMemo(() => {
    if (ticketView) return rawDisplayThreads;
    if (csViewMode === "all" && csPriority === "all" && csCategory === "all") {
      return rawDisplayThreads;
    }
    if (!emailTicketMap) return rawDisplayThreads;
    return rawDisplayThreads.filter((t) => {
      const ticket = emailTicketMap.get(t.thread_id);
      // Agent filter: uses assigned_agent_id from the enriched ticket row.
      if (csViewMode === "mine") {
        if (!ticket || ticket.assigned_agent_id !== employee?.id) return false;
      } else if (csViewMode === "unassigned") {
        if (ticket && ticket.assigned_agent_id) return false;
      }
      // Priority/category filters require a ticket row.
      if (csPriority !== "all" || csCategory !== "all") {
        if (!ticket) return false;
        if (csPriority !== "all" && ticket.priority !== csPriority) return false;
        if (csCategory !== "all" && ticket.category !== csCategory) return false;
      }
      return true;
    });
  }, [
    rawDisplayThreads,
    ticketView,
    csViewMode,
    csPriority,
    csCategory,
    emailTicketMap,
    employee?.id,
  ]);

  const ticketMap = ticketView
    ? (csFilteredData?.ticketMap ?? new Map())
    : (emailTicketMap ?? new Map());

  const isLoading = ticketView ? csLoading : emailLoading;

  // Contact photos
  const allFromEmails = useMemo(() => {
    return displayThreads.flatMap((t) => t.messages.map((m) => m.from_address));
  }, [displayThreads]);
  const { data: contactPhotos } = useContactPhotos(allFromEmails);

  // ─── Selected thread ticket data ────────────────────────────────────────────
  const { data: selectedTicket, refetch: refetchTicket } = useTicketForThread(selectedThreadId || undefined);
  const { data: ticketEventsData, refetch: refetchEvents } = useTicketEvents(selectedTicket?.id);

  function handleTicketUpdate() {
    refetchTicket();
    refetchEvents();
    qc.invalidateQueries({ queryKey: ["cs-tickets"] });
    qc.invalidateQueries({ queryKey: ["cs-filtered-threads"] });
    qc.invalidateQueries({ queryKey: ["cs-tickets-by-threads"] });
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectThread = useCallback((t: EmailThread) => {
    setSelectedThreadId(t.thread_id);
  }, []);

  // Keyboard shortcuts (Gmail-style muscle memory). j/k navigate the thread
  // list, Esc closes the selected thread, x toggles compose. Ignored while
  // typing in inputs or textareas so they don't interfere with the composer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "j" || e.key === "k") {
        if (displayThreads.length === 0) return;
        e.preventDefault();
        const idx = selectedThreadId
          ? displayThreads.findIndex((t) => t.thread_id === selectedThreadId)
          : -1;
        const nextIdx =
          e.key === "j"
            ? Math.min(idx + 1, displayThreads.length - 1)
            : Math.max(idx - 1, 0);
        const next = displayThreads[nextIdx === -1 ? 0 : nextIdx];
        if (next) setSelectedThreadId(next.thread_id);
      } else if (e.key === "Escape" && selectedThreadId) {
        setSelectedThreadId(null);
      } else if (e.key === "c") {
        e.preventDefault();
        setComposing({ mode: "new", to: "", subject: "", body: "" });
      } else if (e.key === "?") {
        e.preventDefault();
        alert(
          "Pikanäppäimet:\n" +
            "j / k — seuraava / edellinen ketju\n" +
            "Esc — sulje valittu ketju\n" +
            "c — uusi viesti\n" +
            "⌘/Ctrl + K — hae\n" +
            "⌘/Ctrl + Enter — lähetä vastaus"
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayThreads, selectedThreadId]);

  const handleCompose = useCallback(() => {
    setComposing({ mode: "new", to: "", subject: "", body: "" });
  }, []);

  const handleReply = useCallback((msg: SalesEmail, mode: "reply" | "reply_all" | "forward" = "reply") => {
    const reSubject = msg.subject || "";
    let to = "";
    let cc = "";
    let body = "";

    if (mode === "reply") {
      to = msg.is_inbound ? msg.from_address : msg.to_addresses[0] || "";
    } else if (mode === "reply_all") {
      to = msg.is_inbound ? msg.from_address : msg.to_addresses[0] || "";
      const allRecipients = [...msg.to_addresses, ...msg.cc_addresses]
        .filter((e) => e !== userEmail && e !== to);
      cc = allRecipients.join(", ");
    } else if (mode === "forward") {
      to = "";
    }

    const prefix = mode === "forward" ? "Fwd:" : "Re:";
    const subject = reSubject.startsWith(prefix) ? reSubject : `${prefix} ${reSubject}`;

    if (mode === "forward") {
      const fwdHeader = `\n\n---------- Välitetty viesti ----------\nLähettäjä: ${msg.from_name || msg.from_address}\nPäivämäärä: ${new Date(msg.date).toLocaleString("fi-FI", { timeZone: "Europe/Helsinki" })}\nAihe: ${msg.subject || ""}\nVastaanottaja: ${msg.to_addresses.join(", ")}\n\n`;
      body = fwdHeader + (msg.body_text || msg.snippet || "");
    }

    setComposing({
      mode: mode === "forward" ? "forward" : "reply",
      to,
      cc,
      subject,
      body,
      inReplyTo: mode !== "forward" ? msg.gmail_message_id : undefined,
      threadId: mode !== "forward" ? msg.gmail_thread_id : undefined,
    });
  }, [userEmail]);

  function switchView(v: SidebarView) {
    setView(v);
    setSelectedLabelId(null);
    setSelectedThreadId(null);
    setSearchQuery("");
  }

  // ─── Sidebar items ──────────────────────────────────────────────────────────

  const PRIMARY_ITEMS: { key: SidebarView; label: string; icon: typeof Inbox }[] = [
    { key: "inbox", label: "Saapuneet", icon: Inbox },
    { key: "waiting_customer", label: "Odottaa asiakasta", icon: Hourglass },
    { key: "waiting_internal", label: "Odottaa sisäistä", icon: Clock },
    { key: "done", label: "Ratkaistu", icon: CheckCircle2 },
  ];

  const SECONDARY_ITEMS: { key: SidebarView; label: string; icon: typeof Inbox }[] = [
    { key: "sent", label: "Lähetetyt", icon: Send },
    { key: "starred", label: "Tärkeät", icon: Star },
    { key: "archive", label: "Arkisto", icon: Archive },
    { key: "trash", label: "Roskakori", icon: Trash2 },
  ];

  // Show sub-filters for inbox + ticket views
  const showSubFilters = view === "inbox" || ticketView;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
    <UnifiedSearchDialog />
    <div className="px-3 pt-2 empty:hidden">
      <SyncHealthBanner />
    </div>
    <div className="flex flex-1 min-h-0 relative">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex w-48 border-r border-border flex-shrink-0 flex-col">
        <button type="button"
          onClick={handleCompose}
          className="m-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Kirjoita
        </button>

        <nav className="flex-1 px-2 space-y-px">
          {PRIMARY_ITEMS.map((item) => (
            <button type="button"
              key={item.key}
              onClick={() => switchView(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                view === item.key && !selectedLabelId
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-bg-secondary"
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}

          <div className="h-px bg-border mx-1 my-2" />

          {SECONDARY_ITEMS.map((item) => (
            <button type="button"
              key={item.key}
              onClick={() => switchView(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                view === item.key && !selectedLabelId
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-bg-secondary"
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}

          <LabelsSidebar
            labels={labels}
            mailbox={gmailMailbox}
            selectedLabelId={selectedLabelId}
            userEmail={userEmail}
            onSelectLabel={(labelId) => {
              setView("label");
              setSelectedLabelId(labelId);
              setSelectedThreadId(null);
              setSearchQuery("");
            }}
          />
        </nav>
      </div>

      {/* ── Mobile drawer ───────────────────────────────────────────────────── */}
      <div
        className={`md:hidden fixed inset-0 z-50 transition-opacity duration-300 ${mobileDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setMobileDrawerOpen(false)}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div
          className={`absolute inset-y-0 left-0 w-72 bg-white flex flex-col shadow-2xl transition-transform duration-300 ease-out ${mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <span className="text-sm font-bold text-text-primary">Asiakaspalvelu</span>
            <button type="button" onClick={() => setMobileDrawerOpen(false)} className="p-1 text-text-muted">
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {[...PRIMARY_ITEMS, ...SECONDARY_ITEMS].map((item) => {
              const isActive = view === item.key && !selectedLabelId;
              return (
                <button type="button"
                  key={item.key}
                  onClick={() => { switchView(item.key); setMobileDrawerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                    isActive ? "bg-accent/10 text-accent border-r-4 border-accent" : "text-text-primary hover:bg-bg-secondary"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1 text-left">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile compose FAB */}
      {!selectedThreadId && (
        <button type="button"
          onClick={handleCompose}
          className="md:hidden fixed bottom-6 right-4 z-40 w-14 h-14 bg-accent text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedThreadId ? (
          <>
            {/* Info banner for threads without a ticket (legacy/system) */}
            {selectedTicket === null && threadMessages.length > 0 && (
              <div className="px-4 py-1.5 bg-surface-alt border-b border-border">
                <span className="text-xs text-text-muted">Ei tikettiä — järjestelmäviesti tai vanha ketju</span>
              </div>
            )}
            <ThreadView
              messages={threadMessages}
              threadId={selectedThreadId}
              onBack={() => setSelectedThreadId(null)}
              allLabels={labels}
              senderEmail={COMPANY_EMAIL}
              senderName="Lasikiilto"
              employeeId={employee?.id}
              employee={employee}
              onReply={handleReply}
              ticket={selectedTicket}
              ticketEvents={ticketEventsData}
              onTicketUpdate={handleTicketUpdate}
              mode="cs"
            />
          </>
        ) : (
          <>
            {/* Search bar */}
            <div className="border-b border-border">
              <div className="flex items-center gap-2 px-3 md:px-4 py-2">
                <button type="button"
                  onClick={() => setMobileDrawerOpen(true)}
                  className="md:hidden p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary"
                >
                  <Menu className="w-5 h-5" />
                </button>

                <span className="hidden md:block text-xs text-text-muted font-medium px-2">info@lasikiilto.fi</span>

                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-bg-secondary text-sm"
                    placeholder="Hae..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button type="button"
                  onClick={async () => {
                    setRefreshing(true);
                    try {
                      await supabase.functions.invoke("sync-gmail", { body: { email_address: COMPANY_EMAIL, reconcile: true } });
                      await refetch();
                      qc.invalidateQueries({ queryKey: ["cs-filtered-threads"] });
                      qc.invalidateQueries({ queryKey: ["cs-tickets-by-threads"] });
                    } catch (err: any) {
                      console.error("Gmail sync failed:", err);
                    } finally {
                      setRefreshing(false);
                    }
                  }}
                  disabled={refreshing}
                  className="p-2 text-text-muted hover:text-accent rounded-lg hover:bg-bg-secondary active:scale-90 transition-all disabled:opacity-50"
                  title="Synkkaa ja päivitä"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                </button>
                <NotificationToggle />
                <span className="text-xs text-text-muted whitespace-nowrap">
                  {displayThreads.length} ketjua
                </span>
              </div>

              {/* Sub-filters: view mode, priority, category (for inbox + ticket views) */}
              {showSubFilters && (
                <div className="flex items-center gap-2 px-3 md:px-4 py-1.5 bg-bg-secondary/30 flex-wrap overflow-x-auto">
                  {/* View mode */}
                  <div className="flex items-center rounded-lg border border-border bg-white overflow-hidden flex-shrink-0">
                    {([
                      { key: "all" as const, label: "Kaikki", icon: Users },
                      { key: "mine" as const, label: "Omat", icon: User },
                      { key: "unassigned" as const, label: "Ei vastuuhlöä", icon: UserX },
                    ]).map((vm) => (
                      <button
                        type="button"
                        key={vm.key}
                        onClick={() => setCsViewMode(vm.key)}
                        className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 text-xs font-medium transition-colors ${
                          csViewMode === vm.key ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-bg-secondary"
                        }`}
                      >
                        <vm.icon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{vm.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Priority filter */}
                  <select
                    value={csPriority}
                    onChange={(e) => setCsPriority(e.target.value as TicketPriority | "all")}
                    className="text-xs border border-border rounded-lg px-2 py-1 bg-white flex-shrink-0"
                  >
                    <option value="all">Kaikki prioriteetit</option>
                    {Object.entries(TICKET_PRIORITY_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>

                  {/* Category filter */}
                  <select
                    value={csCategory}
                    onChange={(e) => setCsCategory(e.target.value)}
                    className="text-xs border border-border rounded-lg px-2 py-1 bg-white flex-shrink-0"
                  >
                    <option value="all">Kaikki kategoriat</option>
                    {(categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Thread list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : displayThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Mail className="w-12 h-12 text-text-muted/20 mb-3" />
                  <p className="text-sm text-text-muted">
                    {ticketView ? "Ei tikettejä" : "Ei sähköposteja"}
                  </p>
                </div>
              ) : (
                displayThreads.map((t) => (
                  <ThreadListItem
                    key={t.thread_id}
                    thread={t}
                    selected={selectedThreadId === t.thread_id}
                    allLabels={labels}
                    senderEmail={COMPANY_EMAIL}
                    contactPhotos={contactPhotos}
                    ticket={ticketMap.get(t.thread_id)}
                    onSelect={() => handleSelectThread(t)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Compose modal */}
      {composing && (
        <ComposeModal
          state={composing}
          onClose={() => setComposing(null)}
          senderEmail={COMPANY_EMAIL}
          senderName="Lasikiilto"
          employeeId={employee?.id}
          employee={employee}
        />
      )}
    </div>
    </div>
  );
}
