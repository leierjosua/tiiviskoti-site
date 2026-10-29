import { z } from 'zod';

/* =========================================================
   Kartoituslomake — kysymykset ja tallennusmuoto.

   Paperisen "Kartoituslomake A4":n sisältö CRM:ssä. Erillään palvelin-
   koodista, jotta selainkomponentti ja testit voivat käyttää samoja
   vaihtoehtoja.

   Kohteiden MÄÄRÄT eivät ole tässä vapaana tekstinä vaan hinnaston
   (pricing.ts) kappalemäärinä: niistä lasketaan tarjouksen hinta samalla
   tavalla kuin Tarjoukset-näkymässä. Lomake lisää niihin vain materiaalin
   ja huomion.

   Paperilomakkeesta poikkeavat kohdat (tarkoituksella):
   - "Ikkunoiden ja ovien käynnin säätö" → vain ovet säätövaran puitteissa
     (Josua 19.10.2026: ikkunoita ei säädetä).
   - "2 vuoden takuu" -lause puuttuu: takuuta ei käytetä myyntikärkenä
     tarjouksissa (25.8.2026).
   ========================================================= */

export const TALOTYYPIT = {
  omakoti: 'Omakotitalo', pari_rivi: 'Pari- / rivitalo', kerrostalo: 'Kerrostalo', muu: 'Muu',
} as const;

export const MATERIAALIT = ['Puu', 'Puualumiini', 'Alumiini', 'Teräs', 'Muovi'] as const;

export const HAVAINNOT = {
  veto: 'Vetoa tai ilmavuotoja',
  kovettuneet: 'Tiivisteet kovettuneet tai irronneet',
  ei_sulkeudu: 'Ikkuna tai ovi ei sulkeudu kunnolla',
  jaykat: 'Saranat tai lukot jäykät',
  huurtuminen: 'Huurtumista lasien välissä',
  kynnyskumi: 'Kynnyskumi kulunut',
  vauriot: 'Puitteissa tai karmeissa vaurioita',
  maalattu: 'Tiivisteiden päälle maalattu',
} as const;
export type HavaintoKey = keyof typeof HAVAINNOT;

/** Kuvapaikat — samat kuin asiakkaan kohdetietokyselyssä (survey-schema.ts)
 *  ja ohjeet samat kuin varausvahvistuksessa (mail-templates.ts). */
export const KARTOITUS_PHOTO_SLOTS = {
  ikkuna_sisa: ['Ikkuna sisältä', 'avaa ikkuna niin, että puitteet ja karmi näkyvät'],
  ikkuna_tiiviste: ['Lähikuva tiivisteestä', 'nykyinen tiiviste karmin tai puitteen reunassa'],
  ikkuna_ulko: ['Ikkuna ulkoa', 'koko ikkuna talon ulkopuolelta'],
  ovi_sisa: ['Ovi sisältä', 'avaa ovi niin, että karmi ja tiiviste näkyvät'],
  ovi_tiiviste: ['Lähikuva oven tiivisteestä', 'nykyinen tiiviste karmin tai oven reunassa'],
  ovi_ulko: ['Ovi ulkoa', 'koko ovi talon ulkopuolelta'],
} as const;
export type KartoitusPhotoSlot = keyof typeof KARTOITUS_PHOTO_SLOTS;

/** Kohteet joille kirjataan materiaali ja huomio. Avain = pricing.ts TYPES[].id. */
export const KOHDE_IDS = ['ikkuna', 'parveke', 'ulko', 'terassi', 'vali', 'kynnys'] as const;

const kohde = z.object({
  materiaali: z.string().max(40).optional(),
  huomio: z.string().max(300).optional(),
}).strip();

