'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { finalTotal, type Line } from '@/lib/completion';
import { deliverReceipt } from '../../actions';

export type CompleteState = { error?: string; ok?: string };

const lineSchema = z.object({
  catalogId: z.string().nullable(),
  name: z.string().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(999),
  unitPriceCents: z.coerce.number().int().min(-1_000_000).max(1_000_000),
});

const schema = z.object({
  id: z.string().uuid(),
  lines: z.array(lineSchema).max(100),
  discountCents: z.coerce.number().int().min(0).max(1_000_000),
  discountReason: z.string().max(200),
  paid: z.boolean(),
  satisfaction: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  sendReceiptMail: z.boolean(),
});

export type CompleteInput = z.input<typeof schema>;

/**
 * Keikan viimeistely: rivit, hinta, maksutila, tyytyväisyys ja tila
 * yhdellä kertaa.
 *
 * Rivit korvataan kokonaan sen sijaan että niitä päivitettäisiin
 * yksitellen: velho lähettää aina koko listan, ja korvaaminen on ainoa
 * tapa jolla poistettu rivi oikeasti katoaa. Sama tapa kuin
 * `saveJobLines`illa varausvahvistuksessa.
 *
 * Kuitti lähetetään vasta transaktion jälkeen. Sähköpostin lähetys voi
 * kestää sekunteja ja epäonnistua — jos se olisi transaktion sisällä,
 * Gmailin nikottelu peruisi koko viimeistelyn ja asentaja seisoisi pihalla
 * lomakkeen kanssa uudestaan.
 */
export async function completeJob(input: CompleteInput): Promise<CompleteState> {
  await requireStaff();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };
  }
  const d = parsed.data;

  const lines = d.lines as Line[];
  if (lines.length === 0) return { error: 'Lisää vähintään yksi rivi.' };

  const total = finalTotal(lines, d.discountCents);

  /* Alennus tallennetaan omana miinusrivinään eikä hintaa hiljaa
     pienentämällä: kuitissa on näyttävä mistä erotus tuli. */
  const stored = [...lines];
  if (d.discountCents > 0) {
    stored.push({
      catalogId: null,
      name: d.discountReason.trim() || 'Alennus',
      quantity: 1,
      unitPriceCents: -d.discountCents,
    });
  }

  try {
    await sql.begin(async (tx) => {
      await tx`delete from tk.job_lines where job_id = ${d.id}`;
      for (const [i, l] of stored.entries()) {
        await tx`
          insert into tk.job_lines (job_id, name, quantity, unit_price_cents, minutes, sort_order)
          values (${d.id}, ${l.name}, ${l.quantity}, ${l.unitPriceCents}, 0, ${i})
        `;
      }
      await tx`
        update tk.jobs
           set price_cents  = ${total},
               status       = 'done',
               paid         = ${d.paid},
               satisfaction = ${d.satisfaction},
               completed_at = now()
         where id = ${d.id}
      `;
    });
  } catch (err) {
    /* 42703 = saraketta ei ole. Migraatio 016 ajetaan käsin
       postgres-roolilla, joten tämä on se virhe joka näkyy jos se on
       jäänyt ajamatta — ja geneerinen kantavirhe ei kertoisi mitä tehdä. */
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42703') {
      return { error: 'Tietokannasta puuttuu viimeistelyn sarakkeet. Aja db/016_job_completion.sql.' };
    }
    throw err;
  }

  revalidatePath(`/tyot/${d.id}`);
  revalidatePath('/tyot');
  revalidatePath('/kalenteri');
  revalidatePath('/');

  if (d.sendReceiptMail) {
    const r = await deliverReceipt(d.id);
    /* Keikka on jo viimeistelty kantaan. Kuitin epäonnistuminen ei siis
       peru mitään — se on tieto, ei virhe joka pitäisi yrittää uudelleen
       koko lomakkeella. */
    if (r.error) return { ok: `Keikka viimeistelty. Kuitti ei lähtenyt: ${r.error}` };
    return { ok: 'Keikka viimeistelty ja kuitti lähetetty.' };
  }

  return { ok: 'Keikka viimeistelty.' };
}
