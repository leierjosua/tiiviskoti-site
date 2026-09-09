'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';

export type ActionState = { error?: string; ok?: string };

const MISSING_TABLE = '42P01';
const MIGRATION_HINT =
  'A/B-taulua ei ole. Aja db/031_ab_tests.sql Supabasen SQL-editorissa postgres-roolilla.';

const isMissingTable = (e: unknown) => (e as { code?: string })?.code === MISSING_TABLE;

const testSchema = z.object({
  name: z.string().min(3, 'Anna testille nimi').max(120),
  hypothesis: z.string().max(500).optional(),
  pathPattern: z.string().min(1).max(200),
  baseStep: z.string().max(40),
  metricStep: z.string().min(1, 'Valitse mitattava askel').max(40),
  labelA: z.string().min(1).max(80),
  labelB: z.string().min(1).max(80),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Anna aloituspäivä'),
});

export async function createAbTest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const parsed = testSchema.safeParse({
    name: String(formData.get('name') ?? '').trim(),
    hypothesis: String(formData.get('hypothesis') ?? '').trim() || undefined,
    pathPattern: String(formData.get('pathPattern') ?? '%').trim() || '%',
    baseStep: String(formData.get('baseStep') ?? ''),
    metricStep: String(formData.get('metricStep') ?? ''),
    labelA: String(formData.get('labelA') ?? '').trim() || 'A',
    labelB: String(formData.get('labelB') ?? '').trim() || 'B',
    startedOn: String(formData.get('startedOn') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const d = parsed.data;
  if (d.baseStep && d.baseStep === d.metricStep) {
    return { error: 'Perusjoukko ja mitattava askel eivät voi olla sama.' };
  }

  try {
    await sql`
      insert into tk.ab_tests
        (name, hypothesis, path_pattern, base_step, metric_step, label_a, label_b, started_on)
      values (${d.name}, ${d.hypothesis ?? null}, ${d.pathPattern},
              ${d.baseStep || null}, ${d.metricStep}, ${d.labelA}, ${d.labelB},
              ${d.startedOn}::date)
    `;
  } catch (e) {
    if (isMissingTable(e)) return { error: MIGRATION_HINT };
    throw e;
  }

  revalidatePath('/analytiikka/ab');
  return { ok: `Testi "${d.name}" kirjattu käyntiin.` };
}

/**
 * Päätä testi.
 *
 * Päättäminen on tarkoituksella oma tekonsa eikä automaattinen: tilasto
 * kertoo milloin ero ei ole enää sattumaa, mutta päätöksen siitä mikä versio
 * jää sivustolle tekee ihminen — ja se päätös pitää voida kirjata myös
 * silloin kun tulos oli "ei eroa".
 */
export async function endAbTest(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  const winner = String(formData.get('winner') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  if (!['a', 'b', 'none'].includes(winner)) return;

  try {
    await sql`
      update tk.ab_tests
         set ended_on = current_date, winner = ${winner}
       where id = ${id}::uuid and ended_on is null
    `;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  revalidatePath('/analytiikka/ab');
}

/** Palauta päättynyt testi käyntiin — päätös tuli liian aikaisin. */
export async function reopenAbTest(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  try {
    await sql`update tk.ab_tests set ended_on = null, winner = null where id = ${id}::uuid`;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  revalidatePath('/analytiikka/ab');
}

export async function deleteAbTest(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  try {
    await sql`delete from tk.ab_tests where id = ${id}::uuid`;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  revalidatePath('/analytiikka/ab');
}
