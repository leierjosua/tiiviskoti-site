import { useState, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { finnishNow } from "@/lib/utils";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import {
  Megaphone,
  DollarSign,
  MousePointer,
  Eye,
  Target,
  TrendingUp,
  RefreshCw,
  Clock,
  UserPlus,
  ShoppingCart,
  CalendarCheck,
  CheckCircle,
  XCircle,
  Percent,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useMarketingOverview } from "@/hooks/marketing/useMarketingOverview";
import { useMarketingSync } from "@/hooks/marketing/useMarketingSync";
import { useMarketingCampaigns } from "@/hooks/marketing/useMarketingCampaigns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ── Period helpers ─────────────────────────────────────────────────────────

type PeriodKey = "this_month" | "prev_month" | "3months" | "6months" | "this_year" | "all";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "Tämä kuukausi" },
  { key: "prev_month", label: "Edellinen kuukausi" },
  { key: "3months", label: "3 kk" },
  { key: "6months", label: "6 kk" },
  { key: "this_year", label: "Tämä vuosi" },
  { key: "all", label: "Kaikki" },
];

function getRange(key: PeriodKey): DateRange {
  const today = finnishNow();
  const y = today.getFullYear();
  const m = today.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const lastDay = (yr: number, mo: number) => new Date(yr, mo + 1, 0).getDate();
  const todayStr = fmt(today);

  const r = (from: string, to: string): DateRange => ({ from, to, prevFrom: "", prevTo: "" });

  switch (key) {
    case "this_month":
      return r(`${y}-${pad(m + 1)}-01`, todayStr);
    case "prev_month": {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      return r(`${py}-${pad(pm + 1)}-01`, `${py}-${pad(pm + 1)}-${pad(lastDay(py, pm))}`);
    }
    case "3months": {
      const d = new Date(y, m - 2, 1);
      return r(fmt(d), todayStr);
    }
    case "6months": {
      const d = new Date(y, m - 5, 1);
      return r(fmt(d), todayStr);
    }
    case "this_year":
      return r(`${y}-01-01`, todayStr);
    case "all":
      return r("2024-01-01", todayStr);
  }
}

function fmtEur(cents: number): string {
  return `${(cents / 100).toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €`;
}

// ── Tabs ───────────────────────────────────────────────────────────────────

const TABS = [
  { to: "/analytiikka/markkinointi", label: "Yhteenveto", end: true },
  { to: "/analytiikka/markkinointi/kampanjat", label: "Kampanjat" },
  { to: "/analytiikka/markkinointi/aluekannattavuus", label: "Aluekannattavuus" },
  { to: "/analytiikka/markkinointi/kohdistukset", label: "Kohdistukset" },
  { to: "/analytiikka/markkinointi/provisio", label: "Provisio" },
];

// ── Hook: daily spend data ────────────────────────────────────────────────

function useDailySpend(from: string, to: string) {
  return useQuery({
    queryKey: ["marketing-daily-spend", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_daily_stats")
        .select("date, spend_cents, impressions, clicks, conversions, conversions_lead, conversions_purchase, conversions_schedule, marketing_ad_groups!inner(campaign_id, marketing_campaigns!inner(platform))")
        .gte("date", from)
        .lte("date", to)
        .order("date");
      if (error) throw error;
      return data as unknown as {
        date: string;
        spend_cents: number;
        impressions: number;
        clicks: number;
        conversions: number;
        conversions_lead: number;
        conversions_purchase: number;
        conversions_schedule: number;
        marketing_ad_groups: { campaign_id: string; marketing_campaigns: { platform: string } };
      }[];
    },
  });
}

