/* =========================================================
   Google Adsin offline-konversiotuonnin CSV-muoto.

   Omassa tiedostossaan, koska sekä sivu että latausreitti tarvitsevat
   konversiotapahtuman nimen — ja jos se ei täsmää Adsin tapahtuman nimeen
   merkilleen, lataus menee läpi mutta konversioita ei kirjaudu yhtään.
   ========================================================= */

/** Täsmää Ads-tilin konversiotapahtuman nimeen. Jos nimi muuttuu Adsissa, muuta tässä. */
export const CONVERSION_NAME = 'Varaus verkosta';

export type ConversionRow = {
  gclid: string;
  created_at: Date;
  price_cents: number;
};

/* Aikaleima UTC:na ja nimenomainen +00:00-siirtymä.

   Google hyväksyy joko tiedoston alussa annetun `Parameters:TimeZone=`-rivin
   tai rivikohtaisen siirtymän. Rivikohtainen on turvallisempi: se ei riipu
   siitä mitä aikavyöhykettä Ads-tilillä sattuu olemaan, eikä kesäajan vaihdos
   voi siirtää konversiota tunnilla väärään suuntaan. */
function adsTime(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace('T', ' ')}+00:00`;
}

/* Kenttien lainaus. gclid ja valuutta ovat aina turvallisia merkkejä, mutta
   konversion nimi on ihmisen kirjoittama ja voi sisältää pilkun. */
function q(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toAdsCsv(rows: ConversionRow[]): string {
  const head = [
    'Google Click ID',
    'Conversion Name',
    'Conversion Time',
    'Conversion Value',
    'Conversion Currency',
  ].join(',');

  const body = rows.map((r) => [
    q(r.gclid),
    q(CONVERSION_NAME),
    adsTime(r.created_at),
    /* Piste desimaalierottimena — Ads odottaa englanninkielistä muotoa,
       ei suomalaista pilkkua, joka rikkoisi myös CSV:n sarakejaon. */
    (r.price_cents / 100).toFixed(2),
    'EUR',
  ].join(','));

  /* CRLF ja lopun rivinvaihto: Google lukee tiedoston Excel-tyylisenä
     CSV:nä ja jättää viimeisen rivin huomiotta ilman päättävää vaihtoa. */
  return [head, ...body].join('\r\n') + '\r\n';
}
