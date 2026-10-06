'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { ownsJob, requireStaff } from '@/lib/session';
import { finalTotal, type Line } from '@/lib/completion';
import { deliverReceipt } from '../../actions';
import { isMissingTable } from '@/lib/job-report';
import { decimalOf, reportProblems, STEP_KEYS, type StepAnswers, type WorkReport } from '@/lib/work-report';

export type CompleteState = { error?: string; ok?: string };

const lineSchema = z.object({
  catalogId: z.string().nullable(),
  name: z.string().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(999),
  unitPriceCents: z.coerce.number().int().min(-1_000_000).max(1_000_000),
});

/* Raportin MUOTO tarkistetaan zodilla, SISÄLTÖ (pakolliset vaiheet,
   ajat, kuittaus) samalla `reportProblems`-funktiolla jota velho käyttää.
   Selaimen tarkistus on vain mukavuus: action on oma päätepisteensä. */
const reportSchema = z.object({
  workDate: z.string().max(10),
  installers: z.string().max(300),
  customerName: z.string().max(300),
  customerPhone: z.string().max(100),
  address: z.string().max(400),
  unit: z.string().max(100),
  startedAt: z.string().max(5),
  finishedAt: z.string().max(5),
  travelHours: z.string().max(20),
  windows: z.coerce.number(),
  balconyDoors: z.coerce.number(),
  otherDoors: z.coerce.number(),
  steps: z.record(z.string(), z.enum(['done', 'na'])),
  sealantM: z.string().max(20),
  siliconePcs: z.string().max(20),
  acrylicPcs: z.string().max(20),
  notes: z.string().max(4000),
  customerAckName: z.string().max(300),
});

const schema = z.object({
  id: z.string().uuid(),
  lines: z.array(lineSchema).max(100),
  discountCents: z.coerce.number().int().min(0).max(1_000_000),
  discountReason: z.string().max(200),
  paid: z.boolean(),
  satisfaction: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  sendReceiptMail: z.boolean(),
  report: reportSchema,
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
  const staff = await requireStaff();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };
  }
  const d = parsed.data;

  /* Sivun rajaus ei riitä: action on oma päätepisteensä, ja sen voi
     kutsua ohi käyttöliittymän millä tahansa työn tunnisteella. */
  if (!(await ownsJob(staff, d.id))) return { error: 'Työtä ei löytynyt.' };

  const lines = d.lines as Line[];
  if (lines.length === 0) return { error: 'Lisää vähintään yksi rivi.' };

  /* Työraportti on pakollinen: jokainen työvaihe kuitattu, ajat ja
     asiakkaan kuittaus. Tuntemattomat avaimet pudotetaan pois, jottei
     kantaan päädy mitään mitä lomakkeella ei ole. */
  const steps: StepAnswers = {};
  for (const k of STEP_KEYS) {
    const v = d.report.steps[k];
    if (v === 'done' || v === 'na') steps[k] = v;
  }
  const report: WorkReport = { ...d.report, steps };
  const problems = reportProblems(report);
  if (problems.length > 0) return { error: `Työraportti on kesken. ${problems.join(' ')}` };

  const travel = decimalOf(report.travelHours);
  const sealant = decimalOf(report.sealantM);
  const silicone = decimalOf(report.siliconePcs);
  const acrylic = decimalOf(report.acrylicPcs);
  const text = (v: string) => v.trim() || null;

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
      await tx`
        insert into tk.job_reports (
          job_id, work_date, installers, customer_name, customer_phone, address, unit,
          started_at, finished_at, travel_hours, windows, balcony_doors, other_doors,
          steps, sealant_m, silicone_pcs, acrylic_pcs, notes, customer_ack_name,
          created_by, updated_by
        ) values (
          ${d.id}, ${report.workDate}, ${report.installers.trim()},
          ${text(report.customerName)}, ${text(report.customerPhone)},
          ${text(report.address)}, ${text(report.unit)},
          ${report.startedAt}, ${report.finishedAt}, ${travel},
          ${report.windows}, ${report.balconyDoors}, ${report.otherDoors},
          ${tx.json(steps)}, ${sealant}, ${silicone}, ${acrylic},
          ${text(report.notes)}, ${report.customerAckName.trim()},
          ${staff.id}, ${staff.id}
        )
        on conflict (job_id) do update set
          work_date = excluded.work_date, installers = excluded.installers,
          customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
          address = excluded.address, unit = excluded.unit,
          started_at = excluded.started_at, finished_at = excluded.finished_at,
          travel_hours = excluded.travel_hours, windows = excluded.windows,
          balcony_doors = excluded.balcony_doors, other_doors = excluded.other_doors,
          steps = excluded.steps, sealant_m = excluded.sealant_m,
          silicone_pcs = excluded.silicone_pcs, acrylic_pcs = excluded.acrylic_pcs,
          notes = excluded.notes, customer_ack_name = excluded.customer_ack_name,
          updated_by = excluded.updated_by
      `;
    });
  } catch (err) {
    /* 42P01 = taulua ei ole: db/033 ajamatta. Koko viimeistely perutaan
       (sama transaktio), koska raportti on pakollinen osa sitä. */
    if (isMissingTable(err)) {
      return { error: 'Tietokannasta puuttuu työraporttien taulu. Aja db/033_job_reports.sql.' };
    }
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
