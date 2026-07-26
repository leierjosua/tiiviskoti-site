import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SiteAnalyticsData {
  // KPIs
  sessions: number;
  uniqueVisitors: number;
  pageViews: number;
  avgDurationSeconds: number;
  conversions: number;
  conversionRate: number;

  // Daily trend
  dailyTrend: { date: string; sessions: number; visitors: number; conversions: number }[];

  // Top landing pages
  topLandingPages: { page: string; sessions: number; conversions: number; rate: number }[];

  // Traffic sources
  trafficSources: { source: string; sessions: number; conversions: number; percent: number }[];

  // CTA clicks
  ctaClicks: { element: string; clicks: number; percent: number }[];

  // Conversion funnel
  funnel: { step: string; sessions: number }[];

  // Device breakdown
  devices: { type: string; count: number; percent: number }[];

  // Browser breakdown
  browsers: { name: string; count: number; percent: number }[];

  // Scroll depth (aggregated across pages)
  scrollDepth: { depth: number; count: number; percent: number }[];

  // Top pages by views
  topPages: { path: string; views: number; percent: number }[];

  // Widget attribution (where conversions come from)
  widgetAttribution: { source: string; conversions: number; percent: number }[];

  // Conversion paths (most common page sequences before conversion)
  conversionPaths: { path: string[]; count: number }[];

  // Engagement metrics
  avgEngagementSeconds: number;
  avgMaxScroll: number;
  avgInteractions: number;

  // Recent sessions (for session explorer)
  recentSessions: {
    session_id: string;
    visitor_id: string;
    started_at: string;
    landing_page: string;
    page_count: number;
    duration_seconds: number;
    engagement_seconds: number;
    has_conversion: boolean;
    conversion_type: string | null;
    utm_source: string | null;
    conversion_path: string[] | null;
  }[];

  // Rage clicks
  rageClicks: { page: string; count: number; element: string }[];

  // Form abandonment
  formAbandonment: { form: string; field: string; drop_count: number }[];

  // Postal code demand (valid + rejected)
  postalDemand: { postal_code: string; service: string; count: number; accepted: boolean }[];

  // Rejected areas (where we don't serve but have demand)
  rejectedAreas: { postal_code: string; count: number; services: string[] }[];

  // Booking funnel micro-steps
  bookingFunnel: { step: string; sessions: number; drop_rate: number }[];

  // Time slot preferences
  timeSlotPreferences: { time: string; count: number; percent: number }[];

  // Discount code attempts
  discountAttempts: { code: string; applied: number; rejected: number }[];

  // Multi-session visitors (returning before conversion)
  returningVisitors: { sessions_before_conversion: number; count: number }[];

  // Exit intent popup stats
  exitPopup: { shown: number; closed: number; cta_clicked: number; code_copied: number; conversion_rate: number };

  // IV system type preferences
  ivSystemTypes: { type: string; count: number; percent: number }[];

  // IV area size preferences
  ivAreaSizes: { size: string; count: number; percent: number }[];

  // All postal submissions (accepted + rejected, with conversion status)
  postalSubmissions: { postal_code: string; total: number; accepted: number; rejected: number; converted: number }[];

  // Source performance (per traffic source breakdown)
  sourcePerformance: {
    source: string;
    sessions: number;
    visitors: number;
    conversions: number;
    conversion_rate: number;
    avg_duration: number;
    avg_pages: number;
    avg_engagement: number;
    bounce_rate: number;
  }[];

}

// ---------------------------------------------------------------------------
// Fetch function
// ---------------------------------------------------------------------------

export type ConversionTypeFilter = "all" | "booking" | "contact" | "quote_request";

async function fetchSiteAnalytics(
  from: string,
  to: string,
  conversionType: ConversionTypeFilter
): Promise<SiteAnalyticsData> {
  const fromTs = `${from}T00:00:00`;
  const toTs = `${to}T23:59:59`;

  // All aggregation runs server-side in the get_site_analytics() RPC. Doing it in
  // the browser meant fetching raw rows, which PostgREST silently caps at
  // db-max-rows (10000) — over any real date range that truncated sessions
  // (~36k/30d) and especially events (~430k/30d, ~98% dropped), so every KPI was a
  // severe undercount. The RPC returns the fully-aggregated SiteAnalyticsData JSON.
  const { data, error } = await supabase.rpc("get_site_analytics", {
    p_from: fromTs,
    p_to: toTs,
    p_conversion_type: conversionType,
  });
  if (error) throw error;
  return data as SiteAnalyticsData;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSiteAnalytics(
  from: string,
  to: string,
  conversionType: ConversionTypeFilter = "all"
) {
  return useQuery({
    queryKey: queryKeys.siteAnalytics.dashboard(from, to, conversionType),
    queryFn: () => fetchSiteAnalytics(from, to, conversionType),
    staleTime: 60_000,
  });
}
