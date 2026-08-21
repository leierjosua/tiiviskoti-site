'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { areaForPostal, type OfferLine } from '@/lib/data';
import { computePricing, TYPES, EXTRAS } from '@/lib/pricing';
import { generateOfferPdf } from '@/lib/offer-pdf';
import { sendMail } from '@/lib/google';
import { offerEmailSubject, offerEmailHtml, offerEmailText } from '@/lib/mail-templates';

export type ActionState = { error?: string; ok?: string };

const OFFER_VALID_DAYS = 14;
const eurToCents = (e: number) => Math.round(e * 100);

const schema = z.object({
  customerName: z.string().min(1, 'Asiakkaan nimi puuttuu'),
  email: z.string().email('Tarkista sähköposti'),
  phone: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().regex(/^\d{5}$/, 'Postinumero on 5 numeroa').or(z.literal('')),
  city: z.string().optional(),
  notes: z.string().optional(),
});

/* Rakentaa laskurin syötteet lomakkeen kentistä. Määrät tulevat `qty_<id>`
   -kentistä ja `kpl`-lisätyö `qty_extra_<id>`:stä; boolean-lisätyöt ovat
   päällä kun kenttä on 'on'. */
function readCounts(formData: FormData) {
  const counts: Record<string, number> = {};
  for (const t of TYPES) counts[t.id] = Number(formData.get(`qty_${t.id}`) ?? 0);
  const extras: Record<string, boolean> = {};
  for (const e of EXTRAS) {
    if (e.per === 'kpl') counts[`extra_${e.id}`] = Number(formData.get(`qty_extra_${e.id}`) ?? 0);
    else extras[e.id] = formData.get(`extra_${e.id}`) === 'on';
  }
  return { counts, extras };
}

/** Matkalisä postinumerosta (senteissä) — käytetään laskurin esikatselussa. */
export async function lookupTravelFee(postal: string): Promise<{ cents: number; area: string | null }> {
  if (!/^\d{5}$/.test(postal)) return { cents: 0, area: null };
  const area = await areaForPostal(postal);
  return { cents: area?.travelFeeCents ?? 0, area: area?.name ?? null };
}

/** Luo tarjous, lähetä se PDF:nä sähköpostilla ja tallenna tk.offers:iin. */
export async function sendProspectOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const parsed = schema.safeParse({
    customerName: String(formData.get('customerName') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim() || undefined,
    address: String(formData.get('address') ?? '').trim() || undefined,
    postalCode: String(formData.get('postalCode') ?? '').trim(),
    city: String(formData.get('city') ?? '').trim() || undefined,
    notes: String(formData.get('notes') ?? '').trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot.' };
  const d = parsed.data;

  const { counts, extras } = readCounts(formData);
  const area = d.postalCode ? await areaForPostal(d.postalCode) : null;
  const travelFee = (area?.travelFeeCents ?? 0) / 100;
  const discount = Math.max(0, Number(formData.get('discount')) || 0);
  const discountLabel = String(formData.get('discountLabel') ?? '').trim() || undefined;
  const pricing = computePricing(counts, extras, { travelFee, discount, discountLabel });

  if (pricing.total <= 0) return { error: 'Valitse vähintään yksi palvelu tarjoukseen.' };

  const lines: OfferLine[] = pricing.lines.map((l) => ({
    name: l.name,
    quantity: l.qty,
    unit_price_cents: eurToCents(l.unit),
  }));
  const totalCents = eurToCents(pricing.total);
  const travelCents = eurToCents(pricing.travelFee);
  const validUntil = new Date(Date.now() + OFFER_VALID_DAYS * 24 * 60 * 60 * 1000);

  // Rivi ensin, jotta saadaan juokseva tarjousnumero PDF:ää ja sähköpostia varten.
  const [offer] = await sql<{ id: string; offer_number: string }[]>`
    insert into tk.offers
      (customer_name, email, phone, address, postal_code, city, lines,
       total_cents, travel_fee_cents, notes, valid_until)
    values
      (${d.customerName}, ${d.email}, ${d.phone ?? null}, ${d.address ?? null},
       ${d.postalCode || null}, ${d.city ?? null}, ${sql.json(lines)},
       ${totalCents}, ${travelCents}, ${d.notes ?? null}, ${validUntil})
    returning id, offer_number
  `;

  let pdf: Uint8Array;
  try {
    pdf = await generateOfferPdf({
      jobNumber: offer.offer_number,
      createdAt: new Date(),
      customer: {
        name: d.customerName,
        address: d.address,
        postalCode: d.postalCode || null,
        city: d.city,
        email: d.email,
        phone: d.phone,
      },
      lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unit_price_cents })),
      totalIncVatCents: totalCents,
    });
  } catch (e) {
    await sql`update tk.offers set error = ${(e as Error).message} where id = ${offer.id}`;
    return { error: `Tarjouksen luonti epäonnistui: ${(e as Error).message}` };
  }

  const mailData = {
    jobNumber: offer.offer_number,
    customerName: d.customerName,
    lines: lines.map((l) => ({
      name: l.name,
      qty: l.quantity,
      unit: l.unit_price_cents / 100,
      sum: (l.unit_price_cents * l.quantity) / 100,
    })),
    totalCents,
    validDays: OFFER_VALID_DAYS,
  };

  let providerId: string | null = null;
  let sendErr: string | null = null;
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
    update tk.offers
       set provider_id = ${providerId}, error = ${sendErr}, sent_at = ${sendErr ? null : new Date()}
     where id = ${offer.id}
  `;

  revalidatePath('/tarjoukset');
  if (sendErr) return { error: `Tarjous ${offer.offer_number} luotiin, mutta lähetys epäonnistui: ${sendErr}` };
  return { ok: `Tarjous ${offer.offer_number} lähetetty osoitteeseen ${d.email}.` };
}

const STATUSES = ['sent', 'accepted', 'declined', 'expired'] as const;

/** Päivitä tarjouksen tila (hyväksytty / hylätty / vanhentunut). */
export async function setOfferStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !STATUSES.includes(status as (typeof STATUSES)[number])) return { error: 'Virheellinen tila.' };
  await sql`update tk.offers set status = ${status} where id = ${id}`;
  revalidatePath('/tarjoukset');
  revalidatePath(`/tarjoukset/${id}`);
  return { ok: 'Tila päivitetty.' };
}
