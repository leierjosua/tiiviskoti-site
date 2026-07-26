import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AwaitingReplyInfo {
  opportunity_id: string;
  last_inbound_at: string;
  hours_waiting: number;
}

export function useAwaitingReply() {
  return useQuery({
    queryKey: ["awaiting-reply"],
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_opportunities_awaiting_reply");
      if (error) throw error;
      const map = new Map<string, AwaitingReplyInfo>();
      for (const row of data || []) {
        map.set(row.opportunity_id, row as AwaitingReplyInfo);
      }
      return map;
    },
  });
}
