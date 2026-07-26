import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Varausattribuutio: mistä keikka tulee + kanavatalous (analytics_attribution RPC)
// Asuu sivuanalytiikassa (hankinta-näkymä).
// ---------------------------------------------------------------------------

export interface AttributionItem {
  key: string;
  count: number;
  revenue: number; // sentteinä, sis. ALV
  percent: number; // osuus jäljitetyistä varauksista
}

export interface ChannelEconomics {
  channel: string;
  sessions: number;
  sessionConversions: number;
  bookings: number;
  revenue: number; // sentteinä, sis. ALV
  /** Varauksia / sessiot (%) */
  conversionRate: number;
  /** Liikevaihto (ALV 0%) / sessiot, euroina */
  revenuePerSession: number;
}

export interface AttributionData {
  totalBookings: number;
  attributedBookings: number;
  coveragePercent: number;
  byLanding: AttributionItem[];
  byChannel: AttributionItem[];
  byCampaign: AttributionItem[];
  byReferrer: AttributionItem[];
  channelEconomics: ChannelEconomics[];
}

export function useAttribution(from: string, to: string) {
  return useQuery<AttributionData>({
    queryKey: ["attribution", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics_attribution", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      const r = (data || {}) as any;

      const attributedBookings = Number(r.attributedBookings) || 0;
      const totalBookings = Number(r.totalBookings) || 0;
      const mapAttr = (rows: any[], keyField: string): AttributionItem[] =>
        ((rows || []) as any[]).map((x) => ({
          key: String(x[keyField] ?? "—"),
          count: Number(x.count) || 0,
          revenue: Number(x.revenue) || 0,
          percent: attributedBookings > 0 ? Math.round((Number(x.count) / attributedBookings) * 100) : 0,
        }));

      return {
        totalBookings,
        attributedBookings,
        coveragePercent: totalBookings > 0 ? Math.round((attributedBookings / totalBookings) * 100) : 0,
        byLanding: mapAttr(r.byLanding, "url"),
        byChannel: mapAttr(r.byChannel, "channel"),
        byCampaign: mapAttr(r.byCampaign, "campaign"),
        byReferrer: mapAttr(r.byReferrer, "referrer"),
        channelEconomics: ((r.channelEconomics || []) as any[]).map((c) => {
          const sessions = Number(c.sessions) || 0;
          const bookings = Number(c.bookings) || 0;
          const revenueCents = Number(c.revenue) || 0;
          const revenueExVat = revenueCents / 1.255;
          return {
            channel: String(c.channel ?? "—"),
            sessions,
            sessionConversions: Number(c.session_conversions) || 0,
            bookings,
            revenue: revenueCents,
            conversionRate: sessions > 0 ? Math.round((bookings / sessions) * 1000) / 10 : 0,
            revenuePerSession: sessions > 0 ? Math.round(revenueExVat / sessions) / 100 : 0,
          };
        }),
      };
    },
  });
}
