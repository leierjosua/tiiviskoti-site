'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isSlotTaken, sql } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { removeCalendarEventForJob } from '@/lib/deliver';
import { getJob } from '@/lib/data';
import { generateReceiptPdf } from '@/lib/receipt-pdf';
import { generateOfferPdf } from '@/lib/offer-pdf';
import { sendMail } from '@/lib/google';
import { helsinkiDateTime } from '@/lib/time';
import { receiptEmailSubject, receiptEmailHtml, receiptEmailText, offerEmailSubject, offerEmailHtml, offerEmailText } from '@/lib/mail-templates';

const OFFER_VALID_DAYS = 14;

export type ActionState = { error?: string; ok?: string };

const SLOT_TAKEN = 'Aika meni juuri varatuksi. Valitse toinen aika.';

/**
 * `datetime-local` -kentän arvo ('YYYY-MM-DDTHH:MM') Suomen aikana hetkeksi.
 *
 * MIKSI EI `new Date(arvo)`: kentän arvossa ei ole aikavyöhykettä, joten JS
 * tulkitsee sen AJOYMPÄRISTÖN paikallisena aikana. Vercelissä se on UTC, joten
 * kello 9:30 tallentui hetkeksi 09:30Z eli 12:30 Suomen aikaa — kolme tuntia
 * myöhemmäksi, ja joka tallennus siirsi ajan uudelleen. Lomake NÄYTTÄÄ Suomen
 * aikaa (`toLocalInput` käyttää `dateKeyOf`/`timeOf`), joten myös luennan on
 * oltava Suomen aikaa. Sama muunnos kuin varausputkessa.
 */
function parseLocalInput(value: string): Date {
  const [dateKey, time] = value.split('T');
  if (!dateKey || !time) return new Date(NaN);
  return helsinkiDateTime(dateKey, time.slice(0, 5));
}

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
  /* Liidin tunniste tulee esitäytetystä lomakkeesta. Ei skeemassa: jos se
     on roskaa, työ syntyy silti — liidin tilan päivitys on kirjanpitoa,
     ei ehto työn luomiselle. */
  const leadId = String(formData.get('leadId') ?? '').trim() || null;
  const starts = parseLocalInput(d.startsAt);
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
      /* Kampanja ja klikkitunniste siirtyvät liidiltä työlle, jotta
         mainoksesta tullut yhteydenotto raportoituu konversiona vaikka
         kauppa sovittaisiin puhelimessa tai sähköpostitse. Ilman tätä
         Google näkisi klikin muttei koskaan kauppaa. */
      const [lead] = leadId
        ? await tx<{ campaign: string | null; gclid: string | null }[]>`
            select campaign, gclid from tk.leads where id = ${leadId}::uuid
          `
        : [];

      const [job] = await tx<{ id: string }[]>`
        insert into tk.jobs (customer_id, calendar_id, starts_at, ends_at, status,
                             title, address, postal_code, city, notes, source,
                             campaign, gclid)
        values (${customer.id}, ${d.calendarId}, ${starts}, ${ends}, 'confirmed',
                ${d.title}, ${d.address ?? null}, ${d.postalCode ?? null},
                ${d.city ?? null}, ${d.notes ?? null}, ${leadId ? 'liidi' : 'admin'},
                ${lead?.campaign ?? null}, ${lead?.gclid ?? null})
        returning id
      `;
      /* Liidi merkitään asiakkaaksi samassa transaktiossa: muuten se jäisi
         Liidit-sivulle avoimeksi ja joku soittaisi perään turhaan. */
      if (leadId) {
        await tx`
          update tk.leads set status = 'converted', updated_at = now()
           where id = ${leadId}::uuid
        `;
      }
      return job.id;
    }) as unknown as string;
  } catch (err) {
    if (isSlotTaken(err)) return { error: SLOT_TAKEN };
    throw err;
  }

  revalidatePath('/tyot');
  revalidatePath('/kalenteri');
  if (leadId) revalidatePath('/liidit');
  redirect(`/tyot/${jobId}`);
}

