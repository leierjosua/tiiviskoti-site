import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { groupIntoThreads } from "@/hooks/sales/useSalesEmails";
import type { CSTicket, TicketFilters } from "@/lib/cs-types";
import type { SalesEmail, EmailThread } from "@/lib/sales-types";

const TICKET_SELECT = `*, assigned_agent:employees!cs_tickets_assigned_agent_id_fkey(id, first_name, last_name), cs_categories(id, label, color)`;

export interface TicketFilteredResult {
  threads: EmailThread[];
  ticketMap: Map<string, CSTicket>;
}

/**
 * When CS filters are active, fetch tickets first, then load their email threads.
 */
export function useTicketFilteredThreads(filters: TicketFilters) {
  const {
    status = "all",
    priority = "all",
    category = "all",
    assigned_agent_id = "all",
    search,
  } = filters;

  return useQuery({
    queryKey: ["cs-filtered-threads", { status, priority, category, assigned_agent_id, search }],
    staleTime: 30_000,
    queryFn: async (): Promise<TicketFilteredResult> => {
      // 1. Query cs_tickets with filters
      let query = supabase
        .from("cs_tickets")
        .select(TICKET_SELECT)
        .eq("is_merged", false)
        .not("gmail_thread_id", "is", null) // Only email-based tickets
        .order("last_activity_at", { ascending: false })
        .limit(200);

      if (Array.isArray(status)) {
        query = query.in("status", status);
        const activeStatuses = ["new", "open", "waiting_customer", "waiting_internal"];
        if (status.some((s) => activeStatuses.includes(s))) {
          query = query.eq("gmail_archived", false).eq("gmail_trashed", false);
        }
      } else if (status !== "all") {
        query = query.eq("status", status);
        if (["new", "open", "waiting_customer", "waiting_internal"].includes(status)) {
          query = query.eq("gmail_archived", false).eq("gmail_trashed", false);
        }
      }
      if (priority !== "all") query = query.eq("priority", priority);
      if (category !== "all") query = query.eq("category", category);
      if (assigned_agent_id === "unassigned") {
        query = query.is("assigned_agent_id", null);
      } else if (assigned_agent_id !== "all") {
        query = query.eq("assigned_agent_id", assigned_agent_id);
      }
      if (search) {
        query = query.or(
          `subject.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,snippet.ilike.%${search}%`
        );
      }

      const { data: tickets, error: ticketErr } = await query;
      if (ticketErr) throw ticketErr;

      const ticketList = (tickets ?? []) as CSTicket[];

      // 2. Collect gmail_thread_ids
      const threadIds = ticketList
        .map((t) => t.gmail_thread_id)
        .filter((id): id is string => !!id);

      // 3. Build ticket map
      const ticketMap = new Map<string, CSTicket>();
      for (const t of ticketList) {
        if (t.gmail_thread_id) ticketMap.set(t.gmail_thread_id, t);
      }

      if (threadIds.length === 0) {
        return { threads: [], ticketMap };
      }

      // 4. Fetch emails for those threads
      const batchSize = 100;
      const allEmails: SalesEmail[] = [];
      for (let i = 0; i < threadIds.length; i += batchSize) {
        const batch = threadIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("sales_emails")
          .select("*")
          .in("gmail_thread_id", batch)
          .eq("is_trashed", false)
          .order("date", { ascending: false })
          .limit(1000);
        if (error) throw error;
        allEmails.push(...((data ?? []) as SalesEmail[]));
      }

      // 5. Group into threads and sort by ticket order
      const threads = groupIntoThreads(allEmails);

      // Sort threads to match ticket order (most recent activity first)
      const threadIdOrder = new Map(threadIds.map((id, idx) => [id, idx]));
      threads.sort((a, b) => {
        const ai = threadIdOrder.get(a.thread_id) ?? 999;
        const bi = threadIdOrder.get(b.thread_id) ?? 999;
        return ai - bi;
      });

      return { threads, ticketMap };
    },
  });
}
