/* Soiton tulokset. Oma moduuli, koska 'use server' -tiedosto saa viedä
   vain async-funktioita, ja sivu tarvitsee nimet myös näyttämiseen. */
export const CALL_RESULTS = {
  no_answer: 'ei vastannut',
  thinking: 'vastasi, miettii vielä',
  declined: 'ei kiinnosta',
} as const;
export type CallResult = keyof typeof CALL_RESULTS;