export async function rescheduleJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();

  const id = String(formData.get('id') ?? '');
  const startsAt = String(formData.get('startsAt') ?? '');
  const durationMinutes = Number(formData.get('durationMinutes') ?? 0);

  const starts = parseLocalInput(startsAt);
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

/* Merkitse maksetuksi & lähetä kuitti asiakkaalle.
   Kuitti = keikan tiedoista koostettu PDF (työn osuus 90 %, uusi logo), joka
   lähetetään Gmaililla ja kirjataan tk.mail_log:iin (kind='receipt'). */
export async function sendReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Työtä ei löytynyt.' };
  return deliverReceipt(id);
}

/* Kuitin varsinainen tekeminen. Erillään lomakeactionista, koska
   viimeistelyvelho lähettää kuitin osana isompaa tallennusta eikä sillä
   ole FormDataa — eikä kuittilogiikkaa saa olla kahta versiota. */
export async function deliverReceipt(id: string): Promise<ActionState> {
  const job = await getJob(id);
  if (!job) return { error: 'Työtä ei löytynyt.' };
  if (!job.customer_email) return { error: 'Asiakkaalla ei ole sähköpostiosoitetta — lisää se ensin.' };
  if (!job.price_cents || job.price_cents <= 0) return { error: 'Työllä ei ole hintaa, kuittia ei voi tehdä.' };

  const lines = await sql<{ name: string; quantity: number; unit_price_cents: number }[]>`
    select name, quantity, unit_price_cents from tk.job_lines
     where job_id = ${id} order by sort_order
  `;
  const receiptLines = lines.length
    ? lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unit_price_cents }))
    : [{ name: job.title || 'Palvelu', quantity: 1, unitPriceCents: job.price_cents }];

  let pdf: Uint8Array;
  try {
    pdf = await generateReceiptPdf({
      jobNumber: job.job_number,
      createdAt: new Date(),
      workDate: job.starts_at,
      customer: {
        name: job.customer_name ?? 'Asiakas',
        address: job.address,
        postalCode: job.postal_code,
        city: job.city,
        email: job.customer_email,
        phone: job.customer_phone,
      },
      lines: receiptLines,
      totalIncVatCents: job.price_cents,
    });
  } catch (e) {
    return { error: `Kuitin luonti epäonnistui: ${(e as Error).message}` };
  }

  const mailData = {
    jobNumber: job.job_number,
    customerName: job.customer_name ?? 'Asiakas',
    lines: receiptLines.map((l) => ({
      name: l.name,
      qty: l.quantity,
      unit: l.unitPriceCents / 100,
      sum: (l.unitPriceCents * l.quantity) / 100,
    })),
    totalCents: job.price_cents,
  };
  const subject = receiptEmailSubject(mailData);
  const html = receiptEmailHtml(mailData);
  const text = receiptEmailText(mailData);

  let providerId: string | null = null;
  let sendErr: string | null = null;
  try {
    const r = await sendMail({
      to: job.customer_email,
      subject,
      html,
      text,
      attachment: { filename: `kuitti-${job.job_number}.pdf`, mimeType: 'application/pdf', content: pdf },
    });
    providerId = r.id;
  } catch (e) {
    sendErr = (e as Error).message;
  }

  await sql`
    insert into tk.mail_log (job_id, kind, to_email, subject, provider_id, error, sent_at)
    values (${id}, 'receipt', ${job.customer_email}, ${subject},
            ${providerId}, ${sendErr}, ${sendErr ? null : new Date()})
  `;

  revalidatePath(`/tyot/${id}`);
  if (sendErr) return { error: `Kuitin lähetys epäonnistui: ${sendErr}` };
  return { ok: `Kuitti lähetetty osoitteeseen ${job.customer_email}.` };
}

/* Lähetä tarjous asiakkaalle ennen työtä. Kuin kuitti, mutta ei muuta työn
   tilaa: PDF (VOIMASSA 14 pv) + sähköposti + tk.mail_log (kind='offer'). */
