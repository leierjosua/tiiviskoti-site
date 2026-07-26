import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { finnishNow } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { AnalyticsData, ViewMode } from "@/hooks/useAnalytics";
import { useMarketingCommission } from "@/hooks/useMarketingCommission";
import { useSalesFunnel, FUNNEL_STATUS_LABELS, FUNNEL_STAGE_ORDER, labelChannel } from "@/hooks/useSalesFunnel";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Receipt,
  Truck,
  Megaphone,
  PiggyBank,
  Percent,
  ShoppingCart,
  CalendarDays,
  Package,
  Handshake,
  Building2,
  Target,
  Workflow,
  Award,
  XCircle,
  Coins,
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

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

type PeriodKey = "this_month" | "prev_month" | "3months" | "6months" | "this_year" | "all";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "Tämä kuukausi" },
  { key: "prev_month", label: "Edellinen kuukausi" },
  { key: "3months", label: "3 kk" },
  { key: "6months", label: "6 kk" },
  { key: "this_year", label: "Tämä vuosi" },
  { key: "all", label: "Kaikki" },
];

function getRange(key: PeriodKey): { from: string; to: string; prevFrom: string; prevTo: string } {
  const today = finnishNow();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const lastDay = (yr: number, mo: number) => new Date(yr, mo + 1, 0).getDate();

  const todayStr = fmt(today);

  switch (key) {
    case "this_month": {
      // Apr 1-2 → compare to Mar 1-2
      const prevMonth = new Date(y, m - 1, 1);
      const prevTo = new Date(y, m - 1, Math.min(d, lastDay(prevMonth.getFullYear(), prevMonth.getMonth())));
      return {
        from: `${y}-${pad(m + 1)}-01`, to: todayStr,
        prevFrom: fmt(prevMonth), prevTo: fmt(prevTo),
      };
    }
    case "prev_month": {
      // Mar 1-31 → compare to Feb 1-28
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      const ppm = pm === 0 ? 11 : pm - 1;
      const ppy = pm === 0 ? py - 1 : py;
      return {
        from: `${py}-${pad(pm + 1)}-01`,
        to: `${py}-${pad(pm + 1)}-${pad(lastDay(py, pm))}`,
        prevFrom: `${ppy}-${pad(ppm + 1)}-01`,
        prevTo: `${ppy}-${pad(ppm + 1)}-${pad(lastDay(ppy, ppm))}`,
      };
    }
    case "3months": {
      // Feb 1 - Apr 2 → compare to Nov 1 - Jan 2 (same length, shifted 3 months back)
      const from = new Date(y, m - 2, 1);
      const prevFrom = new Date(y, m - 5, 1);
      const prevTo = new Date(y, m - 3, d);
      return { from: fmt(from), to: todayStr, prevFrom: fmt(prevFrom), prevTo: fmt(prevTo) };
    }
    case "6months": {
      const from = new Date(y, m - 5, 1);
      const prevFrom = new Date(y, m - 11, 1);
      const prevTo = new Date(y, m - 6, d);
      return { from: fmt(from), to: todayStr, prevFrom: fmt(prevFrom), prevTo: fmt(prevTo) };
    }
    case "this_year":
      // Jan 1 - Apr 2 2026 → Jan 1 - Apr 2 2025
      return {
        from: `${y}-01-01`, to: todayStr,
        prevFrom: `${y - 1}-01-01`, prevTo: `${y - 1}-${pad(m + 1)}-${pad(d)}`,
      };
    case "all":
      // All data — compare to same length before start
      return {
        from: "2024-01-01", to: todayStr,
        prevFrom: "2022-01-01", prevTo: "2023-12-31",
      };
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtEur(cents: number): string {
  return `${(cents / 100).toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €`;
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : null;
  // Use absolute value of previous to get correct direction
  // when previous is negative (e.g. loss → profit)
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const pct = changePercent(current, previous);
  if (pct === null) return <span className="text-xs text-text-muted">–</span>;
  if (pct > 0)
    return (
      <span className="text-xs text-green-600 font-medium inline-flex items-center gap-0.5">
        <TrendingUp className="w-3 h-3" /> +{pct}%
      </span>
    );
  if (pct < 0)
    return (
      <span className="text-xs text-red-500 font-medium inline-flex items-center gap-0.5">
        <TrendingDown className="w-3 h-3" /> {pct}%
      </span>
    );
  return (
    <span className="text-xs text-text-muted font-medium inline-flex items-center gap-0.5">
      <Minus className="w-3 h-3" /> 0%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-border rounded w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
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

// ---------------------------------------------------------------------------
// Weekday labels
// ---------------------------------------------------------------------------
const WEEKDAY_LABELS = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------
function Section({
  title,
  subtitle,
  children,
  className = "",
  headerRight,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
}) {
  return (
    <div className={`bg-surface rounded-2xl border border-border overflow-hidden ${className}`}>
      <div className="px-4 sm:px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary text-sm">{title}</h3>
          {subtitle && <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {headerRight && <div className="flex-shrink-0">{headerRight}</div>}
      </div>
      <div className="p-4 sm:p-5 overflow-x-auto">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar row for breakdowns
// ---------------------------------------------------------------------------
function HBar({ label, count, percent, maxPercent }: { label: string; count: number; percent: number; maxPercent: number }) {
  const width = maxPercent > 0 ? (percent / maxPercent) * 100 : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-1.5">
      <span className="text-xs sm:text-sm text-text-primary shrink-0 whitespace-nowrap" title={label}>{label}</span>
      <div className="flex-1 h-5 bg-accent/10 rounded-full overflow-hidden min-w-[60px]">
        <div
          className="h-full bg-accent rounded-full transition-all"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs sm:text-sm text-text-muted w-14 sm:w-16 text-right shrink-0">
        {count} ({percent}%)
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clean URL path
// ---------------------------------------------------------------------------
function cleanUrl(url: string): string {
  if (url === "Tuntematon") return url;
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

// Euromäärä (jo euroina, ei sentteinä)
function fmtEuros(euros: number): string {
  return `${euros.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €`;
}


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>(() => getRange("this_month"));
  const [viewMode, setViewMode] = useState<ViewMode>("varaukset");
  const [showCompare, setShowCompare] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<string>("");

  const { data: services } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { from, to, prevFrom, prevTo } = dateRange;
  const { data, isLoading } = useAnalytics(from, to, viewMode, prevFrom, prevTo, serviceFilter || undefined);

  const handlePresetPeriod = useCallback((key: PeriodKey) => {
    setDateRange(getRange(key));
  }, []);

  // Chart data — merge current and previous revenue by index for area chart
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.revenueByDate.map((d, i) => ({
      label: new Date(d.date + "T12:00:00").toLocaleDateString("fi-FI", {
        day: "numeric",
        month: "numeric",
        timeZone: "Europe/Helsinki",
      }),
      Myynti: Math.round(d.revenue / 100),
      Edellinen:
        showCompare && data.prevRevenueByDate[i]
          ? Math.round(data.prevRevenueByDate[i].revenue / 100)
          : undefined,
    }));
  }, [data, showCompare]);

  const weekdayData = useMemo(() => {
    if (!data) return [];
    return WEEKDAY_LABELS.map((label, i) => ({ day: label, count: data.bookingsByWeekday[i] }));
  }, [data]);

  const hourData = useMemo(() => {
    if (!data) return [];
    return data.bookingsByHour
      .map((count, h) => ({ hour: `${String(h).padStart(2, "0")}:00`, count }));
  }, [data]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Analytiikka</h1>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">Kaikki palvelut</option>
            {services?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCompare}
              onChange={(e) => setShowCompare(e.target.checked)}
              className="rounded border-border text-accent accent-accent-dark"
            />
            Vertaa edelliseen
          </label>
        </div>
      </div>

      {/* View mode toggle */}
      <div className="inline-flex items-center gap-1 bg-surface border border-border rounded-xl p-1 mb-4">
        <button
          onClick={() => setViewMode("varaukset")}
          className={`px-4 py-2 min-h-[40px] rounded-lg text-sm font-medium transition-colors ${
            viewMode === "varaukset"
              ? "bg-brand text-white shadow-sm"
              : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
          }`}
        >
          Varaukset
        </button>
        <button
          onClick={() => setViewMode("toteutunut")}
          className={`px-4 py-2 min-h-[40px] rounded-lg text-sm font-medium transition-colors ${
            viewMode === "toteutunut"
              ? "bg-brand text-white shadow-sm"
              : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
          }`}
        >
          Toteutunut
        </button>
        <button
          onClick={() => setViewMode("tuleva")}
          className={`px-4 py-2 min-h-[40px] rounded-lg text-sm font-medium transition-colors ${
            viewMode === "tuleva"
              ? "bg-brand text-white shadow-sm"
              : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
          }`}
        >
          Tuleva
        </button>
      </div>
      <p className="text-xs text-text-muted mb-4">
        {viewMode === "varaukset"
          ? "Varaukset ryhmitelty luontipäivän mukaan — milloin varaus tuli"
          : viewMode === "toteutunut"
          ? "Vain valmiit keikat — toteutunut kassavirta"
          : "Varaukset ryhmitelty keikkapäivän mukaan — paljonko on varattu tulevaisuuteen"}
      </p>

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
      </div>

      {isLoading && <Skeleton />}

      {!isLoading && !data && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted">
          Ei dataa valitulla aikavälillä.
        </div>
      )}

      {!isLoading && data && <AnalyticsContent data={data} showCompare={showCompare} chartData={chartData} weekdayData={weekdayData} hourData={hourData} viewMode={viewMode} from={from} to={to} prevFrom={prevFrom ?? ""} prevTo={prevTo ?? ""} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content (separated so we can guarantee data is defined)
// ---------------------------------------------------------------------------

type AnalyticsMetric = "revenue" | "revenueExVat" | "costs" | "marketing" | "marketingCommission" | "salesCommissions" | "profit" | "margin" | "overhead" | "netResult" | "avgValue" | "bookings" | "deviceCosts";

const ANALYTICS_METRIC_CONFIG: Record<AnalyticsMetric, { chartLabel: string; unit: string; isCurrency: boolean; isPercent?: boolean }> = {
  revenue: { chartLabel: "Myynti (sis. ALV)", unit: "€", isCurrency: true },
  revenueExVat: { chartLabel: "Liikevaihto (ALV 0%)", unit: "€", isCurrency: true },
  costs: { chartLabel: "Tekijäkulut", unit: "€", isCurrency: true },
  marketing: { chartLabel: "Markkinointi", unit: "€", isCurrency: true },
  marketingCommission: { chartLabel: "Markkinointiprovisio", unit: "€", isCurrency: true },
  salesCommissions: { chartLabel: "Myyntikomissiot", unit: "€", isCurrency: true },
  profit: { chartLabel: "Kate", unit: "€", isCurrency: true },
  margin: { chartLabel: "Kate %", unit: "%", isCurrency: false, isPercent: true },
  overhead: { chartLabel: "Kiinteät kulut", unit: "€", isCurrency: true },
  netResult: { chartLabel: "Tulos", unit: "€", isCurrency: true },
  avgValue: { chartLabel: "Keskim. varausarvo", unit: "€", isCurrency: true },
  bookings: { chartLabel: "Varaukset", unit: "", isCurrency: false },
  deviceCosts: { chartLabel: "Laitekustannukset", unit: "€", isCurrency: true },
};

function AnalyticsContent({
  data,
  showCompare,
  weekdayData,
  hourData,
  viewMode,
  from,
  to,
  prevFrom,
  prevTo,
}: {
  data: AnalyticsData;
  showCompare: boolean;
  chartData: { label: string; Myynti: number; Edellinen?: number }[];
  weekdayData: { day: string; count: number }[];
  hourData: { hour: string; count: number }[];
  viewMode: ViewMode;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}) {
  const { data: salesFunnel } = useSalesFunnel(from, to);
  // Markkinointiprovisio (region-based, created_at). Shown as a cost card and
  // deducted from Tulos. Period base differs from the dashboard's viewMode —
  // it always reflects orders *created* in the range, matching the Provisio page.
  const { totalCommissionCents: marketingCommission } = useMarketingCommission(from, to);
  const { totalCommissionCents: prevMarketingCommission } = useMarketingCommission(prevFrom, prevTo);
  const [activeMetric, setActiveMetric] = useState<AnalyticsMetric>("revenue");
  const [bucket, setBucket] = useState<"day" | "week" | "month">("day");
  const isToteutunut = viewMode === "toteutunut";
  const isTuleva = viewMode === "tuleva";

  // Build data for all metrics from raw bookings + forecast rows, bucketed by day/week/month
  const metricChartData = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const bucketStartIso = (iso: string): string => {
      if (bucket === "day") return iso;
      const dt = new Date(iso + "T12:00:00");
      if (bucket === "month") return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-01`;
      const day = dt.getDay() || 7; // Mon=1 ... Sun=7
      dt.setDate(dt.getDate() - (day - 1));
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    };
    const showYear = data.dailyMetrics.length > 365;
    const fmtLabel = (iso: string) => {
      const dt = new Date(iso + "T12:00:00");
      if (bucket === "month") {
        return dt.toLocaleDateString("fi-FI", { month: "short", year: "2-digit", timeZone: "Europe/Helsinki" });
      }
      return showYear
        ? dt.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "2-digit", timeZone: "Europe/Helsinki" })
        : dt.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", timeZone: "Europe/Helsinki" });
    };

    // Markkinointiprovisio is a period-level total (region/created_at based), so it
    // has no natural per-day series. Spread it evenly across the in-range days for
    // the chart, mirroring how overhead is visualized. The period sum still equals
    // the KPI-card total.
    const inRangeDates = data.dailyMetrics.filter((d) => d.date >= from && d.date <= to).map((d) => d.date);
    const commissionPerDay = inRangeDates.length > 0 ? marketingCommission / inRangeDates.length : 0;
    const commissionDates = new Set(inRangeDates);

    type Agg = { revenue: number; revenueExVat: number; costs: number; marketing: number; marketingCommission: number; salesCommissions: number; overhead: number; profit: number; bookings: number; deviceCosts: number; avgValueSum: number; avgValueDays: number };
    const empty = (): Agg => ({ revenue: 0, revenueExVat: 0, costs: 0, marketing: 0, marketingCommission: 0, salesCommissions: 0, overhead: 0, profit: 0, bookings: 0, deviceCosts: 0, avgValueSum: 0, avgValueDays: 0 });
    const addDaily = (acc: Agg, m: (typeof data.dailyMetrics)[number]) => {
      acc.revenue += m.revenue;
      acc.revenueExVat += m.revenueExVat;
      acc.costs += m.costs;
      acc.marketing += m.marketing;
      if (commissionDates.has(m.date)) acc.marketingCommission += commissionPerDay;
      acc.salesCommissions += m.salesCommissions;
      acc.overhead += m.overhead;
      acc.profit += m.profit;
      acc.bookings += m.bookings;
      acc.deviceCosts += m.deviceCosts;
      if (m.avgValue > 0) { acc.avgValueSum += m.avgValue; acc.avgValueDays += 1; }
    };
    const pick = (a: Agg): number => {
      switch (activeMetric) {
        case "revenue": return Math.round(a.revenue / 100);
        case "revenueExVat": return Math.round(a.revenueExVat / 100);
        case "costs": return Math.round(a.costs / 100);
        case "marketing": return Math.round(a.marketing / 100);
        case "marketingCommission": return Math.round(a.marketingCommission / 100);
        case "salesCommissions": return Math.round(a.salesCommissions / 100);
        case "profit": return Math.round(a.profit / 100);
        case "margin": return a.revenueExVat > 0 ? Math.round((a.profit / a.revenueExVat) * 1000) / 10 : 0;
        // overhead per day: recurring spread + one-time spikes (see useAnalytics overheadByDate)
        case "overhead": return Math.round(a.overhead / 100);
        case "netResult": return Math.round((a.profit - a.overhead - a.marketingCommission) / 100);
        case "avgValue": return a.bookings > 0 ? Math.round(a.revenue / a.bookings / 100) : 0;
        case "bookings": return a.bookings;
        case "deviceCosts": return Math.round(a.deviceCosts / 100);
        default: return 0;
      }
    };
    const forecastable = activeMetric === "revenue" || activeMetric === "revenueExVat" || activeMetric === "bookings";
    const pickForecast = (revenueCents: number, bookings: number): number | undefined => {
      if (activeMetric === "revenue") return Math.round(revenueCents / 100);
      if (activeMetric === "revenueExVat") return Math.round(revenueCents / 100 / 1.255);
      if (activeMetric === "bookings") return Math.round(bookings);
      return undefined;
    };

    // Drop future actual rows — backend generate_series fills them with 0s,
    // forecast rows cover those dates instead.
    const today = finnishNow();
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // Aggregate actuals by bucket
    const actualBuckets = new Map<string, Agg>();
    const prevBuckets = new Map<string, Agg>();
    const bucketOrder: string[] = [];

    data.dailyMetrics
      .filter((d) => d.date <= todayIso)
      .forEach((d, i) => {
        const key = bucketStartIso(d.date);
        if (!actualBuckets.has(key)) { actualBuckets.set(key, empty()); bucketOrder.push(key); }
        addDaily(actualBuckets.get(key)!, d);
        if (showCompare && data.prevDailyMetrics[i]) {
          if (!prevBuckets.has(key)) prevBuckets.set(key, empty());
          addDaily(prevBuckets.get(key)!, data.prevDailyMetrics[i]);
        }
      });

    // The backend's prev_daily only carries revenue per day, so prevDailyMetrics has
    // costs/marketing/commissions/bookings = 0 and profit = revenueExVat. Only the
    // revenue-derived metrics have a real prev daily series — drawing the dashed
    // "Edellinen" line for the others would fabricate a comparison.
    const prevDailyReliable = activeMetric === "revenue" || activeMetric === "revenueExVat";
    const actualRows = bucketOrder.map((key) => {
      const a = actualBuckets.get(key)!;
      const p = prevBuckets.get(key);
      return {
        date: key,
        label: fmtLabel(key),
        value: pick(a),
        prev: p && prevDailyReliable ? pick(p) : undefined,
        forecast: undefined as number | undefined,
      };
    });

    if (!forecastable || data.forecast.daily.length === 0) return actualRows;

    // Bucket forecast days too — a bucket that's already in actualRows (e.g. current
    // partial week/month) gets its forecast value blended into the final list below.
    const forecastBuckets = new Map<string, { revenue: number; bookings: number }>();
    const forecastOrder: string[] = [];
    data.forecast.daily
      .filter((f) => f.date > todayIso)
      .forEach((f) => {
        const key = bucketStartIso(f.date);
        if (!forecastBuckets.has(key)) { forecastBuckets.set(key, { revenue: 0, bookings: 0 }); forecastOrder.push(key); }
        const b = forecastBuckets.get(key)!;
        b.revenue += f.revenue;
        b.bookings += f.bookings;
      });

    // If the last actual bucket also has forecast days (partial current week/month),
    // merge them so the bucket total reflects both.
    if (actualRows.length > 0) {
      const lastKey = actualRows[actualRows.length - 1].date;
      const fc = forecastBuckets.get(lastKey);
      if (fc) {
        const actualAgg = actualBuckets.get(lastKey)!;
        const combined: Agg = { ...actualAgg, revenue: actualAgg.revenue + fc.revenue, bookings: actualAgg.bookings + fc.bookings };
        actualRows[actualRows.length - 1] = {
          ...actualRows[actualRows.length - 1],
          forecast: pickForecast(combined.revenue, combined.bookings),
        };
        forecastBuckets.delete(lastKey);
      } else {
        actualRows[actualRows.length - 1] = {
          ...actualRows[actualRows.length - 1],
          forecast: actualRows[actualRows.length - 1].value,
        };
      }
    }

    const forecastRows = forecastOrder
      .filter((k) => forecastBuckets.has(k))
      .map((key) => {
        const b = forecastBuckets.get(key)!;
        return {
          date: key,
          label: fmtLabel(key),
          value: undefined as unknown as number,
          prev: undefined,
          forecast: pickForecast(b.revenue, b.bookings),
        };
      });

    return [...actualRows, ...forecastRows];
  }, [data, activeMetric, showCompare, bucket, marketingCommission, from, to]);

  // Tulos vähentää myös markkinointiprovision (kiinteiden kulujen tapaan).
  const netResultAfterCommission = data.netResult - marketingCommission;

  // Grouped KPI cards: revenue, costs, result, volume
  const kpiCards: { key: AnalyticsMetric; label: string; value: string; icon: typeof DollarSign; iconBg: string; iconColor: string; prev: number; curr: number; group: string }[] = [
    // ── Myynti ──
    {
      key: "revenue",
      label: isToteutunut ? "Toteutunut myynti (sis. ALV)" : isTuleva ? "Tuleva myynti (sis. ALV)" : "Kokonaismyynti (sis. ALV)",
      value: fmtEur(data.totalRevenue),
      icon: DollarSign, iconBg: "bg-green-50", iconColor: "text-green-600",
      prev: data.prevTotalRevenue, curr: data.totalRevenue, group: "Myynti",
    },
    {
      key: "revenueExVat",
      label: "Liikevaihto (ALV 0%)",
      value: fmtEur(data.revenueExVat),
      icon: Receipt, iconBg: "bg-blue-50", iconColor: "text-blue-600",
      prev: Math.round(data.prevTotalRevenue / 1.255), curr: data.revenueExVat, group: "Myynti",
    },
    {
      key: "bookings",
      label: isToteutunut ? "Valmiit keikat" : isTuleva ? "Tulevat keikat" : "Varaukset",
      value: String(data.bookingCount),
      icon: CalendarDays, iconBg: "bg-blue-50", iconColor: "text-blue-600",
      prev: data.prevBookingCount, curr: data.bookingCount, group: "Myynti",
    },
    {
      key: "avgValue",
      label: "Keskim. varausarvo",
      value: fmtEur(data.avgBookingValue),
      icon: ShoppingCart, iconBg: "bg-violet-50", iconColor: "text-violet-600",
      prev: data.prevAvgBookingValue, curr: data.avgBookingValue, group: "Myynti",
    },
    // ── Kulut ──
    {
      key: "costs",
      label: "Tekijäkulut",
      value: fmtEur(data.subcontractorCosts),
      icon: Truck, iconBg: "bg-orange-50", iconColor: "text-orange-600",
      prev: data.prevTekijakulut, curr: data.subcontractorCosts, group: "Kulut",
    },
    {
      key: "marketing",
      label: "Markkinointi",
      value: fmtEur(data.marketingCosts),
      icon: Megaphone, iconBg: "bg-red-50", iconColor: "text-red-500",
      prev: data.prevMarketingCosts, curr: data.marketingCosts, group: "Kulut",
    },
    {
      key: "deviceCosts",
      label: "Laitekustannukset",
      value: `${data.deviceCosts.totalCost.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €`,
      icon: Package, iconBg: "bg-amber-50", iconColor: "text-amber-600",
      prev: data.prevDeviceCostsCents, curr: Math.round(data.deviceCosts.totalCost * 100), group: "Kulut",
    },
    {
      key: "salesCommissions",
      label: "Myyntikomissiot",
      value: fmtEur(data.salesCommissions),
      icon: Handshake, iconBg: "bg-purple-50", iconColor: "text-purple-600",
      prev: data.prevSalesCommissions, curr: data.salesCommissions, group: "Kulut",
    },
    {
      key: "overhead",
      label: "Kiinteät kulut",
      value: fmtEur(data.overheadCosts),
      icon: Building2, iconBg: "bg-rose-50", iconColor: "text-rose-600",
      prev: data.prevOverheadCosts, curr: data.overheadCosts, group: "Kulut",
    },
    {
      key: "marketingCommission",
      label: "Markkinointiprovisio",
      value: fmtEur(marketingCommission),
      icon: Coins, iconBg: "bg-fuchsia-50", iconColor: "text-fuchsia-600",
      prev: prevMarketingCommission, curr: marketingCommission, group: "Kulut",
    },
    // ── Tulos ──
    {
      key: "profit",
      label: "Kate",
      value: fmtEur(data.netAfterCosts),
      icon: PiggyBank, iconBg: "bg-accent-muted", iconColor: "text-accent-dark",
      prev: data.prevNetAfterCosts, curr: data.netAfterCosts, group: "Tulos",
    },
    {
      key: "margin",
      label: "Kate %",
      value: `${data.marginPercent.toFixed(1)} %`,
      icon: Percent, iconBg: "bg-accent-muted", iconColor: "text-accent-dark",
      prev: Math.round(data.prevMarginPercent * 10), curr: Math.round(data.marginPercent * 10), group: "Tulos",
    },
    {
      key: "netResult",
      label: "Tulos",
      value: fmtEur(netResultAfterCommission),
      icon: Target,
      iconBg: netResultAfterCommission >= 0 ? "bg-emerald-50" : "bg-red-50",
      iconColor: netResultAfterCommission >= 0 ? "text-emerald-600" : "text-red-600",
      prev: data.prevNetResult - prevMarketingCommission, curr: netResultAfterCommission, group: "Tulos",
    },
  ];

  // Group cards for sectioned rendering
  const kpiGroups = ["Myynti", "Kulut", "Tulos"] as const;
  const cardsByGroup = kpiCards.reduce<Record<string, typeof kpiCards>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  const maxSourcePct = Math.max(...data.bookingsBySource.map((s) => s.percent), 1);
  const maxCityPct = Math.max(...data.bookingsByCity.map((c) => c.percent), 1);
  const pagesExclTarjous = data.bookingsByPage.filter((p) => !cleanUrl(p.url).startsWith("/tarjous"));
  const maxPagePct = Math.max(...pagesExclTarjous.map((p) => p.percent), 1);

  // Myyntiputki
  const sf = salesFunnel;
  const winRate = sf && (sf.outcome.won + sf.outcome.lost) > 0
    ? Math.round((sf.outcome.won / (sf.outcome.won + sf.outcome.lost)) * 100) : 0;
  const offerAcceptRate = sf && (sf.offers.sent + sf.offers.accepted) > 0
    ? Math.round((sf.offers.accepted / (sf.offers.sent + sf.offers.accepted)) * 100) : 0;
  const funnelStatusMap = new Map((sf?.byStatus || []).map((s) => [s.status, s.count]));
  const maxFunnelCount = Math.max(...FUNNEL_STAGE_ORDER.map((st) => funnelStatusMap.get(st) || 0), 1);

  const mc = ANALYTICS_METRIC_CONFIG[activeMetric];
  const yFmt = (v: number) => mc.isCurrency ? `${v} €` : mc.isPercent ? `${v}%` : v.toLocaleString("fi-FI");
  const tooltipFmt = (value: unknown) => {
    const n = Number(value);
    return mc.isCurrency ? `${n.toLocaleString("fi-FI")} €` : mc.isPercent ? `${n.toFixed(1)}%` : n.toLocaleString("fi-FI");
  };

  const hasForecast = data.forecast.daily.length > 0 && data.forecast.total.revenue > 0;
  const growthPct = Math.round((data.forecast.growthFactor - 1) * 100);

  // Projected totals = actuals so far + forecast for remaining days
  const projectedRevenue = data.totalRevenue + data.forecast.total.revenue;
  const projectedRevenueExVat = Math.round(projectedRevenue / 1.255);
  const projectedBookings = data.bookingCount + Math.round(data.forecast.total.bookings);

  const forecastSubtitle = (key: AnalyticsMetric): string | null => {
    if (!hasForecast) return null;
    if (key === "revenue") return `→ ${fmtEur(projectedRevenue)} jakson loppuun`;
    if (key === "revenueExVat") return `→ ${fmtEur(projectedRevenueExVat)} jakson loppuun`;
    if (key === "bookings") return `→ ~${projectedBookings} jakson loppuun`;
    return null;
  };

  const formsDailyChartData = useMemo(() => {
    const daily = data.formSubmissions.daily;
    if (!daily.length) return [];
    const showYear = daily.length > 365;
    const fmtLabel = (iso: string) => {
      const dt = new Date(iso + "T12:00:00");
      return showYear
        ? dt.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "2-digit", timeZone: "Europe/Helsinki" })
        : dt.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", timeZone: "Europe/Helsinki" });
    };
    return daily.map((d) => ({
      label: fmtLabel(d.date),
      Myynti: d.sales,
      Aspa: d.support,
      Muut: d.other,
    }));
  }, [data.formSubmissions.daily]);

  return (
    <div className="space-y-6">
      {/* KPI Cards — grouped & clickable */}
      <div className="space-y-5">
        {kpiGroups.map((group) => {
          const groupStyle = {
            Myynti: { border: "border-l-green-400", label: "text-green-700", bg: "bg-green-50/40" },
            Kulut:  { border: "border-l-orange-400", label: "text-orange-700", bg: "bg-orange-50/40" },
            Tulos:  { border: "border-l-accent",     label: "text-accent-dark", bg: "bg-accent-muted/40" },
          }[group]!;
          return (
            <div key={group} className={`rounded-2xl ${groupStyle.bg} border border-border/50 p-4`}>
              <div className={`border-l-[3px] ${groupStyle.border} pl-3 mb-3`}>
                <p className={`text-xs font-bold ${groupStyle.label} uppercase tracking-widest`}>{group}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(cardsByGroup[group] || []).map((card) => {
                  const isActive = activeMetric === card.key;
                  const fcSub = forecastSubtitle(card.key);
                  return (
                    <button
                      key={card.key}
                      onClick={() => setActiveMetric(card.key)}
                      className={`bg-white rounded-xl p-4 flex flex-col gap-2 text-left transition-all ${
                        isActive
                          ? "border-2 border-accent shadow-sm shadow-accent/10"
                          : "border border-border/60 hover:border-border-hover"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${card.iconBg}`}>
                          <card.icon className={`w-4 h-4 ${card.iconColor}`} />
                        </div>
                        <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide leading-tight">
                          {card.label}
                        </span>
                      </div>
                      <p className="text-base sm:text-xl font-bold text-text-primary break-words">{card.value}</p>
                      {fcSub && (
                        <p className="text-[11px] font-medium text-blue-600/80 leading-tight">{fcSub}</p>
                      )}
                      <ChangeIndicator current={card.curr} previous={card.prev} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dynamic Chart */}
      <Section
        title={`${mc.chartLabel} aikajaksolla`}
        subtitle={hasForecast && (activeMetric === "revenue" || activeMetric === "revenueExVat" || activeMetric === "bookings")
          ? `Ennuste perustuu YTD-kasvuun ${growthPct >= 0 ? "+" : ""}${growthPct}% vs. viime vuosi`
          : undefined}
        headerRight={
          <div className="inline-flex items-center gap-0.5 bg-surface-hover border border-border rounded-lg p-0.5">
            {(["day", "week", "month"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  bucket === b
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {b === "day" ? "Päivä" : b === "week" ? "Viikko" : "Kuukausi"}
              </button>
            ))}
          </div>
        }
      >
        {metricChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={metricChartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="gradientLime" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradientForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradientGray" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={Math.max(0, Math.floor(metricChartData.length / 12) - 1)}
                minTickGap={40}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={yFmt} />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [tooltipFmt(value), name === "Edellinen" ? "Edellinen" : String(name)]}
                labelFormatter={(_label: any, payload: readonly any[]) => {
                  const dateStr = payload?.[0]?.payload?.date;
                  if (!dateStr) return _label;
                  const dt = new Date(dateStr + "T12:00:00");
                  if (bucket === "month") {
                    return dt.toLocaleDateString("fi-FI", { month: "long", year: "numeric", timeZone: "Europe/Helsinki" });
                  }
                  if (bucket === "week") {
                    const end = new Date(dt); end.setDate(end.getDate() + 6);
                    const fmt = (d: Date) => d.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", timeZone: "Europe/Helsinki" });
                    return `Viikko ${fmt(dt)}–${fmt(end)}`;
                  }
                  return dt.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Helsinki" });
                }}
                labelStyle={{ fontWeight: 600 }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
              {showCompare && (
                <Area type="monotone" dataKey="prev" name="Edellinen" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" fill="url(#gradientGray)" />
              )}
              <Area type="monotone" dataKey="value" name={mc.chartLabel} stroke="#3b82f6" strokeWidth={2} fill="url(#gradientLime)" connectNulls={false} />
              <Area type="monotone" dataKey="forecast" name="Ennuste" stroke="#3b82f6" strokeOpacity={0.7} strokeWidth={2} strokeDasharray="5 3" fill="url(#gradientForecast)" connectNulls={true} />
              {showCompare && <Legend />}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-text-muted text-center py-8">Ei dataa.</p>
        )}
      </Section>

      {/* Breakdowns row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Source */}
        <Section title="Varaukset lähteen mukaan">
          {data.bookingsBySource.length > 0 ? (
            <div className="space-y-1">
              {data.bookingsBySource.map((s) => (
                <HBar key={s.source} label={s.source} count={s.count} percent={s.percent} maxPercent={maxSourcePct} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
          )}
        </Section>

        {/* Cities */}
        <Section title="Suosituimmat kaupungit">
          {data.bookingsByCity.length > 0 ? (
            <div className="space-y-1">
              {data.bookingsByCity.slice(0, 10).map((c) => (
                <HBar key={c.city} label={c.city} count={c.count} percent={c.percent} maxPercent={maxCityPct} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
          )}
        </Section>
      </div>

      {/* Page — full width */}
      <Section title="Varaukset sivun mukaan">
        {pagesExclTarjous.length > 0 ? (
          <div className="space-y-1">
            {pagesExclTarjous.map((p) => (
              <HBar key={p.url} label={cleanUrl(p.url)} count={p.count} percent={p.percent} maxPercent={maxPagePct} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
        )}
      </Section>

      {/* ── Myyntiputki & häviöanalyysi (asennusmyynti) ──────────────────── */}
      {sf && sf.outcome.total > 0 && (
        <Section
          title="Asennusmyynnin putki & häviöanalyysi"
          subtitle="Liidit ryhmitelty luontipäivän mukaan jaksoon, nykyinen tila. Vastaa: missä vaiheessa menetämme keikkoja."
        >
          {/* Lopputulema-KPI:t */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="flex items-center gap-1 text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1"><Award className="w-3.5 h-3.5" /> Voitettu</p>
              <p className="text-lg font-bold text-green-600">{sf.outcome.won}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1"><XCircle className="w-3.5 h-3.5" /> Hävitty</p>
              <p className="text-lg font-bold text-red-500">{sf.outcome.lost}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Avoinna</p>
              <p className="text-lg font-bold text-text-primary">{sf.outcome.open}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Voittoaste</p>
              <p className="text-lg font-bold text-text-primary">{winRate} %</p>
              <p className="text-[10px] text-text-muted">voitetut / ratkaistut</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
            {/* Putki vaiheittain */}
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                <Workflow className="w-3.5 h-3.5" /> Putki vaiheittain (nykytila)
              </h4>
              <div className="space-y-1">
                {FUNNEL_STAGE_ORDER.map((st) => {
                  const count = funnelStatusMap.get(st) || 0;
                  const pct = sf.outcome.total > 0 ? Math.round((count / sf.outcome.total) * 100) : 0;
                  return <HBar key={st} label={FUNNEL_STATUS_LABELS[st] || st} count={count} percent={pct} maxPercent={Math.max((maxFunnelCount / sf.outcome.total) * 100, 1)} />;
                })}
              </div>
            </div>

            {/* Tarjoukset */}
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                <Handshake className="w-3.5 h-3.5" /> Tarjoukset
              </h4>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><p className="text-[11px] text-text-muted">Lähetetty</p><p className="text-base font-bold text-text-primary">{sf.offers.sent}</p></div>
                <div><p className="text-[11px] text-text-muted">Hyväksytty</p><p className="text-base font-bold text-green-600">{sf.offers.accepted}</p></div>
                <div><p className="text-[11px] text-text-muted">Hyväksyntä-%</p><p className="text-base font-bold text-text-primary">{offerAcceptRate} %</p></div>
              </div>
              <div className="divide-y divide-border text-sm">
                <div className="flex justify-between py-2"><span className="text-text-muted">Hyväksyttyjen arvo</span><span className="font-semibold text-text-primary">{fmtEuros(sf.offers.acceptedValue)}</span></div>
                <div className="flex justify-between py-2"><span className="text-text-muted">Keskim. hyväksytty</span><span className="text-text-primary">{fmtEuros(Math.round(sf.offers.avgAcceptedValue))}</span></div>
                <div className="flex justify-between py-2"><span className="text-text-muted">Keskim. tarjous</span><span className="text-text-primary">{fmtEuros(Math.round(sf.offers.avgValue))}</span></div>
              </div>
            </div>

            {/* Kanavakohtainen onnistuminen */}
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                <Target className="w-3.5 h-3.5" /> Liidit kanavittain (mistä laadukas liidi)
              </h4>
              {sf.byChannel.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-1.5 pr-2 text-xs font-medium text-text-muted">Kanava</th>
                      <th className="py-1.5 pr-2 text-xs font-medium text-text-muted text-right">Liidit</th>
                      <th className="py-1.5 pr-2 text-xs font-medium text-text-muted text-right">Voitettu</th>
                      <th className="py-1.5 text-xs font-medium text-text-muted text-right">Voitto-%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sf.byChannel.map((c) => {
                      const resolved = c.won + c.lost;
                      const wr = resolved > 0 ? Math.round((c.won / resolved) * 100) : null;
                      return (
                        <tr key={c.channel}>
                          <td className="py-2 pr-2 text-sm text-text-primary">{labelChannel(c.channel)}</td>
                          <td className="py-2 pr-2 text-sm text-text-muted text-right">{c.count}</td>
                          <td className="py-2 pr-2 text-sm text-green-600 text-right">{c.won}</td>
                          <td className="py-2 text-sm text-right font-semibold text-text-primary">{wr == null ? "—" : `${wr} %`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <p className="text-sm text-text-muted py-2">Ei dataa.</p>}
            </div>

            {/* Häviösyyt */}
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                <XCircle className="w-3.5 h-3.5" /> Häviösyyt
              </h4>
              {sf.lostReasons.length > 0 ? (
                <div className="divide-y divide-border text-sm">
                  {sf.lostReasons.map((l) => (
                    <div key={l.reason} className="flex justify-between gap-3 py-2">
                      <span className="text-text-primary min-w-0 break-words">{l.reason}</span>
                      <span className="text-text-muted shrink-0">{l.count} kpl</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted py-2">Häviösyitä ei ole kirjattu tälle jaksolle. Vinkki: kirjaa hävityille diileille syy, niin näet tästä miksi keikkoja menetetään.</p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Services — full width */}
      <Section title="Varaukset palvelun mukaan">
        {data.bookingsByService.length > 0 ? (
          <div className="divide-y divide-border">
            {data.bookingsByService.map((s) => (
              <div key={s.service} className="flex items-center justify-between py-2.5 gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm text-text-primary truncate min-w-0">{s.service}</span>
                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                  <span className="text-xs text-text-muted">{s.count} kpl</span>
                  <span className="text-xs sm:text-sm font-semibold text-text-primary">{fmtEur(s.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">Ei dataa.</p>
        )}
      </Section>

      {/* Capacity charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Weekday */}
        <Section title="Varaukset viikonpäivän mukaan">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekdayData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                formatter={(value: unknown) => [Number(value), "Varaukset"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        {/* Hour */}
        <Section title="Varaukset kellonajan mukaan">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                formatter={(value: unknown) => [Number(value), "Varaukset"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* Device costs */}
      {data.deviceCosts.byProduct.length > 0 && (
        <Section title="Laitekustannukset">
          {/* KPI summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Myynti</p>
              <p className="text-lg font-bold text-text-primary">{data.deviceCosts.totalRevenue.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Hankintahinta</p>
              <p className="text-lg font-bold text-text-primary">{data.deviceCosts.totalCost.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Kate</p>
              <p className={`text-lg font-bold ${data.deviceCosts.totalMargin >= 0 ? "text-green-600" : "text-red-500"}`}>
                {data.deviceCosts.totalMargin.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Kate %</p>
              <p className={`text-lg font-bold ${data.deviceCosts.marginPercent >= 0 ? "text-green-600" : "text-red-500"}`}>
                {data.deviceCosts.marginPercent.toFixed(1)} %
              </p>
            </div>
          </div>
          {/* Per product breakdown */}
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted">Tuote</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Kpl</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Myynti</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Hankinta</th>
                  <th className="py-2 pr-3 text-xs font-medium text-text-muted text-right">Kate</th>
                  <th className="py-2 text-xs font-medium text-text-muted text-right">Kate %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.deviceCosts.byProduct.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2.5 pr-3 text-sm text-text-primary font-medium truncate max-w-[200px]">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-text-muted shrink-0" />
                        {p.name}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-sm text-text-primary text-right">{p.quantity}</td>
                    <td className="py-2.5 pr-3 text-sm text-text-primary text-right">{p.revenue.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €</td>
                    <td className="py-2.5 pr-3 text-sm text-text-muted text-right">{p.cost.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €</td>
                    <td className="py-2.5 pr-3 text-sm text-right">
                      <span className={p.margin >= 0 ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
                        {p.margin.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €
                      </span>
                    </td>
                    <td className="py-2.5 text-sm text-right">
                      <span className={p.marginPercent >= 0 ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
                        {p.marginPercent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Form submissions */}
      <Section title="Lomakelähetykset">
        {data.formSubmissions.total > 0 ? (
          <div>
            <p className="text-lg font-bold text-text-primary mb-3">
              {data.formSubmissions.total} lähetystä
            </p>

            {formsDailyChartData.length > 0 && (
              <div className="mb-5">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={formsDailyChartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.max(0, Math.floor(formsDailyChartData.length / 12) - 1)}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [Number(value), String(name)]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Myynti" stackId="forms" fill="#f97316" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Aspa" stackId="forms" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Muut" stackId="forms" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="divide-y divide-border">
              {data.formSubmissions.bySlug.map((f) => (
                <div key={f.slug} className="flex items-center justify-between py-2">
                  <span className="text-sm text-text-primary">{f.slug}</span>
                  <span className="text-sm text-text-muted">{f.count} kpl</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">Ei lomakelähetyksiä aikavälillä.</p>
        )}
      </Section>
    </div>
  );
}
