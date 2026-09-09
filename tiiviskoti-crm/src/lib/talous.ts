import 'server-only';
import { sql } from './db';
import { kartoitusCalendarId } from './data';
import { getMetaSpendDaily, type MetaSpendDays } from './meta';
import { addDays, dateKeyOf, helsinkiDateTime } from './time';
import { DEFAULT_SETTINGS, isCategory, type Category, type CostSettings } from './talous-shared';
import {
  addMonths, computeMetrics, firstOfMonth, maxKey, minKey, monthLabel, monthOf,
  rangeWindow, sumExpenses, sumMeta, sumSales, ymd, zeroByCategory,
  type DaySales, type MonthPoint, type RangeKey, type ResolvedRange, type TalousMetrics,
} from './talous-laskenta';

/* =========================================================
   Talousanalytiikan kyselyt: myynti kannasta, kulut kannasta ja
   mainoskulut Metan rajapinnasta. Laskenta on lib/talous-laskenta.ts:ssä.

   MISTÄ LUVUT TULEVAT
     Myynti      tk.jobs.price_cents, työn päivän (starts_at) mukaan.
                 KAIKKI kalenteriin päätyneet keikat: alustava, vahvistettu
                 ja tehty. Keikka on myyty siinä hetkessä kun se on
                 kalenterissa, joten tekemätön tuleva keikka on myyntiä
                 siinä missä eilen tehty. Pois jäävät vain peruutetut ja
                 `hold` (checkoutin aikainen varaus, joka vanhenee itsestään
                 eikä ole vielä kenenkään sopima). Kuluttajahinta eli
                 sisältää alvin.
     Kulut       tk.cost_settings (osuus liikevaihdosta + kiinteä €/kk)
                 + tk.expenses (yksittäiset kirjaukset)
                 + Meta-mainoskulut, jos automatiikka on päällä.

   MIKSI PÄIVÄTASON HAKU JA LASKENTA JS:SSÄ
     Sivu tarvitsee samasta datasta kolme eri rajausta: valittu jakso,
     sitä edeltävä vertailujakso ja 12 kuukauden sarja. Ne eivät ole
     sisäkkäisiä eivätkä kuukausirajoilla, joten yksi päivätarkka kysely
     kattaa kaikki kolme — erilliset kyselyt tekisivät saman työn kolmesti.
   ========================================================= */

export type { Category, CostSettings } from './talous-shared';
export type { MonthPoint, RangeKey, ResolvedRange, TalousMetrics } from './talous-laskenta';

export type Talous = {
  range: ResolvedRange;
  now: TalousMetrics;
  prev: TalousMetrics | null;
  months: MonthPoint[];
  settings: CostSettings;
  /** Onko db/030 ajettu. Ilman sitä myynti näkyy mutta kulut ovat nollia. */
  migrated: boolean;
  /** Jakson käsinkirjatut kulut kategorioittain — loput ovat sääntöjen tuottamia. */
  manual: Record<Category, number>;
  meta: { auto: boolean; ok: boolean; error?: string; spendCents: number };
};

export async function getCostSettings(): Promise<{ settings: CostSettings; migrated: boolean }> {
  try {
    const rows = await sql<{
      vat_bp: number; tekija_bp: number; laite_bp: number; komissio_bp: number;
      provisio_bp: number; kiinteat_cents_month: number; meta_auto: boolean;
    }[]>`
      select vat_bp, tekija_bp, laite_bp, komissio_bp, provisio_bp,
             kiinteat_cents_month, meta_auto
        from tk.cost_settings limit 1
    `;
    const r = rows[0];
    if (!r) return { settings: DEFAULT_SETTINGS, migrated: true };
    return {
      migrated: true,
      settings: {
        vatBp: r.vat_bp,
        tekijaBp: r.tekija_bp,
        laiteBp: r.laite_bp,
        komissioBp: r.komissio_bp,
        provisioBp: r.provisio_bp,
        kiinteatCentsMonth: r.kiinteat_cents_month,
        metaAuto: r.meta_auto,
      },
    };
  } catch (e) {
    /* 42P01 = taulua ei ole, eli db/030 on ajamatta. Se ei ole syy jättää
       myyntiä näyttämättä — sivu kertoo puutteesta ja jatkaa nollakuluilla. */
    if ((e as { code?: string })?.code !== '42P01') throw e;
    return { settings: DEFAULT_SETTINGS, migrated: false };
  }
}

/** Jakson rajat. `kaikki` tarvitsee ensimmäisen työn päivän kannasta;
 *  muut jaksot ratkeavat pelkästä kalenterista. */
async function resolveRange(key: RangeKey, now: Date): Promise<ResolvedRange> {
  let firstJobKey: string | null = null;
  if (key === 'kaikki') {
    const rows = await sql<{ d: string | null }[]>`
      select to_char(min(j.starts_at) at time zone 'Europe/Helsinki', 'YYYY-MM-DD') as d
        from tk.jobs j
       where j.status in ('confirmed', 'done')
    `;
    firstJobKey = rows[0]?.d ?? null;
  }
  return rangeWindow(key, now, firstJobKey);
}

