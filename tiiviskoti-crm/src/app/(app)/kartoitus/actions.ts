'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { ownsJob, requireStaff } from '@/lib/session';
import { areaForPostal, type OfferLine } from '@/lib/data';
import { computePricing, EXTRAS, TYPES } from '@/lib/pricing';
import { cleanInclusions } from '@/lib/inclusions';
import { generateOfferPdf } from '@/lib/offer-pdf';
import { sendMail } from '@/lib/google';
import { offerEmailHtml, offerEmailSubject, offerEmailText } from '@/lib/mail-templates';
import { KARTOITUS_PHOTO_SLOTS, kartoitusNote, kartoitusSchema, TALOTYYPIT, type KartoitusData, type KartoitusPhotoSlot } from '@/lib/kartoitus-schema';
import { createKartoitusPhotoUpload, kartoitusPhotoPrefix, removeKartoitusFiles, syncKartoitusPhotosToJob } from '@/lib/photos';
import { acceptUrl, ensureAcceptToken, getKartoitus, migrationMissing } from '@/lib/kartoitus';

export type KartoitusState = { error?: string; ok?: string };

/* =========================================================
   Kartoituksen tallennus ja tarjouksen lähetys.

   'save' = vain kartoituksen tiedot talteen (voi jatkaa myöhemmin).
   'send' = tiedoista tarjous (tk.offers) + PDF + sähköposti, jossa
            "Hyväksy tarjous" -linkki. Sen jälkeen sivu näyttää napin,
            jolla asiakas hyväksyy heti kartoittajan puhelimella.

   Hinta lasketaan TÄÄLLÄ pricing.ts:stä selaimen määristä — selaimen
   näyttämä summa on vain esikatselu, kuten Tarjoukset-näkymässä.

   Asentajakin saa käyttää tätä (kartoittaja on usein asentaja), mutta
   näkee ja muokkaa vain omia kartoituksiaan.
   ========================================================= */

const OFFER_VALID_DAYS = 14;
const UUID = /^[0-9a-f-]{36}$/i;

/* ---------- kuvat ---------- */

type Photos = Pick<KartoitusData, 'photos' | 'extraPhotos'>;

/** Vain tämän kartoituksen polut kelpaavat — muuten payloadilla voisi
 *  liittää kartoitukseen minkä tahansa ämpärin tiedoston. */
function ownPhotos(kid: string, p: Photos): Photos {
  const own = (x: string) => x.startsWith(kartoitusPhotoPrefix(kid)) && !x.includes('..');
  return {
    photos: Object.fromEntries(Object.entries(p.photos ?? {}).filter(([, v]) => own(v))),
    extraPhotos: [...new Set((p.extraPhotos ?? []).filter(own))],
  };
}

const allPaths = (p: Photos) => [...Object.values(p.photos ?? {}), ...(p.extraPhotos ?? [])];

function captioned(p: Photos) {
  return [
    ...Object.entries(p.photos ?? {}).map(([slot, path]) => ({
      path, caption: `Kartoitus: ${KARTOITUS_PHOTO_SLOTS[slot as KartoitusPhotoSlot]?.[0] ?? slot}`,
    })),
    ...(p.extraPhotos ?? []).map((path) => ({ path, caption: 'Kartoitus: muu kuva' })),
  ];
}

/** Siivoaa tiedostot jotka poistettiin, ja päivittää työn kuvat. */
async function afterPhotoChange(kid: string, jobId: string | null, before: Photos, after: Photos, staffId: string) {
  const keep = new Set(allPaths(after));
  await removeKartoitusFiles(kid, allPaths(before).filter((x) => !keep.has(x)));
  if (jobId) await syncKartoitusPhotosToJob(kid, jobId, captioned(after), staffId);
}

/**
 * Latauslupa kartoituksen kuvalle. Uudella kartoituksella riviä ei vielä ole:
 * tunniste on selaimen keksimä ja rivi luodaan sillä tallennettaessa.
 */
export async function prepareKartoitusPhoto(
  kid: string, contentType: string,
): Promise<{ error: string } | { path: string; token: string }> {
  const staff = await requireStaff();
  if (!UUID.test(kid)) return { error: 'Virheellinen kartoitus.' };
  if (!(await getKartoitus(kid, staff))) {
    const [exists] = await sql<{ id: string }[]>`select id from tk.kartoitukset where id = ${kid}::uuid`;
    if (exists) return { error: 'Kartoitusta ei löytynyt.' };
  }
  return createKartoitusPhotoUpload(kid, contentType);
}

