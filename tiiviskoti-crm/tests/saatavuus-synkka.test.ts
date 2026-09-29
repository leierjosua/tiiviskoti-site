import { test, expect } from 'vitest';
import { existsSync } from 'node:fs';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { freeSlots, type WeeklyHour, type CalendarException, type Interval } from '../src/lib/availability';
import { addDays, dateKeyOf, isoWeekday, todayKey } from '../src/lib/time';

/* =========================================================
   Sanooko varauskalenteri samaa kuin saatavuusnäkymä?

   /omat-ajat ja /saatavuus piirtävät päivän tilan omalla logiikallaan
   (lib/saatavuus.ts), kun taas varattavat ajat lasketaan kokonaan eri
   funktiolla (lib/availability.ts). Ne LUKEVAT saman datan mutta eivät
   jaa koodia, joten mikään ei estä niitä ajautumasta eri mieltä — ja
   silloin toimisto näkisi vapaan päivän jolle ei voi varata, tai
   pahempaa: asiakas saisi varattua päivälle jonka asentaja on merkinnyt
   poissaoloksi.

   Tämä testi ajaa OIKEAN freeSlots()-funktion oikealla tuotantodatalla
   ja vertaa tulosta näkymän päätelmään päivä kerrallaan. Se ei kirjoita
   mitään.

   Kaksi eroa on sallittua eikä kumpikaan ole vika: päivä voi olla
   työpäivä mutta täyteen varattu, ja kuluva päivä on jo osin mennyt.
   Kielletty suunta on se toinen — varaus ei saa tarjota aikaa päivälle
   jonka näkymä sanoo poissaoloksi.

   Ohitetaan jos .env.local puuttuu (CI ilman kantayhteyttä).
   ========================================================= */
const envTiedosto = new URL('../.env.local', import.meta.url);
const ajetaan = existsSync(envTiedosto) ? test : test.skip;

ajetaan('saatavuusnakyma on synkassa varauslogiikan kanssa', async () => {
  const env = Object.fromEntries(readFileSync(envTiedosto, 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
  const sql = postgres(env.DATABASE_URL || env.POSTGRES_URL, { ssl: 'require', max: 3 });

  const PAIVIA = 42;
  const alkaen = todayKey();
  const now = new Date();

  const cals = await sql<{ id: string; staff_name: string; slot_minutes: number; lead_time_hours: number; horizon_days: number }[]>`
    select c.id, s.full_name as staff_name, c.slot_minutes, c.lead_time_hours, c.horizon_days
      from tk.calendars c join tk.staff s on s.id = c.staff_id order by s.full_name`;
  const ids = cals.map((c) => c.id);

  const [hourRows, excRows, busyRows] = await Promise.all([
    sql<{ calendar_id: string; weekday: number; start_time: string; end_time: string }[]>`
      select calendar_id, weekday, to_char(start_time,'HH24:MI') start_time, to_char(end_time,'HH24:MI') end_time
        from tk.calendar_hours where calendar_id in ${sql(ids)}`,
    sql<{ calendar_id: string; date: string; kind: 'open' | 'closed'; start_time: string | null; end_time: string | null }[]>`
      select calendar_id, to_char(date,'YYYY-MM-DD') date, kind,
             to_char(start_time,'HH24:MI') start_time, to_char(end_time,'HH24:MI') end_time
        from tk.calendar_exceptions where calendar_id in ${sql(ids)} and date >= current_date - 1`,
    sql<{ calendar_id: string; starts_at: Date; ends_at: Date }[]>`
      select calendar_id, starts_at, ends_at from tk.jobs
       where calendar_id in ${sql(ids)} and status <> 'cancelled' and ends_at > now()
         and not (status = 'hold' and hold_expires_at < now())`,
  ]);

  const paino = (p: { kind: string; start_time: string | null }) => (p.kind === 'closed' ? 2 : p.start_time ? 1 : 0);
  let eroja = 0, tarkistettu = 0;
  const selitetyt: Record<string, number> = {};

  for (const c of cals) {
    const hours: WeeklyHour[] = hourRows.filter((h) => h.calendar_id === c.id)
      .map((h) => ({ weekday: h.weekday, startTime: h.start_time, endTime: h.end_time }));
    const exceptions: CalendarException[] = excRows.filter((e) => e.calendar_id === c.id)
      .map((e) => ({ date: e.date, kind: e.kind, startTime: e.start_time, endTime: e.end_time }));
    const busy: Interval[] = busyRows.filter((b) => b.calendar_id === c.id)
      .map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }));

    const slots = freeSlots({ hours, exceptions, busy, durationMinutes: 60, now,
      until: new Date(Date.now() + PAIVIA * 86_400_000),
      settings: { slotMinutes: c.slot_minutes, leadTimeHours: c.lead_time_hours, horizonDays: c.horizon_days } });
    const slotPaivat = new Set(slots.map((s) => dateKeyOf(s.start)));

    const excKartta = new Map<string, (typeof excRows)[number]>();
    for (const e of excRows.filter((x) => x.calendar_id === c.id)) {
      const v = excKartta.get(e.date);
      if (!v || paino(e) > paino(v)) excKartta.set(e.date, e);
    }

    for (let i = 0; i < PAIVIA; i++) {
      const d = addDays(alkaen, i);
      const p = excKartta.get(d);
      const viikko = hours.find((h) => h.weekday === isoWeekday(d));
      const tila = p?.kind === 'closed' ? 'poissa'
        : (p?.kind === 'open' && p.start_time && p.end_time) ? 'tyossa'
        : viikko ? 'tyossa' : 'ilmoittamatta';
      const onSlotteja = slotPaivat.has(d);
      tarkistettu++;

      /* PAHIN VIRHE: varauskalenteri tarjoaa aikaa paivalle jonka nakyma
         sanoo poissa tai ilmoittamatta — silloin nakyma valehtelee. */
      if (onSlotteja && tila !== 'tyossa') {
        eroja++;
        console.log(`  X ${c.staff_name} ${d}: nakyma="${tila}" mutta varaus tarjoaa aikaa`);
      }
      if (!onSlotteja && tila === 'tyossa') {
        const varattu = busy.some((b) => dateKeyOf(b.start) === d);
        const syy = varattu ? 'paiva varattu' : i === 0 ? 'tama paiva jo kaynnissa'
          : i > c.horizon_days * 1.5 ? 'yli varausikkunan' : 'SELITTAMATON';
        selitetyt[syy] = (selitetyt[syy] ?? 0) + 1;
        if (syy === 'SELITTAMATON') { eroja++; console.log(`  X ${c.staff_name} ${d}: "tyossa" mutta ei vapaita aikoja`); }
      }
    }
  }
  console.log(`tarkistettu ${tarkistettu} kalenteripaivaa, ${cals.length} kalenteria`);
  console.log('tyossa mutta ei vapaita aikoja — syyt:', JSON.stringify(selitetyt));
  await sql.end();
  expect(eroja).toBe(0);
}, 180_000);
