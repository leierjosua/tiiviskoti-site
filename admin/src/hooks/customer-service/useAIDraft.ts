import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { CSAIDraftResult, AIFeedbackAction } from "@/lib/cs-types";

export function useGenerateAIDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      agentHint,
    }: {
      ticketId: string;
      agentHint?: string;
    }): Promise<CSAIDraftResult> => {
      const { data, error } = await supabase.functions.invoke(
        "cs-ai-generate-draft",
        {
          body: agentHint
            ? { ticket_id: ticketId, agent_hint: agentHint }
            : { ticket_id: ticketId },
        }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as CSAIDraftResult;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.tickets.events(v.ticketId),
      });
    },
  });
}

export function useDeleteAIDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      eventId,
    }: {
      ticketId: string;
      eventId: string;
    }) => {
      // Delete the cs_ticket_events row. Related cs_ai_feedback rows cascade
      // via FK on event_id. This fully removes the draft from history.
      const { error } = await supabase
        .from("cs_ticket_events")
        .delete()
        .eq("id", eventId);
      if (error) throw error;
      return ticketId;
    },
    onSuccess: (ticketId) => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.tickets.events(ticketId),
      });
    },
  });
}

export function useSubmitAIFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      eventId,
      action,
      editedBody,
      agentId,
      intent,
      customerType,
      confidence,
    }: {
      ticketId: string;
      eventId: string;
      action: AIFeedbackAction;
      editedBody?: string;
      agentId?: string;
      intent?: string;
      customerType?: string;
      confidence?: number;
    }) => {
      // Write intent/customerType/confidence when available so the quality
      // dashboard in CSSettings has per-intent breakdowns. If the columns
      // don't exist yet (migration pending) the insert falls back without.
      const base: Record<string, unknown> = {
        ticket_id: ticketId,
        event_id: eventId,
        action,
        edited_body: editedBody ?? null,
        agent_id: agentId ?? null,
      };
      if (intent) base.intent = intent;
      if (customerType) base.customer_type = customerType;
      if (typeof confidence === "number") base.confidence = confidence;

      const { error } = await supabase.from("cs_ai_feedback").insert(base);
      if (error && (error.message ?? "").includes("column")) {
        // Retry without the new columns (migration not yet applied)
        const { error: err2 } = await supabase.from("cs_ai_feedback").insert({
          ticket_id: ticketId,
          event_id: eventId,
          action,
          edited_body: editedBody ?? null,
          agent_id: agentId ?? null,
        });
        if (err2) throw err2;
      } else if (error) {
        throw error;
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.tickets.events(v.ticketId),
      });
    },
  });
}
