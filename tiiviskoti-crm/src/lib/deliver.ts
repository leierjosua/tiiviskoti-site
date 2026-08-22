import 'server-only';
import { sql } from './db';
import { createCalendarEvent, deleteCalendarEvent, googleConfigured } from './google';
import { sendMail } from './google';
import {
  calendarDescription, confirmationHtml, confirmationSubject, confirmationText,
  workOrderHtml, workOrderSubject, workOrderText,
  kartoitusCalendarDescription, kartoitusHtml, kartoitusSubject, kartoitusText,
  kartoitusWorkOrderHtml, kartoitusWorkOrderSubject, kartoitusWorkOrderText,
  type ConfirmationData, type KartoitusData, type MailLine, type WorkOrderData,
} from './mail-templates';
import { SENDER_EMAIL } from './google';
import { dateKeyOf, timeOf } from './time';

/* =========================================================
   Varauksen jälkitoimet: vahvistusposti ja kalenteritapahtuma.

   PERIAATE: kumpikaan ei saa kaataa varausta. Aika on jo varattu ja työ on
   kannassa; jos posti tai kalenteri epäonnistuu, se on tieto joka kirjataan
   riville ja näkyy panelissa — ei virhe jonka takia asiakkaan varaus
   hylätään. Vanha järjestelmä teki tämän saman valinnan, ja se on oikea:
   asiakas on jo täyttänyt lomakkeen, eikä hänen varaustaan menetetä siksi
   että Gmail nikottelee.
   ========================================================= */

export type DeliverInput = {
  jobId: string;
  jobNumber: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city?: string | null;
  startsAt: Date;
  endsAt: Date;
  lines: MailLine[];
  totalCents: number;
  netCents: number;
  notes?: string | null;
  googleCalendarId?: string | null;
};

export type DeliverResult = {
  mail: { ok: boolean; id?: string; error?: string };
  workOrder: { ok: boolean; id?: string; error?: string; to?: string };
  calendar: { ok: boolean; id?: string; error?: string };
};

/** Työn tekijä: kalenterin kautta löytyvä asentaja. Jos sähköpostia ei ole,
 *  työmääräin menee yrityksen osoitteeseen, jotta se ei katoa kokonaan. */
