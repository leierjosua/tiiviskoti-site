import 'server-only';
import { sql } from './db';
import { freeSlots, type CalendarException, type Interval, type WeeklyHour } from './availability';

/* =========================================================
   Tietokantakyselyt yhdessä paikassa, jotta sivut pysyvät ohuina ja
   SQL:ää voi lukea kokonaisuutena.
   ========================================================= */

/* Taloyhtiöiden kartoituskäyntien oma kalenteri.

   Miksi ympäristömuuttuja eikä sarake `tk.calendars`-taulussa: sovelluksen
   tunnuksilla (`tk_app`) ei ole DDL-oikeuksia `tk`-skeemaan, joten uutta
   `purpose`-saraketta ei voi lisätä ilman postgres-roolia. Nimeen perustuva
   tunnistus taas hajoaisi heti kun kalenterin nimeä muokataan adminissa.

   Kalenteri EI ole `tk.calendar_areas`-taulussa. Se on koko erottelun ydin:
   julkinen saatavuusreitti rajaa kalenterit alueella, joten kartoituskalenteri
   ei voi vahingossa päätyä kuluttajan varauskalenteriin. Kartoitusreitti hakee
   sen suoraan tällä tunnuksella.

   HUOM: `tk.jobs`-taulun päällekkäisyysrajoite on kalenterikohtainen
   (`EXCLUDE ... calendar_id WITH =`), ei henkilökohtainen. Kartoitus ja
   asennus voivat siis osua samaan hetkeen, koska ne ovat eri kalentereissa.
   Tämä on tietoinen valinta — kartoituskalenterin työajat ovat samat kuin
   asennusten (ma–pe 08–18), jotta aikoja on tarjolla koko viikon. Jos
   päällekkäisyys alkaa haitata, kavenna kartoituskalenterin työaikoja niin
   etteivät ne mene asennusaikojen kanssa ristiin. */
export function kartoitusCalendarId(): string | null {
  const id = process.env.KARTOITUS_CALENDAR_ID?.trim();
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

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
  /* Mainoskampanja josta asiakas tuli, esim. qr-a6. null = ei tiedossa.
     Eri asia kuin `source`, joka kertoo syntyikö työ adminissa vai verkossa. */
  campaign: string | null;
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
           j.address, j.postal_code, j.city, j.price_cents, j.notes, j.source, j.campaign,
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
           j.address, j.postal_code, j.city, j.price_cents, j.notes, j.source, j.campaign,
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
  /** Ohittaa kalenterin oman aikaruudukon. Työparia haettaessa toisen
   *  asentajan ajat lasketaan tiheällä ruudukolla, jotta kysymykseksi jää
   *  "onko hän vapaa juuri tuolloin" eikä "osuuko hänen ruudukkonsa
   *  samaan hetkeen" — eri ruudukot pudottivat kokonaisia päiviä pois. */
  slotMinutes?: number;
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
          slotMinutes: opts.slotMinutes ?? calendar.slot_minutes,
          leadTimeHours: calendar.lead_time_hours,
          horizonDays: calendar.horizon_days,
        },
      }),
    };
  });
}

/* ---------- Tarjoukset (prospektit) ---------- */

export type OfferLine = { name: string; quantity: number; unit_price_cents: number };

export type OfferKind = 'asiakas' | 'taloyhtio';

export type OfferRow = {
  id: string;
  offer_number: string;
  kind: OfferKind;
  /* Taloyhtiöllä yhteyshenkilö; kuluttajalla null. */
  contact_name: string | null;
  customer_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  lines: OfferLine[];
  total_cents: number;
  travel_fee_cents: number;
  /* Sisäinen muistiinpano — EI näy asiakkaalle. */
  notes: string | null;
  /* Vapaa sana: asiakkaalle näkynyt saateteksti PDF:ssä ja sähköpostissa.
     undefined = db/020 ajamatta, null = ei kirjoitettu. */
  customer_note?: string | null;
  /* "Työhön sisältyy" -rivit sellaisina kuin ne lähtivät asiakkaalle.
     undefined = db/022 ajamatta, null = tarjous tehty ennen saraketta,
     tyhjä lista = osio jätetty tietoisesti pois. */
  inclusions?: string[] | null;
  /* 'draft' = tallennettu mutta EI lähetetty (db/021). */
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  valid_until: string | null;
  provider_id: string | null;
  error: string | null;
  sent_at: Date | null;
  created_at: Date;
  /* Kalenteriin laitettu työ, jos tarjous on jo aikataulutettu (db/026).
     undefined = migraatio ajamatta, null = ei vielä buukattu. */
  job_id?: string | null;
  job_number?: string | null;
  job_starts_at?: Date | null;
};

