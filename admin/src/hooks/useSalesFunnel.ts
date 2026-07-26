import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Asennusmyynnin putki + häviöanalyysi (analytics_sales_funnel RPC)
// ---------------------------------------------------------------------------

export interface FunnelStatus {
  status: string;
  count: number;
}

export interface FunnelChannel {
  channel: string;
  count: number;
  won: number;
  lost: number;
}

export interface LostReason {
  reason: string;
  count: number;
}

export interface SalesFunnelData {
  byStatus: FunnelStatus[];
  outcome: { total: number; won: number; lost: number; open: number };
  byChannel: FunnelChannel[];
  lostReasons: LostReason[];
  offers: {
    total: number;
    sent: number;
    accepted: number;
    draft: number;
    acceptedValue: number;
    avgAcceptedValue: number;
    avgValue: number;
  };
}

// Suomenkieliset labelit putken statuksille (näyttötarkoituksiin).
export const FUNNEL_STATUS_LABELS: Record<string, string> = {
  new_inbound: "Uusi liidi",
  kontaktoitu: "Kontaktoitu",
  kartoitus_varattu: "Kartoitus varattu",
  kartoitus_tehty: "Kartoitus tehty",
  tarjous_lahetetty: "Tarjous lähetetty",
  tarjous_hyvaksytty: "Tarjous hyväksytty",
  voitettu: "Voitettu",
  havitty: "Hävitty",
};

// Loogisen putken järjestys (alkupäästä loppuun). Voitettu/hävitty ovat lopputulemia.
export const FUNNEL_STAGE_ORDER = [
  "new_inbound",
  "kontaktoitu",
  "kartoitus_varattu",
  "kartoitus_tehty",
  "tarjous_lahetetty",
  "tarjous_hyvaksytty",
  "voitettu",
];

const CHANNEL_LABELS: Record<string, string> = {
  inbound_contact: "Inbound-yhteydenotto",
  website: "Verkkosivu",
  form: "Lomake",
  survey_booking: "Kartoitusvaraus",
  manual: "Manuaalinen",
  d2d: "Ovelta ovelle",
  email: "Sähköposti",
  phone: "Puhelin",
  contact_form: "Yhteydenottolomake",
  admin: "Hallintapaneeli",
  other: "Muu",
  tuntematon: "Tuntematon",
};

export function labelChannel(channel: string): string {
  return CHANNEL_LABELS[channel] || channel;
}

export function useSalesFunnel(from: string, to: string) {
  return useQuery<SalesFunnelData>({
    queryKey: ["sales-funnel", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics_sales_funnel", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      const r = (data || {}) as any;

      return {
        byStatus: ((r.byStatus || []) as any[]).map((s) => ({
          status: String(s.status),
          count: Number(s.count) || 0,
        })),
        outcome: {
          total: Number(r.outcome?.total) || 0,
          won: Number(r.outcome?.won) || 0,
          lost: Number(r.outcome?.lost) || 0,
          open: Number(r.outcome?.open) || 0,
        },
        byChannel: ((r.byChannel || []) as any[]).map((c) => ({
          channel: String(c.channel),
          count: Number(c.count) || 0,
          won: Number(c.won) || 0,
          lost: Number(c.lost) || 0,
        })),
        lostReasons: ((r.lostReasons || []) as any[]).map((l) => ({
          reason: String(l.reason),
          count: Number(l.count) || 0,
        })),
        offers: {
          total: Number(r.offers?.total) || 0,
          sent: Number(r.offers?.sent) || 0,
          accepted: Number(r.offers?.accepted) || 0,
          draft: Number(r.offers?.draft) || 0,
          acceptedValue: Number(r.offers?.accepted_value) || 0,
          avgAcceptedValue: Number(r.offers?.avg_accepted_value) || 0,
          avgValue: Number(r.offers?.avg_value) || 0,
        },
      };
    },
  });
}
