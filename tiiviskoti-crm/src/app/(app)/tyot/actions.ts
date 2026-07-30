'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isSlotTaken, sql } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { removeCalendarEventForJob } from '@/lib/deliver';

export type ActionState = { error?: string; ok?: string };

const SLOT_TAKEN = 'Aika meni juuri varatuksi. Valitse toinen aika.';

const createSchema = z.object({
  calendarId: z.string().uuid('Valitse kalenteri'),
  startsAt: z.string().min(1, 'Valitse aika'),
  durationMinutes: z.coerce.number().int().min(15).max(600),
  title: z.string().min(1, 'Anna työlle nimi'),
  customerName: z.string().min(1, 'Asiakkaan nimi puuttuu'),
  email: z.string().email('Tarkista sähköposti').or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
});

export async function createJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();

  const parsed = createSchema.safeParse({
    calendarId: String(formData.get('calendarId') ?? ''),
    startsAt: String(formData.get('startsAt') ?? ''),
    durationMinutes: formData.get('durationMinutes'),
    title: String(formData.get('title') ?? '').trim(),
    customerName: String(formData.get('customerName') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim() || undefined,
    address: String(formData.get('address') ?? '').trim() || undefined,
    postalCode: String(formData.get('postalCode') ?? '').trim() || undefined,
    city: String(formData.get('city') ?? '').trim() || undefined,
    notes: String(formData.get('notes') ?? '').trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const d = parsed.data;
  const starts = new Date(d.startsAt);
  if (Number.isNaN(starts.getTime())) return { error: 'Aika ei kelpaa.' };
  const ends = new Date(starts.getTime() + d.durationMinutes * 60_000);

  let jobId: string;
  try {
    // Asiakas ja työ syntyvät joko molemmat tai ei kumpikaan: ilman
    // transaktiota päällekkäinen aika jättäisi orvon asiakasrivin.
    jobId = await sql.begin(async (tx) => {
      const [customer] = await tx<{ id: string }[]>`
        insert into tk.customers (full_name, email, phone, address, postal_code, city)
        values (${d.customerName}, ${d.email || null}, ${d.phone ?? null},
                ${d.address ?? null}, ${d.postalCode ?? null}, ${d.city ?? null})
        returning id
      `;
      const [job] = await tx<{ id: string }[]>`
        insert into tk.jobs (customer_id, calendar_id, starts_at, ends_at, status,
                             title, address, postal_code, city, notes, source)
        values (${customer.id}, ${d.calendarId}, ${starts}, ${ends}, 'confirmed',
                ${d.title}, ${d.address ?? null}, ${d.postalCode ?? null},
                ${d.city ?? null}, ${d.notes ?? null}, 'admin')
        returning id
      `;
      return job.id;
    }) as unknown as string;
  } catch (err) {
    if (isSlotTaken(err)) return { error: SLOT_TAKEN };
    throw err;
  }

  revalidatePath('/tyot');
  revalidatePath('/kalenteri');
  redirect(`/tyot/${jobId}`);
}

export async function rescheduleJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();

  const id = String(formData.get('id') ?? '');
  const startsAt = String(formData.get('startsAt') ?? '');
  const durationMinutes = Number(formData.get('durationMinutes') ?? 0);

  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime())) return { error: 'Aika ei kelpaa.' };
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15) return { error: 'Tarkista kesto.' };
  const ends = new Date(starts.getTime() + durationMinutes * 60_000);

  try {
    await sql`update tk.jobs set starts_at = ${starts}, ends_at = ${ends} where id = ${id}`;
  } catch (err) {
    if (isSlotTaken(err)) return { error: SLOT_TAKEN };
    throw err;
  }

  revalidatePath(`/tyot/${id}`);
  revalidatePath('/kalenteri');
  return { ok: 'Aika siirretty.' };
}

const editSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, 'Anna työlle nimi').max(300),
  address: z.string().max(300).optional(),
  postalCode: z.string().regex(/^\d{5}$/, 'Postinumero on 5 numeroa').or(z.literal('')),
  city: z.string().max(100).optional(),
  priceEur: z.coerce.number().min(0, 'Hinta ei voi olla negatiivinen').max(100000),
  notes: z.string().max(4000).optional(),
  customerName: z.string().min(1, 'Asiakkaan nimi puuttuu').max(200),
  customerEmail: z.string().email('Tarkista sähköposti').or(z.literal('')),
  customerPhone: z.string().max(60).optional(),
});

/**
 * Työn ja sen asiakkaan tietojen korjaus.
 *
 * Hinta annetaan euroina ja tallennetaan sentteinä. Rivejä ei kosketa: jos
 * hintaa muutetaan käsin, se voi poiketa rivien summasta — se on tarkoitus,
 * koska asentaja voi sopia asiakkaan kanssa toisenlaisen hinnan paikan
 * päällä. Panel kertoo erosta työn sivulla.
 */
export async function updateJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();

  const parsed = editSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    title: String(formData.get('title') ?? '').trim(),
    address: String(formData.get('address') ?? '').trim() || undefined,
    postalCode: String(formData.get('postalCode') ?? '').trim(),
    city: String(formData.get('city') ?? '').trim() || undefined,
    priceEur: formData.get('priceEur') ?? 0,
    notes: String(formData.get('notes') ?? '').trim() || undefined,
    customerName: String(formData.get('customerName') ?? '').trim(),
    customerEmail: String(formData.get('customerEmail') ?? '').trim(),
    customerPhone: String(formData.get('customerPhone') ?? '').trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const d = parsed.data;
  await sql.begin(async (tx) => {
    await tx`
      update tk.jobs
         set title = ${d.title},
             address = ${d.address ?? null},
             postal_code = ${d.postalCode || null},
             city = ${d.city ?? null},
             price_cents = ${Math.round(d.priceEur * 100)},
             notes = ${d.notes ?? null}
       where id = ${d.id}
    `;
    // Asiakasrivi on jaettu useamman työn kesken, joten muutos näkyy myös
    // asiakkaan muissa töissä — se on oikein, kyse on samasta henkilöstä.
    await tx`
      update tk.customers c
         set full_name = ${d.customerName},
             email = ${d.customerEmail || null},
             phone = ${d.customerPhone ?? null}
        from tk.jobs j
       where j.id = ${d.id} and c.id = j.customer_id
    `;
  });

  revalidatePath(`/tyot/${d.id}`);
  revalidatePath('/tyot');
  revalidatePath('/asiakkaat');
  return { ok: 'Tiedot tallennettu.' };
}

/** Työn poisto. Vain peruttu työ voi kadota, jottei laskutettavaa työtä
 *  hävitetä vahingossa — muu poistetaan perumalla ensin. */
export async function deleteJob(formData: FormData) {
  const staff = await requireStaff();
  if (staff.role === 'installer') return;

  const id = String(formData.get('id') ?? '');
  await removeCalendarEventForJob(id);
  const rows = await sql<{ id: string }[]>`
    delete from tk.jobs where id = ${id} and status = 'cancelled' returning id
  `;
  revalidatePath('/tyot');
  revalidatePath('/kalenteri');
  if (rows.length > 0) redirect('/tyot');
}

const STATUSES = ['tentative', 'confirmed', 'done', 'cancelled'] as const;

export async function setJobStatus(formData: FormData) {
  await requireStaff();

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return;

  // Perutun työn palauttaminen voi törmätä aikaan, joka on sillä välin
  // varattu toiselle — silloin muutos vain ei mene läpi.
  try {
    await sql`update tk.jobs set status = ${status} where id = ${id}`;
  } catch (err) {
    if (!isSlotTaken(err)) throw err;
    return;
  }

  // Peruttu työ pois myös Google-kalenterista, jottei asentaja aja paikalle
  // työhön jota ei ole.
  if (status === 'cancelled') await removeCalendarEventForJob(id);

  revalidatePath(`/tyot/${id}`);
  revalidatePath('/tyot');
  revalidatePath('/kalenteri');
}
