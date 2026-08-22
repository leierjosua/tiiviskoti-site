/* =========================================================
   Näkymä: toimisto vai asennus.

   Sama henkilö katsoo samaa dataa kahdesta eri kulmasta. Toimisto haluaa
   tilannekuvan koko yrityksestä; asentaja haluaa tietää mitä hän tekee
   tänään ja missä. Ne eivät ole eri sivuja vaan eri näkymiä samaan
   sivuun — muuten kumpikin näkymä tarvitsisi oman reitin, oman navin ja
   oman linkin joka paikkaan.

   MIKSI EVÄSTE EIKÄ URL-PARAMETRI: näkymä on käyttäjän asetus, ei sivun
   tila. Parametri katoaisi joka linkistä ja pitäisi kuljettaa mukana
   jokaisessa hrefissä (kalenterissa niitä on tusina).

   Tässä tiedostossa ei ole palvelinkoodia, koska näkymän vaihtaja on
   selainkomponentti ja tarvitsee nimet. Evästeen luku on session.ts:ssä.
   ========================================================= */

export type ViewMode = 'toimisto' | 'asennus';

export const VIEW_COOKIE = 'tk_view';

export const VIEW_LABELS: Record<ViewMode, string> = {
  toimisto: 'Toimisto',
  asennus: 'Asennus',
};

/**
 * Näkymä roolista ja evästeestä.
 *
 * Asentajalle näkymä ei ole valinta: hänellä ei ole pääsyä toimiston
 * tietoihin, joten evästettä ei edes lueta.
 */
export function resolveView(role: string, cookieValue: string | undefined): ViewMode {
  if (role === 'installer') return 'asennus';
  return cookieValue === 'asennus' ? 'asennus' : 'toimisto';
}
