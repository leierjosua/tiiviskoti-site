import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { finnishDayRange } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared marketing-commission (provisio) calculation.
//
// Single source of truth for the region-based provisio formula used both on
// the dedicated Markkinointi → Provisio page (SalesCommission.tsx) and as a
// cost card on the main /analytiikka dashboard. Keep the formula here only —
// duplicating it has caused drift before.
// ---------------------------------------------------------------------------

export const REKRY_NAME_RE = /\brekry\b/i;
export const INSTALL_NAME_RE = /\basennus\b/i;

// ── Types ────────────────────────────────────────────────────────────────────

export interface AdSetSpend {
  ad_group_id: string;
  ad_group_name: string;
  ad_group_region_id: string | null;
  campaign_id: string;
  campaign_name: string;
  campaign_platform: string;
  campaign_service_id: string | null;
  campaign_region_id: string | null;
  spend_cents: number;
  category: "rekry" | "asennus" | "general";
  region_id: string | null; // effective region (ad_group → campaign fallback)
}

export interface Region {
  id: string;
  name: string;
  postal_prefixes: string[];
}

export interface RegionRevenue {
  region_id: string;
  total_cents: number;
  install_cents: number;
}

export interface UnattributedBooking {
  id: string;
  booking_number: number | null;
  booking_date: string;
  postal_code: string | null;
  region_id: string | null;
  price_cents: number;
  description: string;
}

export interface AllBookingsResult {
  byRegion: Map<string, RegionRevenue>;
  unattributed: UnattributedBooking[];
}

export interface CommissionSettings {
  avgBookingEur: number;
  thresholdUusimaaEur: number;
  thresholdOtherEur: number;
}

// alloc[ad_group_id] = { region_id: percent, ... } summing to 100
export type AllocMap = Record<string, Record<string, number>>;

export interface CommissionRow {
  region_id: string;
  region_name: string;
  revenue_eur: number;
  install_eur: number;
  service_revenue_eur: number;
  N: number;
  mkt_eur: number;
  cpa: number;
  threshold: number;
  commission: number;
}

// ── Persistent settings (Supabase) ───────────────────────────────────────────
// Previously localStorage (per-browser); now DB-backed so the calculation is
// identical on every device. See migration 20260527000004.

export const DEFAULT_SETTINGS: CommissionSettings = {
  avgBookingEur: 280,
  thresholdUusimaaEur: 80,
  thresholdOtherEur: 95,
};

const SETTINGS_QK = ["marketing-commission-settings"];
const ALLOC_QK = ["marketing-commission-alloc"];
const EXCLUDED_QK = ["marketing-commission-excluded"];
const OVERRIDES_QK = ["marketing-commission-region-overrides"];

// Settings: single row, cents in DB → euros in the UI/formula.
export function useCommissionSettings() {
  return useQuery<CommissionSettings>({
    queryKey: SETTINGS_QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_commission_settings")
        .select("avg_booking_cents, threshold_uusimaa_cents, threshold_other_cents")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS;
      return {
        avgBookingEur: (data.avg_booking_cents as number) / 100,
        thresholdUusimaaEur: (data.threshold_uusimaa_cents as number) / 100,
        thresholdOtherEur: (data.threshold_other_cents as number) / 100,
      };
    },
  });
}

export function useSaveCommissionSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: CommissionSettings) => {
      const { error } = await supabase
        .from("marketing_commission_settings")
        .update({
          avg_booking_cents: Math.round(s.avgBookingEur * 100),
          threshold_uusimaa_cents: Math.round(s.thresholdUusimaaEur * 100),
          threshold_other_cents: Math.round(s.thresholdOtherEur * 100),
        })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_QK });
    },
  });
}

// Allocations: rows of (ad_group_id, region_id, percent) → AllocMap.
export function useCommissionAlloc() {
  return useQuery<AllocMap>({
    queryKey: ALLOC_QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_commission_adset_allocations")
        .select("ad_group_id, region_id, percent");
      if (error) throw error;
      const map: AllocMap = {};
      for (const r of data || []) {
        const ag = r.ad_group_id as string;
        (map[ag] ??= {})[r.region_id as string] = r.percent as number;
      }
      return map;
    },
  });
}

// Replace all rows for one ad-set (delete + insert non-zero percents).
export function useSetAdsetAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ adGroupId, percents }: { adGroupId: string; percents: Record<string, number> }) => {
      const { error: delErr } = await supabase
        .from("marketing_commission_adset_allocations")
        .delete()
        .eq("ad_group_id", adGroupId);
      if (delErr) throw delErr;
      const rows = Object.entries(percents)
        .filter(([, p]) => p > 0)
        .map(([region_id, percent]) => ({ ad_group_id: adGroupId, region_id, percent }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("marketing_commission_adset_allocations")
          .insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ALLOC_QK });
    },
  });
}

