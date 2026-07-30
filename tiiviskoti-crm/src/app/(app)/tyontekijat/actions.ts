'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';

export type ActionState = { error?: string; ok?: string };

const staffSchema = z.object({
  email: z.string().email('Tarkista sähköpostiosoite'),
  fullName: z.string().min(1, 'Nimi puuttuu'),
  phone: z.string().optional(),
  role: z.enum(['owner', 'admin', 'installer']),
});

/**
 * Lisää työntekijän. Authin tunnusta ei luoda tässä: henkilö saa tunnuksen
 * Supabasen kutsulinkillä, ja `tk.staff.user_id` sidotaan ensimmäisellä
 * kirjautumisella sähköpostin perusteella (ks. lib/session.ts).
 */
export async function addStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const parsed = staffSchema.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    fullName: String(formData.get('fullName') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim() || undefined,
    role: String(formData.get('role') ?? 'installer'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const { email, fullName, phone, role } = parsed.data;
  const existing = await sql`select 1 from tk.staff where lower(email) = ${email}`;
  if (existing.length > 0) return { error: 'Sähköposti on jo listalla.' };

  await sql`
    insert into tk.staff (email, full_name, phone, role)
    values (${email}, ${fullName}, ${phone ?? null}, ${role})
  `;

  revalidatePath('/tyontekijat');
  return { ok: `${fullName} lisätty. Luo tunnus Supabase Authissa samalla sähköpostilla.` };
}

export async function setStaffActive(formData: FormData) {
  const me = await requireManager();
  const id = String(formData.get('id') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';

  // Omistaja ei saa poistaa itseään käytöstä — muuten järjestelmään ei
  // välttämättä pääse enää kukaan sisään.
  if (id === me.id) return;

  await sql`update tk.staff set active = ${active} where id = ${id}`;
  revalidatePath('/tyontekijat');
}