// ── Section wrapper ─────────────────────────────────────────────────────

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface rounded-2xl border border-border ${className}`}>
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-semibold text-text-primary text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

type MetricKey = "spend" | "clicks" | "impressions" | "conversions" | "leads" | "purchases" | "schedules" | "ctr" | "cpa" | "cpa_purchase";

const METRIC_CONFIG: Record<MetricKey, { chartLabel: string; unit: string; isCurrency: boolean }> = {
  spend: { chartLabel: "Kulutus", unit: "€", isCurrency: true },
  clicks: { chartLabel: "Klikkaukset", unit: "", isCurrency: false },
  impressions: { chartLabel: "Näyttökerrat", unit: "", isCurrency: false },
  conversions: { chartLabel: "Konversiot (yht.)", unit: "", isCurrency: false },
  leads: { chartLabel: "Liidit", unit: "", isCurrency: false },
  purchases: { chartLabel: "Ostot", unit: "", isCurrency: false },
  schedules: { chartLabel: "Ajanvaraukset", unit: "", isCurrency: false },
  ctr: { chartLabel: "CTR", unit: "%", isCurrency: false },
  cpa: { chartLabel: "CPA (kaikki)", unit: "€", isCurrency: true },
  cpa_purchase: { chartLabel: "CPA (osto)", unit: "€", isCurrency: true },
};

type PlatformFilter = "all" | "google_ads" | "meta_ads";

export default function MarketingDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>(() => getRange("this_month"));
  const [activeMetric, setActiveMetric] = useState<MetricKey>("spend");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const { from, to } = dateRange;

  const handlePresetPeriod = useCallback((key: PeriodKey) => {
    setDateRange(getRange(key));
  }, []);

  const { data: overview, isLoading: loadingOverview } = useMarketingOverview(from, to);
  const { data: campaigns, isLoading: loadingCampaigns } = useMarketingCampaigns(from, to);
  const { data: dailyRaw, isLoading: loadingDaily } = useDailySpend(from, to);
  const { syncLog, syncAll, isSyncing } = useMarketingSync();

  const lastSync = syncLog[0];
  const isLoading = loadingOverview || loadingCampaigns || loadingDaily;

  // Filtered overview based on platform toggle
  const filteredOverview = useMemo(() => {
    if (!overview) return null;
    const platforms = platformFilter === "all"
      ? overview.platforms
      : overview.platforms.filter((p) => p.platform === platformFilter);
    const totalSpendCents = platforms.reduce((s, p) => s + p.total_spend_cents, 0);
    const totalImpressions = platforms.reduce((s, p) => s + p.total_impressions, 0);
    const totalClicks = platforms.reduce((s, p) => s + p.total_clicks, 0);
    const totalConversions = platforms.reduce((s, p) => s + p.total_conversions, 0);
    const totalLeads = platforms.reduce((s, p) => s + Number(p.total_leads || 0), 0);
    const totalPurchases = platforms.reduce((s, p) => s + Number(p.total_purchases || 0), 0);
    const totalSchedules = platforms.reduce((s, p) => s + Number(p.total_schedules || 0), 0);
    return {
      ...overview,
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
  }, [overview, platformFilter]);

  // Daily chart data — aggregate all metrics by date, split by platform
  const dailyByDate = useMemo(() => {
    if (!dailyRaw) return [];
    interface DayRow {
      date: string;
      google_spend: number; meta_spend: number;
      google_clicks: number; meta_clicks: number;
      google_impressions: number; meta_impressions: number;
      google_conversions: number; meta_conversions: number;
      google_leads: number; meta_leads: number;
      google_purchases: number; meta_purchases: number;
      google_schedules: number; meta_schedules: number;
    }
    const byDate = new Map<string, DayRow>();
    for (const r of dailyRaw) {
      const platform = (r.marketing_ad_groups as any).marketing_campaigns.platform;
      const isGoogle = platform === "google_ads";
      const existing = byDate.get(r.date) || {
        date: r.date,
        google_spend: 0, meta_spend: 0,
        google_clicks: 0, meta_clicks: 0,
        google_impressions: 0, meta_impressions: 0,
        google_conversions: 0, meta_conversions: 0,
        google_leads: 0, meta_leads: 0,
        google_purchases: 0, meta_purchases: 0,
        google_schedules: 0, meta_schedules: 0,
      };
      if (isGoogle) {
        existing.google_spend += r.spend_cents;
        existing.google_clicks += r.clicks;
        existing.google_impressions += r.impressions;
        existing.google_conversions += Number(r.conversions);
        existing.google_leads += Number(r.conversions_lead || 0);
        existing.google_purchases += Number(r.conversions_purchase || 0);
        existing.google_schedules += Number(r.conversions_schedule || 0);
      } else {
        existing.meta_spend += r.spend_cents;
        existing.meta_clicks += r.clicks;
        existing.meta_impressions += r.impressions;
        existing.meta_conversions += Number(r.conversions);
        existing.meta_leads += Number(r.conversions_lead || 0);
        existing.meta_purchases += Number(r.conversions_purchase || 0);
        existing.meta_schedules += Number(r.conversions_schedule || 0);
      }
      byDate.set(r.date, existing);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyRaw]);

  // Transform daily data based on selected metric + platform filter
  const dailyChartData = useMemo(() => {
    const showGoogle = platformFilter === "all" || platformFilter === "google_ads";
    const showMeta = platformFilter === "all" || platformFilter === "meta_ads";

    return dailyByDate.map((d) => {
      const label = new Date(d.date + "T12:00:00").toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", timeZone: "Europe/Helsinki" });

      function val(metric: MetricKey, prefix: "google" | "meta"): number {
        switch (metric) {
          case "spend": return Math.round(d[`${prefix}_spend`] / 100);
          case "clicks": return d[`${prefix}_clicks`];
          case "impressions": return d[`${prefix}_impressions`];
          case "conversions": return Math.round(d[`${prefix}_conversions`]);
          case "leads": return Math.round(d[`${prefix}_leads`]);
          case "purchases": return Math.round(d[`${prefix}_purchases`]);
          case "schedules": return Math.round(d[`${prefix}_schedules`]);
          case "ctr": return d[`${prefix}_impressions`] > 0 ? Number(((d[`${prefix}_clicks`] / d[`${prefix}_impressions`]) * 100).toFixed(2)) : 0;
          case "cpa": return d[`${prefix}_conversions`] > 0 ? Math.round(d[`${prefix}_spend`] / 100 / d[`${prefix}_conversions`]) : 0;
          case "cpa_purchase": return d[`${prefix}_purchases`] > 0 ? Math.round(d[`${prefix}_spend`] / 100 / d[`${prefix}_purchases`]) : 0;
        }
      }

      const result: Record<string, unknown> = { label };
      if (showGoogle) result.Google = val(activeMetric, "google");
      if (showMeta) result.Meta = val(activeMetric, "meta");
      return result as { label: string; Google?: number; Meta?: number };
    });
  }, [dailyByDate, activeMetric, platformFilter]);

  // Campaigns with spend, filtered by platform
  const activeCampaigns = useMemo(() => {
    if (!campaigns) return [];
    return campaigns
      .filter((c) => c.total_spend_cents > 0)
      .filter((c) => platformFilter === "all" || c.platform === platformFilter)
      .sort((a, b) => b.total_spend_cents - a.total_spend_cents);
  }, [campaigns, platformFilter]);

  // Platform comparison
  const platformData = useMemo(() => {
    if (!overview) return [];
    return overview.platforms
      .filter((p) => p.total_spend_cents > 0)
      .filter((p) => platformFilter === "all" || p.platform === platformFilter)
      .map((p) => ({
        platform: p.platform === "google_ads" ? "Google Ads" : "Meta Ads",
        Kulut: Math.round(p.total_spend_cents / 100),
        Klikkaukset: p.total_clicks,
        Konversiot: Math.round(p.total_conversions),
      }));
  }, [overview, platformFilter]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Markkinointi</h1>
        </div>

        <div className="flex items-center gap-3">
          {lastSync && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              {lastSync.status === "success" ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              <Clock className="w-3 h-3" />
              {new Date(lastSync.synced_at).toLocaleString("fi-FI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" })}
            </div>
          )}
          <button
            onClick={() => syncAll.mutate()}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-dark disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Synkronoidaan..." : "Synkronoi nyt"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 max-w-full mb-4 overflow-x-auto">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${isActive ? "bg-accent text-white shadow-sm" : "text-text-muted hover:text-text-primary hover:bg-surface-hover"}`}>
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Date range picker + quick presets + platform toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="flex flex-nowrap gap-1 overflow-x-auto">
          {PERIOD_OPTIONS.map((opt) => (
            <button key={opt.key} onClick={() => handlePresetPeriod(opt.key)} className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-0.5 sm:ml-auto">
          {([
            { key: "all" as PlatformFilter, label: "Kaikki" },
            { key: "google_ads" as PlatformFilter, label: "Google" },
            { key: "meta_ads" as PlatformFilter, label: "Meta" },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPlatformFilter(opt.key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                platformFilter === opt.key
                  ? opt.key === "google_ads" ? "bg-[#F4B400] text-white" : opt.key === "meta_ads" ? "bg-[#0668E1] text-white" : "bg-brand text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-surface rounded-2xl" />)}
          </div>
          <div className="h-72 bg-surface rounded-2xl" />
        </div>
      )}

      {/* Content */}
      {!isLoading && filteredOverview && (
        <div className="space-y-6">
          {/* KPI Cards — clickable to change chart */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {([
              { key: "spend" as MetricKey, label: "Kokonaiskulut", value: fmtEur(filteredOverview.totalSpendCents), icon: DollarSign, iconBg: "bg-red-50", iconColor: "text-red-500" },
              { key: "clicks" as MetricKey, label: "Klikkaukset", value: filteredOverview.totalClicks.toLocaleString("fi-FI"), icon: MousePointer, iconBg: "bg-blue-50", iconColor: "text-blue-600" },
              { key: "impressions" as MetricKey, label: "Näyttökerrat", value: filteredOverview.totalImpressions.toLocaleString("fi-FI"), icon: Eye, iconBg: "bg-purple-50", iconColor: "text-purple-600" },
              { key: "leads" as MetricKey, label: "Liidit", value: Math.round(filteredOverview.totalLeads || 0).toLocaleString("fi-FI"), icon: UserPlus, iconBg: "bg-green-50", iconColor: "text-green-600" },
              { key: "purchases" as MetricKey, label: "Ostot", value: Math.round(filteredOverview.totalPurchases || 0).toLocaleString("fi-FI"), icon: ShoppingCart, iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
              { key: "schedules" as MetricKey, label: "Ajanvaraukset", value: Math.round(filteredOverview.totalSchedules || 0).toLocaleString("fi-FI"), icon: CalendarCheck, iconBg: "bg-teal-50", iconColor: "text-teal-600" },
              { key: "conversions" as MetricKey, label: "Konversiot yht.", value: Math.round(filteredOverview.totalConversions).toLocaleString("fi-FI"), icon: Target, iconBg: "bg-lime-50", iconColor: "text-lime-600" },
              { key: "ctr" as MetricKey, label: "CTR", value: `${filteredOverview.ctr.toFixed(2)} %`, icon: Percent, iconBg: "bg-orange-50", iconColor: "text-orange-600" },
              { key: "cpa" as MetricKey, label: "CPA (kaikki)", value: fmtEur(filteredOverview.cpa), icon: TrendingUp, iconBg: "bg-accent-muted", iconColor: "text-accent-dark" },
              { key: "cpa_purchase" as MetricKey, label: "CPA (osto)", value: filteredOverview.totalPurchases > 0 ? fmtEur(Math.round(filteredOverview.totalSpendCents / filteredOverview.totalPurchases)) : "-", icon: TrendingUp, iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
            ]).map((card) => {
              const isActive = activeMetric === card.key;
              return (
                <button
                  key={card.key}
                  onClick={() => setActiveMetric(card.key)}
                  className={`bg-surface rounded-2xl border-2 p-4 flex flex-col gap-2 text-left transition-all ${
                    isActive
                      ? "border-accent shadow-sm shadow-accent/10"
                      : "border-border hover:border-border-hover"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${card.iconBg}`}><card.icon className={`w-4 h-4 ${card.iconColor}`} /></div>
                    <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide leading-tight">{card.label}</span>
                  </div>
                  <p className="text-lg sm:text-xl font-bold text-text-primary">{card.value}</p>
                </button>
              );
            })}
          </div>

          {/* Daily chart — metric changes based on selected KPI */}
          {dailyChartData.length > 0 && (() => {
            const mc = METRIC_CONFIG[activeMetric];
            const yFmt = (v: number) => mc.isCurrency ? `${v} €` : mc.unit === "%" ? `${v}%` : v.toLocaleString("fi-FI");
            const tooltipFmt = (value: unknown) => {
              const n = Number(value);
              return mc.isCurrency ? `${n.toLocaleString("fi-FI")} €` : mc.unit === "%" ? `${n.toFixed(2)}%` : n.toLocaleString("fi-FI");
            };
            return (
              <Section title={`${mc.chartLabel} päivittäin`}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dailyChartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradGoogle" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F4B400" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#F4B400" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradMeta" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0668E1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0668E1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={yFmt} />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [tooltipFmt(value), String(name)]}
                      labelStyle={{ fontWeight: 600 }}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                    />
                    <Legend />
                    {(platformFilter === "all" || platformFilter === "google_ads") && (
                      <Area type="monotone" dataKey="Google" stroke="#F4B400" strokeWidth={2} fill="url(#gradGoogle)" />
                    )}
                    {(platformFilter === "all" || platformFilter === "meta_ads") && (
                      <Area type="monotone" dataKey="Meta" stroke="#0668E1" strokeWidth={2} fill="url(#gradMeta)" />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </Section>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Campaign breakdown */}
            <Section title={`Kampanjat (${activeCampaigns.length} aktiivista)`}>
              {activeCampaigns.length > 0 ? (
                <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                  {activeCampaigns.map((c) => {
                    const ctr = c.total_impressions > 0 ? ((c.total_clicks / c.total_impressions) * 100).toFixed(2) : "0";
                    const maxSpend = activeCampaigns[0]?.total_spend_cents || 1;
                    const barWidth = (c.total_spend_cents / maxSpend) * 100;
                    return (
                      <div key={c.id} className="py-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${c.platform === "google_ads" ? "bg-[#F4B400]/10 text-[#F4B400]" : "bg-[#0668E1]/10 text-[#0668E1]"}`}>
                              {c.platform === "google_ads" ? "G" : "M"}
                            </span>
                            <span className="text-sm text-text-primary truncate">{c.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-text-primary flex-shrink-0">{fmtEur(c.total_spend_cents)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-accent/10 rounded-full overflow-hidden">
                            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                          </div>
                          <div className="flex gap-3 text-[11px] text-text-muted flex-shrink-0">
                            <span>{c.total_clicks.toLocaleString("fi-FI")} klik</span>
                            <span>{ctr}% CTR</span>
                            <span>{Math.round(c.total_conversions)} konv</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-4">Ei kampanjoita jaksolla.</p>
              )}
            </Section>

            {/* Platform comparison */}
            <Section title="Alustavertailu">
              {platformData.length > 0 ? (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={platformData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="platform" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v} €`} />
                      <Tooltip
                        formatter={(value: unknown, name: unknown) => {
                          const n = Number(value);
                          return [name === "Kulut" ? `${n.toLocaleString("fi-FI")} €` : n.toLocaleString("fi-FI"), String(name)];
                        }}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                      />
                      <Legend />
                      <Bar dataKey="Kulut" fill="#ef4444" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {/* Platform summary */}
                  <div className="grid grid-cols-2 gap-3">
                    {filteredOverview.platforms.filter((p) => p.total_spend_cents > 0).map((p) => (
                      <div key={p.platform} className="bg-surface-hover rounded-xl p-3 space-y-1">
                        <p className="text-xs font-semibold text-text-primary">{p.platform === "google_ads" ? "Google Ads" : "Meta Ads"}</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                          <span>Kulut</span><span className="text-right font-medium text-text-primary">{fmtEur(p.total_spend_cents)}</span>
                          <span>Klikkaukset</span><span className="text-right">{p.total_clicks.toLocaleString("fi-FI")}</span>
                          <span>Näytöt</span><span className="text-right">{p.total_impressions.toLocaleString("fi-FI")}</span>
                          <span>Konversiot</span><span className="text-right">{Math.round(p.total_conversions)}</span>
                          <span>CPC</span><span className="text-right">{p.total_clicks > 0 ? fmtEur(Math.round(p.total_spend_cents / p.total_clicks)) : "-"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
              )}
            </Section>
          </div>

          {/* Sync log */}
          {syncLog.length > 0 && (
            <Section title="Synkronointihistoria">
              <div className="divide-y divide-border">
                {syncLog.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {entry.status === "success" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        <span className="text-sm font-medium text-text-primary">{entry.platform === "google_ads" ? "Google Ads" : "Meta Ads"}</span>
                        {entry.records_synced != null && <span className="text-xs text-text-muted">{entry.records_synced} tietuetta</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        {entry.duration_ms != null && <span>{(entry.duration_ms / 1000).toFixed(1)}s</span>}
                        <span>{new Date(entry.synced_at).toLocaleString("fi-FI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" })}</span>
                      </div>
                    </div>
                    {entry.error_message && (
                      <p className="text-xs text-red-500 mt-1 truncate" title={entry.error_message}>{entry.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {!isLoading && !overview && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted">
          Ei markkinointidataa. Synkronoi data painamalla "Synkronoi nyt".
        </div>
      )}
    </div>
  );
}
