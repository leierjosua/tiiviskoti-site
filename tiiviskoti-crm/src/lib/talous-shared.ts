/* =========================================================
   Talousnäkymän kulukategoriat ja asetusten muoto.

   Ei 'server-only': kuluvalikko piirretään selaimessa (asetusten
   lomake on client-komponentti), ja sama lista ratkaisee palvelimella
   mikä kategoria on olemassa. Yksi lista molemmille — muuten valikossa
   voisi olla arvo jota kanta ei hyväksy.

   Laskenta ja kyselyt ovat lib/talous.ts:ssä, joka on palvelinpuolinen.
   ========================================================= */

export type Category = 'tekija' | 'markkinointi' | 'laite' | 'komissio' | 'kiinteat' | 'provisio';

export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: 'tekija',       label: 'Tekijäkulut',          hint: 'Asentajien palkat ja palkkiot' },
  { id: 'markkinointi', label: 'Markkinointi',         hint: 'Mainoskulut (Meta, Google, muut)' },
  { id: 'laite',        label: 'Laitekustannukset',    hint: 'Tiivisteet, työkalut, auto, tarvikkeet' },
  { id: 'komissio',     label: 'Myyntikomissiot',      hint: 'Myyjän osuus kaupasta' },
  { id: 'kiinteat',     label: 'Kiinteät kulut',       hint: 'Vuokra, vakuutukset, ohjelmistot, kirjanpito' },
  { id: 'provisio',     label: 'Markkinointiprovisio', hint: 'Mainostoimiston tai kumppanin osuus' },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export const categoryLabel = (id: string): string =>
  CATEGORIES.find((c) => c.id === id)?.label ?? id;

export function isCategory(v: string): v is Category {
  return (CATEGORY_IDS as string[]).includes(v);
}

/** Kuluprosentit peruspisteinä (4000 = 40,00 %) ja kiinteät kulut sentteinä. */
export type CostSettings = {
  vatBp: number;
  tekijaBp: number;
  laiteBp: number;
  komissioBp: number;
  provisioBp: number;
  kiinteatCentsMonth: number;
  metaAuto: boolean;
};

export const DEFAULT_SETTINGS: CostSettings = {
  vatBp: 2550,
  tekijaBp: 0,
  laiteBp: 0,
  komissioBp: 0,
  provisioBp: 0,
  kiinteatCentsMonth: 0,
  metaAuto: true,
};
