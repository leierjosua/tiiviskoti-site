import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { WORK_STEPS, type StepAnswers } from './work-report';

/* =========================================================
   Työraportti-PDF — sama asettelu kuin paperilomake "Työraportti A4".

   Koordinaatit on mitattu lomakkeen kuvasta (924 × 1308 px) ja muunnetaan
   pisteiksi kertoimella S. Siksi luvut alla ovat "lomakkeen pikseleitä":
   kun paperilomake muuttuu, mitat voi lukea suoraan uudesta kuvasta.

   Helvetica (WinAnsi) riittää: ä, ö, – ja · ovat siinä. Rasti piirretään
   viivoina, koska ✓ ei ole WinAnsi-merkki.
   ========================================================= */

const W = 595.28;
const H = 841.89;
const S = W / 924;

const DARK = rgb(0.086, 0.227, 0.157);       // #163A28
const GREEN = rgb(0.129, 0.478, 0.306);      // #217A4E
const ICON = rgb(0.2, 0.46, 0.32);
const PALE = rgb(0.894, 0.941, 0.914);       // #E4F0E9
const TEXT = rgb(0.13, 0.17, 0.15);
const GRAY = rgb(0.45, 0.48, 0.46);
const RULE = rgb(0.82, 0.85, 0.83);
const WHITE = rgb(1, 1, 1);
const SOFT_WHITE = rgb(0.82, 0.9, 0.85);

export type JobReportPdfInput = {
  jobNumber: string;
  workDate: string;            // YYYY-MM-DD
  installers: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  unit: string | null;
  startedAt: string;
  finishedAt: string;
  travelHours: string;         // valmiiksi muotoiltu, '' = tyhjä
  windows: number;
  balconyDoors: number;
  otherDoors: number;
  steps: StepAnswers;
  sealantM: string;
  siliconePcs: string;
  acrylicPcs: string;
  notes: string | null;
  customerAckName: string;
  recordedBy: string | null;
  recordedAt: Date;
};

const fiDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return y && m && d ? `${d}.${m}.${y}` : key;
};

/** Teksti mahtumaan leveyteen: ensin pienennetään, sitten lyhennetään. */
function fit(s: string, font: PDFFont, size: number, maxW: number, minSize = 7): { text: string; size: number } {
  let sz = size;
  while (sz > minSize && font.widthOfTextAtSize(s, sz) > maxW) sz -= 0.5;
  if (font.widthOfTextAtSize(s, sz) <= maxW) return { text: s, size: sz };
  let t = s;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, sz) > maxW) t = t.slice(0, -1);
  return { text: `${t}…`, size: sz };
}

/** Rivitys sanoittain leveyteen. Käyttäjän rivinvaihdot säilyvät. */
function wrap(s: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of s.split(/\r?\n/)) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxW) { cur = next; continue; }
      if (cur) out.push(cur);
      cur = word;
    }
    out.push(cur);
  }
  return out;
}

/** WinAnsi ei tunne kaikkea mitä puhelimen näppäimistö tuottaa (emoji,
 *  erikoislainausmerkit). Tuntematon merkki kaataisi koko PDF:n, joten
 *  ne vaihdetaan lähimpään tai pudotetaan. */
function safe(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, '–')
    .replace(/[^\n\x20-\x7E -ÿ–…€]/g, '');
}

