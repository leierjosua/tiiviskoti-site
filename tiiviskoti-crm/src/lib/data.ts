import 'server-only';
import { sql } from './db';
import { freeSlots, type CalendarException, type Interval, type WeeklyHour } from './availability';

/* =========================================================
   Tietokantakyselyt yhdessä paikassa, jotta sivut pysyvät ohuina ja
   SQL:ää voi lukea kokonaisuutena.
   ========================================================= */

export type StaffRow = {
  id: string; email: string; full_name: string; phone: string | null;
  role: 'owner' | 'admin' | 'installer'; active: boolean;
};

export type CalendarRow = {
  id: string; staff_id: string; name: string; slot_minutes: number;
  lead_time_hours: number; horizon_days: number; active: boolean;
  staff_name: string;
};

export type JobRow = {
  id: string; job_number: string; starts_at: Date; ends_at: Date;
  status: 'hold' | 'tentative' | 'confirmed' | 'done' | 'cancelled';
  title: string; address: string | null; postal_code: string | null; city: string | null;
  price_cents: number; notes: string | null; source: string;
  calendar_id: string; calendar_name: string; staff_name: string;
  customer_id: string | null; customer_name: string | null;
  customer_email: string | null; customer_phone: string | null;
};

/* ---------- henkilöstö ---------- */

export function listStaff() {
  return sql<StaffRow[]>`
    select id, email, full_name, phone, role, active
      from tk.staff
     order by active desc, full_name
  `;
}

/* ---------- kalenterit ---------- */

export function listCalendars(onlyActive = false) {
  return sql<CalendarRow[]>`
    select c.id, c.staff_id, c.name, c.slot_minutes, c.lead_time_hours,
           c.horizon_days, c.active, s.full_name as staff_name
      from tk.calendars c
      join tk.staff s on s.id = c.staff_id
     ${onlyActive ? sql`where c.active and s.active` : sql``}
     order by c.active desc, s.full_name, c.name
  `;
}

export async function getCalendar(id: string) {
  const [calendar] = await sql<CalendarRow[]>`
    select c.id, c.staff_id, c.name, c.slot_minutes, c.lead_time_hours,
           c.horizon_days, c.active, s.full_name as staff_name
      from tk.calendars c
      join tk.staff s on s.id = c.staff_id
     where c.id = ${id}
  `;
  if (!calendar) return null;

  const hours = await sql<{ id: string; weekday: number; start_time: string; end_time: string }[]>`
    select id, weekday, to_char(start_time, 'HH24:MI') as start_time,
           to_char(end_time, 'HH24:MI') as end_time
      from tk.calendar_hours
     where calendar_id = ${id}
     order by weekday, start_time
  `;

  const exceptions = await sql<{
    id: string; date: string; kind: 'closed' | 'open';
    start_time: string | null; end_time: string | null; note: string | null;
  }[]>`
    select id, to_char(date, 'YYYY-MM-DD') as date, kind,
           to_char(start_time, 'HH24:MI') as start_time,
           to_char(end_time, 'HH24:MI') as end_time, note
      from tk.calendar_exceptions
     where calendar_id = ${id} and date >= current_date - 30
     order by date
  `;

  return { calendar, hours, exceptions };
}

/* ---------- työt ---------- */

export function listJobs(fromIso: string, toIso: string) {
  return sql<JobRow[]>`
    select j.id, j.job_number, j.starts_at, j.ends_at, j.status, j.title,
           j.address, j.postal_code, j.city, j.price_cents, j.notes, j.source,
           j.calendar_id, c.name as calendar_name, s.full_name as staff_name,
           j.customer_id, cu.full_name as customer_name,
           cu.email as customer_email, cu.phone as customer_phone
      from tk.jobs j
      join tk.calendars c on c.id = j.calendar_id
      join tk.staff s on s.id = c.staff_id
      left join tk.customers cu on cu.id = j.customer_id
     where j.starts_at >= ${fromIso} and j.starts_at < ${toIso}
     order by j.starts_at
  `;
}

export async function getJob(id: string) {
  const [job] = await sql<JobRow[]>`
    select j.id, j.job_number, j.starts_at, j.ends_at, j.status, j.title,
           j.address, j.postal_code, j.city, j.price_cents, j.notes, j.source,
           j.calendar_id, c.name as calendar_name, s.full_name as staff_name,
           j.customer_id, cu.full_name as customer_name,
           cu.email as customer_email, cu.phone as customer_phone
      from tk.jobs j
      join tk.calendars c on c.id = j.calendar_id
      join tk.staff s on s.id = c.staff_id
      left join tk.customers cu on cu.id = j.customer_id
     where j.id = ${id}
  `;
  return job ?? null;
}

/* ---------- vapaat ajat ---------- */

/** Poistaa vanhentuneet hold-varaukset. Ajetaan ennen jokaista
 *  saatavuuslaskentaa, ettei rauennut checkout varaa aikaa ikuisesti. */
export async function purgeExpiredHolds() {
  await sql`delete from tk.jobs where status = 'hold' and hold_expires_at < now()`;
}

export type CalendarAvailability = {
  calendarId: string;
  calendarName: string;
  staffName: string;
  slots: Interval[];
};

export type Area = { id: string; name: string; travelFeeCents: number };

