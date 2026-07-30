/* =========================================================
   Vapaiden aikojen laskenta.

   Puhdas funktio: ei tietokantayhteyttä eikä `new Date()`-kutsuja, joten
   sen voi testata suoraan (tests/availability.test.ts). Kaikki päivämäärät
   sisään ja ulos ovat todellisia hetkiä; Suomen aikaa käytetään vain
   viikkoaikataulun laajentamiseen.
   ========================================================= */

import { addDays, dateKeyOf, helsinkiDateTime, isoWeekday } from './time';

export type WeeklyHour = {
  weekday: number;      // 1=ma … 7=su
  startTime: string;    // 'HH:MM'
  endTime: string;      // 'HH:MM'
};

export type CalendarException = {
  date: string;                 // 'YYYY-MM-DD'
  kind: 'closed' | 'open';
  startTime: string | null;     // null = koko päivä
  endTime: string | null;
};

export type Interval = { start: Date; end: Date };

export type CalendarSettings = {
  slotMinutes: number;
  leadTimeHours: number;
  horizonDays: number;
};

export type FreeSlotsInput = {
  hours: WeeklyHour[];
  exceptions: CalendarException[];
  /** Varatut jaksot: olemassa olevat työt ja voimassa olevat hold-varaukset. */
  busy: Interval[];
  durationMinutes: number;
  now: Date;
  /** Kuinka pitkälle asiakas haluaa katsoa. Rajataan aina horizon_days:llä. */
  until: Date;
  settings: CalendarSettings;
};

const MIN = 60_000;

/* ---------- aikavälialgebra ---------- */

function normalize(intervals: Interval[]): Interval[] {
  const valid = intervals.filter((i) => i.end > i.start);
  valid.sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const iv of valid) {
    const last = out[out.length - 1];
    // Peräkkäiset ja limittäiset jaksot yhdistetään, jotta 08–12 ja 12–16
    // tuottavat myös klo 11.30 alkavan kahden tunnin ajan.
    if (last && iv.start.getTime() <= last.end.getTime()) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      out.push({ start: new Date(iv.start), end: new Date(iv.end) });
    }
  }
  return out;
}

function subtract(base: Interval[], cuts: Interval[]): Interval[] {
  let result = normalize(base);
  for (const cut of normalize(cuts)) {
    const next: Interval[] = [];
    for (const iv of result) {
      if (cut.end <= iv.start || cut.start >= iv.end) { next.push(iv); continue; }
      if (cut.start > iv.start) next.push({ start: iv.start, end: cut.start });
      if (cut.end < iv.end) next.push({ start: cut.end, end: iv.end });
    }
    result = next;
  }
  return result;
}

function clamp(intervals: Interval[], min: Date, max: Date): Interval[] {
  const out: Interval[] = [];
  for (const iv of intervals) {
    const start = iv.start < min ? min : iv.start;
    const end = iv.end > max ? max : iv.end;
    if (end > start) out.push({ start, end });
  }
  return out;
}

/* ---------- päivän työaika ---------- */

/**
 * Yhden kalenteripäivän työaika: viikkoaikataulu, josta on poistettu
 * `closed`-poikkeukset ja johon on lisätty `open`-poikkeukset.
 *
 * Koko päivän `closed` nollaa viikkoaikataulun, mutta ei estä saman
 * päivän `open`-poikkeusta — niin saa merkittyä "loma, mutta tulen
 * kuitenkin klo 14–16".
 */
export function workingIntervalsForDay(
  dateKey: string,
  hours: WeeklyHour[],
  exceptions: CalendarException[],
): Interval[] {
  const dayExceptions = exceptions.filter((e) => e.date === dateKey);
  const weekday = isoWeekday(dateKey);

  const closedAllDay = dayExceptions.some(
    (e) => e.kind === 'closed' && e.startTime === null,
  );

  let base: Interval[] = closedAllDay
    ? []
    : hours
        .filter((h) => h.weekday === weekday)
        .map((h) => ({
          start: helsinkiDateTime(dateKey, h.startTime),
          end: helsinkiDateTime(dateKey, h.endTime),
        }));

  const partialClosed = dayExceptions
    .filter((e) => e.kind === 'closed' && e.startTime !== null && e.endTime !== null)
    .map((e) => ({
      start: helsinkiDateTime(dateKey, e.startTime as string),
      end: helsinkiDateTime(dateKey, e.endTime as string),
    }));
  base = subtract(base, partialClosed);

  const opened = dayExceptions
    .filter((e) => e.kind === 'open' && e.startTime !== null && e.endTime !== null)
    .map((e) => ({
      start: helsinkiDateTime(dateKey, e.startTime as string),
      end: helsinkiDateTime(dateKey, e.endTime as string),
    }));

  return normalize([...base, ...opened]);
}

/* ---------- vapaat ajat ---------- */

export function freeSlots(input: FreeSlotsInput): Interval[] {
  const { hours, exceptions, busy, durationMinutes, now, until, settings } = input;
  if (durationMinutes <= 0) return [];

  const earliest = new Date(now.getTime() + settings.leadTimeHours * 60 * MIN);
  const horizonEnd = helsinkiDateTime(
    addDays(dateKeyOf(now), settings.horizonDays + 1), '00:00',
  );
  const latest = until < horizonEnd ? until : horizonEnd;
  if (latest <= earliest) return [];

  // Käydään päivät läpi Suomen kalenterin mukaan. Aloitetaan päivää
  // aikaisemmasta, koska yli keskiyön jatkuva työvuoro kuuluu edelliselle
  // päivälle.
  const firstDay = addDays(dateKeyOf(earliest), -1);
  const lastDay = dateKeyOf(latest);

  const slots: Interval[] = [];
  const step = settings.slotMinutes * MIN;
  const duration = durationMinutes * MIN;

  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const working = workingIntervalsForDay(day, hours, exceptions);
    if (working.length === 0) continue;

    const open = clamp(subtract(working, busy), earliest, latest);

    for (const iv of open) {
      // Alkuajat asetellaan työvuoron alusta slot_minutes-välein, ei
      // "nyt"-hetkestä — muuten tarjotut ajat olisivat eri joka latauksella.
      for (let t = iv.start.getTime(); t + duration <= iv.end.getTime(); t += step) {
        slots.push({ start: new Date(t), end: new Date(t + duration) });
      }
    }
  }

  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return slots;
}