export async function generateJobReportPdf(r: JobReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Työraportti ${r.jobNumber}`);
  doc.setAuthor('Tiiviskoti Oy');
  const page: PDFPage = doc.addPage([W, H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  /* px → pt. y lasketaan lomakkeen yläreunasta alaspäin. */
  const X = (px: number) => px * S;
  const Y = (px: number) => H - px * S;

  const text = (s: string, xPx: number, yPx: number, o: { f?: PDFFont; size?: number; color?: RGB } = {}) =>
    page.drawText(safe(s), { x: X(xPx), y: Y(yPx), size: o.size ?? 9.5, font: o.f ?? font, color: o.color ?? TEXT });
  const rightText = (s: string, rxPx: number, yPx: number, o: { f?: PDFFont; size?: number; color?: RGB } = {}) => {
    const f = o.f ?? font; const size = o.size ?? 9.5;
    page.drawText(safe(s), { x: X(rxPx) - f.widthOfTextAtSize(safe(s), size), y: Y(yPx), size, font: f, color: o.color ?? TEXT });
  };
  const hline = (x1: number, x2: number, yPx: number, color: RGB = DARK, thickness = 0.6) =>
    page.drawLine({ start: { x: X(x1), y: Y(yPx) }, end: { x: X(x2), y: Y(yPx) }, thickness, color });
  const rect = (xPx: number, yTopPx: number, wPx: number, hPx: number, color: RGB) =>
    page.drawRectangle({ x: X(xPx), y: Y(yTopPx + hPx), width: wPx * S, height: hPx * S, color });
  const roundRect = (xPx: number, yTopPx: number, wPx: number, hPx: number, rPx: number, color: RGB) => {
    const w = wPx, h = hPx, rr = rPx;
    const path = `M ${rr} 0 H ${w - rr} Q ${w} 0 ${w} ${rr} V ${h - rr} Q ${w} ${h} ${w - rr} ${h} `
      + `H ${rr} Q 0 ${h} 0 ${h - rr} V ${rr} Q 0 0 ${rr} 0 Z`;
    page.drawSvgPath(path, { x: X(xPx), y: Y(yTopPx), scale: S, color });
  };

  /** Lomakkeen kenttä: lihavoitu nimi, arvo alleviivauksen päällä. */
  const field = (label: string, value: string, xPx: number, lineEndPx: number, yPx: number) => {
    text(label, xPx, yPx, { f: bold, size: 9.5, color: DARK });
    const start = xPx + bold.widthOfTextAtSize(label, 9.5) / S + 10;
    hline(start, lineEndPx, yPx + 7);
    if (value) {
      const v = fit(safe(value), font, 10, (lineEndPx - start - 6) * S);
      page.drawText(v.text, { x: X(start + 4), y: Y(yPx) + 1, size: v.size, font, color: TEXT });
    }
  };

  /* --- yläpalkki ---------------------------------------------------- */
  rect(0, 0, 924, 120, DARK);
  rect(0, 120, 924, 8, GREEN);
  roundRect(56, 36, 48, 48, 9, ICON);
  // ovi-ikoni: kaksi sisäkkäistä kehystä
  page.drawRectangle({ x: X(68), y: Y(76), width: 24 * S, height: 32 * S, borderColor: WHITE, borderWidth: 1.4 });
  page.drawLine({ start: { x: X(75), y: Y(48) }, end: { x: X(75), y: Y(72) }, thickness: 1.2, color: WHITE });
  text('Tiiviskoti', 121, 70, { f: bold, size: 18.5, color: WHITE });
  rightText('TYÖRAPORTTI', 866, 64, { f: bold, size: 21, color: WHITE });
  rightText('TIIVISTEIDEN VAIHTO', 866, 88, { size: 8, color: SOFT_WHITE });
  rightText(`Työ ${r.jobNumber}`, 866, 108, { size: 7.5, color: SOFT_WHITE });

  /* --- perustiedot --------------------------------------------------- */
  const L = 56, MID = 443, R2 = 481, RE = 868;
  field('Päivämäärä:', fiDate(r.workDate), L, MID, 170);
  field('Asentaja(t):', r.installers, R2, RE, 170);
  field('Asiakas / taloyhtiö:', r.customerName ?? '', L, MID, 209);
  field('Puhelin:', r.customerPhone ?? '', R2, RE, 209);
  field('Osoite:', r.address ?? '', L, MID, 247);
  field('Rappu / huoneisto:', r.unit ?? '', R2, RE, 247);
  field('Aloitus klo:', r.startedAt, L, 241, 285);
  field('Lopetus klo:', r.finishedAt, 250, MID, 285);
  field('Matka-aika (h):', r.travelHours, R2, RE, 285);

  /* --- kohteet ------------------------------------------------------- */
  roundRect(56, 313, 812, 58, 14, PALE);
  text('KOHTEET', 79, 348, { f: bold, size: 9.5, color: GREEN });
  const kpl = (label: string, n: number, xPx: number, lineFrom: number, lineTo: number) => {
    text(label, xPx, 349, { f: bold, size: 9.5, color: TEXT });
    hline(lineFrom, lineTo, 355);
    const s = String(n);
    page.drawText(s, {
      x: X((lineFrom + lineTo) / 2) - bold.widthOfTextAtSize(s, 10.5) / 2, y: Y(349) + 1,
      size: 10.5, font: bold, color: TEXT,
    });
    text('kpl', lineTo + 6, 349, { size: 9.5, color: GRAY });
  };
  kpl('Ikkunat', r.windows, 208, 273, 325);
  kpl('Parvekeovet', r.balconyDoors, 400, 504, 555);
  kpl('Ulko-/muut ovet', r.otherDoors, 631, 766, 817);

  /* --- työvaiheet ---------------------------------------------------- */
  const COL_DONE = 742, COL_NA = 824; // ruutujen keskikohdat
  text('TYÖVAIHE', 56, 427, { f: bold, size: 8.5, color: GREEN });
  rightText('TEHTY', COL_DONE + 25, 427, { f: bold, size: 8.5, color: GREEN });
  text('EI', COL_NA - 7, 407, { f: bold, size: 8.5, color: GREEN });
  text('TARPEEN', COL_NA - 36, 427, { f: bold, size: 8.5, color: GREEN });
  hline(56, 868, 440, GREEN, 1.2);

  const box = (cxPx: number, cyPx: number, checked: boolean) => {
    const size = 20 * S;
    page.drawRectangle({
      x: X(cxPx) - size / 2, y: Y(cyPx) - size / 2, width: size, height: size,
      borderColor: DARK, borderWidth: 0.9, color: checked ? PALE : undefined,
    });
    if (checked) {
      const ox = X(cxPx), oy = Y(cyPx);
      page.drawLine({ start: { x: ox - 4.6, y: oy + 0.2 }, end: { x: ox - 1.4, y: oy - 3.4 }, thickness: 1.8, color: GREEN });
      page.drawLine({ start: { x: ox - 1.4, y: oy - 3.4 }, end: { x: ox + 4.8, y: oy + 4 }, thickness: 1.8, color: GREEN });
    }
  };

  const ROW0 = 459, ROW_H = 37.3;
  WORK_STEPS.forEach((s, i) => {
    const cy = ROW0 + i * ROW_H;
    text(s.label, 56, cy + 4, { size: 10, color: TEXT });
    box(COL_DONE, cy, r.steps[s.key] === 'done');
    box(COL_NA, cy, r.steps[s.key] === 'na');
    hline(56, 868, cy + ROW_H / 2, RULE, 0.5);
  });

  /* --- materiaalit --------------------------------------------------- */
  const MY = 887;
  text('MATERIAALIT', 56, MY, { f: bold, size: 8.5, color: GREEN });
  const mat = (label: string, value: string, xPx: number, from: number, to: number, unit: string) => {
    text(label, xPx, MY, { f: bold, size: 9.5, color: TEXT });
    hline(from, to, MY + 6);
    if (value) {
      page.drawText(safe(value), {
        x: X((from + to) / 2) - font.widthOfTextAtSize(safe(value), 10) / 2, y: Y(MY) + 1,
        size: 10, font, color: TEXT,
      });
    }
    text(unit, to + 8, MY, { size: 9.5, color: GRAY });
  };
  mat('Tiivistettä', r.sealantM, 187, 272, 380, 'm');
  mat('Silikonia', r.siliconePcs, 428, 500, 608, 'kpl');
  mat('Akryyliä', r.acrylicPcs, 664, 732, 840, 'kpl');

  /* --- huomiot -------------------------------------------------------- */
  text('HUOMIOT / LISÄTYÖT', 56, 927, { f: bold, size: 8.5, color: GREEN });
  const noteLines = r.notes ? wrap(safe(r.notes), font, 10, (868 - 60) * S) : [];
  /* Paperilla on kolme viivaa; pidempi teksti jatkuu samalla välillä
     allekirjoitusten yläpuolelle asti (enintään 6 riviä). */
  const NOTE_ROWS = Math.max(3, Math.min(6, noteLines.length));
  for (let i = 0; i < NOTE_ROWS; i += 1) {
    const ly = 966 + i * 34;
    hline(56, 868, ly, DARK, 0.6);
    const ln = noteLines[i];
    if (ln) page.drawText(i === NOTE_ROWS - 1 && noteLines.length > NOTE_ROWS ? `${ln}…` : ln,
      { x: X(58), y: Y(ly - 7), size: 10, font, color: TEXT });
  }

  /* --- allekirjoitukset ------------------------------------------------ */
  hline(56, 438, 1198, DARK, 0.6);
  hline(486, 868, 1198, DARK, 0.6);
  {
    const a = fit(safe(r.installers), font, 10.5, (438 - 60) * S);
    page.drawText(a.text, { x: X(58), y: Y(1188), size: a.size, font, color: TEXT });
    const c = fit(safe(r.customerAckName), font, 10.5, (868 - 490) * S);
    page.drawText(c.text, { x: X(488), y: Y(1188), size: c.size, font, color: TEXT });
  }
  text('Asentajan allekirjoitus', 56, 1220, { f: bold, size: 9, color: DARK });
  text('Asiakkaan kuittaus ja nimenselvennys', 486, 1220, { f: bold, size: 9, color: DARK });
  const stamp = new Intl.DateTimeFormat('fi-FI', {
    timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(r.recordedAt);
  text(`Kirjattu sähköisesti TiivisKoti CRM:ssä ${stamp}${r.recordedBy ? ` · ${r.recordedBy}` : ''}`,
    56, 1238, { size: 7, color: GRAY });

  /* --- alapalkki ------------------------------------------------------ */
  rect(0, 1250, 924, 58, DARK);
  text('Tiiviskoti Oy · Y-tunnus 3652671-7', 56, 1284, { size: 9, color: WHITE });
  const phone = '045 875 5996';
  page.drawText(phone, { x: W / 2 - font.widthOfTextAtSize(phone, 9) / 2, y: Y(1284), size: 9, font, color: WHITE });
  rightText('info@tiiviskoti.fi', 868, 1284, { size: 9, color: WHITE });

  return doc.save();
}