export const kartoitusSchema = z.object({
  customerKind: z.enum(['asiakas', 'taloyhtio']).default('asiakas'),
  customerName: z.string().trim().min(1, 'Asiakkaan nimi puuttuu').max(200),
  contactName: z.string().trim().max(200).optional(),
  email: z.string().trim().email('Tarkista sähköposti'),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().regex(/^\d{5}$/, 'Postinumero on 5 numeroa').or(z.literal('')),
  city: z.string().trim().max(80).optional(),

  talotyyppi: z.enum(Object.keys(TALOTYYPIT) as [keyof typeof TALOTYYPIT]).optional(),
  rakennusvuosi: z.string().trim().max(10).optional(),
  kerroksia: z.string().trim().max(10).optional(),
  huoneistoja: z.string().trim().max(20).optional(),

  /** Hinnaston kappalemäärät: TYPES[].id ja extra_<id> (kpl-lisätyöt). */
  counts: z.record(z.string().max(40), z.number().int().min(0).max(999)).default({}),
  /** Kyllä/ei-lisätyöt (esim. akryylisaumaus). */
  extras: z.record(z.string().max(40), z.boolean()).default({}),
  kohteet: z.record(z.string().max(20), kohde).default({}),
  ikkunaPuitteet: z.enum(['2', '3']).optional(),

  havainnot: z.array(z.string()).max(20).default([])
    .transform((a) => a.filter((h): h is HavaintoKey => h in HAVAINNOT)),
  inclusions: z.array(z.string().trim().max(140)).max(20).default([]),

  /** Vapaa alennus euroina, näkyy omana rivinään. */
  alennus: z.number().min(0).max(100000).default(0),
  kestoH: z.string().trim().max(10).optional(),
  ehdotettuAika: z.string().trim().max(80).optional(),
  /** Näkyy asiakkaalle tarjouksessa. */
  lisatiedot: z.string().trim().max(1500).optional(),
  /** Vain toimistolle. */
  sisainen: z.string().trim().max(2000).optional(),

  /** Kuvat: kuvapaikka → Storage-polku (`kartoitus/<id>/…`). Polut
   *  tarkistetaan palvelimella kuuluviksi tälle kartoitukselle. */
  photos: z.record(z.string().max(30), z.string().max(300)).default({})
    .transform((o) => Object.fromEntries(Object.entries(o).filter(([k]) => k in KARTOITUS_PHOTO_SLOTS))),
  /** Muut kuvat vapaassa järjestyksessä. */
  extraPhotos: z.array(z.string().max(300)).max(40).default([]),
});
export type KartoitusData = z.infer<typeof kartoitusSchema>;

/**
 * Tarjouksen saateteksti kartoituksesta: havainnot, kesto, ehdotettu aika
 * ja lisätiedot. Menee tarjouksen `customer_note`-kenttään, joten se näkyy
 * PDF:ssä, sähköpostissa ja hyväksymissivulla ilman uutta kenttää.
 */
export function kartoitusNote(d: KartoitusData): string | null {
  const parts: string[] = [];
  if (d.havainnot.length) parts.push(`Kartoituksen havainnot: ${d.havainnot.map((h) => HAVAINNOT[h].toLowerCase()).join(', ')}.`);
  const kohteet = Object.entries(d.kohteet)
    .filter(([, k]) => k.materiaali || k.huomio)
    .map(([id, k]) => `${KOHDE_NIMI[id] ?? id}: ${[k.materiaali, k.huomio].filter(Boolean).join(', ')}`);
  if (kohteet.length) parts.push(kohteet.join('\n'));
  if (d.ikkunaPuitteet) parts.push(`Ikkunoissa ${d.ikkunaPuitteet} puitetta.`);
  const aika = [d.kestoH ? `Arvioitu kesto noin ${d.kestoH} h.` : '', d.ehdotettuAika ? `Ehdotettu aika: ${d.ehdotettuAika}.` : '']
    .filter(Boolean).join(' ');
  if (aika) parts.push(aika);
  if (d.lisatiedot) parts.push(d.lisatiedot);
  return parts.length ? parts.join('\n\n').slice(0, 2000) : null;
}

const KOHDE_NIMI: Record<string, string> = {
  ikkuna: 'Ikkunat', parveke: 'Parvekeovet', ulko: 'Ulko-ovet', terassi: 'Liuku- ja pariovet', vali: 'Väliovet', kynnys: 'Kynnykset',
};