export async function listOffers(): Promise<OfferRow[]> {
  /* Peruttu työ ei ole varaus, joten se ei tee tarjouksesta buukattua —
     muuten peruttu keikka piilottaisi "Laita aika" -napin lopullisesti.
     Aikaisin voimassa oleva riittää: pari on samaan aikaan, ja uudelleen
     buukatun tarjouksen kohdalla ensimmäinen tuleva on se joka on voimassa. */
  const run = (withJob: boolean) => sql<OfferRow[]>`
    select o.id, o.offer_number, o.kind, o.contact_name, o.customer_name, o.email,
           o.phone, o.address, o.postal_code, o.city, o.lines, o.total_cents,
           o.travel_fee_cents, o.notes, o.status, o.valid_until, o.provider_id,
           o.error, o.sent_at, o.created_at
           ${withJob ? sql`, j.id as job_id, j.job_number, j.starts_at as job_starts_at` : sql``}
      from tk.offers o
      ${withJob
        ? sql`left join lateral (
                select jj.id, jj.job_number, jj.starts_at
                  from tk.jobs jj
                 where jj.offer_id = o.id and jj.status <> 'cancelled'
                 order by jj.starts_at
                 limit 1
              ) j on true`
        : sql``}
     order by o.created_at desc
  `;
  try {
    return await run(jobOfferLinkExists);
  } catch (e) {
    if (jobOfferLinkExists && undefinedColumn(e)?.includes('offer_id')) {
      jobOfferLinkExists = false;
      return run(false);
    }
    throw e;
  }
}

/** Puuttuvan sarakkeen (42703) virheteksti, muuten null. */
function undefinedColumn(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const err = e as { code?: string; message?: string };
  return err.code === '42703' ? (err.message ?? '') : null;
}

/* Onko db/020 / db/022 ajettu. Kysely kertoo sen vasta epäonnistuessaan,
   joten oletetaan kyllä ja korjataan kerran ajossa. Liput nollautuvat
   deployssa. */
let offerCustomerNoteExists = true;
let offerInclusionsExists = true;
/* Onko db/026 ajettu (tk.jobs.offer_id / crew_group_id). Sama tarkoitus kuin
   yllä: tarjouslista on tärkeämpi kuin tieto siitä onko aika jo laitettu. */
let jobOfferLinkExists = true;

export async function getOffer(id: string): Promise<OfferRow | null> {
  const run = (withNote: boolean, withInclusions: boolean, withJob: boolean) => sql<OfferRow[]>`
    select o.id, o.offer_number, o.kind, o.contact_name, o.customer_name, o.email,
           o.phone, o.address, o.postal_code, o.city, o.lines, o.total_cents,
           o.travel_fee_cents, o.notes, o.status, o.valid_until, o.provider_id,
           o.error, o.sent_at, o.created_at
           ${withNote ? sql`, o.customer_note` : sql``}
           ${withInclusions ? sql`, o.inclusions` : sql``}
           ${withJob ? sql`, j.id as job_id, j.job_number, j.starts_at as job_starts_at` : sql``}
      from tk.offers o
      ${withJob
        ? sql`left join lateral (
                select jj.id, jj.job_number, jj.starts_at
                  from tk.jobs jj
                 where jj.offer_id = o.id and jj.status <> 'cancelled'
                 order by jj.starts_at
                 limit 1
              ) j on true`
        : sql``}
     where o.id = ${id}
  `;
  /* Sarake puuttuu (migraatio ajamatta): tarjous on tärkeämpi kuin sen
     saateteksti tai sisältyy-lista, joten näytetään tarjous ilman niitä.
     Kumpi sarake puuttui, selviää vain virheen tekstistä — ja molemmat
     voivat puuttua, joten yritetään uudelleen kunnes kysely menee läpi. */
  for (let attempt = 0; ; attempt++) {
    try {
      const [row] = await run(offerCustomerNoteExists, offerInclusionsExists, jobOfferLinkExists);
      return row ?? null;
    } catch (e) {
      const missing = attempt < 3 ? undefinedColumn(e) : null;
      if (missing?.includes('inclusions')) offerInclusionsExists = false;
      else if (missing?.includes('customer_note')) offerCustomerNoteExists = false;
      else if (missing?.includes('offer_id')) jobOfferLinkExists = false;
      else throw e;
    }
  }
}

/* Työn liitokset: mistä tarjouksesta se tuli ja kuka on työparina.
   Erillinen kysely eikä osa `getJob`ia, koska db/026 voi olla ajamatta —
   silloin työn sivu näyttää työn ilman näitä eikä kaadu. */
export type JobCrewMate = { id: string; job_number: string; staff_name: string };

export async function jobLinks(jobId: string): Promise<{
  offer: { id: string; offer_number: string } | null;
  mates: JobCrewMate[];
}> {
  const none = { offer: null, mates: [] as JobCrewMate[] };
  if (!jobOfferLinkExists) return none;
  try {
    const [row] = await sql<{
      offer_id: string | null; offer_number: string | null; crew_group_id: string | null;
    }[]>`
      select j.offer_id, o.offer_number, j.crew_group_id
        from tk.jobs j
        left join tk.offers o on o.id = j.offer_id
       where j.id = ${jobId}
    `;
    if (!row) return none;
    const mates = row.crew_group_id
      ? await sql<JobCrewMate[]>`
          select j.id, j.job_number, s.full_name as staff_name
            from tk.jobs j
            join tk.calendars c on c.id = j.calendar_id
            join tk.staff s on s.id = c.staff_id
           where j.crew_group_id = ${row.crew_group_id} and j.id <> ${jobId}
           order by s.full_name
        `
      : [];
    return {
      offer: row.offer_id && row.offer_number
        ? { id: row.offer_id, offer_number: row.offer_number }
        : null,
      mates,
    };
  } catch (e) {
    if (undefinedColumn(e)) { jobOfferLinkExists = false; return none; }
    throw e;
  }
}
