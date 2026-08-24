import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/* Tarjous-PDF (Node). Sama asettelu ja brändi kuin kuitissa
   (receipt-pdf.ts), mutta ennen työtä lähetettävä tarjous: ei "MAKSETTU"
   vaan voimassaoloaika, ja "Työn osuus" näkyy kotitalousvähennystä varten
   myyntiargumenttina. */

const LOGO_URL = 'https://tiiviskoti.fi/img/logo-email.png';
const VAT_RATE = 0.255;
const WORK_PORTION_RATE = 0.9;
const VALID_DAYS = 14;

const BRAND_DARK = rgb(0.086, 0.227, 0.157);
const BRAND_GREEN = rgb(0.129, 0.478, 0.306);
const LIME_LIGHT = rgb(0.894, 0.941, 0.914);
const GRAY = rgb(0.533, 0.533, 0.533);
const LIGHT_GRAY = rgb(0.878, 0.878, 0.878);

export interface OfferInput {
  jobNumber: string;
  createdAt: Date;
  workDate?: Date | null;
  customer: { name: string; address?: string | null; postalCode?: string | null; city?: string | null; email?: string | null; phone?: string | null };
  lines: { name: string; quantity: number; unitPriceCents: number }[];
  totalIncVatCents: number;
  /** Vapaa sana: asiakkaalle näkyvä saateteksti rivien alla. */
  customerNote?: string | null;
}

const fmtCents = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric' }).format(d);

/* pdf-lib HEITTÄÄ jos merkkiä ei voi esittää WinAnsi-koodauksessa — koko
   tarjouksen lähetys kaatuisi yhteen emojiin. "Vapaa sana" on kenttä johon
   asiakkaalle kirjoitetaan vapaasti, ja juuri sinne liitetään hymiöitä ja
   nuolia. Todettu: 😊 (0x1f60a) ja → (0x2192) kaatoivat generoinnin.

   Yleiset merkit korvataan luettavalla vastineella, loput pudotetaan. Tämä
   on `text()`-apurissa eikä vain vapaassa sanassa, koska sama riski koskee
   jokaista käsin kirjoitettua kenttää (asiakkaan nimi, vapaiden rivien
   nimet). Puuttuva merkki on aina parempi kuin lähettämättä jäänyt tarjous. */
const WINANSI_FIXES: [RegExp, string][] = [
  [/[\u2192\u21d2]/g, '->'], [/[\u2190\u21d0]/g, '<-'],
  [/[\u2713\u2714]/g, '+'], [/[\u00a0\u2007\u202f]/g, ' '],
  [/\t/g, '  '],
];

export function toWinAnsi(input: string): string {
  let s = input;
  for (const [re, rep] of WINANSI_FIXES) s = s.replace(re, rep);
  /* WinAnsi kattaa Latin-1:n plus joukon typografisia merkkejä. Loput pois. */
  const EXTRA = '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d'
    + '\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';
  return [...s].filter((ch) => {
    const c = ch.codePointAt(0)!;
    return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.includes(ch) || ch === '\n';
  }).join('');
}

