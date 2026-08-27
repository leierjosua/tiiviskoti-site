#!/usr/bin/env node
/**
 * TiivisKoti — laskun PDF.
 *
 * MIKSI OMA: Holvin laskupohja on geneerinen ja lähettäjänä lukee "Josua
 * Leier". Asiakas on ostanut TiivisKodilta, saanut TiivisKodin tarjouksen ja
 * TiivisKodin kuitin — laskun pitää näyttää samalta. Tuntematon nimi laskussa
 * on myös maksamattomuuden syy: se näyttää huijaukselta.
 *
 * Sama ulkoasu kuin tarjouksessa ja kuitissa (tiiviskoti-crm/src/lib/
 * offer-pdf.ts, receipt-pdf.ts) — värit, logo, taulukko ja alatunniste.
 *
 * KÄYTTÖ
 *   node scripts/lasku-pdf.mjs lasku.json [ulos.pdf]
 *
 * JSON: ks. ESIMERKKI alla. Summat sentteinä, jotta pyöristys ei elä.
 */
/* pdf-lib löytyy CRM:n riippuvuuksista — skriptillä ei ole omaa
   package.jsonia, eikä sellaista kannata lisätä yhden kirjaston takia. */
const { PDFDocument, StandardFonts, rgb } = await import(
  new URL('../tiiviskoti-crm/node_modules/pdf-lib/cjs/index.js', import.meta.url).href
);
import { readFileSync, writeFileSync } from 'node:fs';

const BRAND_DARK = rgb(0.086, 0.227, 0.157);
const BRAND_GREEN = rgb(0.129, 0.478, 0.306);
const LIME_LIGHT = rgb(0.894, 0.941, 0.914);
const GRAY = rgb(0.533, 0.533, 0.533);
const LIGHT_GRAY = rgb(0.878, 0.878, 0.878);
const LOGO_URL = 'https://tiiviskoti.fi/img/logo-email.png';
const VAT_RATE = 0.255;

/* Myyjän tiedot yhdessä paikassa. HUOM: postinumero 04400 on Järvenpää —
   Holvin laskussa luki "04400 Espoo", mikä on virhe. */
const MYYJA = {
  nimi: 'TiivisKoti',
  yhtio: 'Josua Leier',
  ytunnus: '3414418-4',
  alvtunnus: 'FI34144184',
  osoite: 'Järvipuistonkatu 5',
  postitoimipaikka: '04400 Järvenpää',
  puhelin: '045 875 5996',
  email: 'info@tiiviskoti.fi',
  iban: 'FI05 7997 7996 5166 00',
  bic: 'HOLVIFIH',
};

const fmt = (c) => (c / 100).toFixed(2).replace('.', ',');
const pvm = (iso) => new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(iso));

/* Virtuaaliviivakoodi, versio 4 (54 merkkiä): 4 + IBAN ilman FI:tä (16) +
   eurot (6) + sentit (2) + varalla (3) + viite ilman RF:ää (20) + eräpäivä
   YYMMDD. Sama merkkijono jonka pankkisovellus lukee viivakoodista — se
   kelpaa myös näppäiltynä, joten viivakoodikuvaa ei tarvita. */
function virtuaaliviivakoodi({ iban, cents, viite, eräpäivä }) {
  const ib = iban.replace(/\s/g, '').replace(/^FI/, '');
  const eur = String(Math.floor(cents / 100)).padStart(6, '0');
  const snt = String(cents % 100).padStart(2, '0');
  const ref = viite.replace(/\D/g, '').padStart(20, '0');
  const d = new Date(eräpäivä);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `4${ib}${eur}${snt}000${ref}${yy}${mm}${dd}`;
}

