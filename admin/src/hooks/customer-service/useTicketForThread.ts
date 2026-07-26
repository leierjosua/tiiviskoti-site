import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CSTicket } from "@/lib/cs-types";

const TICKET_SELECT = `*, assigned_agent:employees!cs_tickets_assigned_agent_id_fkey(id, first_name, last_name), cs_categories(id, label, color)`;

/**
 * Fetch a single CS ticket by its gmail_thread_id.
 */
export function useTicketForThread(gmailThreadId: string | undefined) {
  return useQuery({
    queryKey: ["cs-ticket-by-thread", gmailThreadId],
    enabled: !!gmailThreadId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_tickets")
        .select(TICKET_SELECT)
        .eq("gmail_thread_id", gmailThreadId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CSTicket) ?? null;
    },
  });
}

/**
 * Fetch CS tickets for multiple gmail_thread_ids at once.
 * Returns a Map<gmail_thread_id, CSTicket>.
 */
export function useTicketsForThreads(threadIds: string[]) {
  const uniqueIds = [...new Set(threadIds.filter(Boolean))];
  return useQuery({
    queryKey: ["cs-tickets-by-threads", uniqueIds.sort().join(",")],
    enabled: uniqueIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const map = new Map<string, CSTicket>();
      if (uniqueIds.length === 0) return map;

      // Supabase .in() has a limit, batch if needed
      const batchSize = 100;
      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("cs_tickets")
          .select(TICKET_SELECT)
          .in("gmail_thread_id", batch);
        if (error) throw error;
        for (const ticket of (data ?? []) as CSTicket[]) {
          if (ticket.gmail_thread_id) {
            map.set(ticket.gmail_thread_id, ticket);
          }
        }
      }
      return map;
    },
  });
}
