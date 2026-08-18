import 'server-only';

/* =========================================================
   Meta-mainosten tulokset (Facebook/Instagram) suoraan Meta Marketing
   API:sta. Sama periaate kuin Ads-konversiot-näkymässä: tiiviskoti.fi:llä
   ei ole selainpikseliä, joten konversiot (varaukset) raportoidaan Metalle
   palvelinpuolelta CAPI:n kautta ja luetaan tässä takaisin insightsista.

   Ympäristömuuttujat (tiiviskoti-crm Vercel):
     META_ACCESS_TOKEN   — ads_read-oikeuksinen token (pakollinen)
     META_AD_ACCOUNT_ID  — mainostilin id ilman act_ (oletus 205952163658187)
     META_GRAPH_VERSION  — (valinnainen) oletus v21.0
   ========================================================= */

const GV = process.env.META_GRAPH_VERSION || 'v21.0';
const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID || '205952163658187';

// Meta-toiminnon tyypit → konversioluokat. Pikselin CAPI-tapahtumat tulevat
// "offsite_conversion.fb_pixel_*" -muodossa; lyhyet muodot varalta mukana.
const PURCHASE = ['offsite_conversion.fb_pixel_purchase', 'purchase', 'onsite_web_purchase'];
const LEAD = ['offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.lead_grouped'];
const SCHEDULE = ['offsite_conversion.fb_pixel_schedule', 'schedule'];

export type MetaAdRow = {
  adId: string; adName: string;
  spendCents: number; impressions: number; clicks: number; linkClicks: number;
  purchases: number; leads: number; schedules: number;
};
export type MetaTotals = Omit<MetaAdRow, 'adId' | 'adName'>;
export type MetaStats = { configured: boolean; error?: string; rows: MetaAdRow[]; totals: MetaTotals };

type Action = { action_type: string; value: string };
type InsightRow = {
  ad_id?: string; ad_name?: string; spend?: string; impressions?: string;
  clicks?: string; inline_link_clicks?: string; actions?: Action[];
};

const zero = (): MetaTotals => ({ spendCents: 0, impressions: 0, clicks: 0, linkClicks: 0, purchases: 0, leads: 0, schedules: 0 });

function sumActions(actions: Action[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((n, a) => (types.includes(a.action_type) ? n + Number(a.value || 0) : n), 0);
}

/** Hakee mainoskohtaiset insightsit viimeisiltä `days` päivältä (ml. tänään).
    Metan date_preset=last_30d päättyy EILISEEN, joten tämän päivän kulut eivät
    näkyisi. Käytämme nimenomaista time_rangea, jotta tänään pyörivät mainokset
    näkyvät heti. */
export async function getMetaStats(days = 30): Promise<MetaStats> {
  if (!TOKEN) return { configured: false, rows: [], totals: zero(), error: 'META_ACCESS_TOKEN puuttuu' };
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date(until);
  since.setDate(since.getDate() - (days - 1));
  const timeRange = JSON.stringify({ since: fmt(since), until: fmt(until) });
  const fields = 'ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions';
  const url =
    `https://graph.facebook.com/${GV}/act_${ACCOUNT}/insights` +
    `?level=ad&time_range=${encodeURIComponent(timeRange)}&fields=${encodeURIComponent(fields)}` +
    `&limit=500&access_token=${encodeURIComponent(TOKEN)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.json() as { data?: InsightRow[]; error?: { message: string } };
    if (body.error) return { configured: true, rows: [], totals: zero(), error: body.error.message };
    const rows: MetaAdRow[] = (body.data || []).map((r) => ({
      adId: String(r.ad_id ?? ''),
      adName: r.ad_name ?? String(r.ad_id ?? '—'),
      spendCents: Math.round(Number(r.spend || 0) * 100),
      impressions: Number(r.impressions || 0),
      clicks: Number(r.clicks || 0),
      linkClicks: Number(r.inline_link_clicks || 0),
      purchases: sumActions(r.actions, PURCHASE),
      leads: sumActions(r.actions, LEAD),
      schedules: sumActions(r.actions, SCHEDULE),
    }));
    const totals = rows.reduce<MetaTotals>((t, r) => ({
      spendCents: t.spendCents + r.spendCents,
      impressions: t.impressions + r.impressions,
      clicks: t.clicks + r.clicks,
      linkClicks: t.linkClicks + r.linkClicks,
      purchases: t.purchases + r.purchases,
      leads: t.leads + r.leads,
      schedules: t.schedules + r.schedules,
    }), zero());
    rows.sort((a, b) => b.spendCents - a.spendCents);
    return { configured: true, rows, totals };
  } catch (e) {
    return { configured: true, rows: [], totals: zero(), error: e instanceof Error ? e.message : String(e) };
  }
}
