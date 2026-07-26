import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCents(cents: number): string {
  return `${(cents / 100).toFixed(0)} €`;
}

/** Return the per-unit price in cents, respecting volume pricing tiers. */
export function getUnitPriceCents(
  service: { base_price_cents: number; volume_pricing?: { min_qty: number; price_cents: number }[] | null },
  qty: number,
): number {
  const tiers = (service.volume_pricing || [])
    .filter((t) => qty >= t.min_qty)
    .sort((a, b) => b.min_qty - a.min_qty);
  return tiers.length > 0 ? tiers[0].price_cents : service.base_price_cents;
}

/**
 * Return per-device {contract, regular} price for a contract duration tier at
 * the given device quantity. Falls back to the tier's base prices (qty=1) if
 * no volume step matches.
 */
export function getTierUnitPrices(
  tier: {
    contract_price_cents: number;
    regular_price_cents: number;
    volume_pricing?: { min_qty: number; contract_price_cents: number; regular_price_cents: number }[] | null;
  },
  qty: number,
): { contract_price_cents: number; regular_price_cents: number } {
  const steps = (tier.volume_pricing || [])
    .filter((s) => qty >= s.min_qty)
    .sort((a, b) => b.min_qty - a.min_qty);
  if (steps.length > 0) {
    return {
      contract_price_cents: steps[0].contract_price_cents,
      regular_price_cents: steps[0].regular_price_cents,
    };
  }
  return {
    contract_price_cents: tier.contract_price_cents,
    regular_price_cents: tier.regular_price_cents,
  };
}

export const FI_TZ = "Europe/Helsinki";

/** Current time interpreted as Finnish timezone */
export function finnishNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: FI_TZ }));
}

/** Today's date string YYYY-MM-DD in Finnish timezone */
export function finnishToday(): string {
  const d = finnishNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Start and end of a Finnish day as UTC ISO strings (for timestamptz queries). */
export function finnishDayRange(dateStr: string): { start: string; end: string } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: FI_TZ, timeZoneName: "shortOffset" });
  const offsetStr = fmt.formatToParts(new Date()).find((p) => p.type === "timeZoneName")!.value; // "GMT+3" or "GMT+2"
  const offsetHours = parseInt(offsetStr.replace("GMT", ""), 10);
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const tz = `${offsetHours >= 0 ? "+" : "-"}${pad(offsetHours)}:00`;
  return {
    start: `${dateStr}T00:00:00${tz}`,
    end: `${dateStr}T23:59:59.999${tz}`,
  };
}

export function formatDate(date: string): string {
  // Parse YYYY-MM-DD directly to avoid timezone issues
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // noon UTC avoids DST edge cases
  return dt.toLocaleDateString("fi-FI", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FI_TZ,
  });
}

// Mirrors quiet-hours rule in supabase/migrations/20260407000001_bulletproof_review_sms.sql:
// review SMS cron only fires Mon-Fri 09:00-19:59 Helsinki, otherwise rows stay pending.
function helsinkiParts(d: Date): { year: number; month: number; day: number; hour: number; isoDow: number } {
  const map: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", {
    timeZone: FI_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(d)) map[p.type] = p.value;
  const dow: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour === "24" ? "0" : map.hour, 10),
    isoDow: dow[map.weekday] ?? 1,
  };
}

