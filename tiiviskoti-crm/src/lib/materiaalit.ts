/**
 * Keikalle pakattavan materiaalin arvio kappalemääristä.
 *
 * Kertoimet ovat asentajien kokemusluvut, eivät mittauksia. Patruunat
 * pyöristetään ylöspäin kokonaisiksi, koska vajaata patruunaa ei voi ottaa
 * mukaan, ja ikkunoiden ja ovien osuudet lasketaan yhteen ENNEN pyöristystä,
 * jottei pieni keikka saa kahta patruunaa yhden sijaan.
 */
export const TIIVISTE_M_PER_IKKUNA = 7;
export const TIIVISTE_M_PER_OVI = 8;
export const IKKUNAA_PER_PATRUUNA = 10;
export const OVEA_PER_PATRUUNA = 8;

export function materialNeed(u: { ikkunat: number; ovet: number }) {
  return {
    tiivisteMetrit: u.ikkunat * TIIVISTE_M_PER_IKKUNA + u.ovet * TIIVISTE_M_PER_OVI,
    /* Yhteisellä nimittäjällä, ettei liukuluku tee tasaluvusta seuraavaa. */
    patruunat: Math.ceil(
      (u.ikkunat * OVEA_PER_PATRUUNA + u.ovet * IKKUNAA_PER_PATRUUNA)
        / (IKKUNAA_PER_PATRUUNA * OVEA_PER_PATRUUNA),
    ),
  };
}

/** "56 m tiivistettä · n. 2 patruunaa massaa" tai null, jos kohteita ei ole. */
export function materialLabel(u: { ikkunat: number; ovet: number } | undefined): string | null {
  if (!u || u.ikkunat + u.ovet <= 0) return null;
  const { tiivisteMetrit, patruunat } = materialNeed(u);
  return `${tiivisteMetrit} m tiivistettä · n. ${patruunat} ${patruunat === 1 ? 'patruuna' : 'patruunaa'} massaa`;
}
