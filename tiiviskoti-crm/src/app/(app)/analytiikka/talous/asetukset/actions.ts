'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { isCategory } from '@/lib/talous-shared';

export type ActionState = { error?: string; ok?: string };

const MISSING_TABLE = '42P01';
const MIGRATION_HINT =
  'Kulutauluja ei ole. Aja db/030_talous.sql Supabasen SQL-editorissa postgres-roolilla.';

function isMissingTable(e: unknown): boolean {
  return (e as { code?: string })?.code === MISSING_TABLE;
}

/** Prosentti lomakkeelta peruspisteiksi: 12,5 → 1250. */
const pctToBp = (v: number) => Math.round(v * 100);

const settingsSchema = z.object({
  vat:      z.coerce.number().min(0, 'Alv ei voi olla negatiivinen').max(100, 'Alv on enintään 100 %'),
  tekija:   z.coerce.number().min(0).max(100),
  laite:    z.coerce.number().min(0).max(100),
  komissio: z.coerce.number().min(0).max(100),
  provisio: z.coerce.number().min(0).max(100),
  kiinteat: z.coerce.number().min(0).max(1_000_000),
});

export async function saveCostSettings(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  await requireManager();

  const parsed = settingsSchema.safeParse({
    vat: formData.get('vat') || 0,
    tekija: formData.get('tekija') || 0,
    laite: formData.get('laite') || 0,
    komissio: formData.get('komissio') || 0,
    provisio: formData.get('provisio') || 0,
    kiinteat: formData.get('kiinteat') || 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Tarkista luvut — prosentti on 0–100.' };
  }

  const d = parsed.data;
  const metaAuto = formData.get('metaAuto') === 'on';

  try {
    /* Asetusrivi on aina sama rivi (id = true). Upsert eikä update, jotta
       sivu toimii myös silloin kun migraation insert on jostain syystä
       jäänyt tekemättä. */
    await sql`
      insert into tk.cost_settings
        (id, vat_bp, tekija_bp, laite_bp, komissio_bp, provisio_bp, kiinteat_cents_month, meta_auto)
      values (true, ${pctToBp(d.vat)}, ${pctToBp(d.tekija)}, ${pctToBp(d.laite)},
              ${pctToBp(d.komissio)}, ${pctToBp(d.provisio)},
              ${Math.round(d.kiinteat * 100)}, ${metaAuto})
      on conflict (id) do update set
        vat_bp               = excluded.vat_bp,
        tekija_bp            = excluded.tekija_bp,
        laite_bp             = excluded.laite_bp,
        komissio_bp          = excluded.komissio_bp,
        provisio_bp          = excluded.provisio_bp,
        kiinteat_cents_month = excluded.kiinteat_cents_month,
        meta_auto            = excluded.meta_auto,
        updated_at           = now()
    `;
  } catch (e) {
    if (isMissingTable(e)) return { error: MIGRATION_HINT };
    throw e;
  }

  revalidatePath('/analytiikka/talous');
  revalidatePath('/analytiikka/talous/asetukset');
  return { ok: 'Kuluasetukset tallennettu.' };
}

const expenseSchema = z.object({
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Anna kulun päivämäärä'),
  category: z.string().refine(isCategory, 'Valitse kategoria'),
  // Negatiivinen on sallittu: hyvitys kirjataan miinuksena eikä riviä poistaen.
  amount: z.coerce.number().gte(-1_000_000).lte(1_000_000).refine((v) => v !== 0, 'Anna summa'),
  note: z.string().max(200).optional(),
});

export async function addExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireManager();

  const parsed = expenseSchema.safeParse({
    spentOn: String(formData.get('spentOn') ?? ''),
    category: String(formData.get('category') ?? ''),
    amount: formData.get('amount') || 0,
    note: String(formData.get('note') ?? '').trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const d = parsed.data;
  try {
    await sql`
      insert into tk.expenses (spent_on, category, amount_cents, note, created_by)
      values (${d.spentOn}::date, ${d.category}, ${Math.round(d.amount * 100)},
              ${d.note ?? null}, ${staff.id})
    `;
  } catch (e) {
    if (isMissingTable(e)) return { error: MIGRATION_HINT };
    throw e;
  }

  revalidatePath('/analytiikka/talous');
  revalidatePath('/analytiikka/talous/asetukset');
  return { ok: `Kulu ${d.amount.toLocaleString('fi-FI')} € kirjattu.` };
}

export async function deleteExpense(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  try {
    await sql`delete from tk.expenses where id = ${id}::uuid`;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }

  revalidatePath('/analytiikka/talous');
  revalidatePath('/analytiikka/talous/asetukset');
}
