import { z } from 'zod';

/* =========================================================
   Kohdetietokyselyn kysymykset ja vastausten muoto.

   Erillään survey.ts:stä, jotta tätä voi käyttää testeissä ja
   selainkomponentissa ilman `server-only`-tuontia.

   PIDÄ SYNKASSA: tiiviskoti/kohdetiedot.html kirjoittaa samat avaimet ja
   arvot. Sivusto on staattinen eikä voi tuoda tätä tiedostoa, joten
   kysymykset ovat kahdessa paikassa. Tuntematon avain tai arvo pudotetaan
   tallennuksessa hiljaa (ks. parseAnswers) — vanha välilehti ei kaada
   tallennusta, mutta uusi kysymys pitää lisätä tänne ennen kuin se
   tallentuu.
   ========================================================= */

/** Kuvapaikat. Avain = vastausten `photos`-kentän avain. */
export const PHOTO_SLOTS = {
  ikkuna_sisa: 'Ikkuna sisältä, puitteet auki',
  ikkuna_tiiviste: 'Ikkunan tiiviste lähikuvana',
  ikkuna_ulko: 'Ikkuna ulkoa',
  ovi_sisa: 'Ovi sisältä, auki',
  ovi_tiiviste: 'Oven tiiviste lähikuvana',
  ovi_ulko: 'Ovi ulkoa',
} as const;
export type PhotoSlot = keyof typeof PHOTO_SLOTS;
export const isPhotoSlot = (s: unknown): s is PhotoSlot =>
  typeof s === 'string' && Object.prototype.hasOwnProperty.call(PHOTO_SLOTS, s);

/** Valintakysymykset: avain → [kysymys, { arvo: selite }]. Järjestys = näyttöjärjestys CRM:ssä. */
export const CHOICES = {
  ikkuna_puitteet: ['Puitteita ikkunassa', { '2': '2 puitetta', '3': '3 puitetta', en_tieda: 'Ei tiedä' }],
  ikkuna_tiivistetaan: ['Tiivistettävät puitteet', {
    '1': 'Vain sisin (1)', '1-2': 'Kaksi puitetta (1 ja 2) — perushinta',
    '1-2-3': 'Kaikki kolme (1, 2 ja ulko 3) — LISÄTYÖ +20 €/ikkuna', en_tieda: 'Katsotaan paikan päällä',
  }],
  ikkuna_ura: ['Ura ikkunan karmissa', { kylla: 'Kyllä', ei: 'Ei', en_tieda: 'Ei tiedä' }],
  aukeavat: ['Aukeavatko ikkunat', { kaikki: 'Kaikki aukeavat', osa_jumissa: 'Osa jumissa / maalattu kiinni', en_tieda: 'Ei tiedä' }],
  saleet: ['Sälekaihtimet lasien välissä', { kylla: 'Kyllä', ei: 'Ei' }],
  ovi_puitteet: ['Puitteita ovessa', { '1': '1 puite', '2': '2 puitetta', en_tieda: 'Ei tiedä' }],
  ovi_ura: ['Ura oven karmissa', { kylla: 'Kyllä', ei: 'Ei', en_tieda: 'Ei tiedä' }],
} as const satisfies Record<string, readonly [string, Record<string, string>]>;

export const PROBLEMS = {
  veto: 'Vetoa', huurtuminen: 'Huurtuu', vihellys: 'Viheltää / humisee',
  melu: 'Melu kuuluu sisään', jaykka: 'Jäykkä tai ei sulkeudu kunnolla', muu: 'Muu',
} as const;

export const TEXTS = {
  saapuminen: 'Paikalle tulo (ovikoodi, pysäköinti, lemmikit)',
  lisatiedot: 'Muuta kerrottavaa',
} as const;

const choice = <T extends Record<string, string>>(opts: T) =>
  z.enum(Object.keys(opts) as [keyof T & string, ...(keyof T & string)[]]);

const schema = z.object({
  ...Object.fromEntries(
    Object.entries(CHOICES).map(([k, [, opts]]) => [k, choice(opts).optional().catch(undefined)]),
  ),
  ongelmat: z.array(z.string()).max(10).optional().catch(undefined)
    .transform((a) => a?.filter((v): v is keyof typeof PROBLEMS => v in PROBLEMS)),
  saapuminen: z.string().max(500).optional().catch(undefined),
  lisatiedot: z.string().max(2000).optional().catch(undefined),
}).strip();

export type SurveyAnswers = {
  [K in keyof typeof CHOICES]?: keyof (typeof CHOICES)[K][1];
} & {
  ongelmat?: (keyof typeof PROBLEMS)[];
  saapuminen?: string;
  lisatiedot?: string;
  /** Kuvapaikka → polku ämpärissä. Palvelin kirjoittaa, ei selain. */
  photos?: Partial<Record<PhotoSlot, string>>;
};

/**
 * Selaimen lähettämät vastaukset talteen kelpaavaan muotoon.
 *
 * Kelvoton arvo pudotetaan eikä koko tallennusta hylätä: kysely
 * välitallentuu kesken täytön, ja yksi outo kenttä vanhasta välilehdestä
 * ei saa hukata muita vastauksia. `photos` ei tule selaimelta koskaan.
 */
export function parseAnswers(input: unknown): Omit<SurveyAnswers, 'photos'> {
  const r = schema.safeParse(input && typeof input === 'object' ? input : {});
  if (!r.success) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r.data)) {
    if (v === undefined) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out as Omit<SurveyAnswers, 'photos'>;
}

/** Vastaukset luettavina riveinä CRM:n työn sivulle. */
export function answerRows(a: SurveyAnswers): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const [k, [label, opts]] of Object.entries(CHOICES)) {
    const v = (a as Record<string, string | undefined>)[k];
    if (v) rows.push({ label, value: (opts as Record<string, string>)[v] ?? v });
  }
  if (a.ongelmat?.length) rows.push({ label: 'Ongelmat', value: a.ongelmat.map((p) => PROBLEMS[p]).join(', ') });
  for (const [k, label] of Object.entries(TEXTS)) {
    const v = (a as Record<string, string | undefined>)[k];
    if (v) rows.push({ label, value: v });
  }
  return rows;
}