/** Tallennetun kartoituksen kuvat heti talteen, ilman Tallenna-nappia. */
export async function saveKartoitusPhotos(kid: string, input: Photos): Promise<KartoitusState> {
  const staff = await requireStaff();
  const k = UUID.test(kid) ? await getKartoitus(kid, staff) : null;
  if (!k) return {};  // luonnos: kuvat tallentuvat lomakkeen mukana
  const p = ownPhotos(kid, input);
  await sql`
    update tk.kartoitukset
       set data = data || ${sql.json({ photos: p.photos, extraPhotos: p.extraPhotos } as never)}, updated_at = now()
     where id = ${kid}::uuid
  `;
  await afterPhotoChange(kid, k.job_id, k.data, p, staff.id);
  revalidatePath(`/kartoitus/${kid}`);
  if (k.job_id) revalidatePath(`/tyot/${k.job_id}`);
  return { ok: 'Kuvat tallennettu.' };
}
const eurToCents = (e: number) => Math.round(e * 100);

export async function saveKartoitus(_prev: KartoitusState, formData: FormData): Promise<KartoitusState> {
  const staff = await requireStaff();
  const mode = formData.get('mode') === 'send' ? 'send' : 'save';
  const id = String(formData.get('id') ?? '');
  const jobId = String(formData.get('jobId') ?? '');
  const draftId = String(formData.get('draftId') ?? '');

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('payload') ?? '{}'));
  } catch {
    return { error: 'Lomakkeen tiedot eivät kelpaa. Lataa sivu uudelleen.' };
  }
  const parsed = kartoitusSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot.' };
  const d: KartoitusData = {
    ...parsed.data,
    /* Vain hinnaston tuntemat avaimet; muut pudotetaan. */
    counts: Object.fromEntries(Object.entries(parsed.data.counts).filter(([k]) =>
      TYPES.some((t) => t.id === k) || EXTRAS.some((e) => e.per === 'kpl' && `extra_${e.id}` === k))),
    extras: Object.fromEntries(Object.entries(parsed.data.extras).filter(([k]) => EXTRAS.some((e) => e.id === k && e.per !== 'kpl'))),
    inclusions: cleanInclusions(parsed.data.inclusions),
  };
  /* Uusi kartoitus luodaan selaimen keksimällä tunnisteella, jotta jo
     ladatut kuvat (kartoitus/<tunniste>/…) kuuluvat sille. */
  const kid = id || (UUID.test(draftId) ? draftId : randomUUID());
  Object.assign(d, ownPhotos(kid, d));

  // --- kartoitusrivi ---
  let kartoitusId = id;
  let existingOfferId: string | null = null;
  try {
    if (id) {
      const k = await getKartoitus(id, staff);
      if (!k) return { error: 'Kartoitusta ei löytynyt.' };
      existingOfferId = k.offer_id;
      if (k.accepted_at) return { error: 'Asiakas on jo hyväksynyt tämän tarjouksen — muutokset tehdään työlle.' };
      await sql`update tk.kartoitukset set data = ${sql.json(d as never)}, updated_at = now() where id = ${id}::uuid`;
      await afterPhotoChange(id, k.job_id, k.data, d, staff.id);
    } else {
      const job = UUID.test(jobId) && (await ownsJob(staff, jobId)) ? jobId : null;
      const [row] = await sql<{ id: string }[]>`
        insert into tk.kartoitukset (id, job_id, staff_id, data)
        values (${kid}::uuid, ${job}, ${staff.id}::uuid, ${sql.json(d as never)})
        on conflict (id) do nothing
        returning id
      `;
      if (!row) return { error: 'Kartoitus on jo tallennettu. Lataa sivu uudelleen.' };
      kartoitusId = row.id;
      if (job) await syncKartoitusPhotosToJob(kid, job, captioned(d), staff.id);
    }
  } catch (e) {
    if (migrationMissing(e)) return { error: 'Kartoitus vaatii migraation db/038_kartoitus_ja_hyvaksynta.sql. Aja se Supabasen SQL-editorissa.' };
    throw e;
  }

  revalidatePath('/kartoitus');
  if (mode === 'save') {
    if (!id) redirect(`/kartoitus/${kartoitusId}?tallennettu=1`);
    revalidatePath(`/kartoitus/${kartoitusId}`);
    return { ok: 'Tallennettu.' };
  }

  // --- tarjous ---
  const area = d.postalCode ? await areaForPostal(d.postalCode) : null;
  const pricing = computePricing(d.counts, d.extras, {
    travelFee: (area?.travelFeeCents ?? 0) / 100,
    discount: d.alennus,
    discountLabel: 'Kartoitusalennus',
  });
  if (pricing.total <= 0) return { error: 'Lisää vähintään yksi kohde (ikkunat tai ovet), jotta tarjouksella on hinta.' };

  const lines: OfferLine[] = pricing.lines.map((l) => ({ name: l.name, quantity: l.qty, unit_price_cents: eurToCents(l.unit) }));
  const totalCents = eurToCents(pricing.total);
  const travelCents = eurToCents(pricing.travelFee);
  const validUntil = new Date(Date.now() + OFFER_VALID_DAYS * 24 * 3600_000);
  const customerNote = kartoitusNote(d);
  const pvm = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date());
  const notes = [
    `Kartoitus ${pvm}, ${staff.fullName}.`,
    d.talotyyppi ? `Talotyyppi: ${TALOTYYPIT[d.talotyyppi]}${d.rakennusvuosi ? `, rv. ${d.rakennusvuosi}` : ''}${d.kerroksia ? `, ${d.kerroksia} krs` : ''}${d.huoneistoja ? `, ${d.huoneistoja} huoneistoa` : ''}.` : '',
    d.sisainen ?? '',
  ].filter(Boolean).join('\n');

  let offer: { id: string; offer_number: string } | undefined;
  if (existingOfferId) {
    [offer] = await sql<{ id: string; offer_number: string }[]>`
      update tk.offers set
        kind = ${d.customerKind}, contact_name = ${d.contactName || null},
        customer_name = ${d.customerName}, email = ${d.email}, phone = ${d.phone || null},
        address = ${d.address || null}, postal_code = ${d.postalCode || null}, city = ${d.city || null},
        lines = ${sql.json(lines)}, total_cents = ${totalCents}, travel_fee_cents = ${travelCents},
        notes = ${notes}, valid_until = ${validUntil}, customer_note = ${customerNote},
        inclusions = ${d.inclusions}, status = 'sent'::tk.offer_status, error = null, updated_at = now()
      where id = ${existingOfferId}::uuid and accepted_at is null
      returning id, offer_number
    `;
    if (!offer) return { error: 'Tarjousta ei voitu päivittää (jo hyväksytty?).' };
  } else {
    [offer] = await sql<{ id: string; offer_number: string }[]>`
      insert into tk.offers
        (kind, contact_name, customer_name, email, phone, address, postal_code, city, lines,
         total_cents, travel_fee_cents, notes, valid_until, status, customer_note, inclusions)
      values
        (${d.customerKind}, ${d.contactName || null}, ${d.customerName}, ${d.email}, ${d.phone || null},
         ${d.address || null}, ${d.postalCode || null}, ${d.city || null}, ${sql.json(lines)},
         ${totalCents}, ${travelCents}, ${notes}, ${validUntil}, 'sent'::tk.offer_status,
         ${customerNote}, ${d.inclusions})
      returning id, offer_number
    `;
    await sql`update tk.kartoitukset set offer_id = ${offer.id}::uuid where id = ${kartoitusId}::uuid`;
  }

  const token = await ensureAcceptToken(offer.id);

  let pdf: Uint8Array;
  try {
    pdf = await generateOfferPdf({
      jobNumber: offer.offer_number,
      createdAt: new Date(),
      customer: {
        name: d.contactName ? `${d.customerName} — ${d.contactName}` : d.customerName,
        address: d.address, postalCode: d.postalCode || null, city: d.city, email: d.email, phone: d.phone,
      },
      lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unit_price_cents })),
      totalIncVatCents: totalCents,
      customerNote,
      inclusions: d.inclusions,
    });
  } catch (e) {
    await sql`update tk.offers set error = ${(e as Error).message} where id = ${offer.id}::uuid`;
    return { error: `Tarjouksen PDF epäonnistui: ${(e as Error).message}` };
  }

  const mailData = {
    jobNumber: offer.offer_number,
    customerName: d.contactName || d.customerName,
    lines: lines.map((l) => ({ name: l.name, qty: l.quantity, unit: l.unit_price_cents / 100, sum: (l.unit_price_cents * l.quantity) / 100 })),
    totalCents,
    validDays: OFFER_VALID_DAYS,
    customerNote,
    inclusions: d.inclusions,
    updated: Boolean(existingOfferId),
    acceptUrl: token ? acceptUrl(token) : null,
  };

  let sendErr: string | null = null;
  let providerId: string | null = null;
  try {
    const r = await sendMail({
      to: d.email,
      subject: offerEmailSubject(mailData),
      html: offerEmailHtml(mailData),
      text: offerEmailText(mailData),
      attachment: { filename: `tarjous-${offer.offer_number}.pdf`, mimeType: 'application/pdf', content: pdf },
    });
    providerId = r.id;
  } catch (e) {
    sendErr = (e as Error).message;
  }
  await sql`
    update tk.offers set provider_id = ${providerId}, error = ${sendErr}, sent_at = ${sendErr ? null : new Date()}
     where id = ${offer.id}::uuid
  `;

  revalidatePath('/tarjoukset');
  revalidatePath(`/kartoitus/${kartoitusId}`);
  /* Posti voi epäonnistua, mutta tarjous ja hyväksyntälinkki ovat silti
     olemassa — asiakas voi hyväksyä heti kartoittajan puhelimella. */
  redirect(`/kartoitus/${kartoitusId}?${sendErr ? `postivirhe=${encodeURIComponent(sendErr.slice(0, 200))}` : 'lahetetty=1'}`);
}
