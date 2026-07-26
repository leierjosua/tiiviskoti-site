import { useState, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { finnishNow } from "@/lib/utils";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { Megaphone, ChevronDown, ChevronRight, Filter, FileText, ArrowUp, ArrowDown } from "lucide-react";
import { useMarketingCampaigns, type CampaignWithSpend, type MarketingAd, type AssetStat } from "@/hooks/marketing/useMarketingCampaigns";

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
  { to: "/analytiikka/markkinointi/kampanjat", label: "Kampanjat", end: true },
  { to: "/analytiikka/markkinointi/aluekannattavuus", label: "Aluekannattavuus" },
  { to: "/analytiikka/markkinointi/kohdistukset", label: "Kohdistukset" },
  { to: "/analytiikka/markkinointi/provisio", label: "Provisio" },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function MarketingCampaigns() {
  const [dateRange, setDateRange] = useState<DateRange>(() => getRange("this_month"));
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedAgId, setExpandedAgId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { from, to } = dateRange;
  const handlePresetPeriod = useCallback((key: PeriodKey) => { setDateRange(getRange(key)); }, []);

  const { data: campaigns, isLoading } = useMarketingCampaigns(from, to);

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    const list = campaigns
      .filter((c) => platformFilter === "all" || c.platform === platformFilter)
      .filter((c) => c.total_spend_cents > 0);

    const getValue = (c: typeof list[0], key: string): number => {
      switch (key) {
        case "spend": return c.total_spend_cents;
        case "clicks": return c.total_clicks;
        case "leads": return c.total_leads || 0;
        case "purchases": return c.total_purchases || 0;
        case "schedules": return c.total_schedules || 0;
        case "ctr": return c.total_impressions > 0 ? c.total_clicks / c.total_impressions : 0;
        case "cpa": {
          const t = (c.total_leads || 0) + (c.total_purchases || 0) + (c.total_schedules || 0);
          return t > 0 ? c.total_spend_cents / t : Infinity;
        }
        case "cpa_purchase": return (c.total_purchases || 0) > 0 ? c.total_spend_cents / c.total_purchases : Infinity;
        default: return c.total_spend_cents;
      }
    };
    return list.sort((a, b) => {
      const va = getValue(a, sortKey);
      const vb = getValue(b, sortKey);
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [campaigns, platformFilter, sortKey, sortDir]);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }, [sortKey]);

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

      {/* Date range + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="flex flex-nowrap gap-1 overflow-x-auto">
          {PERIOD_OPTIONS.map((opt) => (
            <button key={opt.key} onClick={() => handlePresetPeriod(opt.key)} className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-text-muted" />
          <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-text-primary">
            <option value="all">Kaikki alustat</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
          </select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-surface rounded-xl" />
          ))}
        </div>
      )}

      {/* Table */}
      {!isLoading && filtered.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          {/* Desktop header */}
          <div className="hidden lg:grid grid-cols-[1fr_90px_80px_70px_70px_70px_60px_70px_70px] gap-2 px-5 py-3 border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wide">
            <span>Kampanja</span>
            {([
              { key: "spend", label: "Kulut" },
              { key: "clicks", label: "Klikit" },
              { key: "leads", label: "Liidit" },
              { key: "purchases", label: "Ostot" },
              { key: "schedules", label: "Varaukset" },
              { key: "ctr", label: "CTR" },
              { key: "cpa", label: "CPA" },
              { key: "cpa_purchase", label: "CPA osto" },
            ]).map((col) => (
              <button
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="text-right flex items-center justify-end gap-0.5 hover:text-text-primary transition-colors cursor-pointer"
              >
                {col.label}
                {sortKey === col.key && (
                  sortDir === "desc"
                    ? <ArrowDown className="w-3 h-3" />
                    : <ArrowUp className="w-3 h-3" />
                )}
              </button>
            ))}
          </div>

          <div className="divide-y divide-border">
            {filtered.map((c) => (
              <CampaignRow
                key={c.id}
                campaign={c}
                expanded={expandedId === c.id}
                expandedAgId={expandedAgId}
                onToggle={() => { setExpandedId(expandedId === c.id ? null : c.id); setExpandedAgId(null); }}
                onToggleAg={(agId) => setExpandedAgId(expandedAgId === agId ? null : agId)}
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted">
          Ei kampanjoita. Synkronoi data ensin.
        </div>
      )}
    </div>
  );
}

function CampaignRow({
  campaign: c,
  expanded,
  expandedAgId,
  onToggle,
  onToggleAg,
}: {
  campaign: CampaignWithSpend;
  expanded: boolean;
  expandedAgId: string | null;
  onToggle: () => void;
  onToggleAg: (agId: string) => void;
}) {
  const ctr = c.total_impressions > 0 ? ((c.total_clicks / c.total_impressions) * 100).toFixed(2) : "0";
  const totalConv = (c.total_leads || 0) + (c.total_purchases || 0) + (c.total_schedules || 0);
  const cpa = totalConv > 0 ? fmtEur(Math.round(c.total_spend_cents / totalConv)) : "-";
  const cpaPurchase = (c.total_purchases || 0) > 0 ? fmtEur(Math.round(c.total_spend_cents / c.total_purchases)) : "-";
  const hasAdGroups = c.marketing_ad_groups.length > 0;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left lg:grid lg:grid-cols-[1fr_90px_80px_70px_70px_70px_60px_70px_70px] gap-2 px-5 py-3 hover:bg-surface-hover transition-colors"
      >
        {/* Campaign name + platform badge */}
        <div className="flex items-center gap-2">
          {hasAdGroups ? (
            expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            )
          ) : (
            <span className="w-3.5" />
          )}
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              c.platform === "google_ads"
                ? "bg-[#F4B400]/10 text-[#B8860B]"
                : "bg-[#0668E1]/10 text-[#0668E1]"
            }`}
          >
            {c.platform === "google_ads" ? "Google" : "Meta"}
          </span>
          <span className="text-sm font-medium text-text-primary truncate">{c.name}</span>
          {c.status !== "active" && c.status !== "enabled" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              {c.status}
            </span>
          )}
        </div>

        {/* Stats — on mobile show as inline pairs */}
        <div className="lg:hidden flex flex-wrap gap-x-4 gap-y-1 mt-2 ml-8 text-xs text-text-muted">
          <span>Kulut: <b className="text-text-primary">{fmtEur(c.total_spend_cents)}</b></span>
          <span>Liidit: <b className="text-green-600">{Math.round(c.total_leads || 0)}</b></span>
          <span>Ostot: <b className="text-emerald-600">{Math.round(c.total_purchases || 0)}</b></span>
          <span>Varaukset: <b className="text-teal-600">{Math.round(c.total_schedules || 0)}</b></span>
        </div>

        {/* Desktop stats */}
        <span className="hidden lg:block text-sm text-right font-medium text-text-primary">{fmtEur(c.total_spend_cents)}</span>
        <span className="hidden lg:block text-sm text-right text-text-primary">{c.total_clicks.toLocaleString("fi-FI")}</span>
        <span className="hidden lg:block text-sm text-right text-green-600 font-medium">{Math.round(c.total_leads || 0)}</span>
        <span className="hidden lg:block text-sm text-right text-emerald-600 font-medium">{Math.round(c.total_purchases || 0)}</span>
        <span className="hidden lg:block text-sm text-right text-teal-600 font-medium">{Math.round(c.total_schedules || 0)}</span>
        <span className="hidden lg:block text-sm text-right text-text-muted">{ctr}%</span>
        <span className="hidden lg:block text-sm text-right text-text-muted">{cpa}</span>
        <span className="hidden lg:block text-sm text-right font-medium text-emerald-600">{cpaPurchase}</span>
      </button>

      {/* Expanded ad groups / ad sets */}
      {expanded && hasAdGroups && (
        <div className="bg-surface-hover/50 border-t border-border">
          {/* Ad group header */}
          <div className="hidden lg:grid grid-cols-[1fr_90px_80px_70px_70px_70px_60px_70px_70px] gap-2 px-5 py-2 pl-14 text-[10px] font-semibold text-text-muted uppercase tracking-wide">
            <span>{c.platform === "meta_ads" ? "Ad Set" : "Ad Group"}</span>
            <span className="text-right">Kulut</span>
            <span className="text-right">Klikit</span>
            <span className="text-right">Liidit</span>
            <span className="text-right">Ostot</span>
            <span className="text-right">Varaukset</span>
            <span className="text-right">CTR</span>
            <span className="text-right">CPA</span>
            <span className="text-right">CPA osto</span>
          </div>
          {c.marketing_ad_groups
            .filter((ag) => (ag.spend || 0) > 0)
            .sort((a, b) => (b.spend || 0) - (a.spend || 0))
            .map((ag) => {
              const agCtr = (ag.impressions || 0) > 0 ? (((ag.clicks || 0) / (ag.impressions || 1)) * 100).toFixed(2) : "0";
              const agTotal = (ag.leads || 0) + (ag.purchases || 0) + (ag.schedules || 0);
              const agCpa = agTotal > 0 ? fmtEur(Math.round((ag.spend || 0) / agTotal)) : "-";
              const agCpaPurchase = (ag.purchases || 0) > 0 ? fmtEur(Math.round((ag.spend || 0) / (ag.purchases || 1))) : "-";
              const hasAds = (ag.ads || []).length > 0;
              const agExpanded = expandedAgId === ag.id;
              return (
                <div key={ag.id}>
                  <button
                    onClick={() => hasAds && onToggleAg(ag.id)}
                    className="w-full lg:grid lg:grid-cols-[1fr_90px_80px_70px_70px_70px_60px_70px_70px] gap-2 px-5 py-2.5 pl-14 border-b border-border/50 text-left hover:bg-white/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {hasAds ? (
                        agExpanded ? <ChevronDown className="w-3 h-3 text-text-muted flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                      ) : <span className="w-3" />}
                      <span className="text-sm text-text-primary truncate">{ag.name}</span>
                      {ag.status !== "active" && ag.status !== "enabled" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{ag.status}</span>
                      )}
                    </div>
                    <div className="lg:hidden flex flex-wrap gap-x-3 gap-y-0.5 mt-1 ml-5 text-xs text-text-muted">
                      <span>{fmtEur(ag.spend || 0)}</span>
                      <span>L: {Math.round(ag.leads || 0)}</span>
                      <span>O: {Math.round(ag.purchases || 0)}</span>
                      <span>V: {Math.round(ag.schedules || 0)}</span>
                    </div>
                    <span className="hidden lg:block text-sm text-right text-text-primary">{fmtEur(ag.spend || 0)}</span>
                    <span className="hidden lg:block text-sm text-right text-text-primary">{(ag.clicks || 0).toLocaleString("fi-FI")}</span>
                    <span className="hidden lg:block text-sm text-right text-green-600">{Math.round(ag.leads || 0)}</span>
                    <span className="hidden lg:block text-sm text-right text-emerald-600">{Math.round(ag.purchases || 0)}</span>
                    <span className="hidden lg:block text-sm text-right text-teal-600">{Math.round(ag.schedules || 0)}</span>
                    <span className="hidden lg:block text-sm text-right text-text-muted">{agCtr}%</span>
                    <span className="hidden lg:block text-sm text-right text-text-muted">{agCpa}</span>
                    <span className="hidden lg:block text-sm text-right font-medium text-emerald-600">{agCpaPurchase}</span>
                  </button>

                  {/* Expanded: Asset performance + Ads creative */}
                  {agExpanded && (
                    <div className="bg-white/30 border-b border-border/30">
                      {/* Asset-level stats (per headline/description) */}
                      {(ag.assetStats || []).length > 0 && (
                        <AssetPerformanceTable assets={ag.assetStats || []} />
                      )}
                      {/* Ads creative details */}
                      {(ag.ads || []).length > 0 && (
                        <div className="border-t border-border/20">
                          <p className="px-5 sm:pl-20 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wide">Mainokset</p>
                          {(ag.ads || []).map((ad) => (
                            <AdCreativeRow key={ad.id} ad={ad} platform={c.platform} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

const PERF_COLORS: Record<string, string> = {
  BEST: "bg-green-100 text-green-700",
  GOOD: "bg-blue-100 text-blue-700",
  LOW: "bg-red-100 text-red-700",
  LEARNING: "bg-yellow-100 text-yellow-700",
};

function AssetPerformanceTable({ assets }: { assets: AssetStat[] }) {
  const headlines = assets.filter((a) => a.field_type === "HEADLINE").sort((a, b) => b.impressions - a.impressions);
  const descriptions = assets.filter((a) => a.field_type === "DESCRIPTION").sort((a, b) => b.impressions - a.impressions);
  const primaryTexts = assets.filter((a) => a.field_type === "PRIMARY_TEXT").sort((a, b) => b.impressions - a.impressions);

  function renderSection(title: string, items: AssetStat[]) {
    if (items.length === 0) return null;
    return (
      <div className="px-5 sm:pl-20 py-2">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">{title}</p>
        <div className="space-y-0.5">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[1fr_70px_70px_60px_60px_60px_70px] gap-2 text-[10px] font-semibold text-text-muted uppercase tracking-wide pb-1">
            <span>Teksti</span>
            <span className="text-right">Näytöt</span>
            <span className="text-right">Klikit</span>
            <span className="text-right">CTR</span>
            <span className="text-right">Kulut</span>
            <span className="text-right">Konv.</span>
            <span className="text-right">Taso</span>
          </div>
          {items.map((a, i) => {
            const ctr = a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) : "0";
            return (
              <div key={i} className="sm:grid sm:grid-cols-[1fr_70px_70px_60px_60px_60px_70px] gap-2 py-1.5 border-b border-border/10 last:border-0">
                <span className="text-xs text-text-primary leading-snug">{a.text}</span>
                {/* Mobile */}
                <div className="sm:hidden flex flex-wrap gap-x-3 text-[11px] text-text-muted mt-0.5">
                  <span>{a.impressions.toLocaleString("fi-FI")} näyttöä</span>
                  <span>{a.clicks} klik</span>
                  <span>{ctr}% CTR</span>
                  <span>{Math.round(a.conversions)} konv</span>
                </div>
                {/* Desktop */}
                <span className="hidden sm:block text-xs text-right text-text-primary">{a.impressions.toLocaleString("fi-FI")}</span>
                <span className="hidden sm:block text-xs text-right text-text-primary">{a.clicks.toLocaleString("fi-FI")}</span>
                <span className="hidden sm:block text-xs text-right text-text-muted">{ctr}%</span>
                <span className="hidden sm:block text-xs text-right text-text-muted">{fmtEur(a.spend_cents)}</span>
                <span className="hidden sm:block text-xs text-right text-text-primary">{Math.round(a.conversions)}</span>
                <span className="hidden sm:block text-right">
                  {a.performance_label && a.performance_label !== "UNKNOWN" && a.performance_label !== "NOT_APPLICABLE" && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${PERF_COLORS[a.performance_label] || "bg-gray-100 text-gray-600"}`}>
                      {a.performance_label}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {renderSection("Headlines", headlines)}
      {renderSection("Primary Text", primaryTexts)}
      {renderSection("Descriptions", descriptions)}
    </>
  );
}