/**
 * Postinumeron palvelualue, tai null jos aluetta ei ole.
 *
 * Ratkaisu tehdään kannassa (`tk.area_for_postal`), jotta sama logiikka —
 * pisin osuva etuliite voittaa — pätee sekä saatavuudessa että varauksen
 * validoinnissa. Matkalisä tulee samasta kyselystä, joten hinta ja
 * saatavuus eivät voi perustua eri alueeseen.
 */
export async function areaForPostal(postal: string): Promise<Area | null> {
  if (!/^\d{5}$/.test(postal)) return null;
  const rows = await sql<{ id: string; name: string; travel_fee_cents: number }[]>`
    select id, name, travel_fee_cents from tk.area_for_postal(${postal})
  `;
  const row = rows[0];
  return row ? { id: row.id, name: row.name, travelFeeCents: row.travel_fee_cents } : null;
}

/**
 * Vapaat ajat yhdestä tai kaikista aktiivisista kalentereista.
 *
 * Varatuiksi lasketaan kaikki muut kuin perutut työt — myös hold-rivit,
 * koska ne ovat kesken olevia varauksia.
 */
export async function availability(opts: {
  durationMinutes: number;
  until: Date;
  now?: Date;
  calendarId?: string;
  /** Rajaa kalenterit tähän alueeseen. Ilman tätä palautetaan kaikki
   *  kalenterit — käytössä vain hallinnan sisäisissä näkymissä. */
  areaId?: string;
}): Promise<CalendarAvailability[]> {
  const now = opts.now ?? new Date();

  /* Vanhentuneiden holdien siivous ei odota tässä: se on pelkkää siivousta.
     Oikeellisuus ei ole sen varassa, koska alla oleva varattujen kysely
     sulkee vanhentuneet holdit pois joka tapauksessa. Odottaminen lisäisi
     vain yhden kanta-edestakaisen matkan jokaiseen hakuun. */
  void purgeExpiredHolds().catch((e) =>
    console.error('availability: holdien siivous epäonnistui', e));

  const calendars = await sql<CalendarRow[]>`
    select c.id, c.staff_id, c.name, c.slot_minutes, c.lead_time_hours,
           c.horizon_days, c.active, s.full_name as staff_name
      from tk.calendars c
      join tk.staff s on s.id = c.staff_id
     where c.active and s.active
       ${opts.calendarId ? sql`and c.id = ${opts.calendarId}` : sql``}
       ${opts.areaId
         ? sql`and exists (select 1 from tk.calendar_areas ca
                            where ca.calendar_id = c.id and ca.area_id = ${opts.areaId})`
         : sql``}
     order by s.full_name, c.name
  `;
  if (calendars.length === 0) return [];

  const ids = calendars.map((c) => c.id);

  /* Kolme riippumatonta kyselyä rinnakkain. Peräkkäin ajettuina ne olivat
     kolme erillistä kanta-edestakaista matkaa; nyt ne menevät yhtä aikaa. */
  const [hourRows, exceptionRows, busyRows] = await Promise.all([
    sql<{ calendar_id: string; weekday: number; start_time: string; end_time: string }[]>`
      select calendar_id, weekday, to_char(start_time, 'HH24:MI') as start_time,
             to_char(end_time, 'HH24:MI') as end_time
        from tk.calendar_hours
       where calendar_id in ${sql(ids)}
    `,
    sql<{
      calendar_id: string; date: string; kind: 'closed' | 'open';
      start_time: string | null; end_time: string | null;
    }[]>`
      select calendar_id, to_char(date, 'YYYY-MM-DD') as date, kind,
             to_char(start_time, 'HH24:MI') as start_time,
             to_char(end_time, 'HH24:MI') as end_time
        from tk.calendar_exceptions
       where calendar_id in ${sql(ids)} and date >= current_date - 1
    `,
    /* Vanhentunut hold ei varaa aikaa, vaikka siivous ei olisi vielä ehtinyt
       poistaa riviä — siksi ehto on tässä eikä siivouksen varassa. */
    sql<{ calendar_id: string; starts_at: Date; ends_at: Date }[]>`
      select calendar_id, starts_at, ends_at
        from tk.jobs
       where calendar_id in ${sql(ids)}
         and status <> 'cancelled'
         and ends_at > now()
         and not (status = 'hold' and hold_expires_at < now())
    `,
  ]);

  return calendars.map((calendar) => {
    const hours: WeeklyHour[] = hourRows
      .filter((h) => h.calendar_id === calendar.id)
      .map((h) => ({ weekday: h.weekday, startTime: h.start_time, endTime: h.end_time }));

    const exceptions: CalendarException[] = exceptionRows
      .filter((e) => e.calendar_id === calendar.id)
      .map((e) => ({ date: e.date, kind: e.kind, startTime: e.start_time, endTime: e.end_time }));

    const busy: Interval[] = busyRows
      .filter((b) => b.calendar_id === calendar.id)
      .map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }));

    return {
      calendarId: calendar.id,
      calendarName: calendar.name,
      staffName: calendar.staff_name,
      slots: freeSlots({
        hours, exceptions, busy,
        durationMinutes: opts.durationMinutes,
        now,
        until: opts.until,
        settings: {
          slotMinutes: calendar.slot_minutes,
          leadTimeHours: calendar.lead_time_hours,
          horizonDays: calendar.horizon_days,
        },
      }),
    };
  });
}
