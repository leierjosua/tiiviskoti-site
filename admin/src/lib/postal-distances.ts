import postalData from "@/data/postal-coordinates.json";

interface Coords { lat: number; lng: number }

const coordMap = new Map<string, Coords>();
for (const e of postalData as { code: string; lat: number; lng: number }[]) {
  coordMap.set(e.code, { lat: e.lat, lng: e.lng });
}

const R = 6371;
function toRad(d: number) { return (d * Math.PI) / 180; }

function haversineKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2);
  const c = Math.sin(dLng / 2);
  const h = s * s + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * c * c;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function postalDistanceKm(a: string, b: string): number | null {
  const ca = coordMap.get(a);
  const cb = coordMap.get(b);
  if (!ca || !cb) return null;
  return haversineKm(ca, cb);
}

/** Return all postal codes within `radiusKm` of the given center postal code. */
export function postalCodesWithinRadius(center: string, radiusKm: number): string[] {
  const origin = coordMap.get(center);
  if (!origin) return [];
  const result: string[] = [];
  for (const [code, coords] of coordMap) {
    if (haversineKm(origin, coords) <= radiusKm) {
      result.push(code);
    }
  }
  return result.sort();
}
