import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface MarketingCampaign {
  id: string;
  platform: "google_ads" | "meta_ads";
  platform_campaign_id: string;
  name: string;
  status: string;
  campaign_type: string | null;
  region_id: string | null;
  service_area_id: string | null;
  service_id: string | null;
  created_at: string;
  updated_at: string;
  service_areas: { id: string; name: string } | null;
  services: { id: string; name: string } | null;
  marketing_ad_groups: MarketingAdGroup[];
}

export interface AssetStat {
  text: string;
  field_type: string; // HEADLINE, DESCRIPTION
  performance_label: string | null;
  impressions: number;
  clicks: number;
  spend_cents: number;
  conversions: number;
}

export interface MarketingAd {
  id: string;
  ad_group_id: string;
  platform_ad_id: string;
  name: string | null;
  status: string;
  headlines: string[];
  descriptions: string[];
  primary_text: string | null;
  cta: string | null;
  preview_url: string | null;
  creative_type: string | null;
  // Stats
  spend?: number;
  clicks?: number;
  impressions?: number;
  leads?: number;
  purchases?: number;
  schedules?: number;
}

export interface MarketingAdGroup {
  id: string;
  campaign_id: string;
  platform_ad_group_id: string;
  name: string;
  status: string;
  region_id: string | null;
  service_area_id: string | null;
  service_id: string | null;
  // Stats (populated by useMarketingCampaigns)
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  leads?: number;
  purchases?: number;
  schedules?: number;
  // Ads
  ads?: MarketingAd[];
  // Asset-level stats (per headline/description)
  assetStats?: AssetStat[];
}

export interface CampaignWithSpend extends MarketingCampaign {
  total_spend_cents: number;
  total_clicks: number;
  total_impressions: number;
  total_conversions: number;
  total_leads: number;
  total_purchases: number;
  total_schedules: number;
}

