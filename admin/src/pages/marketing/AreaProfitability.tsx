import { useState, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { finnishNow } from "@/lib/utils";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import {
  Megaphone,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Percent,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useAreaProfitability, useRegionServiceProfitability, useRegionServiceLineItems } from "@/hooks/marketing/useAreaProfitability";
import type { RegionServiceProfit } from "@/hooks/marketing/useAreaProfitability";

// ── Period helpers ──────────────────────────────────────────────────────────

type PeriodKey = "this_month" | "prev_month" | "3months" | "6months" | "this_year" | "all";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "Tämä kuukausi" },
  { key: "prev_month", label: "Edellinen kuukausi" },
  { key: "3months", label: "3 kk" },
  { key: "6months", label: "6 kk" },
  { key: "this_year", label: "Tämä vuosi" },
  { key: "all", label: "Kaikki" },
];

function getRange(key: PeriodKey): { from: string; to: string } {
  const today = finnishNow();
  const y = today.getFullYear();
  const m = today.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const lastDay = (yr: number, mo: number) => new Date(yr, mo + 1, 0).getDate();

  switch (key) {
    case "this_month":
      return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}` };
    case "prev_month": {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      return { from: `${py}-${pad(pm + 1)}-01`, to: `${py}-${pad(pm + 1)}-${pad(lastDay(py, pm))}` };
    }
    case "3months": {
      const d = new Date(y, m - 2, 1);
      return { from: fmt(d), to: `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}` };
    }
    case "6months": {
      const d = new Date(y, m - 5, 1);
      return { from: fmt(d), to: `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}` };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "all":
      return { from: "2024-01-01", to: `${y}-12-31` };
  }
}

function fmtEur(cents: number): string {
  return `${(cents / 100).toLocaleString("fi-FI", { maximumFractionDigits: 0 })} €`;
}

const TABS = [
  { to: "/analytiikka/markkinointi", label: "Yhteenveto" },
  { to: "/analytiikka/markkinointi/kampanjat", label: "Kampanjat" },
  { to: "/analytiikka/markkinointi/aluekannattavuus", label: "Aluekannattavuus", end: true },
  { to: "/analytiikka/markkinointi/kohdistukset", label: "Kohdistukset" },
  { to: "/analytiikka/markkinointi/provisio", label: "Provisio" },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function AreaProfitability() {
  const [dateRange, setDateRange] = useState<DateRange>(() => getRange("this_month"));
  const { from, to } = dateRange;
  const handlePresetPeriod = useCallback((key: PeriodKey) => { setDateRange(getRange(key)); }, []);
  const { data: areas, isLoading } = useAreaProfitability(from, to);
  const { data: regionServiceData } = useRegionServiceProfitability(from, to);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  // Group region×service data by region
  const regionServiceGrouped = useMemo(() => {
    if (!regionServiceData) return new Map<string, RegionServiceProfit[]>();
    const map = new Map<string, RegionServiceProfit[]>();
    for (const row of regionServiceData) {
      const arr = map.get(row.region_id) || [];
      arr.push(row);
      map.set(row.region_id, arr);
    }
    return map;
  }, [regionServiceData]);

  // Summary KPIs
  const summary = useMemo(() => {
    if (!areas || areas.length === 0) return null;
    const totalRevenue = areas.reduce((s, a) => s + a.revenue_ex_vat_cents, 0);
    const totalCosts = areas.reduce(
      (s, a) => s + a.installer_cost_cents + (a.device_cost_cents || 0) + (a.sales_commission_cents || 0) + a.marketing_spend_cents,
      0
    );
    const totalNet = areas.reduce((s, a) => s + a.net_profit_cents, 0);
    const avgMargin = totalRevenue > 0 ? (totalNet / totalRevenue) * 100 : 0;
    return { totalRevenue, totalCosts, totalNet, avgMargin };
  }, [areas]);

  // Chart data — top 10 areas by revenue
  const chartData = useMemo(() => {
    if (!areas) return [];
    return areas
      .filter((a) => a.revenue_cents > 0 || a.marketing_spend_cents > 0)
      .slice(0, 10)
      .map((a) => ({
        name: a.region_name,
        Tulot: Math.round(a.revenue_ex_vat_cents / 100),
        Tekijäkulut: Math.round(a.installer_cost_cents / 100),
        Laitteet: Math.round((a.device_cost_cents || 0) / 100),
        Provisiot: Math.round((a.sales_commission_cents || 0) / 100),
        Markkinointi: Math.round(a.marketing_spend_cents / 100),
      }));
  }, [areas]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Megaphone className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Markkinointi</h1>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 max-w-full mb-4 overflow-x-auto">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Date range picker + quick presets */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="flex flex-nowrap gap-1 overflow-x-auto">
          {PERIOD_OPTIONS.map((opt) => (
            <button key={opt.key} onClick={() => handlePresetPeriod(opt.key)} className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-surface rounded-2xl" />
            ))}
          </div>
          <div className="h-72 bg-surface rounded-2xl" />
        </div>
      )}

      {/* Content */}
      {!isLoading && areas && summary && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Kokonaistulot (ALV 0%)",
                value: fmtEur(summary.totalRevenue),
                icon: DollarSign,
                iconBg: "bg-green-50",
                iconColor: "text-green-600",
              },
              {
                label: "Kokonaiskulut",
                value: fmtEur(summary.totalCosts),
                icon: TrendingDown,
                iconBg: "bg-red-50",
                iconColor: "text-red-500",
              },
              {
                label: "Nettotulos",
                value: fmtEur(summary.totalNet),
                icon: summary.totalNet >= 0 ? TrendingUp : TrendingDown,
                iconBg: summary.totalNet >= 0 ? "bg-accent-muted" : "bg-red-50",
                iconColor: summary.totalNet >= 0 ? "text-accent-dark" : "text-red-500",
              },
              {
                label: "Keskikate",
                value: `${summary.avgMargin.toFixed(1)} %`,
                icon: Percent,
                iconBg: "bg-blue-50",
                iconColor: "text-blue-600",
              },
            ].map((card) => (
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

          {/* Stacked bar chart */}
          {chartData.length > 0 && (
            <div className="bg-surface rounded-2xl border border-border">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-text-primary text-sm">
                  Tulot vs. kulut alueittain
                </h3>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${v} €`}
                    />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [
                        `${Number(value).toLocaleString("fi-FI")} €`,
                        String(name),
                      ]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        fontSize: 13,
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Tulot" fill="#22c55e" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Tekijäkulut" stackId="costs" fill="#f97316" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Laitteet" stackId="costs" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Provisiot" stackId="costs" fill="#6366f1" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Markkinointi" stackId="costs" fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Profitability table — expandable rows with service breakdown */}
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-text-primary text-sm">Aluekannattavuus</h3>
            </div>

            {/* Desktop header */}
            <div className="hidden lg:grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px_60px_60px_60px] gap-2 px-5 py-3 border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              <span>Alue</span>
              <span className="text-right">Tulot (ALV 0%)</span>
              <span className="text-right">Tekijäkulut</span>
              <span className="text-right">Laitteet</span>
              <span className="text-right">Provisiot</span>
              <span className="text-right">Markkinointi</span>
              <span className="text-right">Kulut yht.</span>
              <span className="text-right">Tulos</span>
              <span className="text-right">Kate %</span>
              <span className="text-right">Keikat</span>
              <span className="text-right">CPA</span>
            </div>

            <div className="divide-y divide-border">
              {areas.map((a) => {
                const devCost = a.device_cost_cents || 0;
                const salesComm = a.sales_commission_cents || 0;
                const totalCosts = a.installer_cost_cents + devCost + salesComm + a.marketing_spend_cents;
                const isProfitable = a.net_profit_cents >= 0;
                const isExpanded = expandedRegion === a.region_id;
                const services = regionServiceGrouped.get(a.region_id) || [];

                return (
                  <div key={a.region_id}>
                    {/* Desktop row */}
                    <button
                      onClick={() => setExpandedRegion(isExpanded ? null : a.region_id)}
                      className="hidden lg:grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px_60px_60px_60px] gap-2 px-5 py-3 items-center w-full text-left hover:bg-bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>&#9654;</span>
                        <p className="text-sm font-medium text-text-primary">{a.region_name}</p>
                      </div>
                      <span className="text-sm text-right text-text-primary">{fmtEur(a.revenue_ex_vat_cents)}</span>
                      <span className="text-sm text-right text-orange-600">{fmtEur(a.installer_cost_cents)}</span>
                      <span className="text-sm text-right text-amber-600">{fmtEur(devCost)}</span>
                      <span className="text-sm text-right text-indigo-600">{fmtEur(salesComm)}</span>
                      <span className="text-sm text-right text-red-500">{fmtEur(a.marketing_spend_cents)}</span>
                      <span className="text-sm text-right text-text-muted">{fmtEur(totalCosts)}</span>
                      <span className={`text-sm text-right font-semibold ${isProfitable ? "text-green-600" : "text-red-500"}`}>{fmtEur(a.net_profit_cents)}</span>
                      <span className={`text-sm text-right ${isProfitable ? "text-green-600" : "text-red-500"}`}>{a.margin_percent.toFixed(1)}%</span>
                      <span className="text-sm text-right text-text-primary">{a.booking_count}</span>
                      <span className="text-sm text-right text-text-muted">{a.avg_cpa_cents > 0 ? fmtEur(a.avg_cpa_cents) : "-"}</span>
                    </button>

                    {/* Mobile card */}
                    <button onClick={() => setExpandedRegion(isExpanded ? null : a.region_id)} className="lg:hidden px-5 py-3 w-full text-left">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>&#9654;</span>
                          <p className="text-sm font-semibold text-text-primary">{a.region_name}</p>
                        </div>
                        <span className={`text-sm font-bold ${isProfitable ? "text-green-600" : "text-red-500"}`}>{fmtEur(a.net_profit_cents)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-muted">
                        <span>Tulot: <b className="text-text-primary">{fmtEur(a.revenue_ex_vat_cents)}</b></span>
                        <span>Tekijäkulut: <b className="text-orange-600">{fmtEur(a.installer_cost_cents)}</b></span>
                        <span>Laitteet: <b className="text-amber-600">{fmtEur(devCost)}</b></span>
                        <span>Provisiot: <b className="text-indigo-600">{fmtEur(salesComm)}</b></span>
                        <span>Markkinointi: <b className="text-red-500">{fmtEur(a.marketing_spend_cents)}</b></span>
                        <span>Kate: <b className={isProfitable ? "text-green-600" : "text-red-500"}>{a.margin_percent.toFixed(1)}%</b></span>
                        <span>Keikat: <b className="text-text-primary">{a.booking_count}</b></span>
                      </div>
                    </button>

                    {/* Expanded: service breakdown */}
                    {isExpanded && services.length > 0 && (
                      <div className="bg-bg-secondary/30 border-t border-border">
                        <div className="hidden lg:grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px_60px] gap-2 px-5 pl-10 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                          <span>Palvelu</span>
                          <span className="text-right">Tulot</span>
                          <span className="text-right">Tekijäkulut</span>
                          <span className="text-right">Laitteet</span>
                          <span className="text-right">Provisiot</span>
                          <span className="text-right">Markkinointi</span>
                          <span className="text-right">Tulos</span>
                          <span className="text-right">Kate %</span>
                          <span className="text-right">Keikat</span>
                        </div>
                        {services.map((s) => (
                          <ServiceRow key={s.service_id} s={s} regionId={a.region_id} from={from} to={to} />
                        ))}
                      </div>
                    )}
                    {isExpanded && services.length === 0 && (
                      <div className="bg-bg-secondary/30 border-t border-border px-5 pl-10 py-3 text-xs text-text-muted">
                        Ei palveludataa tälle alueelle
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!isLoading && (!areas || areas.length === 0) && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted">
          Ei aluedataa. Varmista, että palvelualueet on määritetty työntekijöille.
        </div>
      )}
    </div>
  );
}

// ─── Service row with expandable line items ──────────────────────────────────

const LINE_TYPE_LABELS: Record<string, string> = {
  service: "Palvelu",
  product: "Tuote",
  addon_service: "Lisäpalvelu",
  custom: "Muu veloitus",
};

function ServiceRow({ s, regionId, from, to }: { s: RegionServiceProfit; regionId: string; from: string; to: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: lineItems } = useRegionServiceLineItems(expanded ? regionId : null, expanded ? s.service_id : null, from, to);
  const sDevCost = s.device_cost_cents || 0;
  const sSalesComm = s.sales_commission_cents || 0;
  const sProfit = s.net_profit_cents >= 0;

  return (
    <div>
      {/* Desktop */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="hidden lg:grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px_60px] gap-2 px-5 pl-10 py-2 items-center w-full text-left hover:bg-bg-secondary/30 transition-colors"
      >
        <span className="text-xs text-text-primary flex items-center gap-1">
          <span className={`text-[8px] transition-transform ${expanded ? "rotate-90" : ""}`}>&#9654;</span>
          {s.service_name}
        </span>
        <span className="text-xs text-right">{fmtEur(s.revenue_ex_vat_cents)}</span>
        <span className="text-xs text-right text-orange-600">{fmtEur(s.installer_cost_cents)}</span>
        <span className="text-xs text-right text-amber-600">{fmtEur(sDevCost)}</span>
        <span className="text-xs text-right text-indigo-600">{fmtEur(sSalesComm)}</span>
        <span className="text-xs text-right text-red-500">{fmtEur(s.marketing_spend_cents)}</span>
        <span className={`text-xs text-right font-semibold ${sProfit ? "text-green-600" : "text-red-500"}`}>{fmtEur(s.net_profit_cents)}</span>
        <span className={`text-xs text-right ${sProfit ? "text-green-600" : "text-red-500"}`}>{s.margin_percent.toFixed(1)}%</span>
        <span className="text-xs text-right">{s.booking_count}</span>
      </button>
      {/* Mobile */}
      <button onClick={() => setExpanded(!expanded)} className="lg:hidden px-5 pl-10 py-2 w-full text-left">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-primary flex items-center gap-1">
            <span className={`text-[8px] transition-transform ${expanded ? "rotate-90" : ""}`}>&#9654;</span>
            {s.service_name}
          </span>
          <span className={`text-xs font-semibold ${sProfit ? "text-green-600" : "text-red-500"}`}>{fmtEur(s.net_profit_cents)} ({s.margin_percent.toFixed(0)}%)</span>
        </div>
        <div className="flex gap-3 text-[10px] text-text-muted mt-0.5 pl-3">
          <span>Tulot {fmtEur(s.revenue_ex_vat_cents)}</span>
          <span>{s.booking_count} keikkaa</span>
        </div>
      </button>
      {/* Expanded line items */}
      {expanded && lineItems && lineItems.length > 0 && (
        <div className="bg-bg-secondary/20 py-1">
          {lineItems.map((li, i) => {
            const totalCosts = li.total_installer_cost_cents + li.total_device_cost_cents;
            const liMargin = li.total_revenue_cents - totalCosts;
            const liMarginPct = li.total_revenue_cents > 0 ? (liMargin / li.total_revenue_cents) * 100 : 0;
            const liProfit = liMargin >= 0;
            return (
              <div key={i}>
                {/* Desktop */}
                <div className="hidden lg:grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px_60px] gap-2 px-5 pl-16 py-1.5 items-center text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      li.line_type === "product" ? "bg-amber-50 text-amber-700" :
                      li.line_type === "addon_service" ? "bg-purple-50 text-purple-700" :
                      li.line_type === "service" ? "bg-blue-50 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{LINE_TYPE_LABELS[li.line_type] || li.line_type}</span>
                    <span className="text-text-primary">{li.name}</span>
                    <span className="text-text-muted">× {li.total_quantity}</span>
                  </div>
                  <span className="text-right">{fmtEur(li.total_revenue_cents)}</span>
                  <span className="text-right text-orange-600">{li.total_installer_cost_cents > 0 ? fmtEur(li.total_installer_cost_cents) : "-"}</span>
                  <span className="text-right text-amber-600">{li.total_device_cost_cents > 0 ? fmtEur(li.total_device_cost_cents) : "-"}</span>
                  <span className="text-right text-text-muted">-</span>
                  <span className={`text-right font-semibold ${liProfit ? "text-green-600" : "text-red-500"}`}>{fmtEur(liMargin)}</span>
                  <span className={`text-right ${liProfit ? "text-green-600" : "text-red-500"}`}>{liMarginPct.toFixed(1)}%</span>
                  <span className="text-right text-text-muted">{li.total_quantity}</span>
                </div>
                {/* Mobile */}
                <div className="lg:hidden px-5 pl-16 py-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1 py-0.5 rounded text-[8px] font-medium ${
                        li.line_type === "product" ? "bg-amber-50 text-amber-700" :
                        li.line_type === "addon_service" ? "bg-purple-50 text-purple-700" :
                        li.line_type === "service" ? "bg-blue-50 text-blue-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{LINE_TYPE_LABELS[li.line_type] || li.line_type}</span>
                      <span className="text-text-primary">{li.name} × {li.total_quantity}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{fmtEur(li.total_revenue_cents)}</span>
                      <span className={`font-semibold ${liProfit ? "text-green-600" : "text-red-500"}`}>{liMarginPct.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {expanded && lineItems && lineItems.length === 0 && (
        <div className="bg-bg-secondary/20 px-5 pl-16 py-2 text-[11px] text-text-muted">Ei lisärivejä</div>
      )}
    </div>
  );
}
