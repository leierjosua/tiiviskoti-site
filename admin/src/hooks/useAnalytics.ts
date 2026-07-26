import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueByDate {
  date: string;
  revenue: number;
}

export interface DailyMetrics {
  date: string;
  revenue: number;
  revenueExVat: number;
  bookings: number;
  costs: number;
  marketing: number;
  deviceCosts: number;
  salesCommissions: number;
  overhead: number;
  profit: number;
  margin: number;
  avgValue: number;
}

export interface SourceBreakdown {
  source: string;
  count: number;
  percent: number;
}

export interface CityBreakdown {
  city: string;
  count: number;
  percent: number;
}

export interface PageBreakdown {
  url: string;
  count: number;
  percent: number;
}

export interface ServiceBreakdown {
  service: string;
  count: number;
  revenue: number;
}

export interface FormSubmissionDaily {
  date: string;
  sales: number;
  support: number;
  other: number;
}

export interface FormSubmissionSummary {
  total: number;
  bySlug: { slug: string; count: number }[];
  daily: FormSubmissionDaily[];
}

export interface DeviceCostItem {
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

export interface DeviceCosts {
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  marginPercent: number;
  byProduct: DeviceCostItem[];
}

export interface ForecastDay {
  date: string;
  revenue: number;
  bookings: number;
}

export interface Forecast {
  growthFactor: number;
  sigma: number;
  daily: ForecastDay[];
  total: {
    revenue: number;
    bookings: number;
    low: number;
    high: number;
  };
}

export interface AnalyticsData {
  totalRevenue: number;
  revenueExVat: number;
  subcontractorCosts: number;
  tekijakulut: number;
  salesCommissions: number;
  marketingCosts: number;
  netAfterCosts: number;
  marginPercent: number;
  overheadCosts: number;
  netResult: number;
  avgBookingValue: number;
  bookingCount: number;
  prevTotalRevenue: number;
  prevBookingCount: number;
  prevTekijakulut: number;
  prevMarketingCosts: number;
  prevDeviceCostsCents: number;
  prevSalesCommissions: number;
  prevNetAfterCosts: number;
  prevMarginPercent: number;
  prevOverheadCosts: number;
  prevNetResult: number;
  prevAvgBookingValue: number;
  revenueByDate: RevenueByDate[];
  prevRevenueByDate: RevenueByDate[];
  dailyMetrics: DailyMetrics[];
  prevDailyMetrics: DailyMetrics[];
  bookingsBySource: SourceBreakdown[];
  bookingsByCity: CityBreakdown[];
  bookingsByPage: PageBreakdown[];
  bookingsByWeekday: number[];
  bookingsByHour: number[];
  bookingsByService: ServiceBreakdown[];
  formSubmissions: FormSubmissionSummary;
  deviceCosts: DeviceCosts;
  forecast: Forecast;
}

export type ViewMode = "varaukset" | "toteutunut" | "tuleva";

// ---------------------------------------------------------------------------
// Source label mapping (client-side, since these are display labels)
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  widget: "Widget",
  chatbot: "Chatbot",
  phone: "Puhelin",
  contact_form: "Yhteydenotto",
  admin: "Hallintapaneeli",
  other: "Muu",
  shopify_legacy: "Shopify (legacy)",
  Tuntematon: "Tuntematon",
};