async function assignedStaff(jobId: string): Promise<{ name: string; email: string; isFallback: boolean }> {
  const rows = await sql<{ full_name: string; email: string | null }[]>`
    select s.full_name, s.email
      from tk.jobs j
      join tk.calendars c on c.id = j.calendar_id
      join tk.staff s on s.id = c.staff_id
     where j.id = ${jobId}
  `;
  const row = rows[0];
  if (row?.email) return { name: row.full_name, email: row.email, isFallback: false };
  return { name: row?.full_name ?? 'TiivisKoti', email: SENDER_EMAIL, isFallback: true };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** Tallentaa työn rivit. Erillinen taulu, jotta panel ja lasku näkevät
 *  mitä tilattiin eikä vain loppusummaa. */
export async function saveJobLines(jobId: string, lines: MailLine[]): Promise<void> {
  if (lines.length === 0) return;
  // Uudelleenlähetys ei saa kahdentaa rivejä.
  await sql`delete from tk.job_lines where job_id = ${jobId}`;
  for (const [i, l] of lines.entries()) {
    await sql`
      insert into tk.job_lines (job_id, name, quantity, unit_price_cents, minutes, sort_order)
      values (${jobId}, ${l.name + (l.note ? ` (${l.note})` : '')}, ${Math.max(1, l.qty)},
              ${Math.round(l.unit * 100)}, 0, ${i})
    `;
  }
}

export async function deliverBooking(input: DeliverInput): Promise<DeliverResult> {
  const result: DeliverResult = { mail: { ok: false }, workOrder: { ok: false }, calendar: { ok: false } };

  const data: ConfirmationData = {
    jobNumber: input.jobNumber,
    customerName: input.customerName,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    address: input.address,
    postalCode: input.postalCode,
    city: input.city,
    lines: input.lines,
    totalCents: input.totalCents,
    netCents: input.netCents,
    notes: input.notes,
  };

  if (!googleConfigured()) {
    const error = 'Google-tunnuksia ei ole asetettu';
    result.mail.error = error;
    result.workOrder.error = error;
    result.calendar.error = error;
    await recordOutcome(input, result, data);
    return result;
  }

  const staff = await assignedStaff(input.jobId);
  const workOrder: WorkOrderData = {
    ...data, phone: input.phone, email: input.email, staffName: staff.name,
  };

  // --- vahvistusposti ---
  const subject = confirmationSubject(data);
  try {
    const sent = await sendMail({
      to: input.email,
      subject,
      html: confirmationHtml(data),
      text: confirmationText(data),
    });
    result.mail = { ok: true, id: sent.id };
  } catch (e) {
    result.mail = { ok: false, error: msg(e) };
    console.error('deliverBooking: posti epäonnistui', input.jobNumber, result.mail.error);
  }

  // --- työmääräin asentajalle ---
  // Erillinen viesti asiakkaan vahvistuksesta: asentaja tarvitsee osoitteen,
  // puhelinnumeron ja veloitettavan hinnan, ei markkinointisävyä.
  try {
    const sent = await sendMail({
      to: staff.email,
      subject: workOrderSubject(workOrder),
      html: workOrderHtml(workOrder),
      text: workOrderText(workOrder),
    });
    result.workOrder = { ok: true, id: sent.id, to: staff.email };
  } catch (e) {
    result.workOrder = { ok: false, error: msg(e), to: staff.email };
    console.error('deliverBooking: työmääräin epäonnistui', input.jobNumber, result.workOrder.error);
  }

  // --- kalenteritapahtuma ---
  try {
    const ev = await createCalendarEvent({
      summary: `${input.customerName} — ${input.address} (${input.jobNumber})`,
      description: calendarDescription({ ...data, phone: input.phone, email: input.email }),
      location: [input.address, input.postalCode, input.city].filter(Boolean).join(', '),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      calendarId: input.googleCalendarId ?? undefined,
      // Asentaja osallistujaksi, jotta työ näkyy hänen omassa kalenterissaan
      // eikä vain yrityksen. Ei lisätä jos osoite on yrityksen oma — silloin
      // tapahtuma on jo siinä kalenterissa.
      attendees: staff.isFallback ? undefined : [{ email: staff.email, displayName: staff.name }],
    });
    result.calendar = { ok: true, id: ev.id };
  } catch (e) {
    result.calendar = { ok: false, error: msg(e) };
    console.error('deliverBooking: kalenteri epäonnistui', input.jobNumber, result.calendar.error);
  }

  await recordOutcome(input, result, data);
  return result;
}

async function recordOutcome(
  input: DeliverInput, result: DeliverResult, data: ConfirmationData,
): Promise<void> {
  try {
    await sql`
      insert into tk.mail_log (job_id, kind, to_email, subject, provider_id, error, sent_at)
      values (${input.jobId}, 'confirmation', ${input.email}, ${confirmationSubject(data)},
              ${result.mail.id ?? null}, ${result.mail.error ?? null},
              ${result.mail.ok ? new Date() : null})
    `;
    // Työmääräin omalle riville: kummankin viestin onnistuminen on nähtävä
    // erikseen, koska ne voivat epäonnistua toisistaan riippumatta.
    if (result.workOrder.to) {
      await sql`
        insert into tk.mail_log (job_id, kind, to_email, subject, provider_id, error, sent_at)
        values (${input.jobId}, 'work_order', ${result.workOrder.to},
                ${`Työmääräin ${input.jobNumber}`},
                ${result.workOrder.id ?? null}, ${result.workOrder.error ?? null},
                ${result.workOrder.ok ? new Date() : null})
      `;
    }
    await sql`
      update tk.jobs
         set google_event_id     = coalesce(${result.calendar.id ?? null}, google_event_id),
             confirmation_sent_at = ${result.mail.ok ? new Date() : null},
             confirmation_error   = ${result.mail.error ?? null}
       where id = ${input.jobId}
    `;
  } catch (e) {
    // Lokitus ei saa myöskään kaataa mitään.
    console.error('deliverBooking: tuloksen kirjaus epäonnistui', msg(e));
  }
}

/* =========================================================
   Taloyhtiön kartoituskäynnin jälkitoimet.

   Sama periaate kuin varauksessa: aika on jo varattu eikä posti tai kalenteri
   saa kaataa sitä. Erillinen funktio eikä `deliverBooking`-haara, koska
   kartoituksesta puuttuu kaikki mitä varaus tarvitsee — rivit, hinta ja
   kotitalousvähennys — ja niiden teeskentely nollina tuottaisi asiakkaalle
   viestin, jossa lukee "Yhteensä 0 €".
   ========================================================= */

export type DeliverKartoitusInput = KartoitusData & {
  jobId: string;
  googleCalendarId?: string | null;
};

export async function deliverKartoitus(input: DeliverKartoitusInput): Promise<DeliverResult> {
  const result: DeliverResult = { mail: { ok: false }, workOrder: { ok: false }, calendar: { ok: false } };

  if (!googleConfigured()) {
    const error = 'Google-tunnuksia ei ole asetettu';
    result.mail.error = error;
    result.workOrder.error = error;
    result.calendar.error = error;
    await recordKartoitusOutcome(input, result);
    return result;
  }

  const staff = await assignedStaff(input.jobId);

  // --- vahvistus taloyhtiön yhteyshenkilölle ---
  try {
    const sent = await sendMail({
      to: input.email,
      subject: kartoitusSubject(input),
      html: kartoitusHtml(input),
      text: kartoitusText(input),
    });
    result.mail = { ok: true, id: sent.id };
  } catch (e) {
    result.mail = { ok: false, error: msg(e) };
    console.error('deliverKartoitus: posti epäonnistui', input.jobNumber, result.mail.error);
  }

  // --- työmääräin kartoittajalle ---
  try {
    const sent = await sendMail({
      to: staff.email,
      subject: kartoitusWorkOrderSubject(input),
      html: kartoitusWorkOrderHtml(input),
      text: kartoitusWorkOrderText(input),
    });
    result.workOrder = { ok: true, id: sent.id, to: staff.email };
  } catch (e) {
    result.workOrder = { ok: false, error: msg(e), to: staff.email };
    console.error('deliverKartoitus: työmääräin epäonnistui', input.jobNumber, result.workOrder.error);
  }

  // --- kalenteritapahtuma ---
  try {
    const ev = await createCalendarEvent({
      // "Kartoitus" alkuun, jotta veloituksettoman käynnin erottaa
      // kalenterinäkymässä maksavasta työstä ilman että sitä tarvitsee avata.
      summary: `Kartoitus: ${input.association} — ${input.address} (${input.jobNumber})`,
      description: kartoitusCalendarDescription(input),
      location: [input.address, input.postalCode, input.city].filter(Boolean).join(', '),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      calendarId: input.googleCalendarId ?? undefined,
      attendees: staff.isFallback ? undefined : [{ email: staff.email, displayName: staff.name }],
    });
    result.calendar = { ok: true, id: ev.id };
  } catch (e) {
    result.calendar = { ok: false, error: msg(e) };
    console.error('deliverKartoitus: kalenteri epäonnistui', input.jobNumber, result.calendar.error);
  }

  await recordKartoitusOutcome(input, result);
  return result;
}

async function recordKartoitusOutcome(
  input: DeliverKartoitusInput, result: DeliverResult,
): Promise<void> {
  try {
    /* Kirjataan `confirmation`- ja `work_order`-lajeina eikä omana
       'kartoitus'-lajinaan: `tk.mail_kind` on enum, ja uuden arvon lisääminen
       vaatii postgres-roolin, jota sovelluksen tunnuksilla ei ole. Viestin
       aihe kertoo silti lokista mistä on kyse, joten oma laji ei toisi
       tähän mitään mitä ei jo näy. */
    await sql`
      insert into tk.mail_log (job_id, kind, to_email, subject, provider_id, error, sent_at)
      values (${input.jobId}, 'confirmation', ${input.email}, ${kartoitusSubject(input)},
              ${result.mail.id ?? null}, ${result.mail.error ?? null},
              ${result.mail.ok ? new Date() : null})
    `;
    if (result.workOrder.to) {
      await sql`
        insert into tk.mail_log (job_id, kind, to_email, subject, provider_id, error, sent_at)
        values (${input.jobId}, 'work_order', ${result.workOrder.to},
                ${kartoitusWorkOrderSubject(input)},
                ${result.workOrder.id ?? null}, ${result.workOrder.error ?? null},
                ${result.workOrder.ok ? new Date() : null})
      `;
    }
    await sql`
      update tk.jobs
         set google_event_id      = coalesce(${result.calendar.id ?? null}, google_event_id),
             confirmation_sent_at = ${result.mail.ok ? new Date() : null},
             confirmation_error   = ${result.mail.error ?? null}
       where id = ${input.jobId}
    `;
  } catch (e) {
    console.error('deliverKartoitus: tuloksen kirjaus epäonnistui', msg(e));
  }
}

/** Peruttaessa tai siirrettäessä vanha kalenteritapahtuma poistetaan, ettei
 *  asentajan kalenteriin jää työtä jota ei enää ole. */
export async function removeCalendarEventForJob(jobId: string): Promise<void> {
  const rows = await sql<{ google_event_id: string | null; google_calendar_id: string | null }[]>`
    select j.google_event_id, c.google_calendar_id
      from tk.jobs j join tk.calendars c on c.id = j.calendar_id
     where j.id = ${jobId}
  `;
  const row = rows[0];
  if (!row?.google_event_id || !googleConfigured()) return;
  try {
    await deleteCalendarEvent(row.google_event_id, row.google_calendar_id ?? undefined);
    await sql`update tk.jobs set google_event_id = null where id = ${jobId}`;
  } catch (e) {
    console.error('removeCalendarEventForJob:', jobId, msg(e));
  }
}

/** Aikaleima ihmisluettavana lokiin ja panelin näyttöön. */
export const humanWhen = (d: Date) => `${dateKeyOf(d)} ${timeOf(d)}`;
