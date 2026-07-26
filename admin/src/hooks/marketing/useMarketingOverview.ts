import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";

export interface PlatformOverview {
  platform: "google_ads" | "meta_ads";
  total_spend_cents: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_leads: number;
  total_purchases: number;
  total_schedules: number;
  campaign_count: number;
}

export interface MarketingOverview {
  platforms: PlatformOverview[];
  totalSpendCents: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalLeads: number;
  totalPurchases: number;
  totalSchedules: number;
  ctr: number;
  cpc: number;
  cpa: number;
}

export function useMarketingOverview(from: string, to: string) {
  const queryClient = useQueryClient();

  // Realtime subscription to invalidate on sync
  useEffect(() => {
    const channel = supabase
      .channel("marketing-overview-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketing_daily_stats" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["marketing-overview"] });
          queryClient.invalidateQueries({ queryKey: ["analytics"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery<MarketingOverview>({
    queryKey: ["marketing-overview", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_marketing_overview", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;

      const platforms = (data || []) as PlatformOverview[];

      const totalSpendCents = platforms.reduce((s, p) => s + p.total_spend_cents, 0);
      const totalImpressions = platforms.reduce((s, p) => s + p.total_impressions, 0);
      const totalClicks = platforms.reduce((s, p) => s + p.total_clicks, 0);
      const totalConversions = platforms.reduce((s, p) => s + p.total_conversions, 0);
      const totalLeads = platforms.reduce((s, p) => s + Number(p.total_leads || 0), 0);
      const totalPurchases = platforms.reduce((s, p) => s + Number(p.total_purchases || 0), 0);
      const totalSchedules = platforms.reduce((s, p) => s + Number(p.total_schedules || 0), 0);

      return {
        platforms,
        totalSpendCents,
        totalImpressions,
        totalClicks,
        totalConversions,
        totalLeads,
        totalPurchases,
        totalSchedules,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        cpc: totalClicks > 0 ? Math.round(totalSpendCents / totalClicks) : 0,
        cpa: totalConversions > 0 ? Math.round(totalSpendCents / totalConversions) : 0,
      };
    },
  });
}