export function useClearAdsetAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (adGroupId: string) => {
      const { error } = await supabase
        .from("marketing_commission_adset_allocations")
        .delete()
        .eq("ad_group_id", adGroupId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ALLOC_QK });
    },
  });
}

// Excluded bookings: presence in table = excluded from commission.
export function useCommissionExcluded() {
  return useQuery<Set<string>>({
    queryKey: EXCLUDED_QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_commission_excluded_bookings")
        .select("booking_id");
      if (error) throw error;
      return new Set((data || []).map((r) => r.booking_id as string));
    },
  });
}

export function useToggleExcludedBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, excluded }: { bookingId: string; excluded: boolean }) => {
      if (excluded) {
        const { error } = await supabase
          .from("marketing_commission_excluded_bookings")
          .upsert({ booking_id: bookingId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("marketing_commission_excluded_bookings")
          .delete()
          .eq("booking_id", bookingId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXCLUDED_QK });
    },
  });
}

// Region overrides: booking_id → region_id (käsin valittu alue varaukselle,
// ohittaa postinumero-osumisen ja alueettoman Uusimaa-oletuksen).
export function useCommissionRegionOverrides() {
  return useQuery<Record<string, string>>({
    queryKey: OVERRIDES_QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_commission_region_overrides")
        .select("booking_id, region_id");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of data || []) map[r.booking_id as string] = r.region_id as string;
      return map;
    },
  });
}

export function useSetRegionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, regionId }: { bookingId: string; regionId: string }) => {
      const { error } = await supabase
        .from("marketing_commission_region_overrides")
        .upsert({ booking_id: bookingId, region_id: regionId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: OVERRIDES_QK });
    },
  });
}

// ── Data hooks ───────────────────────────────────────────────────────────────

export function useRegions() {
  return useQuery<Region[]>({
    queryKey: ["mkt-regions-active-prefixes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_regions")
        .select("id, name, postal_prefixes")
        .eq("active", true)
        .order("position");
      if (error) throw error;
      return data as Region[];
    },
  });
}

export function useAdSetSpend(from: string, to: string) {
  return useQuery<AdSetSpend[]>({
    queryKey: ["ad-set-spend", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      // 1) spend rows in range
      const { data: stats, error: e1 } = await supabase
        .from("marketing_daily_stats")
        .select("ad_group_id, spend_cents")
        .gte("date", from)
        .lte("date", to);
      if (e1) throw e1;
      if (!stats || stats.length === 0) return [];

      const spendByAg = new Map<string, number>();
      for (const r of stats) {
        const k = r.ad_group_id as string;
        spendByAg.set(k, (spendByAg.get(k) || 0) + ((r.spend_cents as number) || 0));
      }
      const agIds = Array.from(spendByAg.keys());

      // 2) ad groups
      const { data: ags, error: e2 } = await supabase
        .from("marketing_ad_groups")
        .select("id, name, region_id, campaign_id")
        .in("id", agIds);
      if (e2) throw e2;

      // 3) campaigns
      const campIds = Array.from(new Set((ags || []).map((a) => a.campaign_id as string)));
      const { data: camps, error: e3 } = await supabase
        .from("marketing_campaigns")
        .select("id, name, platform, service_id, region_id")
        .in("id", campIds);
      if (e3) throw e3;
      const campMap = new Map(camps?.map((c) => [c.id as string, c]) || []);

      const out: AdSetSpend[] = [];
      for (const ag of ags || []) {
        const c = campMap.get(ag.campaign_id as string);
        if (!c) continue;
        const cname = (c.name as string) || "";
        const aname = (ag.name as string) || "";
        const isRekry = REKRY_NAME_RE.test(cname) || REKRY_NAME_RE.test(aname);
        const isInstall = INSTALL_NAME_RE.test(cname) || INSTALL_NAME_RE.test(aname);
        out.push({
          ad_group_id: ag.id as string,
          ad_group_name: aname,
          ad_group_region_id: (ag.region_id as string | null) ?? null,
          campaign_id: c.id as string,
          campaign_name: cname,
          campaign_platform: (c.platform as string) || "",
          campaign_service_id: (c.service_id as string | null) ?? null,
          campaign_region_id: (c.region_id as string | null) ?? null,
          spend_cents: spendByAg.get(ag.id as string) || 0,
          category: isRekry ? "rekry" : isInstall ? "asennus" : "general",
          region_id: ((ag.region_id as string | null) ?? (c.region_id as string | null)) ?? null,
        });
      }
      out.sort((a, b) => b.spend_cents - a.spend_cents);
      return out;
    },
  });
}

