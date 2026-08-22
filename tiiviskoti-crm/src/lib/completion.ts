import { EXTRAS, TYPES } from './pricing';

/* =========================================================
   Keikan viimeistely — jaetut palaset.

   Ei 'server-only': velhon selainkomponentti laskee summan samalla
   funktiolla kuin palvelin tallentaa sen. Jos laskenta olisi kahdessa
   paikassa, asentaja näkisi eri summan kuin kantaan menee.

   TÄRKEIN PÄÄTÖS TÄSSÄ TIEDOSTOSSA: viimeistely EI laske hintaa
   hinnastosta uudelleen. Se muokkaa työn rivejä. Uudelleenlaskenta
   pyyhkisi kaiken mitä varaushetkellä sovittiin — matkalisän, minimin,
   alennuskoodin — koska ne eivät ole hinnastossa vaan riveillä.
   Hinnasto on tässä pelkkä valikko: mistä uusi rivi saa hintansa.
   ========================================================= */

export type Line = {
  /** Katalogin tunnus, jos rivi tuli valikosta. Vapaa rivi: null. */
  catalogId: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type CatalogItem = {
  id: string;
  name: string;
  priceCents: number;
  minutes: number;
  group: 'palvelu' | 'lisapalvelu';
};

/** Palvelut ja lisäpalvelut samassa muodossa velhon ruudukoita varten. */
export const CATALOG: CatalogItem[] = [
  ...TYPES.map((t): CatalogItem => ({
    id: `type:${t.id}`, name: t.name, priceCents: t.price * 100,
    minutes: t.min, group: 'palvelu',
  })),
  ...EXTRAS.map((e): CatalogItem => ({
    id: `extra:${e.id}`, name: e.name, priceCents: e.price * 100,
    minutes: e.min, group: 'lisapalvelu',
  })),
];

const byName = new Map(CATALOG.map((c) => [c.name.toLowerCase(), c.id]));

/**
 * Kannan rivit velhon muotoon.
 *
 * Nimi on ainoa side katalogiin: rivit tallennetaan nimellä, koska ne
 * ovat kuitin ja laskun tekstiä eivätkä viittauksia. Varauslaskuri
 * liittää joskus huomautuksen nimen perään ("Kahvan vaihto (+ osa)"),
 * joten sulkulisä kuoritaan ennen vertailua. Tunnistamaton rivi säilyy
 * vapaana rivinä — sitä ei saa hukata vain siksi ettei se ole valikossa.
 */
export function linesFromDb(
  rows: { name: string; quantity: number; unit_price_cents: number }[],
): Line[] {
  return rows.map((r) => {
    const bare = r.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    return {
      catalogId: byName.get(bare) ?? null,
      name: r.name,
      quantity: r.quantity,
      unitPriceCents: r.unit_price_cents,
    };
  });
}

export const lineSum = (l: Line) => l.quantity * l.unitPriceCents;

export const linesTotal = (lines: Line[]) => lines.reduce((s, l) => s + lineSum(l), 0);

/** Loppusumma alennuksen jälkeen. Ei koskaan alle nollan. */
export function finalTotal(lines: Line[], discountCents: number) {
  return Math.max(0, linesTotal(lines) - Math.max(0, discountCents));
}

export const SATISFACTION = [
  { value: 1, emoji: '😕', label: 'Huono' },
  { value: 2, emoji: '😐', label: 'Ok' },
  { value: 3, emoji: '😄', label: 'Erinomainen' },
] as const;

export const satisfactionLabel = (v: number | null | undefined) =>
  SATISFACTION.find((s) => s.value === v)?.label ?? null;

export const eur = (cents: number) =>
  (cents / 100).toLocaleString('fi-FI', { maximumFractionDigits: 2 }) + ' €';
