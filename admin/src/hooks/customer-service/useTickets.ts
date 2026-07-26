import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type {
  CSTicket,
  CSCategory,
  TicketFilters,
} from "@/lib/cs-types";
import { TICKETS_PAGE_SIZE } from "@/lib/cs-types";

// ─── Paginated List ──────────────────────────────────────────────────────────

export interface PaginatedTickets {
  data: CSTicket[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useTickets(filters: TicketFilters = {}) {
  const {
    status = "all",
    priority = "all",
    category = "all",
    channel = "all",
    assigned_agent_id = "all",
    search,
    page = 0,
  } = filters;

  return useQuery({
    queryKey: queryKeys.customerService.tickets.list({
      status,
      priority,
      category,
      channel,
      assigned_agent_id,
      search,
      page,
    }),
    queryFn: async (): Promise<PaginatedTickets> => {
      let query = supabase
        .from("cs_tickets")
        .select(
          `*, assigned_agent:employees!cs_tickets_assigned_agent_id_fkey(id, first_name, last_name), cs_categories(id, label, color)`,
          { count: "exact" }
        )
        .eq("is_merged", false)
        .order("last_activity_at", { ascending: false })
        .range(page * TICKETS_PAGE_SIZE, (page + 1) * TICKETS_PAGE_SIZE - 1);

      if (Array.isArray(status)) {
        query = query.in("status", status);
        // For active statuses, exclude tickets whose Gmail thread is archived/trashed
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
      if (priority !== "all") {
        query = query.eq("priority", priority);
      }
      if (category !== "all") {
        query = query.eq("category", category);
      }
      if (channel !== "all") {
        query = query.eq("channel", channel);
      }
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

      const { data, error, count } = await query;
      if (error) throw error;

      const total = count ?? 0;
      return {
        data: (data ?? []) as CSTicket[],
        count: total,
        page,
        pageSize: TICKETS_PAGE_SIZE,
        totalPages: Math.ceil(total / TICKETS_PAGE_SIZE),
      };
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

// ─── Counts ──────────────────────────────────────────────────────────────────

export function useOpenTicketCount() {
  return useQuery({
    queryKey: queryKeys.customerService.tickets.count("open"),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("cs_tickets")
        .select("*", { count: "exact", head: true })
        .eq("is_merged", false)
        .in("status", ["new", "open", "waiting_internal"]);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
}

export function useNewTicketCount() {
  return useQuery({
    queryKey: queryKeys.customerService.tickets.count("new"),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("cs_tickets")
        .select("*", { count: "exact", head: true })
        .eq("status", "new")
        .eq("is_merged", false);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
}

// ─── Categories ──────────────────────────────────────────────────────────────

export function useCSCategories() {
  return useQuery({
    queryKey: queryKeys.customerService.categories.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_categories")
        .select("*")
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return data as CSCategory[];
    },
  });
}

// ─── Bulk Mutations ──────────────────────────────────────────────────────────

export function useBulkUpdateTickets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: Partial<Pick<CSTicket, "status" | "priority" | "category" | "assigned_agent_id">>;
    }) => {
      const { error } = await supabase
        .from("cs_tickets")
        .update(updates)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customerService.tickets.all });
    },
  });
}

// ─── Create Ticket (manual / from form submission) ───────────────────────────

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      ticket: Pick<CSTicket, "subject" | "channel"> &
        Partial<
          Pick<
            CSTicket,
            | "customer_name"
            | "customer_email"
            | "customer_phone"
            | "customer_id"
            | "category"
            | "priority"
            | "assigned_agent_id"
            | "form_submission_id"
            | "gmail_thread_id"
            | "snippet"
            | "tags"
          >
        >
    ) => {
      // Look up SLA targets from category
      let sla_first_response_minutes: number | null = null;
      let sla_resolution_minutes: number | null = null;
      if (ticket.category) {
        const { data: cat } = await supabase
          .from("cs_categories")
          .select("sla_first_response_minutes, sla_resolution_minutes")
          .eq("id", ticket.category)
          .single();
        if (cat) {
          sla_first_response_minutes = cat.sla_first_response_minutes;
          sla_resolution_minutes = cat.sla_resolution_minutes;
        }
      }

      const { data, error } = await supabase
        .from("cs_tickets")
        .insert({
          ...ticket,
          sla_first_response_minutes,
          sla_resolution_minutes,
        })
        .select()
        .single();
      if (error) throw error;

      // If created from form submission, link back
      if (ticket.form_submission_id) {
        await supabase
          .from("form_submissions")
          .update({ cs_ticket_id: data.id })
          .eq("id", ticket.form_submission_id);
      }

      return data as CSTicket;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customerService.tickets.all });
      qc.invalidateQueries({ queryKey: queryKeys.formSubmissions.all });
    },
  });
}