export function useMarketingCampaigns(from: string, to: string) {
  return useQuery<CampaignWithSpend[]>({
    queryKey: ["marketing-campaigns", from, to],
    queryFn: async () => {
      // Fetch campaigns with joined data
      const { data: campaigns, error } = await supabase
        .from("marketing_campaigns")
        .select(
          "*, service_areas(id, name), services(id, name), marketing_ad_groups(id, campaign_id, platform_ad_group_id, name, status, service_area_id, service_id, region_id)"
        )
        .order("name");
      if (error) throw error;

      // Fetch aggregated stats per ad_group for the period (includes conversion types)
      const { data: stats, error: statsError } = await supabase
        .from("marketing_daily_stats")
        .select("ad_group_id, spend_cents, clicks, impressions, conversions, conversions_lead, conversions_purchase, conversions_schedule, marketing_ad_groups!inner(campaign_id)")
        .gte("date", from)
        .lte("date", to);
      if (statsError) throw statsError;

      // Aggregate stats by campaign_id AND by ad_group_id
      type Stats = { spend: number; clicks: number; impressions: number; conversions: number; leads: number; purchases: number; schedules: number };
      const campaignMap = new Map<string, Stats>();
      const adGroupStatsMap = new Map<string, Stats>();

      for (const s of stats || []) {
        const cid = (s.marketing_ad_groups as unknown as { campaign_id: string }).campaign_id;
        const agid = s.ad_group_id;

        // Campaign level
        const ce = campaignMap.get(cid) || { spend: 0, clicks: 0, impressions: 0, conversions: 0, leads: 0, purchases: 0, schedules: 0 };
        ce.spend += s.spend_cents;
        ce.clicks += s.clicks;
        ce.impressions += s.impressions;
        ce.conversions += Number(s.conversions);
        ce.leads += Number(s.conversions_lead || 0);
        ce.purchases += Number(s.conversions_purchase || 0);
        ce.schedules += Number(s.conversions_schedule || 0);
        campaignMap.set(cid, ce);

        // Ad group level
        const ae = adGroupStatsMap.get(agid) || { spend: 0, clicks: 0, impressions: 0, conversions: 0, leads: 0, purchases: 0, schedules: 0 };
        ae.spend += s.spend_cents;
        ae.clicks += s.clicks;
        ae.impressions += s.impressions;
        ae.conversions += Number(s.conversions);
        ae.leads += Number(s.conversions_lead || 0);
        ae.purchases += Number(s.conversions_purchase || 0);
        ae.schedules += Number(s.conversions_schedule || 0);
        adGroupStatsMap.set(agid, ae);
      }

      // Fetch ads with creative data + stats via join
      const { data: adsWithStats } = await supabase
        .from("marketing_ads")
        .select("id, ad_group_id, platform_ad_id, name, status, headlines, descriptions, primary_text, cta, preview_url, creative_type, marketing_ad_daily_stats(spend_cents, clicks, impressions, conversions_lead, conversions_purchase, conversions_schedule, date)")
        .order("name");

      // Aggregate ad stats from joined daily rows
      const adStatsMap = new Map<string, Stats>();
      for (const a of adsWithStats || []) {
        const raw = a as unknown as { id: string; marketing_ad_daily_stats: { spend_cents: number; clicks: number; impressions: number; conversions_lead: number; conversions_purchase: number; conversions_schedule: number; date: string }[] };
        const stats = (raw.marketing_ad_daily_stats || [])
          .filter((s) => s.date >= from && s.date <= to);
        if (stats.length > 0) {
          const agg: Stats = { spend: 0, clicks: 0, impressions: 0, conversions: 0, leads: 0, purchases: 0, schedules: 0 };
          for (const s of stats) {
            agg.spend += s.spend_cents;
            agg.clicks += s.clicks;
            agg.impressions += s.impressions;
            agg.leads += Number(s.conversions_lead || 0);
            agg.purchases += Number(s.conversions_purchase || 0);
            agg.schedules += Number(s.conversions_schedule || 0);
          }
          adStatsMap.set(raw.id, agg);
        }
      }

      // Group ads by ad_group_id
      const adsByGroup = new Map<string, MarketingAd[]>();
      for (const a of adsWithStats || []) {
        const raw = a as unknown as { id: string; ad_group_id: string; platform_ad_id: string; name: string | null; status: string; headlines: unknown; descriptions: unknown; primary_text: string | null; cta: string | null; preview_url: string | null; creative_type: string | null };
        const as_ = adStatsMap.get(raw.id);
        const ad: MarketingAd = {
          ...raw,
          headlines: Array.isArray(raw.headlines) ? raw.headlines : (typeof raw.headlines === "string" ? JSON.parse(raw.headlines) : []),
          descriptions: Array.isArray(raw.descriptions) ? raw.descriptions : (typeof raw.descriptions === "string" ? JSON.parse(raw.descriptions) : []),
          spend: as_?.spend || 0,
          clicks: as_?.clicks || 0,
          impressions: as_?.impressions || 0,
          leads: as_?.leads || 0,
          purchases: as_?.purchases || 0,
          schedules: as_?.schedules || 0,
        };
        const list = adsByGroup.get(raw.ad_group_id) || [];
        list.push(ad);
        adsByGroup.set(raw.ad_group_id, list);
      }

      // Fetch asset-level stats (per headline/description)
      const { data: assetStatsRaw } = await supabase
        .from("marketing_asset_stats")
        .select("ad_group_id, field_type, text, performance_label, impressions, clicks, spend_cents, conversions")
        .order("impressions", { ascending: false });

      const assetsByGroup = new Map<string, AssetStat[]>();
      for (const a of assetStatsRaw || []) {
        const raw = a as { ad_group_id: string; field_type: string; text: string; performance_label: string | null; impressions: number; clicks: number; spend_cents: number; conversions: number };
        const list = assetsByGroup.get(raw.ad_group_id) || [];
        list.push(raw);
        assetsByGroup.set(raw.ad_group_id, list);
      }

      return (campaigns || []).map((c) => {
        const s = campaignMap.get(c.id) || { spend: 0, clicks: 0, impressions: 0, conversions: 0, leads: 0, purchases: 0, schedules: 0 };
        const adGroupsWithStats = (c.marketing_ad_groups || []).map((ag: MarketingAdGroup) => {
          const as_ = adGroupStatsMap.get(ag.id) || { spend: 0, clicks: 0, impressions: 0, conversions: 0, leads: 0, purchases: 0, schedules: 0 };
          return { ...ag, ...as_, ads: adsByGroup.get(ag.id) || [], assetStats: assetsByGroup.get(ag.id) || [] };
        });
        return {
          ...c,
          marketing_ad_groups: adGroupsWithStats,
          total_spend_cents: s.spend,
          total_clicks: s.clicks,
          total_impressions: s.impressions,
          total_conversions: s.conversions,
          total_leads: s.leads,
          total_purchases: s.purchases,
          total_schedules: s.schedules,
        } as CampaignWithSpend;
      });
    },
  });
}

// Mutation to update campaign/ad group area & service mapping
export function useUpdateCampaignMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      table: "marketing_campaigns" | "marketing_ad_groups";
      id: string;
      region_id: string | null;
      service_id: string | null;
    }) => {
      const { error } = await supabase
        .from(params.table)
        .update({
          region_id: params.region_id,
          service_id: params.service_id,
        })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      qc.invalidateQueries({ queryKey: ["marketing-area-profitability"] });
    },
  });
}
