'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';

export type ActionState = { error?: string; ok?: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- kalenteri ---------- */

export async function createCalendar(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const parsed = z.object({
    staffId: z.string().uuid('Valitse työntekijä'),
    name: z.string().min(1, 'Anna kalenterille nimi'),
  }).safeParse({
    staffId: String(formData.get('staffId') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const [row] = await sql<{ id: string }[]>`
    insert into tk.calendars (staff_id, name)
    values (${parsed.data.staffId}, ${parsed.data.name})
    returning id
  `;
  redirect(`/kalenterit/${row.id}`);
}

export async function updateCalendar(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const parsed = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, 'Anna kalenterille nimi'),
    slotMinutes: z.coerce.number().int().min(5).max(480),
    leadTimeHours: z.coerce.number().int().min(0).max(2000),
    horizonDays: z.coerce.number().int().min(1).max(365),
    active: z.boolean(),
  }).safeParse({
    id: String(formData.get('id') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    slotMinutes: formData.get('slotMinutes'),
    leadTimeHours: formData.get('leadTimeHours'),
    horizonDays: formData.get('horizonDays'),
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista arvot' };

  const { id, name, slotMinutes, leadTimeHours, horizonDays, active } = parsed.data;
  await sql`
    update tk.calendars
       set name = ${name}, slot_minutes = ${slotMinutes},
           lead_time_hours = ${leadTimeHours}, horizon_days = ${horizonDays},
           active = ${active}
     where id = ${id}
  `;

  revalidatePath(`/kalenterit/${id}`);
  return { ok: 'Asetukset tallennettu.' };
}

/* ---------- viikkoaikataulu ---------- */

export async function addHours(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const calendarId = String(formData.get('calendarId') ?? '');
  const startTime = String(formData.get('startTime') ?? '');
  const endTime = String(formData.get('endTime') ?? '');
  const weekdays = formData.getAll('weekdays').map((v) => Number(v));

  if (!TIME.test(startTime) || !TIME.test(endTime)) return { error: 'Tarkista kellonajat.' };
  if (endTime <= startTime) return { error: 'Lopetuksen on oltava aloituksen jälkeen.' };
  if (weekdays.length === 0) return { error: 'Valitse ainakin yksi viikonpäivä.' };

  // Sama alkuaika samana päivänä on jo olemassa → ohitetaan hiljaisesti,
  // jotta "ma–pe 8–16" voi ajaa kahdesti ilman virhettä.
  for (const weekday of weekdays) {
    await sql`
      insert into tk.calendar_hours (calendar_id, weekday, start_time, end_time)
      values (${calendarId}, ${weekday}, ${startTime}, ${endTime})
      on conflict (calendar_id, weekday, start_time) do update set end_time = excluded.end_time
    `;
  }

  revalidatePath(`/kalenterit/${calendarId}`);
  return { ok: 'Työaika lisätty.' };
}

export async function deleteHours(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  const calendarId = String(formData.get('calendarId') ?? '');
  await sql`delete from tk.calendar_hours where id = ${id}`;
  revalidatePath(`/kalenterit/${calendarId}`);
}

/* ---------- poikkeukset ---------- */

export async function addException(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const calendarId = String(formData.get('calendarId') ?? '');
  const date = String(formData.get('date') ?? '');
  const kind = String(formData.get('kind') ?? 'closed');
  const wholeDay = formData.get('wholeDay') === 'on';
  const startTime = String(formData.get('startTime') ?? '');
  const endTime = String(formData.get('endTime') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!DATE.test(date)) return { error: 'Valitse päivä.' };
  if (kind !== 'closed' && kind !== 'open') return { error: 'Tuntematon poikkeustyyppi.' };
  if (kind === 'open' && wholeDay) return { error: 'Ylimääräiselle työajalle on annettava kellonajat.' };

  if (!wholeDay) {
    if (!TIME.test(startTime) || !TIME.test(endTime)) return { error: 'Tarkista kellonajat.' };
    if (endTime <= startTime) return { error: 'Lopetuksen on oltava aloituksen jälkeen.' };
  }

  await sql`
    insert into tk.calendar_exceptions (calendar_id, date, kind, start_time, end_time, note)
    values (${calendarId}, ${date}, ${kind},
            ${wholeDay ? null : startTime}, ${wholeDay ? null : endTime}, ${note})
  `;

  revalidatePath(`/kalenterit/${calendarId}`);
  return { ok: 'Poikkeus tallennettu.' };
}

export async function deleteException(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  const calendarId = String(formData.get('calendarId') ?? '');
  await sql`delete from tk.calendar_exceptions where id = ${id}`;
  revalidatePath(`/kalenterit/${calendarId}`);
}
