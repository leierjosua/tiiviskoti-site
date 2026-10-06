import { linesFromDb } from './completion';

/* =========================================================
   Työraportti — paperilomakkeen "Työraportti A4" sähköinen vastine.

   Ei 'server-only': velhon selainkomponentti ja server action käyttävät
   SAMAA tarkistusta. Jos sääntö olisi kahdessa paikassa, nappi voisi
   näyttää valmiilta ja palvelin hylätä — tai päinvastoin.

   PAKOLLISUUS ON KOKO IDEA. Jokainen 11 työvaiheesta on kuitattava joko
   "Tehty" tai "Ei tarpeen". Tyhjä rivi ei tarkoita "ei tarpeen" vaan
   "en katsonut", ja juuri sen eron paperilomake teki näkyväksi.

   Avaimet ovat pysyviä tunnisteita kannan jsonb-kentässä (`steps`).
   Tekstiä saa muuttaa, avainta ei: vanhat raportit luetaan avaimella.
   ========================================================= */

export const WORK_STEPS = [
  { key: 'old_removed',    label: 'Vanhat tiivisteet poistettu' },
  { key: 'grooves_clean',  label: 'Urat puhdistettu' },
  { key: 'profile_chosen', label: 'Urat mitattu ja profiili valittu (T101 / T104)' },
  { key: 'new_installed',  label: 'Uudet tiivisteet asennettu silikonimassalla' },
  { key: 'gaps_acrylic',   label: 'Karmin yli 1 mm raot tiivistetty akryylimassalla' },
  { key: 'adjusted',       label: 'Ikkunat ja ovet säädetty' },
  { key: 'hinges_oiled',   label: 'Saranat puhdistettu, kiristetty ja öljytty' },
  { key: 'locks_oiled',    label: 'Lukot ja salvat puhdistettu, kiristetty ja öljytty' },
  { key: 'closing_checked', label: 'Sulkeutuminen ja tiiviys tarkistettu jokaisesta kohteesta' },
  { key: 'area_cleaned',   label: 'Työalue siivottu ja roskat viety' },
  { key: 'drying_told',    label: 'Asiakkaalle kerrottu kuivumisaika (n. 30 min)' },
] as const;

export type StepKey = (typeof WORK_STEPS)[number]['key'];
export type StepAnswer = 'done' | 'na';
export type StepAnswers = Partial<Record<StepKey, StepAnswer>>;

export const STEP_KEYS: StepKey[] = WORK_STEPS.map((s) => s.key);

export type WorkReport = {
  workDate: string;        // YYYY-MM-DD
  installers: string;
  customerName: string;
  customerPhone: string;
  address: string;
  unit: string;            // rappu / huoneisto
  startedAt: string;       // HH:MM
  finishedAt: string;      // HH:MM
  travelHours: string;     // vapaa teksti, pilkku tai piste; tyhjä = ei kirjattu
  windows: number;
  balconyDoors: number;
  otherDoors: number;
  steps: StepAnswers;
  sealantM: string;
  siliconePcs: string;
  acrylicPcs: string;
  notes: string;
  customerAckName: string;
};

/** Työvaiheet joihin ei ole vastattu, lomakkeen järjestyksessä. */
export function missingSteps(steps: StepAnswers | null | undefined) {
  return WORK_STEPS.filter((s) => {
    const v = steps?.[s.key];
    return v !== 'done' && v !== 'na';
  });
}

export const answeredCount = (steps: StepAnswers | null | undefined) =>
  WORK_STEPS.length - missingSteps(steps).length;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** '1,5' → 1.5. Tyhjä → null. Kelvoton → NaN (tarkistus kertoo siitä). */
