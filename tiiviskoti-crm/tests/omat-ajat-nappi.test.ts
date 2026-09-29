import { test, expect } from 'vitest';
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { freeSlots, type WeeklyHour, type CalendarException, type Interval } from '../src/lib/availability';
import { addDays, dateKeyOf, todayKey } from '../src/lib/time';

/* Simuloi "Voin tehda toita" -napin vaikutus KIRJOITTAMATTA mitaan:
   lisataan poikkeus muistiin ja katsotaan syntyyko varattavia aikoja.
   Sama testi ilman kellonaikoja todistaa miksi ne ovat pakolliset. */
const envT = new URL('../.env.local', import.meta.url);
const aja = existsSync(envT) ? test : test.skip;

aja('nappi tuottaa varattavia aikoja, ja kellonajaton rivi ei', async () => {
  const env = Object.fromEntries(readFileSync(envT, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
  const sql = postgres(env.DATABASE_URL || env.POSTGRES_URL, { ssl: 'require', max: 2 });

  const [c] = await sql<{ id: string; staff_name: string; slot_minutes: number; lead_time_hours: number; horizon_days: number }[]>`
    select c.id, s.full_name as staff_name, c.slot_minutes, c.lead_time_hours, c.horizon_days
      from tk.calendars c join tk.staff s on s.id = c.staff_id
     where c.name not ilike '%kartoitus%' order by s.full_name limit 1`;

  const hourRows = await sql<{ weekday: number; start_time: string; end_time: string }[]>`
    select weekday, to_char(start_time,'HH24:MI') start_time, to_char(end_time,'HH24:MI') end_time
      from tk.calendar_hours where calendar_id = ${c.id}`;
  const excRows = await sql<{ date: string; kind: 'open'|'closed'; start_time: string|null; end_time: string|null }[]>`
    select to_char(date,'YYYY-MM-DD') date, kind, to_char(start_time,'HH24:MI') start_time,
           to_char(end_time,'HH24:MI') end_time
      from tk.calendar_exceptions where calendar_id = ${c.id} and date >= current_date - 1`;
  const busyRows = await sql<{ starts_at: Date; ends_at: Date }[]>`
    select starts_at, ends_at from tk.jobs where calendar_id = ${c.id}
     and status <> 'cancelled' and ends_at > now()`;

  const hours: WeeklyHour[] = hourRows.map((h) => ({ weekday: h.weekday, startTime: h.start_time, endTime: h.end_time }));
  const pohja: CalendarException[] = excRows.map((e) => ({ date: e.date, kind: e.kind, startTime: e.start_time, endTime: e.end_time }));
  const busy: Interval[] = busyRows.map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }));
  const now = new Date();
  const asetus = { slotMinutes: c.slot_minutes, leadTimeHours: c.lead_time_hours, horizonDays: c.horizon_days };
  const laske = (exceptions: CalendarException[]) => freeSlots({
    hours, exceptions, busy, durationMinutes: 60, now,
    until: new Date(Date.now() + 30 * 86_400_000), settings: asetus });

  /* Valitaan paiva jolla ei nyt ole mitaan: ei poikkeusta eika viikkoaikaa. */
  const vapaaPaiva = Array.from({ length: 25 }, (_, i) => addDays(todayKey(), i + 3))
    .find((d) => !pohja.some((e) => e.date === d) && !laske(pohja).some((s) => dateKeyOf(s.start) === d));
  expect(vapaaPaiva, 'testipaivaa ei loytynyt').toBeTruthy();

  const ennen = laske(pohja).filter((s) => dateKeyOf(s.start) === vapaaPaiva!).length;
  const kellonajoilla = laske([...pohja, { date: vapaaPaiva!, kind: 'open', startTime: '08:00', endTime: '16:00' }])
    .filter((s) => dateKeyOf(s.start) === vapaaPaiva!).length;
  const ilman = laske([...pohja, { date: vapaaPaiva!, kind: 'open', startTime: null, endTime: null }])
    .filter((s) => dateKeyOf(s.start) === vapaaPaiva!).length;
  const poissa = laske([...pohja, { date: vapaaPaiva!, kind: 'closed', startTime: null, endTime: null }])
    .filter((s) => dateKeyOf(s.start) === vapaaPaiva!).length;

  console.log(`kalenteri: ${c.staff_name}, testipaiva ${vapaaPaiva}`);
  console.log(`  ennen mitaan               ${ennen} vapaata aikaa`);
  console.log(`  "Voin tehda toita" 08-16   ${kellonajoilla} vapaata aikaa`);
  console.log(`  sama ILMAN kellonaikoja    ${ilman} vapaata aikaa  <- siksi ne ovat pakolliset`);
  console.log(`  "En voi"                   ${poissa} vapaata aikaa`);

  await sql.end();
  expect(ennen).toBe(0);
  expect(kellonajoilla).toBeGreaterThan(0);   // nappi toimii
  expect(ilman).toBe(0);                      // kellonajaton rivi on hyodyton
  expect(poissa).toBe(0);                     // poissaolo sulkee paivan
}, 120_000);
