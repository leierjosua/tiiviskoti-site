import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { SLAIndicator } from "@/components/customer-service/SLAIndicator";
import { SyncHealthBanner } from "@/components/customer-service/SyncHealthBanner";
import { NotificationToggle } from "@/components/customer-service/NotificationToggle";
import { useNewTicketNotifications } from "@/hooks/customer-service/useNewTicketNotifications";
import { TicketStatusBadge } from "@/components/customer-service/TicketStatusBadge";
import {
  useTickets,
  useNewTicketCount,
  useCSCategories,
  useBulkUpdateTickets,
  useCreateTicket,
} from "@/hooks/customer-service/useTickets";
import { useSendTicketReply } from "@/hooks/customer-service/useTicketReply";
import { useEmployees } from "@/hooks/useEmployees";
import { useUserRole } from "@/context/UserRoleContext";
import { useToast } from "@/context/ToastContext";
import type {
  TicketStatus,
  TicketPriority,
  TicketFilters,
  CSTicket,
} from "@/lib/cs-types";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_CHANNEL_LABELS,
} from "@/lib/cs-types";
import {
  Search,
  Inbox,
  Clock,
  CheckCircle2,
  Mail,
  FileText,
  Phone,
  PenLine,
  UserRound,
  X,
  Loader2,
  PenSquare,
  ChevronLeft,
  ChevronRight,
  Users,
  UserX,
  RefreshCw,
} from "lucide-react";

// ─── Status tabs ────────────────────────────────────────────────────────────

type InboxTab = "inbox" | "waiting_customer" | "waiting_internal" | "done";

const TABS: { value: InboxTab; label: string; icon: typeof Inbox; statuses: TicketStatus | TicketStatus[] }[] = [
  { value: "inbox", label: "Saapuneet", icon: Inbox, statuses: ["new", "open"] },
  { value: "waiting_customer", label: "Odottaa asiakasta", icon: Clock, statuses: "waiting_customer" },
  { value: "waiting_internal", label: "Odottaa sisäistä", icon: Clock, statuses: "waiting_internal" },
  { value: "done", label: "Valmis", icon: CheckCircle2, statuses: ["resolved", "closed"] },
];