export function decimalOf(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Kaikki raportin puutteet ihmisen kielellä. Tyhjä lista = raportti kelpaa.
 *
 * Palauttaa listan eikä ensimmäistä virhettä: puhelimella on parempi
 * nähdä kerralla mitä puuttuu kuin korjata yksi ja törmätä seuraavaan.
 */
export function reportProblems(r: WorkReport): string[] {
  const out: string[] = [];
  const missing = missingSteps(r.steps);
  if (missing.length > 0) {
    out.push(`Merkitse jokainen työvaihe (puuttuu ${missing.length}): ${missing.map((s) => s.label).join('; ')}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.workDate)) out.push('Päivämäärä puuttuu.');
  if (!r.installers.trim()) out.push('Asentaja(t) puuttuu.');
  if (!TIME.test(r.startedAt)) out.push('Aloitusaika puuttuu.');
  if (!TIME.test(r.finishedAt)) out.push('Lopetusaika puuttuu.');
  if (TIME.test(r.startedAt) && TIME.test(r.finishedAt) && r.finishedAt <= r.startedAt) {
    out.push('Lopetusajan pitää olla aloitusajan jälkeen.');
  }
  for (const [label, n] of [
    ['Ikkunat', r.windows], ['Parvekeovet', r.balconyDoors], ['Ulko-/muut ovet', r.otherDoors],
  ] as const) {
    if (!Number.isInteger(n) || n < 0 || n > 999) out.push(`${label}: anna kappalemäärä 0–999.`);
  }
  const travel = decimalOf(r.travelHours);
  if (travel !== null && (Number.isNaN(travel) || travel < 0 || travel > 24)) {
    out.push('Matka-aika: anna tunnit numerona, esim. 1,5.');
  }
  const sealant = decimalOf(r.sealantM);
  if (sealant !== null && (Number.isNaN(sealant) || sealant < 0 || sealant > 10000)) {
    out.push('Tiivistettä: anna metrit numerona.');
  }
  for (const [label, v] of [['Silikonia', r.siliconePcs], ['Akryyliä', r.acrylicPcs]] as const) {
    const n = decimalOf(v);
    if (n !== null && (Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > 999)) {
      out.push(`${label}: anna kappalemäärä kokonaislukuna.`);
    }
  }
  if (!r.customerAckName.trim()) out.push('Asiakkaan kuittaus: kirjoita asiakkaan nimi.');
  return out;
}

/**
 * Kohteiden kappalemäärät työn riveiltä esitäytöksi.
 *
 * Rivit tunnistetaan hinnaston tunnuksella (`linesFromDb`), ja jos rivi on
 * vapaata tekstiä, nimestä samoin säännöin kuin `jobUnitCounts`
 * (data.ts): ikkuna vain nimen alusta (aukipitolaite "/ 2 per ikkuna" ei
 * ole ikkuna), vain veloitetut rivit, ja ilmainen kohde vain jos saman
 * lajin veloitettua riviä ei ole (alennusrivi veloitetulle kohteelle).
 *
 * Liuku- tai pariovi (`terassi`) lasketaan "muihin oviin": lomakkeen
 * parvekeovisarake on hinnaston Parvekeovi. Asentaja voi korjata luvun.
 */
export function unitsFromLines(
  rows: { name: string; quantity: number; unit_price_cents: number }[],
): { windows: number; balconyDoors: number; otherDoors: number } {
  const lines = linesFromDb(rows);
  const paid = { windows: 0, balconyDoors: 0, otherDoors: 0 };
  const free = { windows: 0, balconyDoors: 0, otherDoors: 0 };

  const kindOf = (catalogId: string | null, name: string): keyof typeof paid | null => {
    if (catalogId === 'type:ikkuna') return 'windows';
    if (catalogId === 'type:parveke') return 'balconyDoors';
    if (catalogId && /^type:(ulko|terassi|vali|kynnys)$/.test(catalogId)) return 'otherDoors';
    if (catalogId) return null; // lisäpalvelu
    const n = name.toLowerCase();
    if (/parveke/.test(n)) return 'balconyDoors';
    if (/^\s*ikkuna/.test(n) || (/ilmain/.test(n) && /ikkuna/.test(n))) return 'windows';
    if (/(ovi|kynnys)/.test(n)) return 'otherDoors';
    return null;
  };

  for (const l of lines) {
    const kind = kindOf(l.catalogId, l.name);
    if (!kind) continue;
    if (l.unitPriceCents > 0) paid[kind] += l.quantity;
    else if (/ilmain/i.test(l.name)) free[kind] += l.quantity;
  }
  return {
    windows: paid.windows || free.windows,
    balconyDoors: paid.balconyDoors || free.balconyDoors,
    otherDoors: paid.otherDoors || free.otherDoors,
  };
}
