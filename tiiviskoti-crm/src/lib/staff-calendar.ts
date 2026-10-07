import 'server-only';
import { sql } from './db';
import { createCalendar, moveCalendarEvent, shareCalendar, updateCalendarEvent } from './google';
import { ensureCalendarEventForJob } from './deliver';

/* =========================================================
   Asentajan oma "TiivisKoti"-kalenteri Googlessa.

   Ennen tätä keikat menivät info@:n pääkalenteriin ja asentaja oli niissä
   osallistujana. Hänen puhelimessaan ne näkyivät kutsuina omien menojen
   seassa — ja Gmail-tili jättää tuntemattoman lähettäjän kutsut usein
   kokonaan näyttämättä, joten keikka saattoi puuttua tyystin.

   Nyt jokaiselle työntekijälle luodaan info@:n tilille oma kalenteri, joka
   jaetaan hänelle lukuoikeudella. Sen tunnus tallennetaan kaikille hänen
   `tk.calendars`-riveilleen, ja varausten jälkitoimet (deliver.ts) vievät
   tapahtumat sinne valmiiksi olemassa olevan `google_calendar_id`-reitityksen
   kautta. Uutta kantasaraketta ei tarvita.
   ========================================================= */

export const STAFF_CALENDAR_NAME = 'TiivisKoti';

export type LinkResult = {
  created: boolean;
  calendarId: string;
  moved: number;
  failed: number;
};

/**
 * Luo (tai käyttää olemassa olevaa) kalenteria, jakaa sen työntekijälle ja
 * siirtää hänen tulevat keikkansa sinne.
 *
 * Toistettava: jos kalenteri on jo olemassa, sitä ei luoda uudestaan, vaan
 * jako tehdään uudelleen — Google lähettää silloin "Lisää kalenteri" -postin
 * uudestaan. Siksi sama nappi toimii myös kutsun uudelleenlähetyksenä.
 */
export async function linkStaffGoogleCalendar(staffId: string): Promise<LinkResult> {
  const [person] = await sql<{ full_name: string; email: string | null }[]>`
    select full_name, email from tk.staff where id = ${staffId}
  `;
  if (!person) throw new Error('Työntekijää ei löytynyt.');
  if (!person.email) throw new Error('Työntekijällä ei ole sähköpostiosoitetta.');

  const calendars = await sql<{ id: string; google_calendar_id: string | null }[]>`
    select id, google_calendar_id from tk.calendars where staff_id = ${staffId}
  `;
  if (calendars.length === 0) {
    throw new Error('Työntekijällä ei ole kalenteria CRM:ssä. Luo ensin kalenteri.');
  }

  /* Kaikki saman henkilön kalenterit (esim. Danielin asennus + kartoitus)
     jakavat yhden Google-kalenterin: asentajalle kyse on samasta työstä. */
  const existing = calendars.find((c) => c.google_calendar_id)?.google_calendar_id ?? null;
  const created = !existing;
  const calendarId = existing ?? (await createCalendar(
    STAFF_CALENDAR_NAME,
    `${person.full_name}: keikat TiivisKoti-CRM:stä. Päivittyy automaattisesti — älä muokkaa täällä.`,
  )).id;

  await shareCalendar(calendarId, person.email);

  /* Tulevat keikat siirretään vanhasta paikasta uuteen. Vanha paikka luetaan
     ennen kannan päivitystä: null = info@:n pääkalenteri. */
  const jobs = await sql<{ id: string; google_event_id: string; prev: string | null }[]>`
    select j.id, j.google_event_id, c.google_calendar_id as prev
      from tk.jobs j
      join tk.calendars c on c.id = j.calendar_id
     where c.staff_id = ${staffId}
       and j.google_event_id is not null
       and j.ends_at > now()
       and j.status <> 'cancelled'
  `;

  await sql`update tk.calendars set google_calendar_id = ${calendarId} where staff_id = ${staffId}`;

  let moved = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      if ((job.prev ?? '') !== calendarId) {
        const res = await moveCalendarEvent(job.google_event_id, job.prev ?? undefined, calendarId);
        if (res.missing) {
          await sql`update tk.jobs set google_event_id = null where id = ${job.id}`;
          continue;
        }
      }
      /* Osallistuja pois: muuten sama keikka näkyisi hänelle kahdesti,
         kerran TiivisKoti-kalenterissa ja kerran kutsuna pääkalenterissa. */
      await updateCalendarEvent(job.google_event_id, { calendarId, attendees: [] });
      moved++;
    } catch (e) {
      failed++;
      console.error('linkStaffGoogleCalendar: siirto epäonnistui', job.id, e instanceof Error ? e.message : e);
    }
  }

  /* Keikat joilla ei ole tapahtumaa lainkaan — työparin rivit ja ilman
     vahvistusta luodut työt. Ne luodaan suoraan uuteen kalenteriin. */
  const missing = await sql<{ id: string }[]>`
    select j.id from tk.jobs j join tk.calendars c on c.id = j.calendar_id
     where c.staff_id = ${staffId} and j.google_event_id is null
       and j.ends_at > now() and j.status <> 'cancelled'
  `;
  for (const job of missing) {
    await ensureCalendarEventForJob(job.id);
    moved++;
  }

  return { created, calendarId, moved, failed };
}
