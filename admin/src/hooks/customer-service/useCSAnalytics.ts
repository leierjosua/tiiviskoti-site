import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { finnishNow } from "@/lib/utils";

export interface CSDashboardStats {
  openTickets: number;
  newTickets: number;
  resolvedToday: number;
  avgFirstResponseMin: number | null;
  avgResolutionMin: number | null;
  slaBreachedCount: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byChannel: Record<string, number>;
  ticketsCreatedLast7Days: { date: string; count: number }[];
}

export function useCSDashboardStats(period = "7d") {
  return useQuery({
    queryKey: queryKeys.customerService.analytics.dashboard(period),
    queryFn: async (): Promise<CSDashboardStats> => {
      const now = finnishNow();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      // Open tickets count
      const { count: openTickets } = await supabase
        .from("cs_tickets")
        .select("*", { count: "exact", head: true })
        .eq("is_merged", false)
        .in("status", ["new", "open", "waiting_customer", "waiting_internal"]);

      // New tickets count
      const { count: newTickets } = await supabase
        .from("cs_tickets")
        .select("*", { count: "exact", head: true })
        .eq("status", "new")
        .eq("is_merged", false);

      // Resolved today
      const { count: resolvedToday } = await supabase
        .from("cs_tickets")
        .select("*", { count: "exact", head: true })
        .eq("is_merged", false)
        .gte("resolved_at", todayStart);

      // SLA breached
      const { count: slaBreachedCount } = await supabase
        .from("cs_tickets")
        .select("*", { count: "exact", head: true })
        .eq("sla_breached", true)
        .eq("is_merged", false)
        .in("status", ["new", "open", "waiting_customer", "waiting_internal"]);

      // Average response & resolution times (from resolved tickets last 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();
      const { data: resolvedTickets } = await supabase
        .from("cs_tickets")
        .select("created_at, first_response_at, resolved_at")
        .eq("is_merged", false)
        .not("resolved_at", "is", null)
        .gte("resolved_at", thirtyDaysAgo)
        .limit(500);

      let avgFirstResponseMin: number | null = null;
      let avgResolutionMin: number | null = null;

      if (resolvedTickets && resolvedTickets.length > 0) {
        const responseTimes = resolvedTickets
          .filter((t) => t.first_response_at)
          .map(
            (t) =>
              (new Date(t.first_response_at!).getTime() -
                new Date(t.created_at).getTime()) /
              60_000
          );
        if (responseTimes.length > 0) {
          avgFirstResponseMin =
            Math.round(
              responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            );
        }

        const resolutionTimes = resolvedTickets
          .filter((t) => t.resolved_at)
          .map(
            (t) =>
              (new Date(t.resolved_at!).getTime() -
                new Date(t.created_at).getTime()) /
              60_000
          );
        if (resolutionTimes.length > 0) {
          avgResolutionMin =
            Math.round(
              resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
            );
        }
      }

      // Group by status
      const { data: allTickets } = await supabase
        .from("cs_tickets")
        .select("status, category, priority, channel")
        .eq("is_merged", false);

      const byStatus: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      const byChannel: Record<string, number> = {};

      for (const t of allTickets ?? []) {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        byCategory[t.category] = (byCategory[t.category] || 0) + 1;
        byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
        byChannel[t.channel] = (byChannel[t.channel] || 0) + 1;
      }

      // Tickets created last 7 days
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
      const { data: recentTickets } = await supabase
        .from("cs_tickets")
        .select("created_at")
        .eq("is_merged", false)
        .gte("created_at", sevenDaysAgo);

      const dayMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400_000);
        dayMap[d.toISOString().slice(0, 10)] = 0;
      }
      for (const t of recentTickets ?? []) {
        const day = t.created_at.slice(0, 10);
        if (day in dayMap) dayMap[day]++;
      }
      const ticketsCreatedLast7Days = Object.entries(dayMap).map(
        ([date, count]) => ({ date, count })
      );

      return {
        openTickets: openTickets ?? 0,
        newTickets: newTickets ?? 0,
        resolvedToday: resolvedToday ?? 0,
        avgFirstResponseMin,
        avgResolutionMin,
        slaBreachedCount: slaBreachedCount ?? 0,
        byStatus,
        byCategory,
        byPriority,
        byChannel,
        ticketsCreatedLast7Days,
      };
    },
  });
}