function labelSource(source: string): string {
  return SOURCE_LABELS[source] || source;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAnalytics(from: string, to: string, viewMode: ViewMode = "varaukset", prevFrom?: string, prevTo?: string, serviceId?: string) {
  return useQuery<AnalyticsData>({
    queryKey: ["analytics", from, to, viewMode, prevFrom, prevTo, serviceId],
    queryFn: async () => {
      const pf = prevFrom || undefined;
      const pt = prevTo || undefined;

      const [dashRes, fcRes, formsDailyRes] = await Promise.all([
        supabase.rpc("analytics_dashboard", {
          p_from: from,
          p_to: to,
          p_view_mode: viewMode,
          ...(pf && pt ? { p_prev_from: pf, p_prev_to: pt } : {}),
          ...(serviceId ? { p_service_id: serviceId } : {}),
        }),
        supabase.rpc("analytics_forecast", {
          p_from: from,
          p_to: to,
          p_view_mode: viewMode,
          ...(serviceId ? { p_service_id: serviceId } : {}),
        }),
        supabase.rpc("analytics_forms_daily", {
          p_from: from,
          p_to: to,
        }),
      ]);

      if (dashRes.error) throw dashRes.error;
      if (fcRes.error) throw fcRes.error;
      if (formsDailyRes.error) throw formsDailyRes.error;
      const r = dashRes.data as any;
      const fc = fcRes.data as any;
      const formsDailyRaw = (formsDailyRes.data as any[]) || [];

      // --- KPIs ---
      const totalRevenue = Number(r.kpis.total_revenue) || 0;
      const revenueExVat = Math.round(totalRevenue / 1.255);
      const bookingCount = Number(r.kpis.booking_count) || 0;
      const tekijakulut = Number(r.kpis.tekijakulut) || 0;
      const salesCommissions = Number(r.kpis.sales_commissions) || 0;
      const lineItemCosts = (Number(r.kpis.line_item_costs) || 0) + (Number(r.kpis.line_item_commissions) || 0);

      const prevTotalRevenue = Number(r.prevKpis.total_revenue) || 0;
      const prevRevenueExVat = Math.round(prevTotalRevenue / 1.255);
      const prevBookingCount = Number(r.prevKpis.booking_count) || 0;
      const prevTekijakulut = Number(r.prevKpis.tekijakulut) || 0;
      const prevMarketingCosts = Number(r.prevKpis.marketing) || 0;
      const prevDeviceCostsCents = Number(r.prevKpis.device_costs) || 0;
      const prevSalesCommissions = Number(r.prevKpis.sales_commissions) || 0;
      const prevLineItemCosts = Number(r.prevKpis.line_item_total_costs) || 0;
      const prevNetAfterCosts = prevRevenueExVat - prevTekijakulut - prevMarketingCosts - prevDeviceCostsCents - prevSalesCommissions - prevLineItemCosts;
      const prevMarginPercent = prevRevenueExVat > 0 ? (prevNetAfterCosts / prevRevenueExVat) * 100 : 0;
      const prevAvgBookingValue = prevBookingCount > 0 ? Math.round(prevTotalRevenue / prevBookingCount) : 0;

      // --- Marketing ---
      const mktByDate = new Map<string, number>();
      let marketingCosts = 0;
      for (const row of r.marketing || []) {
        const cents = Number(row.spend_cents) || 0;
        mktByDate.set(row.date, cents);
        marketingCosts += cents;
      }

      // --- Device costs ---
      const deviceRows = (r.deviceCosts || []) as any[];
      const byProduct: DeviceCostItem[] = deviceRows.map((d: any) => {
        const revExVat = Math.round(Number(d.revenue_cents) / 1.255);
        const cost = Number(d.cost_cents) || 0;
        return {
          name: d.name,
          quantity: Number(d.quantity) || 0,
          revenue: Math.round(revExVat) / 100,
          cost: Math.round(cost) / 100,
          margin: Math.round(revExVat - cost) / 100,
          marginPercent: revExVat > 0 ? Math.round(((revExVat - cost) / revExVat) * 1000) / 10 : 0,
        };
      }).sort((a: DeviceCostItem, b: DeviceCostItem) => b.revenue - a.revenue);

      const totDevRev = byProduct.reduce((s, p) => s + p.revenue, 0);
      const totDevCost = byProduct.reduce((s, p) => s + p.cost, 0);
      const deviceCosts: DeviceCosts = {
        totalRevenue: Math.round(totDevRev * 100) / 100,
        totalCost: Math.round(totDevCost * 100) / 100,
        totalMargin: Math.round((totDevRev - totDevCost) * 100) / 100,
        marginPercent: totDevRev > 0 ? Math.round(((totDevRev - totDevCost) / totDevRev) * 1000) / 10 : 0,
        byProduct,
      };
      const deviceCostsCents = Math.round(deviceCosts.totalCost * 100);

      // --- Overhead expenses ---
      const overheadCosts = Number(r.overhead?.total_cents) || 0;
      const prevOverheadCosts = Number(r.prevOverhead?.total_cents) || 0;

      // --- Derived KPIs ---
      const avgBookingValue = bookingCount > 0 ? Math.round(totalRevenue / bookingCount) : 0;
      const netAfterCosts = revenueExVat - tekijakulut - marketingCosts - deviceCostsCents - salesCommissions - lineItemCosts;
      const marginPercent = revenueExVat > 0 ? (netAfterCosts / revenueExVat) * 100 : 0;
      const netResult = netAfterCosts - overheadCosts;
      const prevNetResult = prevNetAfterCosts - prevOverheadCosts;

      // --- Device costs by date for daily metrics ---
      const devCostsByDate = new Map<string, number>();
      for (const dd of r.deviceCostsDaily || []) {
        devCostsByDate.set(dd.date, Number(dd.cost_cents) || 0);
      }

      // --- Overhead by date (recurring spread + one-time spikes). Falls back to an
      // even spread of the period total if the backend predates overheadDaily. ---
      const daily = (r.daily || []) as any[];
      const overheadByDate = new Map<string, number>();
      const overheadDailyRaw = (r.overheadDaily || []) as any[];
      if (overheadDailyRaw.length > 0) {
        for (const od of overheadDailyRaw) {
          overheadByDate.set(od.date, Number(od.cost_cents) || 0);
        }
      } else if (daily.length > 0) {
        const perDay = overheadCosts / daily.length;
        for (const d of daily) overheadByDate.set(d.date, perDay);
      }

      const revenueByDate: RevenueByDate[] = daily.map((d: any) => ({
        date: d.date,
        revenue: Number(d.revenue) || 0,
      }));

      const dailyMetrics: DailyMetrics[] = daily.map((d: any) => {
        const rev = Number(d.revenue) || 0;
        const revEx = Math.round(rev / 1.255);
        const count = Number(d.bookings) || 0;
        const costs = Number(d.costs) || 0;
        const mkt = mktByDate.get(d.date) || 0;
        const devCost = devCostsByDate.get(d.date) || 0;
        const salesComm = Number(d.sales_comm) || 0;
        const liCosts = (Number(d.li_costs) || 0) + (Number(d.li_comms) || 0);
        const overhead = overheadByDate.get(d.date) || 0;
        const profit = revEx - costs - mkt - devCost - salesComm - liCosts;
        return {
          date: d.date,
          revenue: rev,
          revenueExVat: revEx,
          bookings: count,
          costs,
          marketing: mkt,
          deviceCosts: devCost,
          salesCommissions: salesComm,
          overhead,
          profit,
          margin: revEx > 0 ? Math.round((profit / revEx) * 1000) / 10 : 0,
          avgValue: count > 0 ? Math.round(rev / count) : 0,
        };
      });

      // --- Previous period ---
      const prevDaily = (r.prevDaily || []) as any[];
      const prevRevenueByDate: RevenueByDate[] = prevDaily.map((d: any) => ({
        date: d.date,
        revenue: Number(d.revenue) || 0,
      }));
      const prevDailyMetrics: DailyMetrics[] = prevDaily.map((d: any) => {
        const rev = Number(d.revenue) || 0;
        return {
          date: d.date,
          revenue: rev,
          revenueExVat: Math.round(rev / 1.255),
          bookings: 0, costs: 0, marketing: 0, deviceCosts: 0, salesCommissions: 0, overhead: 0,
          profit: Math.round(rev / 1.255), margin: 0, avgValue: 0,
        };
      });

      // --- Breakdowns ---
      const bySourceRaw = (r.bySource || []) as { source: string; count: number }[];
      const bookingsBySource: SourceBreakdown[] = bySourceRaw.map((s) => ({
        source: labelSource(s.source),
        count: s.count,
        percent: bookingCount > 0 ? Math.round((s.count / bookingCount) * 100) : 0,
      }));

      const byCityRaw = (r.byCity || []) as { city: string; count: number }[];
      const bookingsByCity: CityBreakdown[] = byCityRaw.map((c) => ({
        city: c.city,
        count: c.count,
        percent: bookingCount > 0 ? Math.round((c.count / bookingCount) * 100) : 0,
      }));

      const byPageRaw = (r.byPage || []) as { url: string; count: number }[];
      const bookingsByPage: PageBreakdown[] = byPageRaw.map((p) => ({
        url: p.url,
        count: p.count,
        percent: bookingCount > 0 ? Math.round((p.count / bookingCount) * 100) : 0,
      }));

      const byServiceRaw = (r.byService || []) as { service: string; count: number; revenue: number }[];
      const bookingsByService: ServiceBreakdown[] = byServiceRaw.map((s) => ({
        service: s.service,
        count: s.count,
        revenue: Number(s.revenue) || 0,
      }));

      // Weekday: server returns {dow, count} — fill array [Mon=0..Sun=6]
      const bookingsByWeekday = new Array(7).fill(0);
      for (const w of (r.byWeekday || []) as { dow: number; count: number }[]) {
        // ISODOW: 1=Mon..7=Sun → index 0=Mon..6=Sun
        bookingsByWeekday[w.dow - 1] = w.count;
      }

      // Hour: server returns {hour, count}
      const bookingsByHour = new Array(24).fill(0);
      for (const h of (r.byHour || []) as { hour: number; count: number }[]) {
        if (h.hour != null && h.hour >= 0 && h.hour < 24) {
          bookingsByHour[h.hour] = h.count;
        }
      }

      // Forecast
      const forecast: Forecast = {
        growthFactor: Number(fc?.growthFactor) || 1,
        sigma: Number(fc?.sigma) || 0,
        daily: ((fc?.daily || []) as any[]).map((d: any) => ({
          date: d.day,
          revenue: Number(d.revenue) || 0,
          bookings: Number(d.bookings) || 0,
        })),
        total: {
          revenue: Number(fc?.total?.revenue) || 0,
          bookings: Number(fc?.total?.bookings) || 0,
          low: Number(fc?.total?.low) || 0,
          high: Number(fc?.total?.high) || 0,
        },
      };

      // Form submissions
      const formSubmissions: FormSubmissionSummary = {
        total: r.formSubmissions?.total || 0,
        bySlug: (r.formSubmissions?.bySlug || []).map((f: any) => ({
          slug: f.form_slug,
          count: f.count,
        })),
        daily: formsDailyRaw.map((d: any) => ({
          date: d.date,
          sales: Number(d.sales) || 0,
          support: Number(d.support) || 0,
          other: Number(d.other) || 0,
        })),
      };

      return {
        totalRevenue,
        revenueExVat,
        subcontractorCosts: tekijakulut,
        tekijakulut,
        salesCommissions,
        marketingCosts,
        netAfterCosts,
        marginPercent,
        overheadCosts,
        netResult,
        avgBookingValue,
        bookingCount,
        prevTotalRevenue,
        prevBookingCount,
        prevTekijakulut,
        prevMarketingCosts,
        prevDeviceCostsCents,
        prevSalesCommissions,
        prevNetAfterCosts,
        prevMarginPercent,
        prevOverheadCosts,
        prevNetResult,
        prevAvgBookingValue,
        revenueByDate,
        prevRevenueByDate,
        dailyMetrics,
        prevDailyMetrics,
        bookingsBySource,
        bookingsByCity,
        bookingsByPage,
        bookingsByWeekday,
        bookingsByHour,
        bookingsByService,
        formSubmissions,
        deviceCosts,
        forecast,
      };
    },
  });
}