export async function sendOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Työtä ei löytynyt.' };

  const job = await getJob(id);
  if (!job) return { error: 'Työtä ei löytynyt.' };
  if (!job.customer_email) return { error: 'Asiakkaalla ei ole sähköpostiosoitetta — lisää se ensin.' };
  if (!job.price_cents || job.price_cents <= 0) return { error: 'Työllä ei ole hintaa, tarjousta ei voi tehdä.' };

  const lines = await sql<{ name: string; quantity: number; unit_price_cents: number }[]>`
    select name, quantity, unit_price_cents from tk.job_lines
     where job_id = ${id} order by sort_order
  `;
  const offerLines = lines.length
    ? lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unit_price_cents }))
    : [{ name: job.title || 'Palvelu', quantity: 1, unitPriceCents: job.price_cents }];

  let pdf: Uint8Array;
  try {
    pdf = await generateOfferPdf({
      jobNumber: job.job_number,
      createdAt: new Date(),
      workDate: job.starts_at,
      customer: {
        name: job.customer_name ?? 'Asiakas',
        address: job.address,
        postalCode: job.postal_code,
        city: job.city,
        email: job.customer_email,
        phone: job.customer_phone,
      },
      lines: offerLines,
      totalIncVatCents: job.price_cents,
    });
  } catch (e) {
    return { error: `Tarjouksen luonti epäonnistui: ${(e as Error).message}` };
  }

  const mailData = {
    jobNumber: job.job_number,
    customerName: job.customer_name ?? 'Asiakas',
    lines: offerLines.map((l) => ({
      name: l.name,
      qty: l.quantity,
      unit: l.unitPriceCents / 100,
      sum: (l.unitPriceCents * l.quantity) / 100,
    })),
    totalCents: job.price_cents,
    validDays: OFFER_VALID_DAYS,
  };
  const subject = offerEmailSubject(mailData);
  const html = offerEmailHtml(mailData);
  const text = offerEmailText(mailData);

  let providerId: string | null = null;
  let sendErr: string | null = null;
  try {
    const r = await sendMail({
      to: job.customer_email,
      subject,
      html,
      text,
      attachment: { filename: `tarjous-${job.job_number}.pdf`, mimeType: 'application/pdf', content: pdf },
    });
    providerId = r.id;
  } catch (e) {
    sendErr = (e as Error).message;
  }

  await sql`
    insert into tk.mail_log (job_id, kind, to_email, subject, provider_id, error, sent_at)
    values (${id}, 'offer', ${job.customer_email}, ${subject},
            ${providerId}, ${sendErr}, ${sendErr ? null : new Date()})
  `;

  revalidatePath(`/tyot/${id}`);
  if (sendErr) return { error: `Tarjouksen lähetys epäonnistui: ${sendErr}` };
  return { ok: `Tarjous lähetetty osoitteeseen ${job.customer_email}.` };
}

/* Sisäinen muistiinpano keikalle.

   Lisätään olemassa olevaan `notes`-kenttään aikaleimallisena rivinä eikä
   omaan tauluun: kenttä on jo kaikkialla näkyvissä (työmääräin, kalenterin
   kortti, asentajan päivälista), joten erillinen taulu tarkoittaisi että
   puolet merkinnöistä jäisi näkymättä sinne missä niitä luetaan.

   Vanha teksti säilyy sellaisenaan — merkintä on kirjaus, ei korvaus. */
export async function appendJobNote(formData: FormData) {
  await requireStaff();

  const id = String(formData.get('id') ?? '');
  const text = String(formData.get('note') ?? '').trim().slice(0, 500);
  if (!id || !text) return;

  const stamp = new Date().toLocaleString('fi-FI', {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki',
  });

  await sql`
    update tk.jobs
       set notes = case
                     when notes is null or notes = '' then ${`${stamp} — ${text}`}
                     else notes || ${`\n${stamp} — ${text}`}
                   end
     where id = ${id}
  `;

  revalidatePath(`/tyot/${id}`);
  revalidatePath('/');
}
