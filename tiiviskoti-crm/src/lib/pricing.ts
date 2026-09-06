/* =========================================================
   TiivisKoti — hinnasto (portattu tiiviskoti/pricing.mjs:stä).

   Julkisen sivun varauslaskuri on hinnoittelun alkuperäinen totuuden lähde.
   Tämä on sen synkronoitu kopio CRM:n tarjouslaskuria varten, jotta admin
   näkee samat katalogihinnat kuin asiakas verkossa (ikkunan määräporras,
   ovien saman käynnin alennus, 149 € minimi, matkalisä alueesta). Jos
   pricing.mjs muuttuu, päivitä myös tämä.

   Ei 'server-only': moduuli on puhdas, ja tarjouslaskurin selainkomponentti
   näyttää saman summan reaaliajassa samalla funktiolla.
   ========================================================= */

export const MIN_PRICE = 149;
export const MIN_PRICE_NAME = `Pienen käynnin lisä (min. ${MIN_PRICE} €)`;

export const WINDOW_TIERS = [
  { upTo: 4, price: 90 },
  { upTo: 9, price: 85 },
  { upTo: 13, price: 80 },
  { upTo: Infinity, price: 75 },
];

export type OfferType = {
  id: string;
  name: string;
  desc: string;
  price: number;
  combo?: number;
  tiers?: typeof WINDOW_TIERS;
  min: number;
};

export const TYPES: OfferType[] = [
  { id: 'ikkuna',  name: 'Ikkuna',                  desc: 'Karmi- ja puitetiivisteet, per ikkuna',      tiers: WINDOW_TIERS, price: 90, min: 20 },
  { id: 'ulko',    name: 'Ulko-ovi',                desc: 'Sivutiivisteet + kynnyskumi, käynnin säätö', price: 99,  min: 30 },
  { id: 'parveke', name: 'Parvekeovi',              desc: 'Puu-/alumiiniparvekeovi, koko kehä',         price: 99,  min: 30 },
  { id: 'terassi', name: 'Terassin liuku-/pariovi', desc: 'Iso lasiovi tai liukuovi, kiskon huolto',    price: 149, min: 30 },
  { id: 'vali',    name: 'Väli- / huoneovi',        desc: 'Sisäoven ääni- ja vetotiiviste',             price: 89,  combo: 59, min: 30 },
  { id: 'kynnys',  name: 'Pelkkä kynnyskumi',       desc: 'Alaslistan / kynnyksen tiivisteen vaihto',   price: 45,  min: 20 },
];

export type OfferExtra = {
  id: string;
  name: string;
  price: number;
  per: 'aukko' | 'ikkuna' | 'kpl';
  unit: string;
  min: number;
  note?: string;
};

export const EXTRAS: OfferExtra[] = [
  { id: 'sauma', name: 'Karmin ja seinän välin akryylisaumaus', price: 19, per: 'aukko',  unit: 'aukko',  min: 10 },
  { id: 'helat', name: 'Helojen ja käyntivälyksen säätö',       price: 15, per: 'ikkuna', unit: 'ikkuna', min: 5 },
  { id: 'kahva', name: 'Kahvan vaihto',                         price: 29, per: 'kpl',    unit: 'kpl',    min: 15, note: '+ osa' },
];

/* Vapaa rivi: admin kirjoittaa itse nimen, kappalemäärän ja yksikköhinnan.
   Tarvitaan siihen mitä katalogissa ei ole — esim. "Rappukäytävän ulko-ovet,
   3 rappua" tai kertaluontoinen erikoistyö. Työaikaa ei arvioida, koska
   riviä ei voi tunnistaa: minutes jää nollaksi eikä kalenterivaraus veny
   väärin. */
export type CustomLine = { name: string; qty: number; unit: number };

export type PricingLine = {
  kind: 'type' | 'extra' | 'min' | 'travel' | 'discount' | 'custom';
  id: string;
  name: string;
  qty: number;
  unit: number;      // euroina
  unitName?: string;
  sum: number;       // euroina
  min: number;
  note?: string;
};

export type Pricing = {
  lines: PricingLine[];
  subtotal: number;
  work: number;
  travelFee: number;
  total: number;
  count: number;
  minutes: number;
};

const int = (v: unknown) => Math.max(0, parseInt(String(v), 10) || 0);

export function tierPriceFor(qty: number): number {
  const t = WINDOW_TIERS.find((x) => qty <= x.upTo);
  return (t || WINDOW_TIERS[WINDOW_TIERS.length - 1]).price;
}

