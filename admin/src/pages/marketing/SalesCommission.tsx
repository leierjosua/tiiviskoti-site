import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import { NavLink } from "react-router-dom";
import { finnishNow } from "@/lib/utils";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { Megaphone, Calculator, Settings2, ChevronDown, ChevronRight } from "lucide-react";
import {
  type AdSetSpend,
  type Region,
  type CommissionSettings,
  type AllocMap,
  DEFAULT_SETTINGS,
  useCommissionSettings,
  useSaveCommissionSettings,
  useCommissionAlloc,
  useSetAdsetAllocation,
  useClearAdsetAllocation,
  useCommissionExcluded,
  useToggleExcludedBooking,
  useCommissionRegionOverrides,
  useSetRegionOverride,
  useRegions,
  useAdSetSpend,
  useAllBookings,
  adSetAllocation as computeAdSetAllocation,
  computeRegionMarketing,
  computeCommissionRows,
  computeCommissionTotals,
} from "@/hooks/useMarketingCommission";

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
  const todayStr = fmt(today);

  // Provisioperusta on created_at (tilauksen syntyhetki, "myyty tänään"),
  // ei booking_date. Käynnissä olevien jaksojen yläraja capataan silti
  // tähän päivään — tulevia created_at-arvoja ei ole, mutta pidetään
  // jaksot yhdenmukaisina muiden välilehtien kanssa.
  switch (key) {
    case "this_month":
      return { from: `${y}-${pad(m + 1)}-01`, to: todayStr };
    case "prev_month": {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      return { from: `${py}-${pad(pm + 1)}-01`, to: `${py}-${pad(pm + 1)}-${pad(lastDay(py, pm))}` };
    }
    case "3months": {
      const d = new Date(y, m - 2, 1);
      return { from: fmt(d), to: todayStr };
    }
    case "6months": {
      const d = new Date(y, m - 5, 1);
      return { from: fmt(d), to: todayStr };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: todayStr };
    case "all":
      return { from: "2024-01-01", to: todayStr };
  }
}

const TABS = [
  { to: "/analytiikka/markkinointi", label: "Yhteenveto" },
  { to: "/analytiikka/markkinointi/kampanjat", label: "Kampanjat" },
  { to: "/analytiikka/markkinointi/aluekannattavuus", label: "Aluekannattavuus" },
  { to: "/analytiikka/markkinointi/kohdistukset", label: "Kohdistukset" },
  { to: "/analytiikka/markkinointi/provisio", label: "Provisio", end: true },
];

