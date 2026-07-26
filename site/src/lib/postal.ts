/**
 * Postal code → city & region lookup.
 *
 * Uses the comprehensive postalCodes.json (region → municipality → codes)
 * so we never need to manually maintain prefix mappings again.
 */

import postalCodesData from "@/data/postalCodes.json";
import postalCitiesData from "@/data/postalCities.json";

/* ── Build lookup maps at module load (once) ── */

interface RegionEntry {
  region: string;
  municipalities: { name: string; codes: string[] }[];
}

const _cityMap: Record<string, string> = postalCitiesData; // "17150" → "Urajärvi"
const _regionMap = new Map<string, string>();  // "02140" → "Uusimaa"

for (const entry of postalCodesData as RegionEntry[]) {
  for (const muni of entry.municipalities) {
    for (const code of muni.codes) {
      _regionMap.set(code, entry.region);
    }
  }
}

/* ── Public API ── */

/** Palauttaa postitoimipaikan postinumerosta */
export function postalCity(code: string): string {
  return _cityMap[code] || "";
}

/**
 * Normalisoi postitoimipaikan kunnan nimeksi.
 * Postidatassa on jaotteluja kuten "Siuntio Kk" (kirkonkylä), "Inkoo As"
 * (rautatieasema), "Hanko Pohjoinen" — käytännössä sama kunta. Listoissa
 * ja kaupunkisivuilla ne pitää yhdistää, jottei näytä duplikaateilta.
 */
const CITY_SUFFIX_RE = / (kk|as|asema|mlk|pohjoinen|eteläinen|itäinen|läntinen)$/i;

export function normalizeCity(city: string): string {
  if (!city) return city;
  return city.replace(CITY_SUFFIX_RE, "").trim();
}

/** Palauttaa maakunnan postinumerosta */
export function postalRegion(code: string): string {
  return _regionMap.get(code) || "";
}

/** Maakuntien genetiivimuodot (esim. "Uusimaa" → "Uudenmaan") */
export const REGION_GENITIVE: Record<string, string> = {
  "Uusimaa": "Uudenmaan",
  "Pirkanmaa": "Pirkanmaan",
  "Päijät-Häme": "Päijät-Hämeen",
  "Kanta-Häme": "Kanta-Hämeen",
  "Varsinais-Suomi": "Varsinais-Suomen",
  "Satakunta": "Satakunnan",
  "Keski-Suomi": "Keski-Suomen",
  "Kymenlaakso": "Kymenlaakson",
  "Etelä-Karjala": "Etelä-Karjalan",
  "Etelä-Savo": "Etelä-Savon",
  "Pohjois-Savo": "Pohjois-Savon",
  "Pohjois-Karjala": "Pohjois-Karjalan",
  "Etelä-Pohjanmaa": "Etelä-Pohjanmaan",
  "Pohjanmaa": "Pohjanmaan",
  "Keski-Pohjanmaa": "Keski-Pohjanmaan",
  "Pohjois-Pohjanmaa": "Pohjois-Pohjanmaan",
  "Kainuu": "Kainuun",
  "Lappi": "Lapin",
};

/** Maakuntien näyttöjärjestys */
export const REGION_ORDER = [
  "Uusimaa", "Pirkanmaa", "Päijät-Häme", "Kanta-Häme",
  "Varsinais-Suomi", "Satakunta", "Keski-Suomi",
  "Kymenlaakso", "Etelä-Karjala", "Etelä-Savo",
  "Pohjois-Savo", "Pohjois-Karjala",
  "Etelä-Pohjanmaa", "Pohjanmaa", "Keski-Pohjanmaa",
  "Pohjois-Pohjanmaa", "Kainuu", "Lappi",
];
