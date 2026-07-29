/* =========================================================
   TiivisKoti — hinnasto ja hinnanlaskenta.

   TÄMÄ ON HINNOITTELUN AINOA TOTUUDEN LÄHDE. Sekä selaimen laskuri
   (_shared.js) että palvelimen varausendpoint (api/create-booking.mjs)
   kutsuvat samaa `computePricing()`-funktiota, joten asiakkaan näkemä ja
   veloitettava hinta eivät voi enää erota toisistaan.

   Älä kopioi hintoja muualle. Aiemmin aloitusmaksu oli kahdennettuna
   (_shared.js BASE_PRICE + create-booking.mjs BASE_PRICE_CENTS) ja
   ovikohtaiset hinnat kolmessa paikassa; se hajosi kertaalleen niin, että
   jokainen verkkovaraus tallentui 0 €:na.

   Kannan `service_variants` / `addon_services` -hinnat pidetään samoina
   vain siksi, että admin ja tarjous-PDF näyttävät oikeat katalogihinnat.
   Varauksen rahasumma tulee aina täältä.
   ========================================================= */

/* Aloitusmaksu: matkat, kartoitus ja lämpökamerakuvaus. Lisätään aina
   valittujen kohteiden päälle — ei siis minimiveloitus. */
export const BASE_PRICE = 99;
export const BASE_PRICE_NAME = 'Aloitusmaksu';

/* Ikkunoiden määräporrastus. Koko ikkunamäärä hinnoitellaan sen portaan
   yksikköhinnalla, johon kokonaismäärä osuu — ei liukuvasti portaittain.
   Huom: porras vaihtuu jyrkästi, joten 10 ikkunaa (750 €) on halvempi kuin
   9 ikkunaa (765 €). Se on tietoinen valinta: raja kannustaa ottamaan koko
   asunnon kerralla, ja virhe on aina asiakkaan eduksi. */
export const WINDOW_TIERS = [
  { upTo: 4, price: 95 },
  { upTo: 9, price: 85 },
  { upTo: 19, price: 75 },
  { upTo: Infinity, price: 65 },
];

/* `price`   = hinta kun kohde teetetään yksinään
   `combo`   = hinta kun samaan käyntiin kuuluu vähintään yksi muu kohde
               (asentaja on jo paikalla, joten ajo ja pystytys on jo katettu)
   `tiers`   = määräporrastus, korvaa `price`n kokonaan
   `min`     = arvioitu työaika minuutteina per kappale (= kalenterivaraus) */
export const TYPES = [
  { id: 'ikkuna',  name: 'Ikkuna',                   desc: 'Karmi- ja puitetiivisteet, per ikkuna',      tiers: WINDOW_TIERS, price: 95, min: 20 },
  { id: 'ulko',    name: 'Ulko-ovi',                 desc: 'Sivutiivisteet + kynnyskumi, käynnin säätö', price: 119, combo: 99, min: 40 },
  { id: 'parveke', name: 'Parvekeovi',               desc: 'Puu-/alumiiniparvekeovi, koko kehä',         price: 119, combo: 99, min: 35 },
  { id: 'terassi', name: 'Terassin liuku-/pariovi',  desc: 'Iso lasiovi tai liukuovi, kiskon huolto',    price: 149, min: 45 },
  { id: 'vali',    name: 'Väli- / huoneovi',         desc: 'Sisäoven ääni- ja vetotiiviste',             price: 89,  combo: 59, min: 25 },
  { id: 'kynnys',  name: 'Pelkkä kynnyskumi',        desc: 'Alaslistan / kynnyksen tiivisteen vaihto',   price: 45,  min: 20 },
];

/* Lisätyöt. `per` kertoo mistä kappalemäärä tulee:
     'aukko'  → kaikkien valittujen ovien ja ikkunoiden yhteismäärä
     'ikkuna' → valittujen ikkunoiden määrä (piilotetaan jos ikkunoita ei ole)
     'kpl'    → asiakas valitsee määrän itse (oma askellin)
     'kerta'  → kertaveloitus koko käynnistä
   `note` näytetään hinnan perässä, kun lopullinen summa ei ole kiinteä. */