type ViewMode = "mine" | "unassigned" | "all";

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  form: FileText,
  phone: Phone,
  manual: PenLine,
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) {
    // Today → show time
    return date.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" });
  }
  if (diffDays === 1) return "eilen";
  if (diffDays < 7) {
    return date.toLocaleDateString("fi-FI", { weekday: "short", timeZone: "Europe/Helsinki" });
  }
  // Older → show date
  return date.toLocaleDateString("fi-FI", { day: "numeric", month: "short", timeZone: "Europe/Helsinki" });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TicketInbox() {
  const { employee } = useUserRole();
  const navigate = useNavigate();
  const toast = useToast();
  useNewTicketNotifications();

  const [activeTab, setActiveTab] = useState<InboxTab>("inbox");
  const [viewMode, setViewMode] = useState<ViewMode>("mine");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [showCompose, setShowCompose] = useState(false);

  const { data: agents } = useEmployees("admin");
  const { data: categories } = useCSCategories();
  const { data: newCount } = useNewTicketCount();
  const bulkUpdate = useBulkUpdateTickets();

  // Build assignee filter from view mode
  const assigneeFilter = useMemo(() => {
    if (viewMode === "mine") return employee?.id ?? "all";
    if (viewMode === "unassigned") return "unassigned";
    return "all";
  }, [viewMode, employee?.id]);

  // Build filters
  const tab = TABS.find((t) => t.value === activeTab)!;
  const filters: TicketFilters = useMemo(
    () => ({
      status: tab.statuses,
      priority: priorityFilter as TicketPriority | "all",
      category: categoryFilter,
      channel: channelFilter as "all",
      assigned_agent_id: assigneeFilter,
      search,
      page,
    }),
    [tab.statuses, priorityFilter, categoryFilter, channelFilter, assigneeFilter, search, page]
  );

  const { data: result, isLoading, refetch } = useTickets(filters);
  const tickets = result?.data ?? [];
  const [syncing, setSyncing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    try {
      // Trigger Gmail sync so DB reflects latest Gmail state
      await supabase.functions.invoke("sync-gmail", {
        body: { email_address: "info@lasikiilto.fi" },
      });
    } catch {
      // Non-critical
    }
    await refetch();
    setSyncing(false);
  }, [refetch]);

  // Reset page + selection on filter changes
  function resetPage() {
    setPage(0);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === tickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map((t) => t.id)));
    }
  }

  async function handleBulkAction(updates: Parameters<typeof bulkUpdate.mutate>[0]["updates"]) {
    bulkUpdate.mutate(
      { ids: Array.from(selectedIds), updates },
      {
        onSuccess: () => {
          toast.success(`${selectedIds.size} tikettiä päivitetty`);
          setSelectedIds(new Set());
        },
        onError: (e) => toast.error(e.message),
      }
    );
  }

  return (
    <div className="space-y-5">
      <SyncHealthBanner />
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Asiakaspalvelu</h1>
        <div className="flex items-center gap-2">
          <NotificationToggle />
          <button
            onClick={handleRefresh}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3 py-2.5 border border-border rounded-xl text-sm text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
            title="Synkronoi Gmail & päivitä"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            <PenSquare className="h-4 w-4" />
            Kirjoita
          </button>
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {([
          { value: "mine", label: "Omat", icon: UserRound },
          { value: "unassigned", label: "Ei vastuuhenkilöä", icon: UserX },
          { value: "all", label: "Kaikki", icon: Users },
        ] as const).map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.value}
              onClick={() => { setViewMode(v.value); resetPage(); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                viewMode === v.value
                  ? "bg-accent text-white"
                  : "bg-surface border border-border text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Status tabs */}
      <div className="flex overflow-x-auto border-b border-border -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = t.value === "inbox" ? newCount : undefined;
          return (
            <button
              key={t.value}
              onClick={() => { setActiveTab(t.value); resetPage(); }}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.value
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(" ")[0]}</span>
              {count != null && count > 0 && (
                <Badge className="bg-accent text-white text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] rounded-full">
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Hae tikettiä..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="pl-9 pr-8 py-2 w-full sm:w-64 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); resetPage(); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); resetPage(); }}
          className="border border-border rounded-xl text-sm px-3 py-2 bg-surface"
        >
          <option value="all">Kaikki prioriteetit</option>
          {Object.entries(TICKET_PRIORITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {categories && categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); resetPage(); }}
            className="border border-border rounded-xl text-sm px-3 py-2 bg-surface"
          >
            <option value="all">Kaikki kategoriat</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        )}

        <select
          value={channelFilter}
          onChange={(e) => { setChannelFilter(e.target.value); resetPage(); }}
          className="border border-border rounded-xl text-sm px-3 py-2 bg-surface"
        >
          <option value="all">Kaikki kanavat</option>
          {Object.entries(TICKET_CHANNEL_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-accent/5 border border-accent/20 rounded-xl px-3 sm:px-4 py-2.5">
          <span className="text-sm font-medium text-accent">
            {selectedIds.size} valittu
          </span>
          <div className="h-4 w-px bg-border hidden sm:block" />

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleBulkAction({ assigned_agent_id: e.target.value || null });
              e.target.value = "";
            }}
            className="border border-border rounded-xl text-sm px-2.5 py-1.5 bg-surface"
          >
            <option value="" disabled>Aseta vastuuhenkilö</option>
            <option value="">Ei vastuuhenkilöä</option>
            {(agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
            ))}
          </select>

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleBulkAction({ status: e.target.value as TicketStatus });
              e.target.value = "";
            }}
            className="border border-border rounded-xl text-sm px-2.5 py-1.5 bg-surface"
          >
            <option value="" disabled>Muuta tilaa</option>
            <option value="open">Avoin</option>
            <option value="waiting_customer">Odottaa asiakasta</option>
            <option value="waiting_internal">Odottaa sisäistä</option>
            <option value="resolved">Ratkaistu</option>
          </select>

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleBulkAction({ priority: e.target.value as TicketPriority });
              e.target.value = "";
            }}
            className="border border-border rounded-xl text-sm px-2.5 py-1.5 bg-surface"
          >
            <option value="" disabled>Muuta prioriteettia</option>
            {Object.entries(TICKET_PRIORITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-text-muted hover:text-text-secondary"
          >
            Tyhjennä valinta
          </button>
        </div>
      )}

      {/* Ticket table */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Inbox className="h-10 w-10 mb-2" />
            <p className="text-sm font-medium">Ei tikettejä</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  <th className="pl-4 pr-2 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === tickets.length && tickets.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="px-2 py-3 w-24">Tila</th>
                  <th className="px-2 py-3 w-20">SLA</th>
                  <th className="px-2 py-3">Aihe</th>
                  <th className="px-2 py-3 w-40">Asiakas</th>
                  <th className="px-2 py-3 w-32">Vastuuhenkilö</th>
                  <th className="pr-4 pl-2 py-3 w-24 text-right">Saapui</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    selected={selectedIds.has(ticket.id)}
                    onToggle={() => toggleSelect(ticket.id)}
                    onClick={() => navigate(`/asiakaspalvelu/${ticket.ticket_number}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {result && result.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-text-muted">
            <span>{result.count} yhteensä</span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="p-1 rounded-lg hover:bg-surface-hover disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2">{page + 1} / {result.totalPages}</span>
              <button
                disabled={page >= result.totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="p-1 rounded-lg hover:bg-surface-hover disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Compose modal */}
      {showCompose && (
        <ComposeModal onClose={() => setShowCompose(false)} actorId={employee?.id} />
      )}
    </div>
  );
}

// ─── Ticket Row ──────────────────────────────────────────────────────────────

function TicketRow({
  ticket,
  selected,
  onToggle,
  onClick,
}: {
  ticket: CSTicket;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  const isUnread = ticket.status === "new";
  const ChannelIcon = CHANNEL_ICONS[ticket.channel] ?? Mail;

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer transition-colors ${
        selected ? "bg-accent/5" : isUnread ? "bg-blue-50/40" : "hover:bg-surface-hover"
      }`}
    >
      <td className="pl-4 pr-2 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-border"
        />
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-2">
          <TicketStatusBadge status={ticket.status} />
        </div>
      </td>
      <td className="px-2 py-3">
        <SLAIndicator ticket={ticket} />
      </td>
      <td className="px-2 py-3 min-w-0">
        <div className="flex items-center gap-2">
          <ChannelIcon className="h-3.5 w-3.5 text-text-muted shrink-0" />
          <div className="min-w-0">
            <p className={`truncate ${isUnread ? "font-semibold text-text-primary" : "text-text-primary"}`}>
              {ticket.subject}
            </p>
            {ticket.snippet && (
              <p className="text-xs text-text-muted truncate mt-0.5">
                {ticket.snippet}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-3">
        <div className="min-w-0">
          <p className={`text-sm truncate ${isUnread ? "font-medium" : ""}`}>
            {ticket.customer_name || ticket.customer_email || "Tuntematon"}
          </p>
        </div>
      </td>
      <td className="px-2 py-3">
        {ticket.assigned_agent ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <UserRound className="h-3.5 w-3.5" />
            {ticket.assigned_agent.first_name}
          </span>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
      <td className="pr-4 pl-2 py-3 text-right">
        <span className="text-xs text-text-muted whitespace-nowrap">
          {formatDate(ticket.last_activity_at)}
        </span>
      </td>
    </tr>
  );
}

// ─── Compose Modal ───────────────────────────────────────────────────────────

function ComposeModal({ onClose, actorId }: { onClose: () => void; actorId?: string }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const createTicket = useCreateTicket();
  const sendReply = useSendTicketReply();

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim() || !subject.trim() || !body.trim() || sending) return;

    setSending(true);
    try {
      const ticket = await createTicket.mutateAsync({
        subject,
        channel: "email" as const,
        customer_email: to.trim(),
        assigned_agent_id: actorId,
      });

      await sendReply.mutateAsync({
        ticketId: ticket.id,
        to: [to.trim()],
        subject,
        body_html: `<div style="font-family:Arial,sans-serif;font-size:14px">${body.replace(/\n/g, "<br>")}</div>`,
        actorId,
      });

      toast.success("Viesti lähetetty");
      onClose();
    } catch (err: any) {
      toast.error(`Lähetys epäonnistui: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/30">
      <div className="w-full max-w-2xl bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-text-primary">Uusi viesti</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSend} className="flex-1 flex flex-col min-h-0">
          <div className="px-5 py-3 space-y-2 border-b border-border">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted w-16">Kenelle:</span>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="email@example.com"
                className="flex-1 border-none bg-transparent focus:outline-none text-text-primary"
                required
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted w-16">Aihe:</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Viestin aihe"
                className="flex-1 border-none bg-transparent focus:outline-none text-text-primary"
                required
              />
            </div>
          </div>

          <div className="flex-1 px-5 py-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Kirjoita viesti..."
              className="w-full h-full min-h-[200px] resize-none border-none bg-transparent text-sm focus:outline-none placeholder:text-text-muted"
            />
          </div>

          <div className="flex items-center justify-end px-5 py-3 border-t border-border">
            <button
              type="submit"
              disabled={!to.trim() || !subject.trim() || !body.trim() || sending}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {sending ? "Lähetetään..." : "Lähetä"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
