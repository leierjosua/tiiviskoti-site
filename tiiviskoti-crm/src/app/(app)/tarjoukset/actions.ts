'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { areaForPostal, getOffer, type OfferLine } from '@/lib/data';
import { computePricing, TYPES, EXTRAS, type CustomLine } from '@/lib/pricing';
import { generateOfferPdf } from '@/lib/offer-pdf';
import { MAX_INCLUSIONS, cleanInclusions } from '@/lib/inclusions';
import { sendMail } from '@/lib/google';
import { offerEmailSubject, offerEmailHtml, offerEmailText } from '@/lib/mail-templates';

export type ActionState = { error?: string; ok?: string };

const OFFER_VALID_DAYS = 14;
const eurToCents = (e: number) => Math.round(e * 100);

/* Vapaita rivejä luetaan kiinteä määrä. Raja on lomakkeen puolella sama;
   ilman rajaa selaimelta voisi lähettää mielivaltaisen määrän rivejä. */
const MAX_CUSTOM_LINES = 12;

const schema = z.object({
  kind: z.enum(['asiakas', 'taloyhtio']),
  contactName: z.string().optional(),
  customerName: z.string().min(1, 'Asiakkaan nimi puuttuu'),
  email: z.string().email('Tarkista sähköposti'),
  phone: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().regex(/^\d{5}$/, 'Postinumero on 5 numeroa').or(z.literal('')),
  city: z.string().optional(),
  notes: z.string().optional(),
  /* Asiakkaalle näkyvä saateteksti. Sama pituusrajoite kuin kannan
     offers_customer_note_len -rajoitteessa. */
  customerNote: z.string().max(2000).optional(),
  /* 'send' = luo, tallenna ja lähetä sähköpostilla.
     'draft' = luo ja tallenna luonnoksena; PDF ladataan tarjouksen sivulta.
     Sama toiminto molemmille, koska tarjouksen luonti ja hinnoittelu ovat
     identtiset — ero on vain lopussa. */
  mode: z.enum(['send', 'draft']).default('send'),
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

/** Vapaat rivit lomakkeelta: custom_name_0, custom_qty_0, custom_unit_0, … */
function readCustomLines(formData: FormData): CustomLine[] {
  const out: CustomLine[] = [];
  for (let i = 0; i < MAX_CUSTOM_LINES; i++) {
    const name = String(formData.get(`custom_name_${i}`) ?? '').trim();
    if (!name) continue;
    out.push({
      name: name.slice(0, 120),
      qty: Number(formData.get(`custom_qty_${i}`) ?? 0),
      unit: Number(String(formData.get(`custom_unit_${i}`) ?? '0').replace(',', '.')) || 0,
    });
  }
  return out;
}

/** "Työhön sisältyy" -rivit lomakkeelta: inclusion_0, inclusion_1, … */
function readInclusions(formData: FormData): string[] {
  const rows: string[] = [];
  for (let i = 0; i < MAX_INCLUSIONS; i++) rows.push(String(formData.get(`inclusion_${i}`) ?? ''));
  return cleanInclusions(rows);
}

/** Matkalisä postinumerosta (senteissä) — käytetään laskurin esikatselussa. */
export async function lookupTravelFee(postal: string): Promise<{ cents: number; area: string | null }> {
  if (!/^\d{5}$/.test(postal)) return { cents: 0, area: null };
  const area = await areaForPostal(postal);
  return { cents: area?.travelFeeCents ?? 0, area: area?.name ?? null };
}

/** Luo tarjous, lähetä se PDF:nä sähköpostilla ja tallenna tk.offers:iin. */
/* Onko db/020 ja db/022 ajettu. Vasta epäonnistunut kirjoitus kertoo sen,
   joten oletetaan kyllä ja korjataan kerran ajossa. */
let customerNoteColumnExists = true;
let inclusionsColumnExists = true;

/** Puuttuvan sarakkeen (42703) virheteksti — siitä selviää MIKÄ puuttui. */
const undefinedColumn = (e: unknown): string | null => {
  if (typeof e !== 'object' || e === null) return null;
  const err = e as { code?: string; message?: string };
  return err.code === '42703' ? (err.message ?? '') : null;
};

export async function sendProspectOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const parsed = schema.safeParse({
    kind: String(formData.get('kind') ?? 'asiakas'),
    contactName: String(formData.get('contactName') ?? '').trim() || undefined,
    customerName: String(formData.get('customerName') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim() || undefined,
    address: String(formData.get('address') ?? '').trim() || undefined,
    postalCode: String(formData.get('postalCode') ?? '').trim(),
    city: String(formData.get('city') ?? '').trim() || undefined,
    notes: String(formData.get('notes') ?? '').trim() || undefined,
    customerNote: String(formData.get('customerNote') ?? '').trim() || undefined,
    mode: String(formData.get('mode') ?? 'send'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot.' };
  const d = parsed.data;

  const { counts, extras } = readCounts(formData);
  const area = d.postalCode ? await areaForPostal(d.postalCode) : null;
  const travelFee = (area?.travelFeeCents ?? 0) / 100;
  const discount = Math.max(0, Number(formData.get('discount')) || 0);
  const discountLabel = String(formData.get('discountLabel') ?? '').trim() || undefined;
  const custom = readCustomLines(formData);
  const inclusions = readInclusions(formData);
  const pricing = computePricing(counts, extras, { travelFee, discount, discountLabel, custom });

  if (pricing.total <= 0) return { error: 'Lisää vähintään yksi palvelu tai vapaa rivi tarjoukseen.' };

  const lines: OfferLine[] = pricing.lines.map((l) => ({
    name: l.name,
    quantity: l.qty,
    unit_price_cents: eurToCents(l.unit),
  }));
  const totalCents = eurToCents(pricing.total);
  const travelCents = eurToCents(pricing.travelFee);
  const validUntil = new Date(Date.now() + OFFER_VALID_DAYS * 24 * 60 * 60 * 1000);

  /* Rivi ensin, jotta saadaan juokseva tarjousnumero PDF:ää ja sähköpostia
     varten.

     `customer_note` kirjoitetaan vain jos sarake on olemassa: db/020 ajetaan
     käsin postgres-roolilla, ja tarjous on tärkeämpi kuin sen saateteksti.
     Sama varautuminen kuin lead-insert.ts:ssä. Lippu nollautuu deployssa. */
  const insertOffer = (withNote: boolean, withInclusions: boolean) => sql<{ id: string; offer_number: string }[]>`
    insert into tk.offers
      (kind, contact_name, customer_name, email, phone, address, postal_code, city, lines,
       total_cents, travel_fee_cents, notes, valid_until, status
       ${withNote ? sql`, customer_note` : sql``}
       ${withInclusions ? sql`, inclusions` : sql``})
    values
      (${d.kind}, ${d.contactName ?? null},
       ${d.customerName}, ${d.email}, ${d.phone ?? null}, ${d.address ?? null},
       ${d.postalCode || null}, ${d.city ?? null}, ${sql.json(lines)},
       ${totalCents}, ${travelCents}, ${d.notes ?? null}, ${validUntil},
       ${d.mode === 'draft' ? 'draft' : 'sent'}::tk.offer_status
       ${withNote ? sql`, ${d.customerNote ?? null}` : sql``}
       ${withInclusions ? sql`, ${inclusions}` : sql``})
    returning id, offer_number
  `;

  /* Sarake voi puuttua molemmista lisäyksistä (db/020, db/022), joten
     yritetään uudelleen kunnes kirjoitus menee läpi — kumpi puuttui,
     selviää vain virheen tekstistä. Tarjous on aina tärkeämpi kuin sen
     saateteksti tai sisältyy-lista. */
  let offer: { id: string; offer_number: string } | undefined;
  for (let attempt = 0; !offer; attempt++) {
    try {
      [offer] = await insertOffer(customerNoteColumnExists, inclusionsColumnExists);
    } catch (e) {
      /* 22P02 = enumissa ei ole 'draft'-arvoa (db/021 ajamatta). Kerrotaan se
         suoraan eikä anneta kaatua tuntemattomaan virheeseen: käyttäjä ei voi
         arvata että kyse on ajamattomasta migraatiosta. */
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '22P02') {
        return { error: 'Luonnoksena tallennus vaatii migraation db/021_offer_status_draft.sql. Aja se Supabasen SQL-editorissa, tai lähetä tarjous sähköpostilla.' };
      }
      const missing = attempt < 2 ? undefinedColumn(e) : null;
      if (missing?.includes('inclusions')) {
        console.error('tarjous: tk.offers.inclusions puuttuu — aja db/022. Tarjous tallennetaan ilman sisältyy-listaa.');
        inclusionsColumnExists = false;
      } else if (missing?.includes('customer_note')) {
        console.error('tarjous: tk.offers.customer_note puuttuu — aja db/020. Tarjous tallennetaan ilman vapaata sanaa.');
        customerNoteColumnExists = false;
      } else throw e;
    }
  }

  let pdf: Uint8Array;
  try {
    pdf = await generateOfferPdf({
      jobNumber: offer.offer_number,
      createdAt: new Date(),
      customer: {
        /* Taloyhtiöllä paperille tulee taloyhtiön nimi ja sen alle
           yhteyshenkilö — se on se rivi jonka hallitus tunnistaa. */
        name: d.contactName ? `${d.customerName} — ${d.contactName}` : d.customerName,
        address: d.address,
        postalCode: d.postalCode || null,
        city: d.city,
        email: d.email,
        phone: d.phone,
      },
      lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unit_price_cents })),
      totalIncVatCents: totalCents,
      customerNote: d.customerNote ?? null,
      inclusions,
    });
  } catch (e) {
    await sql`update tk.offers set error = ${(e as Error).message} where id = ${offer.id}`;
    return { error: `Tarjouksen luonti epäonnistui: ${(e as Error).message}` };
  }

  const mailData = {
    jobNumber: offer.offer_number,
    customerName: d.contactName || d.customerName,
    lines: lines.map((l) => ({
      name: l.name,
      qty: l.quantity,
      unit: l.unit_price_cents / 100,
      sum: (l.unit_price_cents * l.quantity) / 100,
    })),
    totalCents,
    validDays: OFFER_VALID_DAYS,
    customerNote: d.customerNote ?? null,
    inclusions,
  };

  /* Luonnos: rivi on tallessa ja PDF ladattavissa tarjouksen sivulta.
     Sähköpostia ei lähetetä eikä sent_at aseteta — tarjous ei ole mennyt
     kenellekään, ja se ero on koko luonnostilan tarkoitus. */
  if (d.mode === 'draft') {
    revalidatePath('/tarjoukset');
    redirect(`/tarjoukset/${offer.id}?ladattu=1`);
  }

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

/**
 * Lähetä JO TALLENNETTU tarjous asiakkaalle.
 *
 * Tätä tarvitaan luonnoksille: ilman sitä luonnos olisi umpikuja, ja tarjous
 * pitäisi näpytellä uudestaan pelkän lähettämisen vuoksi. PDF syntyy samasta
 * rivistä kuin latauskin, joten asiakas saa täsmälleen sen mitä sivulla näkyy.
 */
export async function sendSavedOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Virheellinen tarjous.' };

  const offer = await getOffer(id);
  if (!offer) return { error: 'Tarjousta ei löytynyt.' };
  if (!offer.email) return { error: 'Tarjouksella ei ole sähköpostiosoitetta.' };

  let pdf: Uint8Array;
  try {
    pdf = await generateOfferPdf({
      jobNumber: offer.offer_number,
      createdAt: offer.created_at,
      customer: {
        name: offer.contact_name ? `${offer.customer_name} — ${offer.contact_name}` : offer.customer_name,
        address: offer.address, postalCode: offer.postal_code, city: offer.city,
        email: offer.email, phone: offer.phone,
      },
      lines: offer.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unit_price_cents })),
      totalIncVatCents: offer.total_cents,
      customerNote: offer.customer_note ?? null,
      inclusions: offer.inclusions ?? null,
    });
  } catch (e) {
    return { error: `PDF:n luonti epäonnistui: ${(e as Error).message}` };
  }

  const mailData = {
    jobNumber: offer.offer_number,
    customerName: offer.contact_name || offer.customer_name,
    lines: offer.lines.map((l) => ({
      name: l.name, qty: l.quantity, unit: l.unit_price_cents / 100,
      sum: (l.unit_price_cents * l.quantity) / 100,
    })),
    totalCents: offer.total_cents,
    validDays: OFFER_VALID_DAYS,
    customerNote: offer.customer_note ?? null,
    inclusions: offer.inclusions ?? null,
  };

  try {
    const r = await sendMail({
      to: offer.email,
      subject: offerEmailSubject(mailData),
      html: offerEmailHtml(mailData),
      text: offerEmailText(mailData),
      attachment: { filename: `tarjous-${offer.offer_number}.pdf`, mimeType: 'application/pdf', content: pdf },
    });
    /* Tila vaihtuu vasta onnistuneen lähetyksen jälkeen: epäonnistunut
       lähetys jättää luonnoksen luonnokseksi, jotta sen näkee yrittää
       uudelleen eikä se katoa "lähetettyjen" joukkoon. */
    await sql`
      update tk.offers
         set status = 'sent', sent_at = now(), provider_id = ${r.id}, error = null
       where id = ${id}
    `;
  } catch (e) {
    const msg = (e as Error).message;
    await sql`update tk.offers set error = ${msg} where id = ${id}`;
    revalidatePath(`/tarjoukset/${id}`);
    return { error: `Lähetys epäonnistui: ${msg}` };
  }

  revalidatePath('/tarjoukset');
  revalidatePath(`/tarjoukset/${id}`);
  return { ok: `Tarjous ${offer.offer_number} lähetetty osoitteeseen ${offer.email}.` };
}
