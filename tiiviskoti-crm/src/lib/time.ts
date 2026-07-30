/* =========================================================
   Aikavyöhykeapurit.

   Kaikki tallennetaan kantaan UTC:nä (`timestamptz`). Suomen aika on
   olemassa vain kahdessa kohdassa: kun viikkoaikataulun kellonaika
   ("ma 08:00") muutetaan todelliseksi hetkeksi, ja kun hetki näytetään
   käyttäjälle. Siksi nämä funktiot ovat täällä eivätkä hajallaan.

   Ei aikavyöhykekirjastoa: Intl osaa tämän, ja kesäajan siirtymä on
   ainoa vaikea kohta — se on testattu tests/availability.test.ts:ssä.
   ========================================================= */

export const TZ = 'Europe/Helsinki';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsIn(date: Date): Parts {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    // Intl antaa keskiyöksi joko "00" tai "24" alustasta riippuen.
    hour: +p.hour % 24,
    minute: +p.minute,
    second: +p.second,
  };
}

/** Vyöhykkeen siirtymä millisekunteina annetulla hetkellä (kesäaika mukaan lukien). */
function offsetAt(date: Date): number {
  const p = partsIn(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Suomen seinäkellonaika → todellinen hetki.
 *
 * Kaksivaiheinen, koska siirtymä riippuu itse hetkestä: ensin arvataan
 * siirtymä UTC-tulkinnalla, sitten korjataan arvauksen kohdalla todella
 * voimassa olevalla siirtymällä.
 */
export function helsinkiToInstant(
  year: number, month: number, day: number, hour: number, minute: number,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = offsetAt(new Date(guess));
  let ts = guess - off1;
  const off2 = offsetAt(new Date(ts));
  if (off2 !== off1) ts = guess - off2;
  return new Date(ts);
}

/** 'YYYY-MM-DD' + 'HH:MM' Suomen aikaa → hetki. */
export function helsinkiDateTime(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return helsinkiToInstant(y, m, d, hh, mm);
}

/** Hetki → 'YYYY-MM-DD' Suomen aikaa. */
export function dateKeyOf(date: Date): string {
  const p = partsIn(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Hetki → 'HH:MM' Suomen aikaa. */
export function timeOf(date: Date): string {
  const p = partsIn(date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** ISO-viikonpäivä 1=ma … 7=su, Suomen aikaa. */
export function isoWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=su
  return dow === 0 ? 7 : dow;
}

/** Päiväavain n päivää eteenpäin. Kalenteripäivää siirretään UTC-keskipäivän
 *  kautta, jottei kesäaika koskaan hyppää päivän yli. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai', 'sunnuntai'];
const WEEKDAYS_SHORT = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'];

export const weekdayName = (iso: number) => WEEKDAYS[iso - 1] ?? '';
export const weekdayShort = (iso: number) => WEEKDAYS_SHORT[iso - 1] ?? '';

/** 'YYYY-MM-DD' → '7.1.2030' */
export function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${d}.${m}.${y}`;
}

/** Hetki → 'ma 7.1. klo 8.00' */
export function formatInstant(date: Date): string {
  const key = dateKeyOf(date);
  const [, m, d] = key.split('-').map(Number);
  return `${weekdayShort(isoWeekday(key))} ${d}.${m}. klo ${timeOf(date).replace(':', '.')}`;
}

export const todayKey = (now: Date = new Date()) => dateKeyOf(now);
