'use server';

import { randomUUID } from 'node:crypto';
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
import { parseBookingStart } from '@/lib/time';
import { receiptEmailSubject, receiptEmailHtml, receiptEmailText, offerEmailSubject, offerEmailHtml, offerEmailText } from '@/lib/mail-templates';

const OFFER_VALID_DAYS = 14;

export type ActionState = { error?: string; ok?: string };

const SLOT_TAKEN = 'Aika meni juuri varatuksi. Valitse toinen aika.';

const createSchema = z.object({
  calendarId: z.string().uuid('Valitse kalenteri'),
  /* Toinen asentaja samalle keikalle. Tyhjä = yhden miehen keikka. */
  calendarId2: z.string().uuid('Valitse toinen asentaja').or(z.literal('')),
  /* Tarjous josta aika laitetaan. Tyhjä = työ ei tule tarjouksesta. */
  offerId: z.string().uuid().or(z.literal('')),
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
    calendarId2: String(formData.get('calendarId2') ?? ''),
    offerId: String(formData.get('offerId') ?? ''),
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
  if (d.calendarId2 && d.calendarId2 === d.calendarId) {
    return { error: 'Sama asentaja on valittu kahdesti.' };
  }
  /* Liidin tunniste tulee esitäytetystä lomakkeesta. Ei skeemassa: jos se
     on roskaa, työ syntyy silti — liidin tilan päivitys on kirjanpitoa,
     ei ehto työn luomiselle. */
  const leadId = String(formData.get('leadId') ?? '').trim() || null;
  const starts = parseBookingStart(d.startsAt);
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
        ? await tx<{ campaign: string | null; gclid: string | null; gclid_kind: string | null }[]>`
            select campaign, gclid, gclid_kind from tk.leads where id = ${leadId}::uuid
          `
        /* Tarjouksesta tai puhelimessa sovittu kauppa ei tule liidiriviltä,
           joten klikkitunniste jäi kokonaan kirjaamatta eikä kauppa
           raportoitunut Adsille — mainos näytti tuloksettomalta vaikka se oli
           tuonut asiakkaan. Sähköposti on ainoa yhteinen tunniste, joten
           haetaan sillä. Vain klikkitunnisteen kantava liidi kelpaa ja tuorein
           voittaa; liian vanhan klikin Ads hylkää itse (90 vrk) eikä
           `ads-sync` yritä sitä uudelleen. */
        : d.email
          ? await tx<{ campaign: string | null; gclid: string | null; gclid_kind: string | null }[]>`
              select campaign, gclid, gclid_kind from tk.leads
               where lower(email) = lower(${d.email})
                 and gclid is not null
               order by created_at desc
               limit 1
            `
          : [];

      /* Tarjouksen rivit ja summa siirtyvät työlle, jotta kuitti ja
         liikevaihto vastaavat sitä mitä asiakkaalle luvattiin — muuten
         hinta pitäisi näpytellä uudelleen työn sivulla. */
      const [offer] = d.offerId
        ? await tx<{ lines: { name: string; quantity: number; unit_price_cents: number }[];
                     total_cents: number; offer_number: string }[]>`
            select lines, total_cents, offer_number
              from tk.offers where id = ${d.offerId}::uuid
          `
        : [];

      const source = d.offerId ? 'tarjous' : leadId ? 'liidi' : 'admin';

      const [job] = await tx<{ id: string; job_number: string }[]>`
        insert into tk.jobs (customer_id, calendar_id, starts_at, ends_at, status,
                             title, address, postal_code, city, notes, source,
                             campaign, gclid, ads_click_kind, price_cents)
        values (${customer.id}, ${d.calendarId}, ${starts}, ${ends}, 'confirmed',
                ${d.title}, ${d.address ?? null}, ${d.postalCode ?? null},
                ${d.city ?? null}, ${d.notes ?? null}, ${source},
                ${lead?.campaign ?? null}, ${lead?.gclid ?? null},
                ${lead?.gclid_kind ?? null}, ${offer?.total_cents ?? 0})
        returning id, job_number
      `;

      if (offer?.lines?.length) {
        for (const [i, l] of offer.lines.entries()) {
          await tx`
            insert into tk.job_lines (job_id, name, quantity, unit_price_cents, sort_order)
            values (${job.id}, ${l.name}, ${Math.max(1, l.quantity)},
                    ${l.unit_price_cents}, ${i})
          `;
        }
      }

      /* Työpari: oma rivi toisen asentajan kalenteriin, jotta hänenkin
         aikansa on varattu. Hinta on nolla ja rivit ovat päätyöllä — sama
         keikka ei saa näkyä liikevaihdossa kahteen kertaan.

         Kampanja kulkee paririville raportointia varten, mutta KLIKKITUNNISTE
         EI: ads-sync lähettää jokaisen gclidin kantavan työn, joten pari
         raportoisi saman kaupan Google Adsille toiseen kertaan. */
      if (d.calendarId2) {
        const [mate] = await tx<{ id: string }[]>`
          insert into tk.jobs (customer_id, calendar_id, starts_at, ends_at, status,
                               title, address, postal_code, city, notes, source,
                               campaign, gclid, price_cents)
          values (${customer.id}, ${d.calendarId2}, ${starts}, ${ends}, 'confirmed',
                  ${`${d.title} (työpari)`}, ${d.address ?? null}, ${d.postalCode ?? null},
                  ${d.city ?? null},
                  ${[`Työpari keikalla ${job.job_number} — laskutus ja rivit siellä.`,
                     d.notes].filter(Boolean).join('\n\n')},
                  ${source}, ${lead?.campaign ?? null}, null, 0)
          returning id
        `;
        const crew = randomUUID();
        await tx`update tk.jobs set crew_group_id = ${crew}::uuid where id = ${job.id}`;
        await tx`update tk.jobs set crew_group_id = ${crew}::uuid where id = ${mate.id}`;
        if (d.offerId) {
          await tx`update tk.jobs set offer_id = ${d.offerId}::uuid where id = ${mate.id}`;
        }
      }

      if (d.offerId) {
        await tx`update tk.jobs set offer_id = ${d.offerId}::uuid where id = ${job.id}`;
        /* Aika kalenterissa tarkoittaa että kauppa syntyi. Hylättyä tarjousta
           ei herätetä henkiin: jos joku on merkinnyt sen hylätyksi, tila on
           tuoreempi tieto kuin tämä nappi. */
        await tx`
          update tk.offers set status = 'accepted'
           where id = ${d.offerId}::uuid and status in ('draft', 'sent', 'expired')
        `;
      }
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
    /* Sarake puuttuu = db/026 on ajamatta. Kerrotaan se suoraan: muuten
       tästä tulee 500 eikä kukaan tiedä mitä tehdä. */
    if ((err as { code?: string })?.code === '42703') {
      return { error: 'Tietokannasta puuttuu sarake — aja db/026_offer_booking.sql Supabasen SQL-editorissa.' };
    }
    throw err;
  }

  revalidatePath('/tyot');
  revalidatePath('/kalenteri');
  if (leadId) revalidatePath('/liidit');
  if (d.offerId) { revalidatePath('/tarjoukset'); revalidatePath(`/tarjoukset/${d.offerId}`); }
  redirect(`/tyot/${jobId}`);
}