// Revenue per region (created_at based, sis. ALV). Summa b.price_cents:istä
// joiden created_at (Helsingin aika) jaksolla, status != cancelled. Jaetaan
// asennuspalveluihin ja muihin. Provisioperusta on tilaushetki (myyty tänään),
// ei keikan booking_date.
export function useAllBookings(
  from: string,
  to: string,
  regions: Region[] | undefined,
  excluded: Set<string>,
  regionOverrides: Record<string, string>,
) {
  return useQuery<AllBookingsResult>({
    queryKey: [
      "region-revenue-with-unattributed",
      from,
      to,
      regions?.map((r) => r.id).join(","),
      Array.from(excluded).sort().join(","),
      Object.entries(regionOverrides).sort().map((e) => e.join(":")).join(","),
    ],
    enabled: !!regions && regions.length > 0 && !!from && !!to,
    queryFn: async () => {
      // Provisio lasketaan jaksolla LUODUISTA tilauksista (created_at,
      // Helsingin aika), ei booking_date:sta — myynti tunnistetaan
      // tilaushetkellä, ei keikan ajankohdalla.
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("id, booking_number, price_cents, postal_code, service_id, booking_date, created_at")
        .gte("created_at", finnishDayRange(from).start)
        .lte("created_at", finnishDayRange(to).end)
        .neq("status", "cancelled")
        .is("deleted_at", null);
      if (error) throw error;

      const byRegion = new Map<string, RegionRevenue>();
      for (const r of regions!) byRegion.set(r.id, { region_id: r.id, total_cents: 0, install_cents: 0 });

      const findRegion = (pc: string | null) => {
        if (!pc) return null;
        const prefix = pc.slice(0, 2);
        return regions!.find((r) => r.postal_prefixes.includes(prefix)) || null;
      };

      // Alueeton varaus (postinumero ei osu mihinkään aktiiviseen alueeseen tai
      // puuttuu) ohjataan oletuksena Uusimaalle, jottei myynti katoa summista.
      // Käsin valittu regionOverride ohittaa sekä osumisen että oletuksen.
      const uusimaa = regions!.find((r) => r.name.toLowerCase().includes("uusimaa")) || null;
      const resolveRegion = (b: { id: string; postal_code: string | null }): Region | null => {
        const ov = regionOverrides[b.id];
        if (ov) return regions!.find((r) => r.id === ov) || null;
        return findRegion(b.postal_code) || uusimaa;
      };

      const unattributedRaw: { id: string; booking_number: number | null; booking_date: string; postal_code: string | null; price_cents: number; region_id: string | null }[] = [];

      for (const b of bookings || []) {
        const region = resolveRegion({ id: b.id as string, postal_code: b.postal_code as string | null });
        const price = (b.price_cents as number) || 0;
        if (!b.service_id) {
          unattributedRaw.push({
            id: b.id as string,
            booking_number: (b.booking_number as number | null) ?? null,
            booking_date: b.booking_date as string,
            postal_code: (b.postal_code as string | null) ?? null,
            price_cents: price,
            region_id: region?.id ?? null,
          });
          if (excluded.has(b.id as string)) continue; // poistettu manuaalisesti
        }
        if (!region) continue;
        const ex = byRegion.get(region.id)!;
        ex.total_cents += price;
      }

      // Hae line items unknownseille → tee description
      let unattributed: UnattributedBooking[] = unattributedRaw.map((u) => ({ ...u, description: "" }));
      if (unattributedRaw.length > 0) {
        const ids = unattributedRaw.map((u) => u.id);
        const { data: lis } = await supabase
          .from("booking_line_items")
          .select("booking_id, name, line_type, quantity, price_cents")
          .in("booking_id", ids);
        const liByBooking = new Map<string, typeof lis>();
        for (const li of lis || []) {
          const arr = liByBooking.get(li.booking_id as string) || [];
          arr.push(li);
          liByBooking.set(li.booking_id as string, arr);
        }
        unattributed = unattributedRaw.map((u) => {
          const items = liByBooking.get(u.id) || [];
          const desc = items.length === 0
            ? "(ei rivejä)"
            : items.map((it) => `${it.name}${(it.quantity as number) > 1 ? ` ×${it.quantity}` : ""}`).join(" + ");
          return { ...u, description: desc };
        });
        unattributed.sort((a, b) => b.price_cents - a.price_cents);
      }

      return { byRegion, unattributed };
    },
  });
}

// ── Pure computation ─────────────────────────────────────────────────────────

const isUusimaa = (regionName: string | undefined) =>
  !!regionName && regionName.toLowerCase().includes("uusimaa");

