import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

export interface ActivityFeedItem {
  id: string;
  entity_type: "lead" | "opportunity";
  entity_id: string;
  entity_name: string | null;
  salesperson_id: string | null;
  salesperson_name: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export function useActivityFeed(limit = 30) {
  return useQuery({
    queryKey: queryKeys.sales.management.activityFeed(limit),
    queryFn: async () => {
      // Fetch lead events and opportunity events in parallel
      const [leadEventsRes, oppEventsRes] = await Promise.all([
        supabase
          .from("sales_lead_events")
          .select("id, lead_id, salesperson_id, type, payload, created_at")
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("sales_opportunity_events")
          .select("id, opportunity_id, salesperson_id, type, payload, created_at")
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

      const leadEvents = (leadEventsRes.data || []).map((e) => ({
        id: e.id,
        entity_type: "lead" as const,
        entity_id: e.lead_id,
        entity_name: null as string | null,
        salesperson_id: e.salesperson_id,
        salesperson_name: null as string | null,
        type: e.type,
        payload: e.payload as Record<string, unknown>,
        created_at: e.created_at,
      }));

      const oppEvents = (oppEventsRes.data || []).map((e) => ({
        id: e.id,
        entity_type: "opportunity" as const,
        entity_id: e.opportunity_id,
        entity_name: null as string | null,
        salesperson_id: e.salesperson_id,
        salesperson_name: null as string | null,
        type: e.type,
        payload: e.payload as Record<string, unknown>,
        created_at: e.created_at,
      }));

      // Merge and sort by date
      const merged = [...leadEvents, ...oppEvents]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);

      return merged as ActivityFeedItem[];
    },
    refetchInterval: 30_000, // Auto-refresh every 30s
  });
}