/**
 * Työn ja sen työparin tunnisteet — yksin tehdyllä keikalla pelkkä työ itse.
 *
 * Pari on kaksi riviä kahdessa kalenterissa (ks. db/026). Siirto, peruminen ja
 * poisto osuvat siksi molempiin: jos vain toista siirrettäisiin, asentajat
 * ajaisivat samaan keikkaan eri aikoina.
 */
async function crewIds(id: string): Promise<string[]> {
  try {
    const rows = await sql<{ id: string }[]>`
      select mate.id
        from tk.jobs j
        join tk.jobs mate on mate.crew_group_id = j.crew_group_id
       where j.id = ${id} and j.crew_group_id is not null
    `;
    return rows.length > 0 ? rows.map((r) => r.id) : [id];
  } catch (e) {
    // db/026 ajamatta: paria ei ole olemassakaan, joten työ on yksin.
    if ((e as { code?: string })?.code === '42703') return [id];
    throw e;
  }
}

export async function rescheduleJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();

  const id = String(formData.get('id') ?? '');
  const startsAt = String(formData.get('startsAt') ?? '');
  const durationMinutes = Number(formData.get('durationMinutes') ?? 0);

  const starts = parseBookingStart(startsAt);
  if (Number.isNaN(starts.getTime())) return { error: 'Aika ei kelpaa.' };
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15) return { error: 'Tarkista kesto.' };
  const ends = new Date(starts.getTime() + durationMinutes * 60_000);

  const ids = await crewIds(id);
  try {
    /* Molemmat rivit samassa transaktiossa: jos toisen asentajan kalenteri on
       jo varattu uuteen aikaan, kumpikaan ei siirry eikä pari hajoa. */
    await sql.begin(async (tx) => {
      for (const jobId of ids) {
        await tx`update tk.jobs set starts_at = ${starts}, ends_at = ${ends} where id = ${jobId}`;
      }
    });
  } catch (err) {
    if (isSlotTaken(err)) return { error: ids.length > 1 ? `${SLOT_TAKEN} Aika on vapaa vain jos se sopii molemmille asentajille.` : SLOT_TAKEN };
    throw err;
  }

  for (const jobId of ids) revalidatePath(`/tyot/${jobId}`);
  revalidatePath('/tyot');
  revalidatePath('/kalenteri');
  return { ok: ids.length > 1 ? 'Aika siirretty molemmilta asentajilta.' : 'Aika siirretty.' };
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
  const ids = await crewIds(id);
  let rows: { id: string }[] = [];
  for (const jobId of ids) {
    await removeCalendarEventForJob(jobId);
    const deleted = await sql<{ id: string }[]>`
      delete from tk.jobs where id = ${jobId} and status = 'cancelled' returning id
    `;
    if (jobId === id) rows = deleted;
  }
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
  const ids = await crewIds(id);
  try {
    await sql.begin(async (tx) => {
      for (const jobId of ids) {
        await tx`update tk.jobs set status = ${status} where id = ${jobId}`;
      }
    });
  } catch (err) {
    if (!isSlotTaken(err)) throw err;
    return;
  }

  // Peruttu työ pois myös Google-kalenterista, jottei asentaja aja paikalle
  // työhön jota ei ole. Työparilla molemmat.
  if (status === 'cancelled') {
    for (const jobId of ids) await removeCalendarEventForJob(jobId);
  }

  for (const jobId of ids) revalidatePath(`/tyot/${jobId}`);
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
