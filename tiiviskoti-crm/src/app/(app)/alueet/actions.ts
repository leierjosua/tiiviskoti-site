'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';

export type ActionState = { error?: string; ok?: string };

/** '00, 01,02' → ['00','01','02']. Vain numerot, 1–5 merkkiä. */
function parsePrefixes(raw: string): string[] | null {
  const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((p) => !/^\d{1,5}$/.test(p))) return null;
  return [...new Set(parts)];
}

const areaSchema = z.object({
  name: z.string().min(1, 'Anna alueelle nimi').max(100),
  travelFee: z.coerce.number().min(0, 'Matkalisä ei voi olla negatiivinen').max(2000),
});

export async function createArea(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const parsed = areaSchema.safeParse({
    name: String(formData.get('name') ?? '').trim(),
    travelFee: formData.get('travelFee') || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const prefixes = parsePrefixes(String(formData.get('prefixes') ?? ''));
  if (!prefixes) {
    return { error: 'Anna postinumeron etuliitteet, esim. "00 01 02" tai "33".' };
  }

  await sql`
    insert into tk.areas (name, postal_prefixes, travel_fee_cents)
    values (${parsed.data.name}, ${prefixes}, ${Math.round(parsed.data.travelFee * 100)})
  `;
  revalidatePath('/alueet');
  return { ok: `Alue ${parsed.data.name} luotu.` };
}

export async function updateArea(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const id = String(formData.get('id') ?? '');
  const parsed = areaSchema.safeParse({
    name: String(formData.get('name') ?? '').trim(),
    travelFee: formData.get('travelFee') || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const prefixes = parsePrefixes(String(formData.get('prefixes') ?? ''));
  if (!prefixes) return { error: 'Anna postinumeron etuliitteet, esim. "00 01 02".' };

  await sql`
    update tk.areas
       set name = ${parsed.data.name},
           postal_prefixes = ${prefixes},
           travel_fee_cents = ${Math.round(parsed.data.travelFee * 100)},
           active = ${formData.get('active') === 'on'}
     where id = ${id}
  `;
  revalidatePath('/alueet');
  return { ok: 'Alue tallennettu.' };
}

export async function deleteArea(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');

  // Alue jolla on töitä ei katoa: poistetaan käytöstä sen sijaan, jottei
  // historian työn alue muuttuisi tuntemattomaksi.
  const [used] = await sql<{ n: number }[]>`
    select count(*)::int as n from tk.jobs j
      join tk.calendar_areas ca on ca.calendar_id = j.calendar_id
     where ca.area_id = ${id}
  `;
  if (used && used.n > 0) {
    await sql`update tk.areas set active = false where id = ${id}`;
  } else {
    await sql`delete from tk.areas where id = ${id}`;
  }
  revalidatePath('/alueet');
}

/** Kalenterin alueet: mitkä alueet tämä kalenteri palvelee. */
export async function setCalendarAreas(formData: FormData) {
  await requireManager();
  const calendarId = String(formData.get('calendarId') ?? '');
  const areaIds = formData.getAll('areaIds').map((v) => String(v));

  await sql.begin(async (tx) => {
    await tx`delete from tk.calendar_areas where calendar_id = ${calendarId}`;
    for (const areaId of areaIds) {
      await tx`
        insert into tk.calendar_areas (calendar_id, area_id) values (${calendarId}, ${areaId})
        on conflict do nothing
      `;
    }
  });

  revalidatePath(`/kalenterit/${calendarId}`);
  revalidatePath('/alueet');
}

const LEAD_STATUSES = ['new', 'contacted', 'converted', 'rejected'] as const;

export async function setLeadStatus(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) return;
  await sql`update tk.leads set status = ${status} where id = ${id}`;
  revalidatePath('/liidit');
}