export const EXTRAS = [
  { id: 'sauma',  name: 'Karmin ja seinän välin akryylisaumaus', price: 19, per: 'aukko',  unit: 'aukko',  min: 10 },
  { id: 'helat',  name: 'Helojen ja käyntivälyksen säätö',       price: 15, per: 'ikkuna', unit: 'ikkuna', min: 5 },
  { id: 'poisto', name: 'Vanhan liiman poisto',                  price: 15, per: 'kerta',                  min: 15 },
  /* Määrällinen lisätyö viimeisenä: se vie laskurissa oman koko rivinsä,
     joten muut lisätyöt saavat täyttää kaksi saraketta rauhassa. */
  { id: 'kahva',  name: 'Kahvan vaihto',                         price: 29, per: 'kpl',    unit: 'kpl',    min: 15, note: '+ osa' },
];

/* Kotitalousvähennys: 40 % työn osuudesta, työn osuus n. 70 % hinnasta. */
export const NET_FACTOR = 1 - 0.40 * 0.70;

const int = (v) => Math.max(0, parseInt(v, 10) || 0);

export function tierPriceFor(qty) {
  const t = WINDOW_TIERS.find((x) => qty <= x.upTo);
  return (t || WINDOW_TIERS[WINDOW_TIERS.length - 1]).price;
}

/* Yhden kohdetyypin yksikköhinta annetulla valinnalla.
   `totalItems` on kaikkien ovien ja ikkunoiden yhteismäärä, koska
   saman käynnin alennus ratkeaa siitä eikä tämän tyypin määrästä. */
export function unitPriceFor(type, qty, totalItems) {
  if (type.tiers) return tierPriceFor(qty);
  if (type.combo && totalItems > 1) return type.combo;
  return type.price;
}

export function extraQtyFor(extra, counts, totalItems) {
  switch (extra.per) {
    case 'aukko':  return totalItems;
    case 'ikkuna': return int(counts.ikkuna);
    case 'kpl':    return int(counts[`extra_${extra.id}`]);
    default:       return 1;
  }
}

/**
 * Laskee koko varauksen hinnan.
 *
 * @param {Object} counts   kohdemäärät tyypin id:llä, esim. {ikkuna: 6, ulko: 1}.
 *                          Askeltimella valittavat lisätyöt tulevat samasta
 *                          oliosta avaimella `extra_<id>`, esim. {extra_kahva: 2}.
 * @param {Object} extras   valitut lisätyöt, esim. {sauma: true, helat: false}.
 *                          'kpl'-tyyppinen lisätyö on päällä kun sen määrä > 0.
 * @returns {{lines: Array, subtotal: number, total: number, count: number, minutes: number}}
 *          `lines` sisältää aloitusmaksun ensimmäisenä rivinä, joten rivien
 *          summa on aina täsmälleen `total`.
 */
export function computePricing(counts = {}, extras = {}) {
  const c = counts || {};
  const x = extras || {};
  const totalItems = TYPES.reduce((s, t) => s + int(c[t.id]), 0);

  const lines = [];
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

  /* Ei valintoja → ei hintaa. Aloitusmaksua ei veloiteta yksinään, koska
     emme tee ilmaisia eikä pelkkiä kartoituskäyntejä. */
  if (subtotal <= 0) {
    return { lines: [], subtotal: 0, total: 0, count: 0, minutes: 0 };
  }

  lines.unshift({ kind: 'base', id: 'base', name: BASE_PRICE_NAME, qty: 1, unit: BASE_PRICE, sum: BASE_PRICE, min: 0 });

  return { lines, subtotal, total: BASE_PRICE + subtotal, count: totalItems, minutes };
}
