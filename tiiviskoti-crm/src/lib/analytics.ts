import 'server-only';
import { sql } from './db';

/* =========================================================
   Sivustoanalytiikan koosteet tk.web_events -taulusta (+ tk.jobs
   konversioille). Sessiot ja käynnin kesto johdetaan kävijän
   anonyymistä hashista ja 30 min tauosta — ei client-storagea.
   ========================================================= */

export type Bucket = { key: string; n: number };

export type SiteAnalytics = {
  visitors: number;
  pageviews: number;
  sessions: number;
  avgSessionSec: number;
  conversions: number;
  convRate: number;            // % (konversiot / sessiot)
  landing: Bucket[];
  sources: Bucket[];
  topPages: Bucket[];
  devices: Bucket[];
  browsers: Bucket[];
  os: Bucket[];
  cta: Bucket[];
  funnel: Bucket[];
  scroll: { avg: number; p25: number; p50: number; p75: number; p100: number; total: number };
  jobSource: Bucket[];         // "mistä keikka tulee" (web/admin)
  jobCampaign: Bucket[];       // konversiot kampanjoittain
};

type SessionRow = {
  duration_sec: number;
  landing: string | null;
  source: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
};

const tally = (rows: { k: string | null; n: number }[]): Bucket[] =>
  rows.map((r) => ({ key: r.k ?? '(tuntematon)', n: Number(r.n) }));

export async function getSiteAnalytics(fromIso: string): Promise<SiteAnalytics> {
  const [
    sessionRows, totals, topPages, cta, funnel, scroll, jobsCount, jobSource, jobCampaign,
  ] = await Promise.all([
    /* Sessioittaminen: uusi sessio kun sama kävijä on ollut yli 30 min hiljaa.
       Palautetaan sessiotason rivit, loput lasketaan JS:ssä. */
    sql<SessionRow[]>`
      with base as (
        select visitor_hash, ts, event_type, path, ref_source, device, browser, os,
               lag(ts) over (partition by visitor_hash order by ts) as prev_ts
          from tk.web_events
         where ts >= ${fromIso}
      ),
      marked as (
        select *, case when prev_ts is null or ts - prev_ts > interval '30 minutes'
                       then 1 else 0 end as ns
          from base
      ),
      sess as (
        select *, sum(ns) over (partition by visitor_hash order by ts
                                rows between unbounded preceding and current row) as sn
          from marked
      )
      select extract(epoch from (max(ts) - min(ts)))::int as duration_sec,
             (array_agg(path order by ts) filter (where event_type = 'pageview'))[1] as landing,
             (array_agg(ref_source order by ts))[1] as source,
             (array_agg(device order by ts))[1] as device,
             (array_agg(browser order by ts))[1] as browser,
             (array_agg(os order by ts))[1] as os
        from sess
       group by visitor_hash, sn
    `,
    sql<{ visitors: number; pageviews: number }[]>`
      select count(distinct visitor_hash)::int as visitors,
             count(*) filter (where event_type = 'pageview')::int as pageviews
        from tk.web_events where ts >= ${fromIso}
    `,
    sql<{ k: string | null; n: number }[]>`
      select path as k, count(*)::int as n
        from tk.web_events
       where ts >= ${fromIso} and event_type = 'pageview'
       group by path order by n desc limit 8
    `,
    sql<{ k: string | null; n: number }[]>`
      select cta as k, count(*)::int as n
        from tk.web_events
       where ts >= ${fromIso} and event_type = 'cta'
       group by cta order by n desc limit 8
    `,
    /* Funnelin jokainen vaihe: montako eri kävijää sinne ehti. */
    sql<{ k: string | null; n: number }[]>`
      select funnel_step as k, count(distinct visitor_hash)::int as n
        from tk.web_events
       where ts >= ${fromIso} and event_type = 'funnel'
       group by funnel_step
    `,
    sql<{ avg: number; total: number; p25: number; p50: number; p75: number; p100: number }[]>`
      select coalesce(round(avg(scroll_pct)), 0)::int as avg,
             count(*)::int as total,
             count(*) filter (where scroll_pct >= 25)::int as p25,
             count(*) filter (where scroll_pct >= 50)::int as p50,
             count(*) filter (where scroll_pct >= 75)::int as p75,
             count(*) filter (where scroll_pct >= 100)::int as p100
        from tk.web_events where ts >= ${fromIso} and event_type = 'scroll'
    `,
    sql<{ n: number }[]>`
      select count(*)::int as n from tk.jobs
       where created_at >= ${fromIso} and status <> 'cancelled' and source = 'web'
    `,
    sql<{ k: string | null; n: number }[]>`
      select source as k, count(*)::int as n from tk.jobs
       where created_at >= ${fromIso} and status <> 'cancelled'
       group by source order by n desc
    `,
    sql<{ k: string | null; n: number }[]>`
      select coalesce(campaign, '(suora / tuntematon)') as k, count(*)::int as n from tk.jobs
       where created_at >= ${fromIso} and status <> 'cancelled'
       group by campaign order by n desc limit 8
    `,
  ]);

  const sessions = sessionRows.length;
  const avgSessionSec = sessions
    ? Math.round(sessionRows.reduce((s, r) => s + (r.duration_sec || 0), 0) / sessions)
    : 0;

  const group = (rows: SessionRow[], key: keyof SessionRow): Bucket[] => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = (r[key] as string | null) ?? '(tuntematon)';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
  };

  const conversions = jobsCount[0]?.n ?? 0;
  const sc = scroll[0] ?? { avg: 0, total: 0, p25: 0, p50: 0, p75: 0, p100: 0 };

  return {
    visitors: totals[0]?.visitors ?? 0,
    pageviews: totals[0]?.pageviews ?? 0,
    sessions,
    avgSessionSec,
    conversions,
    convRate: sessions ? Math.round((conversions / sessions) * 1000) / 10 : 0,
    landing: group(sessionRows, 'landing').slice(0, 8),
    sources: group(sessionRows, 'source'),
    devices: group(sessionRows, 'device'),
    browsers: group(sessionRows, 'browser'),
    os: group(sessionRows, 'os'),
    topPages: tally(topPages),
    cta: tally(cta),
    funnel: tally(funnel),
    scroll: { avg: sc.avg, total: sc.total, p25: sc.p25, p50: sc.p50, p75: sc.p75, p100: sc.p100 },
    jobSource: tally(jobSource),
    jobCampaign: tally(jobCampaign),
  };
}
