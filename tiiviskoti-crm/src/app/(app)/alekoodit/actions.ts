'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { normalizeCode } from '@/lib/discounts';

export type ActionState = { error?: string; ok?: string };

/* Lomake antaa euroja ja päivämääriä, kanta ottaa senttejä ja timestampteja.
   Käännös tehdään tässä yhdessä paikassa, jotta luonti ja muokkaus eivät
   voi tulkita samaa lomaketta eri tavoin. */
const codeSchema = z.object({
  description: z.string().max(200).optional(),
  kind: z.enum(['fixed', 'percent']),
  amount: z.coerce.number().min(0).max(1000),
  percent: z.coerce.number().int().min(0).max(100),
  minTotal: z.coerce.number().min(0).max(10000),
  maxUses: z.coerce.number().int().min(0).max(100000),
  maxPerCustomer: z.coerce.number().int().min(1).max(100),
});

type Parsed = z.infer<typeof codeSchema>;

function readForm(formData: FormData) {
  return codeSchema.safeParse({
    description: String(formData.get('description') ?? '').trim(),
    kind: String(formData.get('kind') ?? 'fixed'),
    amount: formData.get('amount') || 0,
    percent: formData.get('percent') || 0,
    minTotal: formData.get('minTotal') || 0,
    maxUses: formData.get('maxUses') || 0,
    maxPerCustomer: formData.get('maxPerCustomer') || 1,
  });
}

/** '' → null, '2026-09-30' → päivän loppu. Voimassaolo päättyy vasta kun
 *  päivä on kokonaan mennyt: mainoksessa lukee "voimassa 30.9. asti". */
function endOfDay(raw: FormDataEntryValue | null): Date | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T23:59:59.999+03:00`);
}

function startOfDay(raw: FormDataEntryValue | null): Date | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000+03:00`);
}

/** Kanta hylkää arvottoman koodin check-rajoitteella; sanotaan se selvemmin. */
function valueError(p: Parsed): string | null {
  if (p.kind === 'fixed' && p.amount <= 0) return 'Anna alennuksen määrä euroina.';
  if (p.kind === 'percent' && p.percent <= 0) return 'Anna alennusprosentti.';
  return null;
}

export async function createCode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const code = normalizeCode(String(formData.get('code') ?? ''));
  if (code.length < 3) {
    return { error: 'Koodin pitää olla vähintään 3 merkkiä (A–Z, 0–9).' };
  }

  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };
  const p = parsed.data;
  const bad = valueError(p);
  if (bad) return { error: bad };

  const startsAt = startOfDay(formData.get('startsAt'));
  const expiresAt = endOfDay(formData.get('expiresAt'));
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    return { error: 'Päättymispäivä on ennen alkamispäivää.' };
  }

  try {
    await sql`
      insert into tk.discount_codes
        (code, description, kind, amount_cents, percent, min_total_cents,
         max_uses, max_uses_per_customer, starts_at, expires_at)
      values (${code}, ${p.description || null}, ${p.kind},
              ${Math.round(p.amount * 100)}, ${p.percent}, ${Math.round(p.minTotal * 100)},
              ${p.maxUses > 0 ? p.maxUses : null}, ${p.maxPerCustomer},
              ${startsAt}, ${expiresAt})
    `;
  } catch (e) {
    // Koodi on unique: sama kampanja kahdesti on tavallinen näppäilyvirhe.
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') {
      return { error: `Koodi ${code} on jo olemassa.` };
    }
    throw e;
  }

  revalidatePath('/alekoodit');
  return { ok: `Koodi ${code} luotu.` };
}

export async function updateCode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const id = String(formData.get('id') ?? '');
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };
  const p = parsed.data;
  const bad = valueError(p);
  if (bad) return { error: bad };

  /* Koodin tekstiä ei voi muuttaa: se on painettu mainokseen, ja jo
     kirjatut käyttökerrat viittaavat tähän riviin. Väärin kirjoitettu koodi
     poistetaan ja luodaan uudelleen. */
  await sql`
    update tk.discount_codes
       set description = ${p.description || null},
           kind = ${p.kind},
           amount_cents = ${Math.round(p.amount * 100)},
           percent = ${p.percent},
           min_total_cents = ${Math.round(p.minTotal * 100)},
           max_uses = ${p.maxUses > 0 ? p.maxUses : null},
           max_uses_per_customer = ${p.maxPerCustomer},
           starts_at = ${startOfDay(formData.get('startsAt'))},
           expires_at = ${endOfDay(formData.get('expiresAt'))},
           active = ${formData.get('active') === 'on'}
     where id = ${id}
  `;
  revalidatePath('/alekoodit');
  return { ok: 'Koodi tallennettu.' };
}

export async function deleteCode(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');

  /* Käytettyä koodia ei poisteta: käyttökerrat katoaisivat mukana
     (cascade), ja niistä koostuu koko kampanjan tulos. Se vain suljetaan.
     Sama valinta kuin palvelualueilla, joilla on töitä. */
  const [used] = await sql<{ n: number }[]>`
    select count(*)::int as n from tk.discount_redemptions where code_id = ${id}
  `;
  if (used && used.n > 0) {
    await sql`update tk.discount_codes set active = false where id = ${id}`;
  } else {
    await sql`delete from tk.discount_codes where id = ${id}`;
  }
  revalidatePath('/alekoodit');
}