function ymdHelsinki(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FI_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function describeReviewSmsSendTime(
  scheduledAtIso: string,
  now: Date = new Date(),
): { text: string; delayed: boolean } {
  const scheduledAt = new Date(scheduledAtIso);
  const evaluateAt = scheduledAt.getTime() > now.getTime() ? scheduledAt : now;
  const p = helsinkiParts(evaluateAt);
  const inActiveWindow = p.isoDow <= 5 && p.hour >= 9 && p.hour < 20;

  if (inActiveWindow) {
    const diffMin = Math.max(0, Math.ceil((scheduledAt.getTime() - now.getTime()) / 60_000));
    return {
      text: diffMin > 0 ? `${diffMin} min päästä` : "hetken päästä",
      delayed: false,
    };
  }

  let dayDate = evaluateAt;
  let dayParts = p;
  if (!(p.isoDow <= 5 && p.hour < 9)) {
    // Past 20:00 today or weekend — advance until next weekday
    do {
      dayDate = new Date(dayDate.getTime() + 24 * 60 * 60 * 1000);
      dayParts = helsinkiParts(dayDate);
    } while (dayParts.isoDow > 5);
  }

  const nowYmd = ymdHelsinki(now);
  const tomorrowYmd = ymdHelsinki(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const dayYmd = ymdHelsinki(dayDate);

  const weekdayEssive = ["maanantaina", "tiistaina", "keskiviikkona", "torstaina", "perjantaina", "lauantaina", "sunnuntaina"];
  let when: string;
  if (dayYmd === nowYmd) when = "tänään";
  else if (dayYmd === tomorrowYmd) when = "huomenna";
  else when = weekdayEssive[dayParts.isoDow - 1] ?? "myöhemmin";

  return { text: `${when} klo 9 jälkeen`, delayed: true };
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "Odottaa",
  confirmed: "Vahvistettu",
  completed: "Valmis",
  cancelled: "Peruutettu",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
};

export const PAYMENT_LABELS: Record<string, string> = {
  paid: "Maksettu",
  unpaid: "Ei maksettu",
};

export const PAYMENT_COLORS: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  unpaid: "bg-red-50 text-red-600 border border-red-200",
};

export const PLAN_LABELS: Record<string, string> = {
  pieni: "Pieni (alle 100 m²)",
  keski: "Keski (100–200 m²)",
  iso: "Iso (200–300 m²)",
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "Luonnos",
  pending_signature: "Odottaa allekirjoitusta",
  active: "Aktiivinen",
  expiring: "Päättymässä",
  expired: "Päättynyt",
  cancelled: "Peruutettu",
  renewed: "Uusittu",
};

export const CONTRACT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-50 text-gray-600 border border-gray-200",
  pending_signature: "bg-amber-50 text-amber-700 border border-amber-200",
  active: "bg-accent-muted text-accent-dark border border-accent/30",
  expiring: "bg-orange-50 text-orange-700 border border-orange-200",
  expired: "bg-red-50 text-red-600 border border-red-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
  renewed: "bg-blue-50 text-blue-700 border border-blue-200",
};

export const FREQUENCY_LABELS: Record<string, string> = {
  once_yearly: "1x / vuosi",
  twice_yearly: "2x / vuosi",
  custom: "Mukautettu",
};

export function intervalLabel(months: number): string {
  if (months === 1) return "Kuukausittain";
  if (months === 12) return "Kerran vuodessa";
  if (months === 24) return "2 vuoden välein";
  if (months % 12 === 0) return `${months / 12} vuoden välein`;
  return `${months} kk välein`;
}

export function billingLabel(months: number): string {
  if (months === 1) return "kk";
  if (months === 12) return "vuosi";
  if (months % 12 === 0) return `${months / 12} v`;
  return `${months} kk`;
}

export const VISIT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Aikataulutettu",
  booking_created: "Varaus luotu",
  completed: "Suoritettu",
  skipped: "Ohitettu",
  cancelled: "Peruutettu",
};

export const VISIT_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 border border-blue-200",
  booking_created: "bg-amber-50 text-amber-700 border border-amber-200",
  completed: "bg-accent-muted text-accent-dark border border-accent/30",
  skipped: "bg-gray-50 text-gray-600 border border-gray-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
};

export const MONTH_LABELS_FI = [
  "Tammi", "Helmi", "Maalis", "Huhti", "Touko", "Kesä",
  "Heinä", "Elo", "Syys", "Loka", "Marras", "Joulu",
];

export const MONTH_NAMES_FI = [
  "Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu",
  "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu",
];

export const MONTH_SHORT_FI = [
  "TAMMI", "HELMI", "MAALIS", "HUHTI", "TOUKO", "KESÄ",
  "HEINÄ", "ELO", "SYYS", "LOKA", "MARRAS", "JOULU",
];

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  website: "Verkkosivut",
  contact_form: "Yhteydenottolomake",
  referral: "Suosittelu",
  google: "Google",
  social: "Some",
  phone: "Puhelin",
  email: "Sähköposti",
  admin: "Admin",
  chatbot: "Chatbot",
  other: "Muu",
};

