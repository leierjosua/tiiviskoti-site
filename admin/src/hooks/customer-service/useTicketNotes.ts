import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

export function useAddTicketNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      bodyHtml,
      bodyText,
      actorId,
      isInternal = true,
    }: {
      ticketId: string;
      bodyHtml: string;
      bodyText: string;
      actorId?: string;
      isInternal?: boolean;
    }) => {
      const { error } = await supabase.from("cs_ticket_events").insert({
        ticket_id: ticketId,
        type: "note",
        actor_id: actorId ?? null,
        body_html: bodyHtml,
        body_text: bodyText,
        is_internal: isInternal,
      });
      if (error) throw error;

      // Update last_activity_at
      await supabase
        .from("cs_tickets")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", ticketId);
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.tickets.events(v.ticketId),
      });
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.tickets.all,
      });
    },
  });
}
