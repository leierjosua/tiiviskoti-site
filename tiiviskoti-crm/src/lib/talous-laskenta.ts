/* =========================================================
   Talousnäkymän laskenta ilman tietokantaa.

   Kaikki rahalaskenta ja jaksojen päivämäärämatematiikka on täällä, jotta
   se on testattavissa ilman kantayhteyttä: juuri nämä palaset (alvin
   erottaminen, kiinteän kulun jakaminen jaksolle, vertailujakson rajat)
   ovat ne joissa virhe ei näy ruudulla vaan väärässä luvussa.

   Ei 'server-only': moduuli on puhdas. Kyselyt ja rajapintahaut ovat
   lib/talous.ts:ssä.
   ========================================================= */

import { addDays, dateKeyOf, isoWeekday } from './time';
import { CATEGORY_IDS, type Category, type CostSettings } from './talous-shared';

// ─────────────────────────────────────────────────────────────
// Päiväavainten aritmetiikka. Kaikki jaksorajat ovat Suomen
// kalenteripäiviä ('YYYY-MM-DD'), ja loppuraja on aina POISSULKEVA.
// Merkkijonovertailu riittää järjestykseen, koska muoto on kiinteä.
// ─────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const firstOfMonth = (y: number, m: number) => `${y}-${pad(m)}-01`;

export function ymd(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

export function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const t = y * 12 + (m - 1) + n;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Päivien määrä väliltä [a, b). */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = ymd(a);
  const [by, bm, bd] = ymd(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export const minKey = (a: string, b: string) => (a < b ? a : b);
export const maxKey = (a: string, b: string) => (a > b ? a : b);

/** Päiväavaimen kuukausi 'YYYY-MM'. */
export const monthOf = (key: string) => key.slice(0, 7);

// ─────────────────────────────────────────────────────────────
// Jaksot
// ─────────────────────────────────────────────────────────────

export type RangeKey = 'viikko' | 'kk' | 'edelliskk' | '6kk' | '12kk' | 'kaikki';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'viikko',    label: 'Tämä viikko' },
  { key: 'kk',        label: 'Tämä kuukausi' },
  { key: 'edelliskk', label: 'Edellinen kuukausi' },
  { key: '6kk',       label: '6 kk' },
  { key: '12kk',      label: '12 kk' },
  { key: 'kaikki',    label: 'Koko historia' },
];

export function parseRange(v: string | undefined): RangeKey {
  return RANGES.some((r) => r.key === v) ? (v as RangeKey) : 'kk';
}

export type ResolvedRange = {
  key: RangeKey;
  label: string;
  /** Jakson alku (mukaan lukien). */
  fromKey: string;
  /** Jakson loppu, poissulkeva — leikattuna huomiseen, jotta kesken oleva
   *  jakso ei laskisi tulevaisuutta mukaan eikä jaa kiinteitä kuluja
   *  päiville joita ei ole vielä eletty. */
  toKey: string;
  /** Vertailujakso, tai null kun edeltävää dataa ei ole mielekästä hakea. */
  prevFromKey: string | null;
  prevToKey: string | null;
};

// ─────────────────────────────────────────────────────────────
// Tunnusluvut
// ─────────────────────────────────────────────────────────────

export type TalousMetrics = {
  myyntiCents: number;        // kokonaismyynti sis. alv
  liikevaihtoCents: number;   // alv 0 %
  varaukset: number;
  keskiarvoCents: number;     // keskimääräinen varausarvo (sis. alv)

  tekijaCents: number;
  markkinointiCents: number;
  laiteCents: number;
  komissioCents: number;
  kiinteatCents: number;
  provisioCents: number;

  kulutCents: number;         // kaikki kulut yhteensä
  kateCents: number;          // liikevaihto − muuttuvat kulut
  katePct: number;
  tulosCents: number;         // liikevaihto − kaikki kulut
};

export type MonthPoint = {
  key: string;                // 'YYYY-MM'
  label: string;              // 'syys 26'
  myyntiCents: number;
  kulutCents: number;
  tulosCents: number;
};

const MONTH_SHORT = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä',
                     'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
}

export const zeroByCategory = (): Record<Category, number> =>
  ({ tekija: 0, markkinointi: 0, laite: 0, komissio: 0, kiinteat: 0, provisio: 0 });

/**
 * Kiinteät kulut jaksolle. Kuukausisumma jaetaan päiville, jotta viikko
 * ei kanna koko kuukauden vuokraa eikä kesken oleva kuukausi näytä
 * kulua päiviltä joita ei ole vielä tullut.
 */
export function fixedCostFor(fromKey: string, toKey: string, perMonthCents: number): number {
  if (perMonthCents <= 0 || toKey <= fromKey) return 0;
  let total = 0;
  let cursor = fromKey;
  while (cursor < toKey) {
    const [y, m] = ymd(cursor);
    const next = addMonths(y, m, 1);
    const monthEnd = firstOfMonth(next.y, next.m);
    const segEnd = minKey(monthEnd, toKey);
    total += (perMonthCents * dayDiff(cursor, segEnd)) / daysInMonth(y, m);
    cursor = segEnd;
  }
  return Math.round(total);
}

export type DaySales = { cents: number; n: number };

export function sumSales(days: Map<string, DaySales>, fromKey: string, toKey: string): DaySales {
  let cents = 0;
  let n = 0;
  for (const [key, v] of days) {
    if (key >= fromKey && key < toKey) { cents += v.cents; n += v.n; }
  }
  return { cents, n };
}

export function sumExpenses(
  days: Map<string, Record<Category, number>>, fromKey: string, toKey: string,
): Record<Category, number> {
  const out = zeroByCategory();
  for (const [key, v] of days) {
    if (key >= fromKey && key < toKey) {
      for (const c of CATEGORY_IDS) out[c] += v[c];
    }
  }
  return out;
}