export function unitPriceFor(type: OfferType, qty: number, totalItems: number): number {
  if (type.tiers) return tierPriceFor(qty);
  if (type.combo && totalItems > 1) return type.combo;
  return type.price;
}

function extraQtyFor(extra: OfferExtra, counts: Record<string, unknown>, totalItems: number): number {
  switch (extra.per) {
    case 'aukko':  return totalItems;
    case 'ikkuna': return int(counts.ikkuna);
    case 'kpl':    return int(counts[`extra_${extra.id}`]);
    default:       return 1;
  }
}

/** Laskee tarjouksen hinnan. `counts` esim. {ikkuna: 6, ulko: 1, extra_kahva: 2},
 *  `extras` esim. {sauma: true}. `travelFee` euroina (matkalisä alueesta). */
export function computePricing(
  counts: Record<string, number> = {},
  extras: Record<string, boolean> = {},
  opts: { travelFee?: number; discount?: number; discountLabel?: string; custom?: CustomLine[] } = {},
): Pricing {
  const travelFee = Math.max(0, Number(opts.travelFee) || 0);
  const c = counts || {};
  const x = extras || {};
  const totalItems = TYPES.reduce((s, t) => s + int(c[t.id]), 0);

  const lines: PricingLine[] = [];
  let subtotal = 0;
  let minutes = 0;

  for (const t of TYPES) {
    const qty = int(c[t.id]);
    if (qty <= 0) continue;
    const unit = unitPriceFor(t, qty, totalItems);
    const sum = unit * qty;
    subtotal += sum;
    minutes += (t.min || 0) * qty;
    lines.push({ kind: 'type', id: t.id, name: t.name, qty, unit, unitName: 'kpl', sum, min: t.min || 0 });
  }

  for (const e of EXTRAS) {
    const on = e.per === 'kpl' ? int(c[`extra_${e.id}`]) > 0 : !!x[e.id];
    if (!on) continue;
    const qty = extraQtyFor(e, c, totalItems);
    if (qty <= 0) continue;
    const sum = e.price * qty;
    subtotal += sum;
    minutes += (e.min || 0) * qty;
    lines.push({ kind: 'extra', id: e.id, name: e.name, qty, unit: e.price, unitName: e.unit || 'kpl', sum, min: e.min || 0, note: e.note });
  }

  /* Vapaat rivit. Tyhjä nimi tai nollamäärä ohitetaan, jotta lomakkeen
     tyhjät rivit eivät päädy tarjoukseen. Negatiivinen yksikköhinta on
     sallittu — sillä saa hyvityksen omalle riville. */
  for (const [i, cl] of (opts.custom ?? []).entries()) {
    const name = String(cl?.name ?? '').trim();
    const qty = int(cl?.qty);
    const unit = Number(cl?.unit) || 0;
    if (!name || qty <= 0) continue;
    const sum = unit * qty;
    subtotal += sum;
    lines.push({ kind: 'custom', id: `custom_${i}`, name, qty, unit, unitName: 'kpl', sum, min: 0 });
  }

  if (subtotal <= 0) {
    return { lines: [], subtotal: 0, work: 0, travelFee: 0, total: 0, count: 0, minutes: 0 };
  }

  const work = Math.max(subtotal, MIN_PRICE);
  if (work > subtotal) {
    const diff = work - subtotal;
    lines.push({ kind: 'min', id: 'min', name: MIN_PRICE_NAME, qty: 1, unit: diff, sum: diff, min: 0 });
  }

  if (travelFee > 0) {
    lines.push({ kind: 'travel', id: 'travel', name: 'Matkalisä', qty: 1, unit: travelFee, sum: travelFee, min: 0 });
  }

  let total = work + travelFee;

  /* Vapaa alennus koko käynnistä. Vähennetään lopuksi minimin ja matkalisän
     jälkeen, eikä summa mene alle nollan. Näkyy omana miinusrivinään. */
  const discount = Math.min(Math.max(0, Number(opts.discount) || 0), total);
  if (discount > 0) {
    lines.push({ kind: 'discount', id: 'discount', name: opts.discountLabel?.trim() || 'Alennus', qty: 1, unit: -discount, sum: -discount, min: 0 });
    total -= discount;
  }

  return { lines, subtotal, work, travelFee, total, count: totalItems, minutes };
}
