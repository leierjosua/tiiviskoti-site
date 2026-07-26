import { useState, useMemo, useCallback } from "react";
import { useSiteAnalytics, type ConversionTypeFilter } from "@/hooks/useSiteAnalytics";
import { useArticleRoi } from "@/hooks/useArticleRoi";
import { useAttribution } from "@/hooks/useAttribution";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import {
  Globe,
  Users,
  Eye,
  Clock,
  Target,
  Percent,
  MousePointerClick,
  Monitor,
  Smartphone,
  Tablet,
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
} from "recharts";

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

type PeriodKey = "today" | "7days" | "30days" | "3months" | "6months";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Tänään" },
  { key: "7days", label: "7 pv" },
  { key: "30days", label: "30 pv" },
  { key: "3months", label: "3 kk" },
  { key: "6months", label: "6 kk" },
];

function getRange(key: PeriodKey): DateRange {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = fmt(today);

  switch (key) {
    case "today":
      return { from: todayStr, to: todayStr };
    case "7days": {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { from: fmt(d), to: todayStr };
    }
    case "30days": {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return { from: fmt(d), to: todayStr };
    }
    case "3months": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      return { from: fmt(d), to: todayStr };
    }
    case "6months": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      return { from: fmt(d), to: todayStr };
    }
  }
}

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface rounded-2xl border border-border overflow-hidden ${className}`}>
      <div className="px-4 sm:px-5 py-4 border-b border-border">
        <h3 className="font-semibold text-text-primary text-sm">{title}</h3>
      </div>
      <div className="p-4 sm:p-5 overflow-x-auto">{children}</div>
    </div>
  );
}

function HBar({ label, value, percent, maxPercent }: { label: string; value: number | string; percent: number; maxPercent: number }) {
  const width = maxPercent > 0 ? (percent / maxPercent) * 100 : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-1.5">
      <span className="text-xs sm:text-sm text-text-primary w-32 sm:w-44 truncate shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-accent/10 rounded-full overflow-hidden min-w-[60px]">
        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs sm:text-sm text-text-muted w-20 sm:w-24 text-right shrink-0">
        {value} ({percent}%)
      </span>
    </div>
  );
}

// Attribuutiorivi: palkki (kpl-osuus) + kpl + liikevaihto
function AttrRow({ label, count, revenueCents, maxCount }: { label: string; count: number; revenueCents: number; maxCount: number }) {
  const width = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-1.5">
      <span className="text-xs sm:text-sm text-text-primary w-32 sm:w-52 truncate shrink-0" title={label}>{label}</span>
      <div className="flex-1 h-5 bg-accent/10 rounded-full overflow-hidden min-w-[40px]">
        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs text-text-muted w-8 text-right shrink-0">{count}</span>
      <span className="text-xs sm:text-sm font-semibold text-text-primary w-16 sm:w-20 text-right shrink-0">
        {(revenueCents / 100).toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €
      </span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 bg-surface rounded-2xl" />
        ))}
      </div>
      <div className="h-72 bg-surface rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="h-64 bg-surface rounded-2xl" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    </div>
  );
}

const WIDGET_LABELS: Record<string, string> = {
  chat_widget: "Chat-widget",
  embedded_widget: "Sivun varauswidget",
  contact_page: "Yhteydenottolomake",
  product_quote_form: "Tuotetarjouspyyntö",
  unknown: "Tuntematon",
};

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SiteAnalytics() {
  const [dateRange, setDateRange] = useState<DateRange>(() => getRange("30days"));
  const [conversionType, setConversionType] = useState<ConversionTypeFilter>("all");
  const { from, to } = dateRange;
  const { data, isLoading } = useSiteAnalytics(from, to, conversionType);
  const { data: articleRoi } = useArticleRoi(from, to);
  const { data: attribution } = useAttribution(from, to);

  const handlePresetPeriod = useCallback((key: PeriodKey) => {
    setDateRange(getRange(key));
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.dailyTrend.map((d) => ({
      label: new Date(d.date + "T00:00:00").toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", timeZone: "Europe/Helsinki" }),
      Sessiot: d.sessions,
      Kävijät: d.visitors,
      Konversiot: d.conversions,
    }));
  }, [data]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Sivuston analytiikka</h1>
        </div>
      </div>

      {/* Date range picker + quick presets */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-6">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="flex flex-nowrap gap-1 overflow-x-auto -mx-1 px-1 pb-1 sm:pb-0">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handlePresetPeriod(opt.key)}
              className="px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium whitespace-nowrap text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <label htmlFor="conv-type" className="text-xs font-medium text-text-muted">Konversiotyyppi</label>
          <select
            id="conv-type"
            value={conversionType}
            onChange={(e) => setConversionType(e.target.value as ConversionTypeFilter)}
            className="px-3 py-1.5 min-h-[36px] rounded-lg border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">Kaikki</option>
            <option value="booking">Varaus (huoltopesu)</option>
            <option value="contact">Yhteydenotto</option>
            <option value="quote_request">Tarjouspyyntö</option>
          </select>
        </div>
      </div>

      {isLoading && <Skeleton />}

      {!isLoading && !data && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted">
          Ei dataa valitulla aikavälillä.
        </div>
      )}

      {!isLoading && data && <Content data={data} chartData={chartData} articleRoi={articleRoi} attribution={attribution} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function Content({
  data,
  chartData,
  articleRoi,
  attribution,
}: {
  data: NonNullable<ReturnType<typeof useSiteAnalytics>["data"]>;
  chartData: { label: string; Sessiot: number; Kävijät: number; Konversiot: number }[];
  articleRoi?: ReturnType<typeof useArticleRoi>["data"];
  attribution?: ReturnType<typeof useAttribution>["data"];
}) {
  const kpiCards = [
    { label: "Sessiot", value: data.sessions.toLocaleString("fi-FI"), icon: Eye, iconBg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Uniikit kävijät", value: data.uniqueVisitors.toLocaleString("fi-FI"), icon: Users, iconBg: "bg-violet-50", iconColor: "text-violet-600" },
    { label: "Sivunäytöt", value: data.pageViews.toLocaleString("fi-FI"), icon: Globe, iconBg: "bg-green-50", iconColor: "text-green-600" },
    { label: "Keskim. kesto", value: fmtDuration(data.avgDurationSeconds), icon: Clock, iconBg: "bg-orange-50", iconColor: "text-orange-600" },
    { label: "Konversiot", value: String(data.conversions), icon: Target, iconBg: "bg-red-50", iconColor: "text-red-500" },
    { label: "Konversioaste", value: `${data.conversionRate}%`, icon: Percent, iconBg: "bg-accent-muted", iconColor: "text-accent-dark" },
  ];

  const maxSourcePct = Math.max(...data.trafficSources.map((s) => s.percent), 1);
  const maxCtaPct = Math.max(...data.ctaClicks.map((c) => c.percent), 1);

  // Attribuutio (varauspohjainen, liikevaihtoon kytketty)
  const eur = (cents: number) => `${(cents / 100).toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €`;
  const attrLanding = (attribution?.byLanding || []).filter((l) => !l.key.startsWith("/tarjous")).slice(0, 15);
  const attrReferrer = (attribution?.byReferrer || []).slice(0, 12);
  const attrCampaign = (attribution?.byCampaign || []).slice(0, 12);
  const maxChannelCount = Math.max(...(attribution?.byChannel || []).map((c) => c.count), 1);
  const maxLandingCount = Math.max(...attrLanding.map((l) => l.count), 1);
  const maxReferrerCount = Math.max(...attrReferrer.map((r) => r.count), 1);
  const maxCampaignCount = Math.max(...attrCampaign.map((c) => c.count), 1);
  const maxChannelSessions = Math.max(...(attribution?.channelEconomics || []).map((c) => c.sessions), 1);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="bg-surface rounded-2xl border border-border p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${card.iconBg}`}>
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide leading-tight">
                {card.label}
              </span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-text-primary">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Daily trend chart */}
      <Section title="Päivittäinen trendi">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSessiot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradKonversiot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
              <Area type="monotone" dataKey="Sessiot" stroke="#3b82f6" strokeWidth={2} fill="url(#gradSessiot)" />
              <Area type="monotone" dataKey="Konversiot" stroke="#22c55e" strokeWidth={2} fill="url(#gradKonversiot)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-text-muted text-center py-8">Ei dataa.</p>
        )}
      </Section>

      {/* Landing pages + traffic sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Top landing pages">
          {data.topLandingPages.length > 0 ? (
            <div className="divide-y divide-border">
              {data.topLandingPages.map((p) => (
                <div key={p.page} className="flex items-center justify-between py-2.5 gap-2">
                  <span className="text-xs sm:text-sm text-text-primary truncate min-w-0">{p.page}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-text-muted">{p.sessions} sessiot</span>
                    <span className={`text-xs font-semibold ${p.conversions > 0 ? "text-green-600" : "text-text-muted"}`}>
                      {p.conversions} konv. ({p.rate}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
          )}
        </Section>

        <Section title="Liikennelähteet">
          {data.trafficSources.length > 0 ? (
            <div className="space-y-1">
              {data.trafficSources.map((s) => (
                <HBar key={s.source} label={s.source} value={s.sessions} percent={s.percent} maxPercent={maxSourcePct} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
          )}
        </Section>
      </div>

      {/* Mistä keikka tulee — varausattribuutio (liikevaihtoon kytketty) */}
      {attribution && attribution.attributedBookings > 0 && (
        <Section title={`Mistä keikka tulee — varausattribuutio (${attribution.attributedBookings}/${attribution.totalBookings} varausta jäljitetty, ${attribution.coveragePercent} %)`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Kanava</h4>
              {attribution.byChannel.map((c) => (
                <AttrRow key={c.key} label={c.key} count={c.count} revenueCents={c.revenue} maxCount={maxChannelCount} />
              ))}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Referrer</h4>
              {attrReferrer.map((r) => (
                <AttrRow key={r.key} label={r.key} count={r.count} revenueCents={r.revenue} maxCount={maxReferrerCount} />
              ))}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Saapumissivu (pl. /tarjous)</h4>
              {attrLanding.map((l) => (
                <AttrRow key={l.key} label={l.key} count={l.count} revenueCents={l.revenue} maxCount={maxLandingCount} />
              ))}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Kampanja (Google-kampanja-ID / Meta-UTM)</h4>
              {attrCampaign.length > 0 ? attrCampaign.map((c) => (
                <AttrRow key={c.key} label={c.key} count={c.count} revenueCents={c.revenue} maxCount={maxCampaignCount} />
              )) : <p className="text-sm text-text-muted py-2">Ei kampanjamerkittyjä varauksia.</p>}
            </div>
          </div>
          <p className="text-[11px] text-text-muted mt-4">
            Google Ads tunnistetaan gclid/gad_campaignid-merkeistä (Google ei käytä UTM:ää). Liikevaihto sis. ALV. Jäljitys puuttuu vanhoilta/tuoduilta varauksilta.
          </p>
        </Section>
      )}

      {/* Kanavatalous — liikenne → varaus → liikevaihto */}
      {attribution && attribution.channelEconomics.length > 0 && (
        <Section title="Kanavatalous — liikenne → varaus → liikevaihto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 text-xs font-medium text-text-muted">Kanava</th>
                <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Sessiot</th>
                <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Varaukset</th>
                <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Konv-%</th>
                <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Liikevaihto</th>
                <th className="py-2 text-xs font-medium text-text-muted text-right">€/sessio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attribution.channelEconomics.map((c) => (
                <tr key={c.channel}>
                  <td className="py-2.5 pr-3 text-sm text-text-primary font-medium">{c.channel}</td>
                  <td className="py-2.5 pr-3 text-sm text-text-muted text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden sm:block w-16 h-1.5 bg-accent/10 rounded-full overflow-hidden">
                        <div className="h-full bg-accent/60 rounded-full" style={{ width: `${(c.sessions / maxChannelSessions) * 100}%` }} />
                      </div>
                      {c.sessions.toLocaleString("fi-FI")}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-sm text-text-primary text-right">{c.bookings}</td>
                  <td className="py-2.5 pr-3 text-sm text-right font-semibold text-text-primary">{c.conversionRate.toFixed(1)} %</td>
                  <td className="py-2.5 pr-3 text-sm text-text-primary text-right">{eur(c.revenue)}</td>
                  <td className="py-2.5 text-sm text-right font-semibold text-accent">{c.revenuePerSession.toLocaleString("fi-FI", { maximumFractionDigits: 1 })} €</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-text-muted mt-3">Sessiot koko sivustolta. Konv-% = varaukset / sessiot. €/sessio on ALV 0 %. Näyttää mikä kanava oikeasti tuottaa.</p>
        </Section>
      )}

      {/* Artikkeli-/sisältö-ROI */}
      {articleRoi && articleRoi.totals.totalArticleSessions > 0 && (
        <Section title="Artikkeli-ROI — mitkä sisällöt tuovat keikkaa">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Artikkelisessiot</p>
              <p className="text-lg font-bold text-text-primary">{articleRoi.totals.totalArticleSessions.toLocaleString("fi-FI")}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Suorat konversiot</p>
              <p className="text-lg font-bold text-green-600">{articleRoi.totals.totalDirectConversions}</p>
              <p className="text-[10px] text-text-muted">laskeutui artikkeliin → konvertoi</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Avustetut konversiot</p>
              <p className="text-lg font-bold text-accent">{articleRoi.totals.totalAssistedConversions}</p>
              <p className="text-[10px] text-text-muted">artikkeli polun varrella</p>
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Artikkeli</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Sessiot</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Suorat</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Konv-%</th>
                  <th className="py-2 text-xs font-medium text-text-muted text-right">Avustetut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {articleRoi.articles.slice(0, 30).map((a) => (
                  <tr key={a.article}>
                    <td className="py-2 pr-3 text-xs sm:text-sm text-text-primary truncate max-w-[260px]" title={a.article}>
                      {a.article.replace("/artikkelit/", "")}
                    </td>
                    <td className="py-2 pr-3 text-sm text-text-muted text-right">{a.sessions}</td>
                    <td className={`py-2 pr-3 text-sm text-right ${a.directConversions > 0 ? "text-green-600 font-semibold" : "text-text-muted"}`}>{a.directConversions}</td>
                    <td className="py-2 pr-3 text-sm text-right text-text-primary">{a.directRate.toFixed(1)} %</td>
                    <td className={`py-2 text-sm text-right ${a.assistedConversions > 0 ? "text-accent font-semibold" : "text-text-muted"}`}>{a.assistedConversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Funnel + CTA clicks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Konversiofunnel">
          {data.funnel.some((f) => f.sessions > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.funnel} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="step" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                <Tooltip
                  formatter={(value: unknown) => [Number(value), "Sessiot"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                />
                <Bar dataKey="sessions" fill="#3b82f6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-muted text-center py-8">Ei funnel-dataa vielä.</p>
          )}
        </Section>

        <Section title="CTA-klikkaukset">
          {data.ctaClicks.length > 0 ? (
            <div className="space-y-1">
              {data.ctaClicks.map((c) => (
                <HBar key={c.element} label={c.element} value={c.clicks} percent={c.percent} maxPercent={maxCtaPct} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei klikkidataa vielä.</p>
          )}
        </Section>
      </div>

      {/* Top pages + scroll depth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Suosituimmat sivut">
          {data.topPages.length > 0 ? (
            <div className="space-y-1">
              {data.topPages.slice(0, 10).map((p) => (
                <HBar key={p.path} label={p.path} value={p.views} percent={p.percent} maxPercent={Math.max(...data.topPages.map((x) => x.percent), 1)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
          )}
        </Section>

        <Section title="Scroll depth">
          {data.scrollDepth.some((s) => s.count > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.scrollDepth} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="depth" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(value: unknown) => [Number(value), "Kertaa"]}
                  labelFormatter={(label: unknown) => `${label}% scroll`}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei scroll-dataa vielä.</p>
          )}
        </Section>
      </div>

      {/* Devices + browsers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Laitteet">
          {data.devices.length > 0 ? (
            <div className="space-y-3">
              {data.devices.map((d) => {
                const Icon = DEVICE_ICONS[d.type] || Monitor;
                return (
                  <div key={d.type} className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-text-muted shrink-0" />
                    <span className="text-sm text-text-primary capitalize w-20">{d.type}</span>
                    <div className="flex-1 h-5 bg-accent/10 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${d.percent}%` }} />
                    </div>
                    <span className="text-xs text-text-muted w-20 text-right">{d.count} ({d.percent}%)</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
          )}
        </Section>

        <Section title="Selaimet">
          {data.browsers.length > 0 ? (
            <div className="space-y-3">
              {data.browsers.map((b) => (
                <div key={b.name} className="flex items-center gap-3">
                  <MousePointerClick className="w-4 h-4 text-text-muted shrink-0" />
                  <span className="text-sm text-text-primary w-20">{b.name}</span>
                  <div className="flex-1 h-5 bg-accent/10 rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${b.percent}%` }} />
                  </div>
                  <span className="text-xs text-text-muted w-20 text-right">{b.count} ({b.percent}%)</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
          )}
        </Section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ADVANCED ANALYTICS
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* Engagement KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface rounded-2xl border border-border p-4">
          <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Keskim. aktiivinen aika</p>
          <p className="text-lg font-bold text-text-primary">{fmtDuration(data.avgEngagementSeconds)}</p>
          <p className="text-[10px] text-text-muted mt-1">vs. {fmtDuration(data.avgDurationSeconds)} kokonaisaika</p>
        </div>
        <div className="bg-surface rounded-2xl border border-border p-4">
          <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Keskim. scroll depth</p>
          <p className="text-lg font-bold text-text-primary">{data.avgMaxScroll}%</p>
        </div>
        <div className="bg-surface rounded-2xl border border-border p-4">
          <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Keskim. interaktiot / sessio</p>
          <p className="text-lg font-bold text-text-primary">{data.avgInteractions}</p>
        </div>
      </div>

      {/* Widget attribution + conversion paths */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Konversiot widgetin mukaan">
          {data.widgetAttribution.length > 0 ? (
            <div className="divide-y divide-border">
              {data.widgetAttribution.map((w) => (
                <div key={w.source} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-text-primary">{WIDGET_LABELS[w.source] || w.source}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-muted">{w.percent}%</span>
                    <span className="text-sm font-semibold text-text-primary">{w.conversions} kpl</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei konversiodataa vielä.</p>
          )}
        </Section>

        <Section title="Yleisimmät konversiopolut">
          {data.conversionPaths.length > 0 ? (
            <div className="space-y-3">
              {data.conversionPaths.map((cp, i) => (
                <div key={i} className="bg-accent/5 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {cp.path.map((page, j) => (
                      <span key={j} className="flex items-center gap-1.5">
                        {j > 0 && <span className="text-text-muted text-xs">→</span>}
                        <span className="text-xs bg-white border border-border rounded-lg px-2 py-0.5 truncate max-w-[140px]">
                          {page}
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted mt-1.5">{cp.count} konversiota</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei polkudataa vielä.</p>
          )}
        </Section>
      </div>

      {/* Rage clicks + form abandonment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Rage clicks (UX-ongelmat)">
          {data.rageClicks.length > 0 ? (
            <div className="divide-y divide-border">
              {data.rageClicks.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary truncate">{r.page}</p>
                    <p className="text-xs text-text-muted truncate">&quot;{r.element}&quot;</p>
                  </div>
                  <span className="text-sm font-semibold text-red-500 shrink-0">{r.count}×</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei rage click -dataa.</p>
          )}
        </Section>

        <Section title="Lomakkeiden keskeytykset">
          {data.formAbandonment.length > 0 ? (
            <div className="divide-y divide-border">
              {data.formAbandonment.map((f, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary">{f.form}</p>
                    <p className="text-xs text-text-muted">Kenttä: {f.field}</p>
                  </div>
                  <span className="text-sm font-semibold text-orange-500 shrink-0">{f.drop_count} keskeytystä</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei lomakekeskeytyksiä.</p>
          )}
        </Section>
      </div>

      {/* Session explorer */}
      <Section title="Viimeisimmät sessiot" className="overflow-hidden">
        {data.recentSessions.length > 0 ? (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Aika</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Landing</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Sivut</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Kesto</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Aktiiv.</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Lähde</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Konversio</th>
                  <th className="py-2 text-xs font-medium text-text-muted">Polku</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.recentSessions.map((s) => (
                  <tr key={s.session_id} className={s.has_conversion ? "bg-green-50/50" : ""}>
                    <td className="py-2 pr-3 text-xs text-text-muted whitespace-nowrap">
                      {new Date(s.started_at).toLocaleString("fi-FI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" })}
                    </td>
                    <td className="py-2 pr-3 text-xs text-text-primary truncate max-w-[140px]" title={s.landing_page}>
                      {s.landing_page}
                    </td>
                    <td className="py-2 pr-3 text-xs text-text-primary">{s.page_count}</td>
                    <td className="py-2 pr-3 text-xs text-text-muted">{fmtDuration(s.duration_seconds)}</td>
                    <td className="py-2 pr-3 text-xs text-text-muted">{fmtDuration(s.engagement_seconds)}</td>
                    <td className="py-2 pr-3 text-xs text-text-muted">{s.utm_source || "suora"}</td>
                    <td className="py-2 pr-3">
                      {s.has_conversion ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                          {s.conversion_type || "kyllä"}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">–</span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-text-muted">
                      {s.conversion_path ? (
                        <span className="truncate max-w-[200px] block" title={s.conversion_path.join(" → ")}>
                          {s.conversion_path.slice(0, 4).join(" → ")}{s.conversion_path.length > 4 ? "..." : ""}
                        </span>
                      ) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">Ei sessiodataa.</p>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SOURCE PERFORMANCE
          ═══════════════════════════════════════════════════════════════════════ */}

      <Section title="Lähdekohtainen suorituskyky (Google Ads vs Meta vs orgaaninen)">
        {data.sourcePerformance.length > 0 ? (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Lähde</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Sessiot</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Kävijät</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Konv.</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Konv.%</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Keskim. kesto</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Sivut/sessio</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Aktiivis.</th>
                  <th className="py-2 text-xs font-medium text-text-muted text-right">Bounce%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.sourcePerformance.map((s) => (
                  <tr key={s.source}>
                    <td className="py-2.5 pr-3 text-sm text-text-primary font-medium truncate max-w-[180px]">{s.source}</td>
                    <td className="py-2.5 pr-3 text-sm text-text-primary text-right">{s.sessions}</td>
                    <td className="py-2.5 pr-3 text-sm text-text-muted text-right">{s.visitors}</td>
                    <td className="py-2.5 pr-3 text-sm text-right">
                      <span className={s.conversions > 0 ? "text-green-600 font-semibold" : "text-text-muted"}>{s.conversions}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-sm text-right">
                      <span className={s.conversion_rate > 3 ? "text-green-600 font-semibold" : s.conversion_rate > 0 ? "text-text-primary" : "text-text-muted"}>
                        {s.conversion_rate}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-sm text-text-muted text-right">{fmtDuration(s.avg_duration)}</td>
                    <td className="py-2.5 pr-3 text-sm text-text-muted text-right">{s.avg_pages}</td>
                    <td className="py-2.5 pr-3 text-sm text-text-muted text-right">{fmtDuration(s.avg_engagement)}</td>
                    <td className="py-2.5 text-sm text-right">
                      <span className={s.bounce_rate > 60 ? "text-red-500" : "text-text-muted"}>{s.bounce_rate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">Ei lähdedataa.</p>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════════
          BUSINESS INTELLIGENCE
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* Booking micro-funnel */}
      <Section title="Huoltopesun varauksen mikrofunnel (vaihe → vaihe pudotus)">
        {data.bookingFunnel.some((f) => f.sessions > 0) ? (
          <div className="space-y-2">
            {data.bookingFunnel.map((step, i) => (
              <div key={step.step} className="flex items-center gap-3">
                <span className="text-xs text-text-primary w-36 shrink-0">{step.step}</span>
                <div className="flex-1 h-7 bg-accent/10 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${data.bookingFunnel[0].sessions > 0 ? (step.sessions / data.bookingFunnel[0].sessions) * 100 : 0}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-text-primary">
                    {step.sessions}
                  </span>
                </div>
                {i > 0 && step.drop_rate > 0 && (
                  <span className="text-xs text-red-500 font-medium w-16 text-right shrink-0">-{step.drop_rate}%</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">Ei funnel-dataa vielä.</p>
        )}
      </Section>

      {/* All postal submissions */}
      <Section title="Kaikki postinumerohaut (submitatut → hyväksytyt → konvertoineet)">
        {data.postalSubmissions.length > 0 ? (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Postinumero</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Haut</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Hyväksytty</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Hylätty</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Konversio</th>
                  <th className="py-2 text-xs font-medium text-text-muted text-right">Konv.%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.postalSubmissions.map((p) => (
                  <tr key={p.postal_code}>
                    <td className="py-2 pr-3 text-sm font-mono font-semibold text-text-primary">{p.postal_code}</td>
                    <td className="py-2 pr-3 text-sm text-text-primary text-right">{p.total}</td>
                    <td className="py-2 pr-3 text-sm text-green-600 text-right">{p.accepted}</td>
                    <td className="py-2 pr-3 text-sm text-right">
                      {p.rejected > 0 ? <span className="text-red-500">{p.rejected}</span> : <span className="text-text-muted">0</span>}
                    </td>
                    <td className="py-2 pr-3 text-sm text-right">
                      <span className={p.converted > 0 ? "text-green-600 font-semibold" : "text-text-muted"}>{p.converted}</span>
                    </td>
                    <td className="py-2 text-sm text-right">
                      <span className={p.accepted > 0 && p.converted > 0 ? "text-green-600 font-semibold" : "text-text-muted"}>
                        {p.accepted > 0 ? Math.round((p.converted / p.accepted) * 100) : 0}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">Ei postinumerodataa.</p>
        )}
      </Section>

      {/* Postal demand + rejected areas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Hylätyt postinumerot (kysyntä ilman palvelua)">
          {data.rejectedAreas.length > 0 ? (
            <div className="divide-y divide-border">
              {data.rejectedAreas.map((r) => (
                <div key={r.postal_code} className="flex items-center justify-between py-2.5 gap-2">
                  <div>
                    <span className="text-sm font-mono font-semibold text-text-primary">{r.postal_code}</span>
                    <p className="text-xs text-text-muted">{r.services.join(", ")}</p>
                  </div>
                  <span className="text-sm font-semibold text-orange-500 shrink-0">{r.count} pyyntöä</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei hylättyjä postinumeroita.</p>
          )}
        </Section>

        <Section title="Suosituimmat postinumerot (hyväksytyt)">
          {data.postalDemand.length > 0 ? (
            <div className="divide-y divide-border">
              {data.postalDemand.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 gap-2">
                  <div>
                    <span className="text-sm font-mono font-semibold text-text-primary">{p.postal_code}</span>
                    <p className="text-xs text-text-muted">{p.service}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600 shrink-0">{p.count} varausta</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei postinumerodataa.</p>
          )}
        </Section>
      </div>

      {/* Exit intent popup stats */}
      {data.exitPopup.shown > 0 && (
        <Section title="Exit intent -popup">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-text-primary">{data.exitPopup.shown}</p>
              <p className="text-xs text-text-muted mt-1">Näytetty</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-text-primary">{data.exitPopup.closed}</p>
              <p className="text-xs text-text-muted mt-1">Suljettu</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{data.exitPopup.cta_clicked}</p>
              <p className="text-xs text-text-muted mt-1">CTA klikattu</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-accent-dark">{data.exitPopup.code_copied}</p>
              <p className="text-xs text-text-muted mt-1">Koodi kopioitu</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-brand">{data.exitPopup.conversion_rate}%</p>
              <p className="text-xs text-text-muted mt-1">Konversioaste</p>
            </div>
          </div>
        </Section>
      )}

      {/* IV preferences */}
      {(data.ivSystemTypes.length > 0 || data.ivAreaSizes.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Section title="IV-järjestelmätyypit (kysyntä)">
            {data.ivSystemTypes.length > 0 ? (
              <div className="space-y-1">
                {data.ivSystemTypes.map((s) => (
                  <HBar key={s.type} label={s.type} value={s.count} percent={s.percent} maxPercent={Math.max(...data.ivSystemTypes.map((x) => x.percent), 1)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
            )}
          </Section>

          <Section title="IV-pinta-alat (kysyntä)">
            {data.ivAreaSizes.length > 0 ? (
              <div className="space-y-1">
                {data.ivAreaSizes.map((a) => (
                  <HBar key={a.size} label={a.size} value={a.count} percent={a.percent} maxPercent={Math.max(...data.ivAreaSizes.map((x) => x.percent), 1)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
            )}
          </Section>
        </div>
      )}

      {/* Time slot preferences + discount codes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Suosituimmat aikaslotit">
          {data.timeSlotPreferences.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.timeSlotPreferences} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(value: unknown) => [Number(value), "Valintoja"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei aikaslottidataa.</p>
          )}
        </Section>

        <Section title="Alennuskoodien käyttö">
          {data.discountAttempts.length > 0 ? (
            <div className="divide-y divide-border">
              {data.discountAttempts.map((d) => (
                <div key={d.code} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-mono font-semibold text-text-primary">{d.code}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-green-600">{d.applied} hyväksytty</span>
                    {d.rejected > 0 && <span className="text-xs text-red-500">{d.rejected} hylätty</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei alennuskoodidataa.</p>
          )}
        </Section>
      </div>

      {/* Returning visitors */}
      <Section title="Sessiot ennen konversiota (montako käyntiä tarvitaan?)">
        {data.returningVisitors.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.returningVisitors} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="sessions_before_conversion"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v >= 10 ? "10+" : String(v)}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                formatter={(value: unknown) => [Number(value), "Konvertoijia"]}
                labelFormatter={(label: unknown) => `${Number(label) >= 10 ? "10+" : label} sessiota`}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
              <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">Ei konversiodataa.</p>
        )}
      </Section>
    </div>
  );
}