/** Download data as CSV file */
export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const bom = "\uFEFF"; // UTF-8 BOM for Excel compatibility
  const csv = [
    headers.join(";"),
    ...rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")),
  ].join("\n");
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const POSTAL_CITIES: Record<string, string> = {
  "00": "Helsinki", "01": "Vantaa", "02": "Espoo",
  "03": "Vihti", "04": "Järvenpää", "05": "Porvoo",
  "06": "Porvoo", "07": "Hyvinkää", "08": "Lohja", "09": "Lohja",
  "10": "Hanko", "11": "Riihimäki", "12": "Hyvinkää", "13": "Hämeenlinna",
  "14": "Hämeenlinna", "15": "Lahti", "16": "Lahti",
  "17": "Heinola", "18": "Heinola", "19": "Orimattila",
  "20": "Turku", "21": "Turku", "22": "Pori",
  "24": "Salo", "25": "Somero", "27": "Rauma", "28": "Pori",
  "29": "Rauma",
  "30": "Forssa", "32": "Loimaa", "33": "Tampere", "34": "Tampere",
  "35": "Nokia", "36": "Kangasala", "37": "Nokia",
  "38": "Sastamala", "39": "Parkano",
  "40": "Jyväskylä", "41": "Jyväskylä", "42": "Äänekoski",
  "43": "Saarijärvi", "44": "Viitasaari",
  "45": "Kouvola", "46": "Kouvola", "47": "Kouvola",
  "48": "Kotka", "49": "Hamina",
  "50": "Mikkeli", "51": "Mikkeli",
  "53": "Lappeenranta", "54": "Lappeenranta", "55": "Imatra",
  "56": "Imatra",
  "57": "Savonlinna", "58": "Savonlinna",
  "60": "Seinäjoki", "61": "Seinäjoki", "62": "Lapua",
  "63": "Kauhajoki", "65": "Vaasa", "66": "Vaasa",
  "67": "Kokkola", "68": "Kokkola",
  "70": "Kuopio", "71": "Kuopio", "72": "Siilinjärvi",
  "73": "Suonenjoki", "74": "Iisalmi", "75": "Iisalmi",
  "76": "Kiuruvesi", "77": "Varkaus", "78": "Varkaus",
  "79": "Leppävirta",
  "80": "Joensuu", "81": "Joensuu", "82": "Kitee",
  "83": "Lieksa",
  "85": "Pietarsaari", "86": "Ylivieska",
  "87": "Kajaani",
  "90": "Oulu", "91": "Oulu", "92": "Raahe",
  "93": "Pudasjärvi", "94": "Kuusamo",
  "95": "Tornio", "96": "Rovaniemi", "97": "Inari",
  "99": "Utsjoki",
};

// Official Posti place names: postal code → postitoimipaikka
import postalCitiesData from "@/data/postalCities.json";
const _postalCityMap: Record<string, string> = postalCitiesData;

/** Resolve city from full postal code (exact match from postalCities.json, prefix fallback) */
export function postalCity(code: string): string {
  if (!code) return "";
  return _postalCityMap[code] ?? POSTAL_CITIES[code.slice(0, 2)] ?? "";
}

/** Format address consistently: "Katuosoite, 02140 Espoo" */
export function formatAddress(address?: string | null, postalCode?: string | null, city?: string | null): string {
  const resolvedCity = city || (postalCode ? (_postalCityMap[postalCode] ?? POSTAL_CITIES[postalCode.slice(0, 2)] ?? "") : "");
  const postalPart = [postalCode, resolvedCity].filter(Boolean).join(" ");

  if (!address) return postalPart || "–";

  // If address already contains the postal code, don't append it again
  if (postalCode && address.includes(postalCode)) return address;

  return postalPart ? `${address}, ${postalPart}` : address;
}

/** Map postal codes to unique city/municipality names */
export function postalCodesToCities(codes: string[]): string[] {
  const cities = new Set<string>();
  for (const code of codes) {
    const city = _postalCityMap[code] ?? POSTAL_CITIES[code.slice(0, 2)];
    if (city) cities.add(city);
  }
  return [...cities].sort();
}
