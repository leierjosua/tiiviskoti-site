import { requireManager } from '@/lib/session';
import { getOffer } from '@/lib/data';
import { generateOfferPdf } from '@/lib/offer-pdf';

/* =========================================================
   Tarjouksen PDF latauksena.

   MIKSI OMA REITTI EIKÄ TIEDOSTO TALTEEN: PDF syntyy joka kerta uudelleen
   tallennetusta rivistä, joten mitään ei tarvitse säilöä eikä siivota, eikä
   vanha tiedosto voi jäädä elämään rivin muututtua. Sama tapa kuin
   kuitissa — pdf-lib on nopea, ja tarjous on muutama kilotavu.

   Tämä palvelee sekä luonnosta (jota ei ole lähetetty) että jo lähetettyä
   tarjousta: samaa PDF:ää tarvitaan kun asiakas soittaa ja kysyy mitä
   tarjottiin.
   ========================================================= */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('invalid id', { status: 400 });

  const offer = await getOffer(id);
  if (!offer) return new Response('not found', { status: 404 });

  const pdf = await generateOfferPdf({
    jobNumber: offer.offer_number,
    createdAt: offer.created_at,
    customer: {
      /* Taloyhtiöllä paperille taloyhtiön nimi ja sen alle yhteyshenkilö —
         sama rivi kuin lähetetyssä tarjouksessa, jottei ladattu poikkea
         siitä mitä asiakas sai. */
      name: offer.contact_name ? `${offer.customer_name} — ${offer.contact_name}` : offer.customer_name,
      address: offer.address,
      postalCode: offer.postal_code,
      city: offer.city,
      email: offer.email,
      phone: offer.phone,
    },
    lines: offer.lines.map((l) => ({
      name: l.name, quantity: l.quantity, unitPriceCents: l.unit_price_cents,
    })),
    totalIncVatCents: offer.total_cents,
    customerNote: offer.customer_note ?? null,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      /* attachment = selain lataa tiedostoksi eikä avaa välilehteen. Juuri
         sitä varten tämä reitti on. */
      'Content-Disposition': `attachment; filename="tarjous-${offer.offer_number}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