const fmtEur = (n: number) => `${n.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtNum = (n: number, d = 2) => n.toLocaleString("fi-FI", { minimumFractionDigits: d, maximumFractionDigits: d });

// ── Component ──────────────────────────────────────────────────────────────

export default function SalesCommission() {
  const [dateRange, setDateRange] = useState<DateRange>(() => getRange("prev_month"));
  const { from, to } = dateRange;
  const handlePresetPeriod = useCallback((key: PeriodKey) => { setDateRange(getRange(key)); }, []);

  // Config is DB-backed (shared across devices). Local state mirrors the DB row
  // for snappy editing and is seeded once when the query first resolves; edits
  // update local state immediately and persist via mutations.
  const { data: settingsData } = useCommissionSettings();
  const { data: allocData } = useCommissionAlloc();
  const { data: excludedData } = useCommissionExcluded();
  const { data: overridesData } = useCommissionRegionOverrides();

  const saveSettingsMut = useSaveCommissionSettings();
  const setAdsetAllocMut = useSetAdsetAllocation();
  const clearAdsetAllocMut = useClearAdsetAllocation();
  const toggleExcludedMut = useToggleExcludedBooking();
  const setRegionOverrideMut = useSetRegionOverride();

  const [settings, setSettings] = useState<CommissionSettings>(DEFAULT_SETTINGS);
  const [alloc, setAlloc] = useState<AllocMap>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [regionOverrides, setRegionOverrides] = useState<Record<string, string>>({});

  // Seed local state once from DB.
  const seeded = useRef({ settings: false, alloc: false, excluded: false, overrides: false });
  useEffect(() => { if (settingsData && !seeded.current.settings) { seeded.current.settings = true; setSettings(settingsData); } }, [settingsData]);
  useEffect(() => { if (allocData && !seeded.current.alloc) { seeded.current.alloc = true; setAlloc(allocData); } }, [allocData]);
  useEffect(() => { if (excludedData && !seeded.current.excluded) { seeded.current.excluded = true; setExcluded(excludedData); } }, [excludedData]);
  useEffect(() => { if (overridesData && !seeded.current.overrides) { seeded.current.overrides = true; setRegionOverrides(overridesData); } }, [overridesData]);

  // Debounced settings persistence (avoids a write per keystroke).
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const updateSettings = useCallback((next: CommissionSettings) => {
    setSettings(next);
    clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(() => saveSettingsMut.mutate(next), 500);
  }, [saveSettingsMut]);

  // Per-ad-set allocation: update local immediately, persist debounced (per ad set).
  const allocTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const updateAlloc = useCallback((adGroupId: string, percents: Record<string, number>) => {
    setAlloc((prev) => ({ ...prev, [adGroupId]: percents }));
    clearTimeout(allocTimers.current[adGroupId]);
    allocTimers.current[adGroupId] = setTimeout(() => setAdsetAllocMut.mutate({ adGroupId, percents }), 500);
  }, [setAdsetAllocMut]);

  const resetAlloc = useCallback((adGroupId: string) => {
    setAlloc((prev) => { const n = { ...prev }; delete n[adGroupId]; return n; });
    clearTimeout(allocTimers.current[adGroupId]);
    clearAdsetAllocMut.mutate(adGroupId);
  }, [clearAdsetAllocMut]);

  const [showSettings, setShowSettings] = useState(false);
  const [showAdsets, setShowAdsets] = useState(false);
  const [showUnattributed, setShowUnattributed] = useState(false);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  const { data: regions } = useRegions();
  const { data: revenueData, isLoading: loadingRev } = useAllBookings(from, to, regions, excluded, regionOverrides);
  const revenueMap = revenueData?.byRegion;
  const unattributed = revenueData?.unattributed || [];
  const { data: adsets, isLoading: loadingSpend } = useAdSetSpend(from, to);

  // Effective allocation for an ad-set: returns Record<region_id, fraction (0..1)>
  const adSetAllocation = useCallback(
    (a: AdSetSpend, regionList: Region[]) => computeAdSetAllocation(a, regionList, alloc),
    [alloc],
  );

  // Per-region marketing spend after exclusions and allocation
  const regionMarketing = useMemo(
    () => computeRegionMarketing(adsets, regions, alloc),
    [adsets, regions, alloc],
  );

  // Per-region commission
  const rows = useMemo(
    () => computeCommissionRows(regions, revenueMap, regionMarketing, settings),
    [regions, revenueMap, regionMarketing, settings],
  );

  const totals = useMemo(() => computeCommissionTotals(rows), [rows]);

  // Ad-set categorization summary
  const adSetSummary = useMemo(() => {
    if (!adsets) return null;
    let rekry = 0, asennus = 0, general = 0;
    for (const a of adsets) {
      if (a.category === "rekry") rekry += a.spend_cents;
      else if (a.category === "asennus") asennus += a.spend_cents;
      else general += a.spend_cents;
    }
    return {
      total: rekry + asennus + general,
      rekry, asennus, general,
    };
  }, [adsets]);

  const isLoading = loadingRev || loadingSpend;

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
                isActive ? "bg-accent text-white shadow-sm" : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Date range picker + presets */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="flex flex-nowrap gap-1 overflow-x-auto">
          {PERIOD_OPTIONS.map((opt) => (
            <button key={opt.key} onClick={() => handlePresetPeriod(opt.key)} className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Settings collapsible */}
      <div className="bg-surface rounded-2xl border border-border mb-4">
        <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-2 w-full px-5 py-3 text-left">
          <Settings2 className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">Parametrit</span>
          <span className="text-xs text-text-muted ml-2">
            keskivaraus {fmtNum(settings.avgBookingEur, 0)} €, kynnys Uusimaa {settings.thresholdUusimaaEur} €, muut {settings.thresholdOtherEur} €
          </span>
          <span className="ml-auto">{showSettings ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
        </button>
        {showSettings && (
          <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <NumberInput label="Keskivaraus (€)" value={settings.avgBookingEur} onChange={(v) => updateSettings({ ...settings, avgBookingEur: v })} />
            <NumberInput label="Kynnys Uusimaa (€)" value={settings.thresholdUusimaaEur} onChange={(v) => updateSettings({ ...settings, thresholdUusimaaEur: v })} />
            <NumberInput label="Kynnys muut (€)" value={settings.thresholdOtherEur} onChange={(v) => updateSettings({ ...settings, thresholdOtherEur: v })} />
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted">Ladataan…</div>
      )}

      {/* Result */}
      {!isLoading && rows.length > 0 && (
        <div className="space-y-4">
          {/* KPI: Provisio */}
          <div className="bg-accent-muted/30 border border-accent/30 rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10"><Calculator className="w-5 h-5 text-accent" /></div>
              <div>
                <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Provisio yhteensä</p>
                <p className="text-2xl font-bold text-text-primary">{fmtEur(totals.commission)}</p>
              </div>
            </div>
          </div>

          {/* Per-region table */}
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="font-semibold text-text-primary text-sm">Alueittain</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold text-text-muted uppercase tracking-wide bg-bg-secondary/50">
                    <th className="text-left px-4 py-2">Alue</th>
                    <th className="text-right px-3 py-2">Myynti</th>
                    <th className="text-right px-3 py-2">Asennukset</th>
                    <th className="text-right px-3 py-2">Palvelumyynti</th>
                    <th className="text-right px-3 py-2">N</th>
                    <th className="text-right px-3 py-2">Markkinointi</th>
                    <th className="text-right px-3 py-2">CPA</th>
                    <th className="text-right px-3 py-2">Kynnys</th>
                    <th className="text-right px-3 py-2 font-bold">Provisio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const isExp = expandedRegion === r.region_id;
                    return (
                      <Fragment key={r.region_id}>
                        <tr className="hover:bg-bg-secondary/30 cursor-pointer" onClick={() => setExpandedRegion(isExp ? null : r.region_id)}>
                          <td className="px-4 py-2 font-medium text-text-primary flex items-center gap-1">
                            <span className={`text-[9px] transition-transform ${isExp ? "rotate-90" : ""}`}>&#9654;</span>
                            {r.region_name}
                          </td>
                          <td className="px-3 py-2 text-right">{fmtEur(r.revenue_eur)}</td>
                          <td className="px-3 py-2 text-right text-text-muted">{r.install_eur > 0 ? fmtEur(r.install_eur) : "—"}</td>
                          <td className="px-3 py-2 text-right">{fmtEur(r.service_revenue_eur)}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(r.N)}</td>
                          <td className="px-3 py-2 text-right text-red-500">{fmtEur(r.mkt_eur)}</td>
                          <td className="px-3 py-2 text-right">{fmtEur(r.cpa)}</td>
                          <td className="px-3 py-2 text-right text-text-muted">{r.threshold} €</td>
                          <td className={`px-3 py-2 text-right font-bold ${r.commission > 0 ? "text-green-600" : "text-text-muted"}`}>{fmtEur(r.commission)}</td>
                        </tr>
                        {isExp && (
                          <tr className="bg-bg-secondary/30">
                            <td colSpan={9} className="px-6 py-3 text-xs text-text-muted">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <b>Laskukaava:</b> N = palvelumyynti / keskivaraus = {fmtEur(r.service_revenue_eur)} / {settings.avgBookingEur} € = {fmtNum(r.N)}
                                </div>
                                <div>
                                  <b>CPA:</b> markkinointi / N = {fmtEur(r.mkt_eur)} / {fmtNum(r.N)} = {fmtEur(r.cpa)}
                                </div>
                                <div>
                                  <b>Provisio:</b> max(0, kynnys − CPA) / 2 × N = max(0, {r.threshold} − {fmtNum(r.cpa)}) / 2 × {fmtNum(r.N)}
                                </div>
                                <div>
                                  <b>= {fmtEur(r.commission)}</b>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-bg-secondary/50 font-semibold">
                  <tr>
                    <td className="px-4 py-2">Yhteensä</td>
                    <td className="px-3 py-2 text-right">{fmtEur(totals.revenue)}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(totals.install)}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(totals.service)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(totals.N)}</td>
                    <td className="px-3 py-2 text-right text-red-500">{fmtEur(totals.mkt)}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right text-green-600">{fmtEur(totals.commission)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Marketing breakdown */}
          {adSetSummary && (
            <div className="bg-surface rounded-2xl border border-border p-5">
              <h3 className="font-semibold text-text-primary text-sm mb-3">Markkinointi yhteensä jaksolla</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Kaikki" value={fmtEur(adSetSummary.total / 100)} />
                <Stat label="Rekry (pois)" value={fmtEur(adSetSummary.rekry / 100)} muted />
                <Stat label="Asennusmarkkinointi (pois)" value={fmtEur(adSetSummary.asennus / 100)} muted />
                <Stat label="Asiakashankintaan" value={fmtEur(adSetSummary.general / 100)} highlight />
              </div>
            </div>
          )}

          {/* Unattributed bookings (no service_id) — manual include/exclude */}
          {unattributed.length > 0 && regions && (
            <div className="bg-surface rounded-2xl border border-border">
              <button onClick={() => setShowUnattributed(!showUnattributed)} className="flex items-center gap-2 w-full px-5 py-3 text-left">
                <span className="text-sm font-medium text-text-primary">
                  Service_id puuttuvat varaukset ({unattributed.length} kpl, {fmtEur(unattributed.reduce((s, u) => s + u.price_cents, 0) / 100)})
                </span>
                {(() => {
                  const excludedCount = unattributed.filter((u) => excluded.has(u.id)).length;
                  return excludedCount > 0 ? (
                    <span className="text-xs text-orange-500 ml-2">{excludedCount} pois laskelmasta</span>
                  ) : null;
                })()}
                <span className="ml-auto">{showUnattributed ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
              </button>
              {showUnattributed && (
                <div className="px-5 pb-4">
                  <p className="text-xs text-text-muted mb-3">
                    Käsin luotuja varauksia, joilta puuttuu service_id (esim. asennustyöt custom-riveinä). Oletuksena mukana myynnissä — ota pois jos esim. asennusluonteinen. Alueeton (postinro ei osu) ohjautuu oletuksena Uusimaalle; vaihda alue pudotusvalikosta tarvittaessa.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-semibold text-text-muted uppercase tracking-wide bg-bg-secondary/50">
                          <th className="text-left px-3 py-2 w-10">Mukana</th>
                          <th className="text-left px-3 py-2">#</th>
                          <th className="text-left px-3 py-2">Pvm</th>
                          <th className="text-left px-3 py-2">Alue</th>
                          <th className="text-right px-3 py-2">€</th>
                          <th className="text-left px-3 py-2">Sisältö</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {unattributed.map((u) => {
                          const isIncluded = !excluded.has(u.id);
                          return (
                            <tr key={u.id} className={isIncluded ? "" : "bg-orange-50/40"}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={isIncluded}
                                  onChange={(e) => {
                                    const nowExcluded = !e.target.checked;
                                    setExcluded((prev) => {
                                      const next = new Set(prev);
                                      if (nowExcluded) next.add(u.id);
                                      else next.delete(u.id);
                                      return next;
                                    });
                                    toggleExcludedMut.mutate({ bookingId: u.id, excluded: nowExcluded });
                                  }}
                                  className="w-4 h-4 cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2 text-text-muted">{u.booking_number ?? "—"}</td>
                              <td className="px-3 py-2 text-text-muted">{u.booking_date}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={u.region_id ?? ""}
                                  onChange={(e) => {
                                    const regionId = e.target.value;
                                    setRegionOverrides((prev) => ({ ...prev, [u.id]: regionId }));
                                    setRegionOverrideMut.mutate({ bookingId: u.id, regionId });
                                  }}
                                  className="px-1.5 py-1 border border-border rounded text-xs bg-bg"
                                >
                                  {regions.map((r) => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2 text-right font-medium">{fmtEur(u.price_cents / 100)}</td>
                              <td className="px-3 py-2 text-text-muted">{u.description}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ad-set allocation editor */}
          {adsets && regions && (
            <div className="bg-surface rounded-2xl border border-border">
              <button onClick={() => setShowAdsets(!showAdsets)} className="flex items-center gap-2 w-full px-5 py-3 text-left">
                <span className="text-sm font-medium text-text-primary">Ad set -kohtainen kohdistus ({adsets.filter(a => a.category === "general").length} kpl)</span>
                <span className="ml-auto">{showAdsets ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
              </button>
              {showAdsets && (
                <div className="px-5 pb-4">
                  <p className="text-xs text-text-muted mb-3">
                    DB:n alue-tagi auto-täytetään 100%. Aseta omat osuudet kun ad-set ajetaan useammalle alueelle (esim. Concept images - static: 50% Uusimaa, 16,7% per muu).
                    Osuudet tallentuvat selaimeen.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-semibold text-text-muted uppercase tracking-wide bg-bg-secondary/50">
                          <th className="text-left px-3 py-2">Ad set</th>
                          <th className="text-left px-3 py-2">Kampanja</th>
                          <th className="text-right px-3 py-2">€</th>
                          {regions.map((r) => (
                            <th key={r.id} className="text-right px-2 py-2">{r.name} %</th>
                          ))}
                          <th className="text-right px-2 py-2">∑</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adsets.filter(a => a.category === "general").map((a) => {
                          const split = adSetAllocation(a, regions);
                          const override = alloc[a.ad_group_id];
                          const values: Record<string, number> = {};
                          for (const r of regions) {
                            values[r.id] = override?.[r.id] ?? Math.round((split[r.id] || 0) * 100);
                          }
                          const sum = Object.values(values).reduce((s, v) => s + v, 0);
                          return (
                            <tr key={a.ad_group_id}>
                              <td className="px-3 py-2 text-text-primary">{a.ad_group_name || "(nimetön)"}</td>
                              <td className="px-3 py-2 text-text-muted">{a.campaign_name}</td>
                              <td className="px-3 py-2 text-right">{fmtEur(a.spend_cents / 100)}</td>
                              {regions.map((r) => (
                                <td key={r.id} className="px-1 py-1 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={values[r.id]}
                                    onChange={(e) => {
                                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                      updateAlloc(a.ad_group_id, { ...(alloc[a.ad_group_id] || values), [r.id]: v });
                                    }}
                                    className="w-16 px-1.5 py-1 border border-border rounded text-right text-xs bg-bg"
                                  />
                                </td>
                              ))}
                              <td className={`px-2 py-2 text-right ${sum === 100 ? "text-text-muted" : "text-orange-500 font-semibold"}`}>{sum}</td>
                              <td className="px-2 py-2 text-right">
                                {alloc[a.ad_group_id] && (
                                  <button
                                    onClick={() => resetAlloc(a.ad_group_id)}
                                    className="text-[10px] text-text-muted hover:text-text-primary underline"
                                  >
                                    nollaa
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted">
          Ei dataa valitulle jaksolle.
        </div>
      )}
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="px-3 py-1.5 border border-border rounded-lg text-sm bg-bg"
      />
    </label>
  );
}

function Stat({ label, value, highlight, muted }: { label: string; value: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">{label}</span>
      <span className={`font-semibold ${highlight ? "text-accent" : muted ? "text-text-muted" : "text-text-primary"}`}>{value}</span>
    </div>
  );
}