function AdCreativeRow({ ad }: { ad: MarketingAd; platform: string }) {
  const headlines = ad.headlines || [];
  const descriptions = ad.descriptions || [];
  // Split primary_text by --- separator (multiple variants joined during sync)
  const primaryTexts = ad.primary_text ? ad.primary_text.split("\n---\n").filter(Boolean) : [];

  return (
    <div className="px-5 py-3 sm:pl-20 border-b border-border/20 last:border-0">
      <div className="flex items-start gap-3">
        {ad.preview_url && (
          <img src={ad.preview_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Ad name + type + stats */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              <span className="text-sm font-medium text-text-primary truncate">{ad.name || "Nimetön"}</span>
              {ad.creative_type && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase flex-shrink-0">
                  {ad.creative_type.replace(/_/g, " ")}
                </span>
              )}
            </div>
            {ad.cta && (
              <span className="inline-block px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-medium flex-shrink-0">
                {ad.cta.replace(/_/g, " ")}
              </span>
            )}
          </div>

          {/* Ad-level stats */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-text-muted">
            <span>Kulut: <b className="text-text-primary">{fmtEur(ad.spend || 0)}</b></span>
            <span>Klikit: <b className="text-text-primary">{(ad.clicks || 0).toLocaleString("fi-FI")}</b></span>
            <span>Impressiot: <b className="text-text-primary">{(ad.impressions || 0).toLocaleString("fi-FI")}</b></span>
            <span>Liidit: <b className="text-green-600">{Math.round(ad.leads || 0)}</b></span>
            <span>Ostot: <b className="text-emerald-600">{Math.round(ad.purchases || 0)}</b></span>
            <span>Varaukset: <b className="text-teal-600">{Math.round(ad.schedules || 0)}</b></span>
          </div>

          {/* Creative variants */}
          <div className="space-y-2 text-xs">
            {headlines.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-0.5">
                  Headlines ({headlines.length})
                </p>
                <div className="space-y-0.5">
                  {headlines.map((h, i) => (
                    <p key={i} className="text-text-primary leading-snug pl-2 border-l-2 border-accent/20">{h}</p>
                  ))}
                </div>
              </div>
            )}

            {primaryTexts.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-0.5">
                  Primary Text ({primaryTexts.length})
                </p>
                <div className="space-y-1">
                  {primaryTexts.map((pt, i) => (
                    <p key={i} className="text-text-primary leading-snug pl-2 border-l-2 border-purple-200 line-clamp-2">{pt}</p>
                  ))}
                </div>
              </div>
            )}

            {descriptions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-0.5">
                  Descriptions ({descriptions.length})
                </p>
                <div className="space-y-0.5">
                  {descriptions.map((d, i) => (
                    <p key={i} className="text-text-primary leading-snug pl-2 border-l-2 border-green-200">{d}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
