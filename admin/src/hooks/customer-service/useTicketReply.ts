import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

export interface TicketReplyPayload {
  ticketId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_html: string;
  in_reply_to?: string;
  thread_id?: string;
  actorId?: string;
  attachments?: {
    filename: string;
    mimeType: string;
    base64: string;
  }[];
}

export function useSendTicketReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TicketReplyPayload) => {
      const { data, error } = await supabase.functions.invoke(
        "cs-send-ticket-reply",
        { body: payload }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
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
