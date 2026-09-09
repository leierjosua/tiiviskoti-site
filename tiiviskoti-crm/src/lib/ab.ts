import 'server-only';
import { sql } from './db';
import { addDays, helsinkiDateTime } from './time';
import { verdict, daysRemaining, type AbArm, type AbVerdict } from './ab-stats';

/* =========================================================
   A/B-testien tulokset.

   Taulu tk.ab_tests kertoo mitä testattiin ja millä mittarilla; luvut
   lasketaan tk.web_eventsistä testin omalta aikaväliltä. Päättyneen testin
   ikkuna on kiinni molemmista päistä, joten sen tulos ei enää muutu vaikka
   sivusto muuttuisi.

   Mittayksikkö on SIVULATAUS eikä kävijä: versio arvotaan sivulatauskohtaisesti
   eikä selaimeen tallenneta tunnistetta (_analytics.js). Sama ihminen voi
   siis nähdä eri version eri latauksilla. Se on tietosuojavalinta, ja sen
   hinta on että tulos on hieman konservatiivisempi kuin kävijätasolla —
   sekoittuminen kaventaa mitattua eroa, ei kasvata sitä.
   ========================================================= */

export type AbTestRow = {
  id: string;
  name: string;
  hypothesis: string | null;
  path_pattern: string;
  base_step: string | null;
  metric_step: string;
  label_a: string;
  label_b: string;
  started_on: string;
  ended_on: string | null;
  winner: 'a' | 'b' | 'none' | null;
  notes: string | null;
};

export type AbTestResult = AbTestRow & {
  a: AbArm;
  b: AbArm;
  stats: AbVerdict;
  daysRun: number;
  daysLeft: number | null;
};

const MISSING_TABLE = '42P01';

/** Testit uusin ensin, käynnissä olevat ensin. Null = db/031 ajamatta. */
export async function listAbTests(): Promise<AbTestRow[] | null> {
  try {
    return await sql<AbTestRow[]>`
      select id, name, hypothesis, path_pattern, base_step, metric_step,
             label_a, label_b,
             to_char(started_on, 'YYYY-MM-DD') as started_on,
             to_char(ended_on,   'YYYY-MM-DD') as ended_on,
             winner, notes
        from tk.ab_tests
       order by (ended_on is not null), started_on desc, created_at desc
    `;
  } catch (e) {
    if ((e as { code?: string })?.code !== MISSING_TABLE) throw e;
    return null;
  }
}

/**
 * Yhden testin luvut. Ikkuna on [started_on, ended_on + 1 pv) Suomen aikaa —
 * päättymispäivä on mukana kokonaan, koska testi ajettiin sen päivän loppuun.
 */
async function armsFor(test: AbTestRow, now: Date): Promise<{ a: AbArm; b: AbArm }> {
  const fromIso = helsinkiDateTime(test.started_on, '00:00').toISOString();
  const toIso = test.ended_on
    // Päättymispäivä kokonaan mukaan: testi ajettiin sen päivän loppuun asti.
    ? helsinkiDateTime(addDays(test.ended_on, 1), '00:00').toISOString()
    : now.toISOString();

  /* Perusjoukko on joko sivunäyttö tai suppilon aiempi askel. Kumpikin
     rajataan samalla polkukuviolla, jotta osoittaja ja nimittäjä ovat samalta
     sivulta — muuten osuus voisi ylittää sadan prosentin. */
  const rows = await sql<{ variant: string; base: number; hit: number }[]>`
    select variant,
           count(*) filter (
             where (${test.base_step}::text is null and event_type = 'pageview')
                or (funnel_step = ${test.base_step})
           )::int as base,
           count(*) filter (where funnel_step = ${test.metric_step})::int as hit
      from tk.web_events
     where variant in ('a', 'b')
       and ts >= ${fromIso}
       and ts <  ${toIso}
       and path like ${test.path_pattern}
     group by 1
  `;

  const arm = (v: string): AbArm => {
    const r = rows.find((x) => x.variant === v);
    return { base: r?.base ?? 0, hit: r?.hit ?? 0 };
  };
  return { a: arm('a'), b: arm('b') };
}

const DAY = 86_400_000;

export async function getAbResults(now: Date = new Date()): Promise<AbTestResult[] | null> {
  const tests = await listAbTests();
  if (!tests) return null;

  return Promise.all(tests.map(async (t) => {
    const { a, b } = await armsFor(t, now);
    const loppu = t.ended_on ? new Date(`${t.ended_on}T12:00:00Z`) : now;
    const alku = new Date(`${t.started_on}T12:00:00Z`);
    const daysRun = Math.max(1, Math.round((loppu.getTime() - alku.getTime()) / DAY));
    const stats = verdict(a, b);
    return { ...t, a, b, stats, daysRun, daysLeft: daysRemaining(stats, daysRun) };
  }));
}

/** Suppilon askeleet valikkoon. Nimet vastaavat sivustoanalytiikan vaiheita. */
export const FUNNEL_STEPS: { key: string; label: string }[] = [
  /* 'card' on A/B-testien nimittäjä: se laukeaa kun varauskortti näkyy,
     riippumatta siitä mikä vaihe on ensimmäisenä. Juuri ensimmäinen vaihe on
     se mitä testeissä vaihdetaan, joten sen oma tapahtuma ei kelpaa
     nimittäjäksi. */
  { key: 'card',   label: 'Näki varauskortin' },
  { key: 'postal', label: 'Postinumerovaihe' },
  { key: 'calc',   label: 'Avasi laskurin' },
  { key: 'pick',   label: 'Valitsi kohteen' },
  { key: 'cal',    label: 'Kalenteri' },
  { key: 'form',   label: 'Yhteystiedot' },
  { key: 'done',   label: 'Varasi ajan' },
  { key: 'y-cal',  label: 'Taloyhtiö: kalenteri' },
  { key: 'y-form', label: 'Taloyhtiö: yhteystiedot' },
  { key: 'y-done', label: 'Taloyhtiö: varasi kartoituksen' },
];

export const stepLabel = (key: string | null): string =>
  key === null ? 'Sivunäytöt' : FUNNEL_STEPS.find((s) => s.key === key)?.label ?? key;