// Effective allocation for an ad-set: returns Record<region_id, fraction (0..1)>
export function adSetAllocation(a: AdSetSpend, regionList: Region[], alloc: AllocMap): Record<string, number> {
  const override = alloc[a.ad_group_id];
  if (override) {
    const sum = Object.values(override).reduce((s, v) => s + v, 0);
    if (sum > 0) {
      const result: Record<string, number> = {};
      for (const r of regionList) result[r.id] = (override[r.id] || 0) / sum;
      return result;
    }
  }
  if (a.region_id) return { [a.region_id]: 1 };
  // No tag → equal split across all active regions
  const result: Record<string, number> = {};
  for (const r of regionList) result[r.id] = 1 / regionList.length;
  return result;
}

// Per-region marketing spend after exclusions and allocation (general only)
export function computeRegionMarketing(
  adsets: AdSetSpend[] | undefined,
  regions: Region[] | undefined,
  alloc: AllocMap,
): Map<string, number> {
  const m = new Map<string, number>();
  if (!regions || !adsets) return m;
  for (const a of adsets) {
    if (a.category !== "general") continue; // exclude rekry + install
    const split = adSetAllocation(a, regions, alloc);
    for (const [rid, frac] of Object.entries(split)) {
      m.set(rid, (m.get(rid) || 0) + a.spend_cents * frac);
    }
  }
  return m;
}

// Per-region commission rows
export function computeCommissionRows(
  regions: Region[] | undefined,
  revenueMap: Map<string, RegionRevenue> | undefined,
  regionMarketing: Map<string, number>,
  settings: CommissionSettings,
): CommissionRow[] {
  if (!regions) return [];
  return regions.map((r) => {
    const rev = revenueMap?.get(r.id) || { region_id: r.id, total_cents: 0, install_cents: 0 };
    const totalEur = rev.total_cents / 100;
    const installEur = rev.install_cents / 100;
    const serviceRevenueEur = totalEur - installEur;
    const N = settings.avgBookingEur > 0 ? serviceRevenueEur / settings.avgBookingEur : 0;
    const mktEur = (regionMarketing.get(r.id) || 0) / 100;
    const cpa = N > 0 ? mktEur / N : 0;
    const threshold = isUusimaa(r.name) ? settings.thresholdUusimaaEur : settings.thresholdOtherEur;
    const delta = Math.max(0, threshold - cpa);
    const commission = (delta / 2) * N;
    return {
      region_id: r.id,
      region_name: r.name,
      revenue_eur: totalEur,
      install_eur: installEur,
      service_revenue_eur: serviceRevenueEur,
      N,
      mkt_eur: mktEur,
      cpa,
      threshold,
      commission,
    };
  });
}

export interface CommissionTotals {
  revenue: number;
  install: number;
  service: number;
  N: number;
  mkt: number;
  commission: number;
}

export function computeCommissionTotals(rows: CommissionRow[]): CommissionTotals {
  const t: CommissionTotals = { revenue: 0, install: 0, service: 0, N: 0, mkt: 0, commission: 0 };
  for (const r of rows) {
    t.revenue += r.revenue_eur;
    t.install += r.install_eur;
    t.service += r.service_revenue_eur;
    t.N += r.N;
    t.mkt += r.mkt_eur;
    t.commission += r.commission;
  }
  return t;
}

// ── Convenience hook: total commission for a date range ──────────────────────
//
// Reads the shared DB-backed parameters the Provisio page uses (or defaults
// until configured). Used by the main /analytiikka dashboard to show provisio
// as a cost card. Period base is created_at ("sold in range"), matching the
// Provisio page — independent of the dashboard's viewMode.
export function useMarketingCommission(from: string, to: string) {
  const { data: settings = DEFAULT_SETTINGS, isLoading: loadingSettings } = useCommissionSettings();
  const { data: alloc = {}, isLoading: loadingAlloc } = useCommissionAlloc();
  const { data: excluded = new Set<string>(), isLoading: loadingExcluded } = useCommissionExcluded();
  const { data: regionOverrides = {}, isLoading: loadingOverrides } = useCommissionRegionOverrides();

  const { data: regions, isLoading: loadingRegions } = useRegions();
  const { data: revenueData, isLoading: loadingRev } = useAllBookings(from, to, regions, excluded, regionOverrides);
  const { data: adsets, isLoading: loadingSpend } = useAdSetSpend(from, to);

  const totalCommissionCents = useMemo(() => {
    const regionMarketing = computeRegionMarketing(adsets, regions, alloc);
    const rows = computeCommissionRows(regions, revenueData?.byRegion, regionMarketing, settings);
    const total = computeCommissionTotals(rows).commission;
    return Math.round(total * 100);
  }, [regions, revenueData, adsets, settings, alloc]);

  return {
    totalCommissionCents,
    isLoading:
      loadingSettings || loadingAlloc || loadingExcluded || loadingOverrides ||
      loadingRegions || loadingRev || loadingSpend,
  };
}