export function sumMeta(days: Record<string, number>, fromKey: string, toKey: string): number {
  let cents = 0;
  for (const [key, v] of Object.entries(days)) {
    if (key >= fromKey && key < toKey) cents += v;
  }
  return cents;
}

export function computeMetrics(input: {
  sales: DaySales;
  expenses: Record<Category, number>;
  metaCents: number;
  fromKey: string;
  toKey: string;
  s: CostSettings;
}): TalousMetrics {
  const { sales, expenses, metaCents, fromKey, toKey, s } = input;

  const myyntiCents = sales.cents;
  // Kannan hinta on kuluttajahinta. Liikevaihto = hinta ilman alvia.
  const liikevaihtoCents = Math.round(myyntiCents / (1 + s.vatBp / 10_000));
  const share = (bp: number) => Math.round((liikevaihtoCents * bp) / 10_000);

  const tekijaCents       = share(s.tekijaBp)   + expenses.tekija;
  const laiteCents        = share(s.laiteBp)    + expenses.laite;
  const komissioCents     = share(s.komissioBp) + expenses.komissio;
  const provisioCents     = share(s.provisioBp) + expenses.provisio;
  const markkinointiCents = (s.metaAuto ? metaCents : 0) + expenses.markkinointi;
  const kiinteatCents     = fixedCostFor(fromKey, toKey, s.kiinteatCentsMonth) + expenses.kiinteat;

  /* Kate = liikevaihto miinus ne kulut jotka syntyvät työn tekemisestä.
     Markkinointi, provisio ja kiinteät kulut juoksevat myös ilman keikkaa,
     joten ne vähennetään vasta tuloksessa — muuten kate ei kertoisi
     yhdestäkään keikasta mitään. */
  const kateCents = liikevaihtoCents - (tekijaCents + laiteCents + komissioCents);
  const kulutCents = tekijaCents + markkinointiCents + laiteCents
                   + komissioCents + kiinteatCents + provisioCents;

  return {
    myyntiCents,
    liikevaihtoCents,
    varaukset: sales.n,
    keskiarvoCents: sales.n > 0 ? Math.round(myyntiCents / sales.n) : 0,
    tekijaCents, markkinointiCents, laiteCents, komissioCents, kiinteatCents, provisioCents,
    kulutCents,
    kateCents,
    katePct: liikevaihtoCents > 0 ? (kateCents / liikevaihtoCents) * 100 : 0,
    tulosCents: liikevaihtoCents - kulutCents,
  };
}

/**
 * Jakson rajat. Puhdas osa: `kaikki` tarvitsee ensimmäisen työn päivän,
 * jonka kutsuja hakee kannasta — muuten kiinteät kulut juoksisivat vuosia
 * ennen ensimmäistä keikkaa.
 *
 * Loppuraja leikataan aina huomiseen: kesken oleva jakso ei saa laskea
 * mukaan tulevaisuutta eikä jakaa kiinteitä kuluja päiville joita ei ole
 * vielä eletty. Vertailujakso on täsmälleen yhtä pitkä kuin jakson
 * KULUNUT osa ja päättyy jakson alkuun.
 */
export function rangeWindow(
  key: RangeKey, now: Date, firstJobKey: string | null,
): ResolvedRange {
  const today = dateKeyOf(now);
  const tomorrow = addDays(today, 1);
  const [y, m] = ymd(today);
  const thisMonth = firstOfMonth(y, m);
  const nextM = addMonths(y, m, 1);
  const nextMonth = firstOfMonth(nextM.y, nextM.m);
  const label = RANGES.find((r) => r.key === key)!.label;

  let fromKey: string;
  let toKey: string;

  switch (key) {
    case 'viikko':
      fromKey = addDays(today, -(isoWeekday(today) - 1));
      toKey = addDays(fromKey, 7);
      break;
    case 'edelliskk': {
      const p = addMonths(y, m, -1);
      fromKey = firstOfMonth(p.y, p.m);
      toKey = thisMonth;
      break;
    }
    case '6kk': {
      const p = addMonths(y, m, -5);
      fromKey = firstOfMonth(p.y, p.m);
      toKey = nextMonth;
      break;
    }
    case '12kk': {
      const p = addMonths(y, m, -11);
      fromKey = firstOfMonth(p.y, p.m);
      toKey = nextMonth;
      break;
    }
    case 'kaikki': {
      const [fy, fm] = ymd(firstJobKey ?? today);
      fromKey = firstOfMonth(fy, fm);
      toKey = nextMonth;
      break;
    }
    default:
      fromKey = thisMonth;
      toKey = nextMonth;
  }

  const cappedTo = minKey(toKey, tomorrow);
  const elapsed = Math.max(dayDiff(fromKey, cappedTo), 0);
  // Koko historialla ei ole edeltävää jaksoa johon verrata.
  const vertailu = key !== 'kaikki' && elapsed > 0;

  return {
    key,
    label,
    fromKey,
    toKey: cappedTo,
    prevFromKey: vertailu ? addDays(fromKey, -elapsed) : null,
    prevToKey: vertailu ? fromKey : null,
  };
}

/** '1.9.' — jaksorajojen näyttömuoto. */
export function shortDate(key: string): string {
  const [, m, d] = ymd(key);
  return `${d}.${m}.`;
}

/** Jakson ihmisluettava rajaus: '1.9.–9.9.' (loppu mukaan lukien). */
export function rangeText(fromKey: string, toKeyExclusive: string): string {
  const last = addDays(toKeyExclusive, -1);
  return fromKey === last ? shortDate(fromKey) : `${shortDate(fromKey)}–${shortDate(last)}`;
}