export async function getTalous(rangeKey: RangeKey, now: Date = new Date()): Promise<Talous> {
  const [{ settings, migrated }, range] = await Promise.all([
    getCostSettings(),
    resolveRange(rangeKey, now),
  ]);

  const today = dateKeyOf(now);
  const [ty, tm] = ymd(today);
  const nextM = addMonths(ty, tm, 1);
  // Kuukausisarja on aina viimeiset 12 kuukautta — se ei kavennu vaikka
  // ylhäältä katsoisi yhtä viikkoa, koska juuri trendi on se mitä
  // yksittäisestä viikosta ei näe. Kuluva kuukausi on mukana kokonaisena:
  // loppukuun keikat on jo myyty, vaikka niitä ei ole vielä tehty.
  const firstOfSeries = addMonths(ty, tm, -11);
  const seriesFrom = firstOfMonth(firstOfSeries.y, firstOfSeries.m);
  const seriesTo = firstOfMonth(nextM.y, nextM.m);

  const unionFrom = minKey(range.prevFromKey ?? range.fromKey, seriesFrom);
  const unionTo = maxKey(range.toKey, seriesTo);

  const fromIso = helsinkiDateTime(unionFrom, '00:00').toISOString();
  const toIso = helsinkiDateTime(unionTo, '00:00').toISOString();
  const kartoitus = kartoitusCalendarId();

  const salesRowsP = sql<{
    d: string; cents: string; n: number; avoin_cents: string; avoin_n: number;
  }[]>`
    select to_char(j.starts_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD') as d,
           coalesce(sum(j.price_cents), 0)::bigint as cents,
           count(*)::int as n,
           coalesce(sum(j.price_cents) filter (where j.status <> 'done'), 0)::bigint as avoin_cents,
           count(*) filter (where j.status <> 'done')::int as avoin_n
      from tk.jobs j
     where j.status in ('tentative', 'confirmed', 'done')
       and j.starts_at >= ${fromIso}
       and j.starts_at <  ${toIso}
       -- Ilmainen kartoituskäynti ei ole myynti eikä varaus: se on nollan
       -- euron rivi, joka vetäisi keskimääräisen varausarvon alas.
       and (${kartoitus}::uuid is null or j.calendar_id <> ${kartoitus}::uuid)
     group by 1
  `;

  const expenseRowsP = (async () => {
    try {
      return await sql<{ d: string; category: Category; cents: string }[]>`
        select to_char(e.spent_on, 'YYYY-MM-DD') as d,
               e.category,
               coalesce(sum(e.amount_cents), 0)::bigint as cents
          from tk.expenses e
         where e.spent_on >= ${unionFrom}::date
           and e.spent_on <  ${unionTo}::date
         group by 1, 2
      `;
    } catch (e) {
      if ((e as { code?: string })?.code !== '42P01') throw e;
      return [];
    }
  })();

  /* Mainoskulut haetaan vain jos automatiikka on päällä. Rajapinta on
     hidas verrattuna kantaan, eikä sitä kannata odottaa jos luku
     heitettäisiin kuitenkin pois. */
  const metaP: Promise<MetaSpendDays> = settings.metaAuto
    ? getMetaSpendDaily(unionFrom, addDays(unionTo, -1))
    : Promise.resolve({ configured: false, days: {}, totalCents: 0 });

  const [salesRows, expenseRows, meta] = await Promise.all([salesRowsP, expenseRowsP, metaP]);

  const salesByDay = new Map<string, DaySales>();
  for (const r of salesRows) {
    salesByDay.set(r.d, {
      cents: Number(r.cents), n: r.n,
      avoinCents: Number(r.avoin_cents), avoinN: r.avoin_n,
    });
  }

  const expensesByDay = new Map<string, Record<Category, number>>();
  for (const r of expenseRows) {
    const day = expensesByDay.get(r.d) ?? zeroByCategory();
    if (isCategory(r.category)) day[r.category] += Number(r.cents);
    expensesByDay.set(r.d, day);
  }

  const forWindow = (fromKey: string, toKey: string) => computeMetrics({
    sales: sumSales(salesByDay, fromKey, toKey),
    expenses: sumExpenses(expensesByDay, fromKey, toKey),
    metaCents: sumMeta(meta.days, fromKey, toKey),
    fromKey, toKey, s: settings,
  });

  const months: MonthPoint[] = [];
  for (let i = 0; i < 12; i++) {
    const p = addMonths(firstOfSeries.y, firstOfSeries.m, i);
    const start = firstOfMonth(p.y, p.m);
    const nx = addMonths(p.y, p.m, 1);
    const end = firstOfMonth(nx.y, nx.m);
    const mm = forWindow(start, end);
    months.push({
      key: monthOf(start),
      label: monthLabel(monthOf(start)),
      myyntiCents: mm.myyntiCents,
      kulutCents: mm.kulutCents,
      tulosCents: mm.tulosCents,
    });
  }

  return {
    range,
    now: forWindow(range.fromKey, range.toKey),
    prev: range.prevFromKey && range.prevToKey
      ? forWindow(range.prevFromKey, range.prevToKey)
      : null,
    months,
    settings,
    migrated,
    manual: sumExpenses(expensesByDay, range.fromKey, range.toKey),
    meta: {
      auto: settings.metaAuto,
      ok: !meta.error,
      error: meta.error,
      spendCents: sumMeta(meta.days, range.fromKey, range.toKey),
    },
  };
}

/** Kulukirjaukset listaa varten. Uusin ensin. */
export type ExpenseRow = {
  id: string;
  spent_on: string;
  category: Category;
  amount_cents: number;
  note: string | null;
  created_by_name: string | null;
};

export async function listExpenses(limit = 100): Promise<ExpenseRow[] | null> {
  try {
    return await sql<ExpenseRow[]>`
      select e.id,
             to_char(e.spent_on, 'YYYY-MM-DD') as spent_on,
             e.category, e.amount_cents, e.note,
             s.full_name as created_by_name
        from tk.expenses e
        left join tk.staff s on s.id = e.created_by
       order by e.spent_on desc, e.created_at desc
       limit ${limit}
    `;
  } catch (e) {
    if ((e as { code?: string })?.code !== '42P01') throw e;
    return null;
  }
}