export async function generateInvoicePdf(l) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  let y = height - margin;

  const t = (s, x, yy, o = {}) =>
    page.drawText(String(s), { x, y: yy, size: o.size ?? 10, font: o.font ?? font, color: o.color ?? BRAND_DARK });
  const oikealle = (s, f, size, rx) => rx - f.widthOfTextAtSize(String(s), size);
  const viiva = (x1, yy, x2, color = LIGHT_GRAY, paksuus = 0.5) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: paksuus, color });

  page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: BRAND_GREEN });

  try {
    const res = await fetch(LOGO_URL);
    const img = await doc.embedPng(new Uint8Array(await res.arrayBuffer()));
    const w = 150;
    page.drawImage(img, { x: margin, y: y - img.height * (w / img.width) + 12, width: w, height: img.height * (w / img.width) });
  } catch { /* ilman logoa jos haku ei onnistu */ }

  t('LASKU', width - margin - bold.widthOfTextAtSize('LASKU', 28), y - 20, { font: bold, size: 28 });
  y -= 62;

  const metaR = width - margin;
  const rivit = [
    ['Laskunumero:', l.laskunumero],
    ['Päiväys:', pvm(l.päiväys)],
    ['Eräpäivä:', pvm(l.eräpäivä)],
    ['Maksuehto:', l.maksuehto],
    ['Viivästyskorko:', l.viivästyskorko],
    ['Viitenumero:', l.viite],
  ];
  for (const [k, v] of rivit) {
    t(k, metaR - 200, y, { size: 9, color: GRAY });
    t(v, oikealle(v, bold, 9, metaR), y, { font: bold, size: 9 });
    y -= 15;
  }

  /* Asiakastiedot alkavat samalta korkeudelta kuin metatiedot. */
  let cy = height - margin - 62 + 8;
  t('LASKUTETAAN', margin, cy, { font: bold, size: 9, color: GRAY });
  t(l.asiakas.nimi, margin, cy - 16, { font: bold, size: 11 });
  let ly = cy - 32;
  for (const rivi of [l.asiakas.osoite, l.asiakas.postitoimipaikka].filter(Boolean)) { t(rivi, margin, ly, { size: 10 }); ly -= 14; }
  if (l.asiakas.email) t(l.asiakas.email, margin, ly, { size: 9, color: GRAY });

  y = Math.min(y, ly) - 24;
  viiva(margin, y, width - margin, BRAND_GREEN, 1);
  y -= 22;

  const c1 = margin, c2 = 320, c3 = 390, c4 = width - margin;
  page.drawRectangle({ x: margin, y: y - 6, width: width - margin * 2, height: 20, color: LIME_LIGHT });
  t('Selite', c1 + 4, y, { font: bold, size: 9 });
  t('Määrä', c2, y, { font: bold, size: 9 });
  t('á hinta', c3, y, { font: bold, size: 9 });
  t('Yhteensä', oikealle('Yhteensä', bold, 9, c4 - 4), y, { font: bold, size: 9 });
  y -= 8;
  viiva(margin, y, width - margin, BRAND_GREEN, 1.5);
  y -= 16;

  for (const r of l.rivit) {
    const summa = r.määrä * r.yksikköhintaCents;
    t(r.selite, c1, y, { size: 10 });
    t(String(r.määrä), c2 + 10, y, { size: 10 });
    t(`${fmt(r.yksikköhintaCents)} €`, c3, y, { size: 10 });
    const s = `${fmt(summa)} €`;
    t(s, oikealle(s, font, 10, c4), y, { size: 10 });
    y -= 20;
    if (r.lisätieto) { t(r.lisätieto, c1 + 8, y + 6, { size: 8.5, color: GRAY }); y -= 8; }
  }

  y -= 4;
  viiva(margin, y, width - margin);
  y -= 20;

  const yhteensa = l.rivit.reduce((s, r) => s + r.määrä * r.yksikköhintaCents, 0);
  const veroton = Math.round(yhteensa / (1 + VAT_RATE));
  const vero = yhteensa - veroton;
  const lx = 350, vx = c4;
  for (const [k, v] of [
    ['Veroton:', `${fmt(veroton)} €`],
    [`ALV ${String(VAT_RATE * 100).replace('.', ',')} %:`, `${fmt(vero)} €`],
    ...(l.työnOsuusCents ? [['Työn osuus (kotitalousvähennys):', `${fmt(l.työnOsuusCents)} €`]] : []),
  ]) {
    t(k, lx, y, { size: 10, color: GRAY });
    t(v, oikealle(v, font, 10, vx), y, { size: 10 });
    y -= 16;
  }
  y -= 4;
  viiva(lx - 10, y, width - margin, BRAND_GREEN, 1.5);
  y -= 26;

  page.drawRectangle({ x: lx - 14, y: y - 8, width: width - margin - (lx - 14) + 4, height: 30, color: BRAND_DARK });
  page.drawRectangle({ x: lx - 14, y: y - 8, width: 4, height: 30, color: BRAND_GREEN });
  t('MAKSETTAVAA:', lx, y, { font: bold, size: 12, color: rgb(1, 1, 1) });
  const gt = `${fmt(yhteensa)} €`;
  t(gt, oikealle(gt, bold, 12, vx), y, { font: bold, size: 12, color: rgb(1, 1, 1) });
  y -= 54;

  /* Maksutiedot omaan laatikkoonsa: tämä on se kohta jota asiakas etsii. */
  const bh = 118;   /* mahtuu viisi paria + viivakoodirivi ilman että se osuu reunaan */
  page.drawRectangle({ x: margin, y: y - bh + 14, width: width - margin * 2, height: bh, color: LIME_LIGHT });
  page.drawRectangle({ x: margin, y: y - bh + 14, width: 4, height: bh, color: BRAND_GREEN });
  t('MAKSUTIEDOT', margin + 16, y, { font: bold, size: 9, color: BRAND_GREEN });
  const parit = [
    ['Saaja', `${MYYJA.nimi} (${MYYJA.yhtio})`],
    ['IBAN', MYYJA.iban],
    ['BIC', MYYJA.bic],
    ['Viitenumero', l.viite],
    ['Eräpäivä', pvm(l.eräpäivä)],
  ];
  let py = y - 18;
  for (const [k, v] of parit) {
    t(k, margin + 16, py, { size: 9, color: GRAY });
    t(v, margin + 110, py, { font: bold, size: 9.5 });
    py -= 14;
  }
  const koodi = virtuaaliviivakoodi({ iban: MYYJA.iban, cents: yhteensa, viite: l.viite, eräpäivä: l.eräpäivä });
  t('Virtuaaliviivakoodi', margin + 16, py - 2, { size: 8, color: GRAY });
  t(koodi, margin + 110, py - 2, { size: 8, font: bold });
  y -= bh + 16;

  if (l.huomautus) { t(l.huomautus, margin, y, { size: 9, color: GRAY }); y -= 14; }
  t('Huomautukset laskusta 8 päivän kuluessa. Viivästyskorko ' + l.viivästyskorko + '.', margin, y, { size: 9, color: GRAY });

  viiva(margin, 62, width - margin);
  t(MYYJA.nimi, margin, 48, { font: bold, size: 9 });
  const yt = `Y-tunnus ${MYYJA.ytunnus} · ALV ${MYYJA.alvtunnus}`;
  t(yt, width - margin - font.widthOfTextAtSize(yt, 9), 48, { size: 9, color: GRAY });
  t(`${MYYJA.yhtio} · ${MYYJA.osoite}, ${MYYJA.postitoimipaikka}`, margin, 36, { size: 8, color: GRAY });
  t(`${MYYJA.email} · ${MYYJA.puhelin} · tiiviskoti.fi`, margin, 25, { size: 8, color: GRAY });

  return doc.save();
}

const [, , dataPath, outPath] = process.argv;
if (dataPath) {
  const data = JSON.parse(readFileSync(dataPath, 'utf8'));
  const pdf = await generateInvoicePdf(data);
  const out = outPath || `TiivisKoti-lasku-${data.laskunumero}.pdf`;
  writeFileSync(out, pdf);
  console.log(`✓ ${out} (${(pdf.length / 1024).toFixed(1)} kB)`);
}