export async function generateOfferPdf(input: OfferInput): Promise<Uint8Array> {
  const validUntil = new Date(input.createdAt.getTime() + VALID_DAYS * 24 * 60 * 60 * 1000);

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  let y = height - margin;

  const text = (s: string, x: number, yy: number, o: { font?: typeof font; size?: number; color?: typeof BRAND_DARK } = {}) =>
    page.drawText(toWinAnsi(s), { x, y: yy, size: o.size ?? 10, font: o.font ?? font, color: o.color ?? BRAND_DARK });
  const rightX = (s: string, f: typeof font, size: number, rx: number) => rx - f.widthOfTextAtSize(s, size);
  const line = (x1: number, yy: number, x2: number, color = LIGHT_GRAY) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.5, color });

  // ylapalkki
  page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: BRAND_GREEN });

  // logo
  try {
    const res = await fetch(LOGO_URL);
    const img = await doc.embedPng(new Uint8Array(await res.arrayBuffer()));
    const w = 150;
    page.drawImage(img, { x: margin, y: y - (img.height * (w / img.width)) + 12, width: w, height: img.height * (w / img.width) });
  } catch { /* ilman logoa jos haku epaonnistuu */ }

  text('TARJOUS', width - margin - bold.widthOfTextAtSize('TARJOUS', 28), y - 20, { font: bold, size: 28 });
  y -= 62;

  // meta
  const metaR = width - margin;
  const metaRows: [string, string][] = [
    ['Tarjousnumero:', `#${input.jobNumber}`],
    ['Päiväys:', fmtDate(input.createdAt)],
    ['Voimassa:', `${fmtDate(validUntil)} asti`],
  ];
  if (input.workDate) metaRows.push(['Ehdotettu pvm:', fmtDate(input.workDate)]);
  for (const [label, value] of metaRows) {
    text(label, metaR - 200, y, { size: 9, color: GRAY });
    text(value, rightX(value, bold, 9, metaR), y, { font: bold, size: 9 });
    y -= 16;
  }
  y -= 6;

  // TARJOUS-badge
  const bw = 200, bh = 26, bx = width - margin - bw;
  page.drawRectangle({ x: bx, y: y - bh + 8, width: bw, height: bh, color: LIME_LIGHT, borderColor: BRAND_GREEN, borderWidth: 1 });
  text('VOIMASSA ' + VALID_DAYS + ' PV', bx + (bw - bold.widthOfTextAtSize('VOIMASSA ' + VALID_DAYS + ' PV', 10)) / 2, y - bh + 17, { font: bold, size: 10, color: BRAND_GREEN });

  // asiakas
  const cy = y + 8;
  text('ASIAKAS', margin, cy, { font: bold, size: 9, color: GRAY });
  text(input.customer.name, margin, cy - 16, { font: bold, size: 11 });
  let ly = cy - 32;
  const cust = input.customer;
  if (cust.address) { text(cust.address, margin, ly, { size: 10 }); ly -= 14; }
  if (cust.postalCode || cust.city) { text(`${cust.postalCode ?? ''} ${cust.city ?? ''}`.trim(), margin, ly, { size: 10 }); ly -= 14; }
  if (cust.email) { text(cust.email, margin, ly, { size: 9, color: GRAY }); ly -= 14; }
  if (cust.phone) { text(cust.phone, margin, ly, { size: 9, color: GRAY }); }

  y -= 78;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: BRAND_GREEN });
  y -= 22;

  // taulukko-otsikko
  const c1 = margin, c2 = 330, c3 = 400, c4 = width - margin;
  page.drawRectangle({ x: margin, y: y - 6, width: width - margin * 2, height: 20, color: LIME_LIGHT });
  text('Nimike', c1 + 4, y, { font: bold, size: 9 });
  text('Määrä', c2, y, { font: bold, size: 9 });
  text('á hinta', c3, y, { font: bold, size: 9 });
  text('Yhteensä', rightX('Yhteensä', bold, 9, c4 - 4), y, { font: bold, size: 9 });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: BRAND_GREEN });
  y -= 16;

  for (const it of input.lines) {
    const tot = it.unitPriceCents * it.quantity;
    text(it.name, c1, y, { size: 10 });
    text(String(it.quantity), c2 + 10, y, { size: 10 });
    text(`${fmtCents(it.unitPriceCents)} €`, c3, y, { size: 10 });
    const t = `${fmtCents(tot)} €`;
    text(t, rightX(t, font, 10, c4), y, { size: 10 });
    y -= 20;
  }

  y -= 4;
  line(margin, y, width - margin);
  y -= 20;

  // summat
  const total = input.totalIncVatCents;
  const work = Math.round(total * WORK_PORTION_RATE);
  const ex = Math.round(total / (1 + VAT_RATE));
  const vat = total - ex;
  const lx = 360, vx = c4;
  for (const [label, value] of [
    ['Työn osuus:', `${fmtCents(work)} €`],
    ['Veroton hinta:', `${fmtCents(ex)} €`],
    ['ALV 25,5%:', `${fmtCents(vat)} €`],
  ]) {
    text(label, lx, y, { size: 10, color: GRAY });
    text(value, rightX(value, font, 10, vx), y, { size: 10 });
    y -= 16;
  }
  y -= 4;
  page.drawLine({ start: { x: lx - 10, y }, end: { x: width - margin, y }, thickness: 1.5, color: BRAND_GREEN });
  y -= 26;

  // yhteensa
  page.drawRectangle({ x: lx - 14, y: y - 8, width: width - margin - (lx - 14) + 4, height: 30, color: BRAND_DARK });
  page.drawRectangle({ x: lx - 14, y: y - 8, width: 4, height: 30, color: BRAND_GREEN });
  text('YHTEENSÄ:', lx, y, { font: bold, size: 12, color: rgb(1, 1, 1) });
  const gt = `${fmtCents(total)} €`;
  text(gt, rightX(gt, bold, 12, vx), y, { font: bold, size: 12, color: rgb(1, 1, 1) });
  y -= 50;

  /* Vapaa sana ennen vakioehtoja: se on tälle tarjoukselle kirjoitettu
     viesti, ja vakiotekstin alle jäädessään se luettaisiin pikkupränttinä.
     Rivitys on tehtävä itse — pdf-lib ei katkaise tekstiä, vaan piirtäisi
     yhden rivin sivun reunan yli. */
  if (input.customerNote) {
    const maxWidth = width - margin * 2;
    const wrapped: string[] = [];
    for (const para of toWinAnsi(input.customerNote).split(/\r?\n/)) {
      if (!para.trim()) { wrapped.push(''); continue; }
      let line = '';
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, 10) > maxWidth && line) { wrapped.push(line); line = word; }
        else line = test;
      }
      if (line) wrapped.push(line);
    }
    /* Katkaistaan jos teksti ei mahdu: mieluummin lyhennetty tarjous kuin
       alalaidan yli valuva. 2000 merkin raja tekee tästä harvinaisen. */
    const MAX_LINES = 12;
    const shown = wrapped.slice(0, MAX_LINES);
    if (wrapped.length > MAX_LINES) shown[MAX_LINES - 1] = shown[MAX_LINES - 1].slice(0, 80) + '…';

    text('Terveisin:', margin, y, { font: bold, size: 10, color: BRAND_DARK });
    y -= 15;
    for (const l of shown) { text(l, margin, y, { size: 10 }); y -= 13; }
    y -= 12;
  }

  text(`Tarjous on voimassa ${fmtDate(validUntil)} asti. Hinnat sisältävät ALV 25,5 %.`, margin, y, { size: 10, color: GRAY });
  y -= 14;
  text('Työn osuudesta voi saada kotitalousvähennystä — osuus on eritelty yllä.', margin, y, { size: 9, color: GRAY });
  y -= 14;
  text('Hyväksy tarjous vastaamalla tähän sähköpostiin tai soittamalla 045 875 5996.', margin, y, { size: 9, color: GRAY });

  // footer — yrityksen viralliset tiedot
  page.drawLine({ start: { x: margin, y: 62 }, end: { x: width - margin, y: 62 }, thickness: 0.5, color: LIGHT_GRAY });
  text('TiivisKoti', margin, 48, { font: bold, size: 9, color: BRAND_DARK });
  text('Y-tunnus 3414418-4', width - margin - font.widthOfTextAtSize('Y-tunnus 3414418-4', 9), 48, { size: 9, color: GRAY });
  text('Järvipuistonkatu 5, 04400 Järvenpää', margin, 36, { size: 8, color: GRAY });
  text('info@tiiviskoti.fi · 045 875 5996 · tiiviskoti.fi', margin, 25, { size: 8, color: GRAY });

  return doc.save();
}
