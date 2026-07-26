import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

interface SalesDashboardStats {
  totalLeads: number;
  leadsThisWeek: number;
  totalOpportunities: number;
  opportunitiesThisWeek: number;
  openOffers: number;
  wonDeals: number;
  conversionRate: number;
  totalCommissions: number;
}

export function useSalesDashboardStats(salespersonId?: string) {
  return useQuery({
    queryKey: queryKeys.sales.dashboard.stats(salespersonId),
    queryFn: async (): Promise<SalesDashboardStats> => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Build queries with optional salesperson filter
      let leadsQ = supabase.from("sales_leads").select("id", { count: "exact", head: true });
      let leadsWeekQ = supabase.from("sales_leads").select("id", { count: "exact", head: true }).gte("created_at", weekAgo);
      let oppsQ = supabase.from("sales_opportunities").select("id", { count: "exact", head: true }).eq("is_archived", false);
      let oppsWeekQ = supabase.from("sales_opportunities").select("id", { count: "exact", head: true }).gte("created_at", weekAgo);
      let offersQ = supabase.from("sales_offers").select("id", { count: "exact", head: true }).eq("status", "sent");
      let wonQ = supabase.from("sales_opportunities").select("id", { count: "exact", head: true }).eq("status", "voitettu");

      if (salespersonId) {
        leadsQ = leadsQ.eq("assigned_salesperson_id", salespersonId);
        leadsWeekQ = leadsWeekQ.eq("assigned_salesperson_id", salespersonId);
        oppsQ = oppsQ.eq("assigned_salesperson_id", salespersonId);
        oppsWeekQ = oppsWeekQ.eq("assigned_salesperson_id", salespersonId);
        offersQ = offersQ.eq("created_by_salesperson_id", salespersonId);
        wonQ = wonQ.eq("assigned_salesperson_id", salespersonId);
      }

      const [leadsRes, leadsWeekRes, oppsRes, oppsWeekRes, offersRes, wonRes, commissionsRes] =
        await Promise.all([
          leadsQ, leadsWeekQ, oppsQ, oppsWeekQ, offersQ, wonQ,
          supabase.rpc("get_total_sales_commission"),
        ]);

      const totalLeads = leadsRes.count || 0;
      const totalOpps = oppsRes.count || 0;
      const wonDeals = wonRes.count || 0;
      const totalCommissions = Number(commissionsRes.data ?? 0);

      return {
        totalLeads,
        leadsThisWeek: leadsWeekRes.count || 0,
        totalOpportunities: totalOpps,
        opportunitiesThisWeek: oppsWeekRes.count || 0,
        openOffers: offersRes.count || 0,
        wonDeals,
        conversionRate: totalOpps > 0 ? (wonDeals / totalOpps) * 100 : 0,
        totalCommissions,
      };
    },
  });
}
