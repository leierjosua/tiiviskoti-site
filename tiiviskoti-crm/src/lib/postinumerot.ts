import data from '@/data/postinumerot.json';

/* Suomen postinumerot ja niiden sijainti (Paavo, Tilastokeskus).
   Rakennetaan: node scripts/rakenna-postinumerot.mjs

   Ei 'server-only': sama laskenta ajetaan kartalla selaimessa (esikatselu)
   ja palvelimella tallennettaessa. Palvelin laskee listan aina itse — lomakkeen
   lähettämään listaan ei luoteta. */

export type Postinumero = {
  code: string; name: string; kunta: string;
  lat: number; lon: number; asukkaat: number;
};

type Raw = [string, string, string, number, number, number];

export const POSTINUMEROT: Postinumero[] = (data as Raw[]).map(
  ([code, name, kunta, lat, lon, asukkaat]) => ({ code, name, kunta, lat, lon, asukkaat }),
);

const BY_CODE = new Map(POSTINUMEROT.map((p) => [p.code, p]));

export function postinumero(code: string): Postinumero | undefined {
  return BY_CODE.get(code);
}

/** Linnuntie km. Tieetäisyys on tyypillisesti 1,2–1,4 × tämä. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export type RadiusResult = {
  center: Postinumero;
  /** Säteen sisällä, poissuljetut mukana. Lähimmästä kauimpaan. */
  within: (Postinumero & { km: number })[];
  /** Alueeseen kuuluvat = within miinus poissuljetut. */
  included: string[];
  /** Poissuljetut jotka ovat yhä säteen sisällä (muut ovat merkityksettömiä). */
  excluded: string[];
  asukkaat: number;
};

/** Säteen postinumerot. null jos keskipostinumeroa ei ole. */
export function postalsWithin(centerCode: string, radiusKm: number, excluded: Iterable<string> = []): RadiusResult | null {
  const center = BY_CODE.get(centerCode);
  if (!center || !(radiusKm > 0)) return null;
  const ex = new Set(excluded);
  const within = POSTINUMEROT
    .map((p) => ({ ...p, km: distanceKm(center, p) }))
    .filter((p) => p.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
  // Keskipistettä ei voi sulkea pois — alue ilman omaa keskustaansa on virhe.
  const isExcluded = (code: string) => ex.has(code) && code !== centerCode;
  const included = within.filter((p) => !isExcluded(p.code));
  return {
    center,
    within,
    included: included.map((p) => p.code),
    excluded: within.filter((p) => isExcluded(p.code)).map((p) => p.code),
    asukkaat: included.reduce((sum, p) => sum + p.asukkaat, 0),
  };
}
