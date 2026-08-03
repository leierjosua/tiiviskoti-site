import { z } from 'zod';
import { resolveDiscount, DISCOUNT_ERROR_TEXT } from '@/lib/discounts';

/* =========================================================
   Alennuskoodin esikatselu — SISÄINEN rajapinta.

   Kutsuja on tiiviskoti.fi:n `api/check-discount.mjs`, samalla jaetulla
   salaisuudella kuin varaus. Selain ei kutsu tätä suoraan, jottei
   salaisuus valu sivulle eikä koodivarastoa voi haravoida suoraan CRM:stä.

   Tämä VAIN näyttää, se ei varaa koodia. Koodi kuluu vasta varauksen
   yhteydessä, samassa transaktiossa työn kanssa. Siksi tässä palautettu
   summa on lupaus vain siihen asti kunnes joku muu ehtii käyttää koodin
   loppuun — varauspolku tarkistaa saman uudelleen ja hylkää varauksen jos
   tilanne on ehtinyt muuttua.
   ========================================================= */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  code: z.string().min(1).max(40),
  /* Veloitus ennen alennusta. Tämä on VAIN näyttöä varten: veloitettava
     summa lasketaan varauksessa palvelimen omista luvuista, joten tänne
     syötetty luku ei voi vaikuttaa hintaan. */
  subtotalCents: z.number().int().min(0).max(10_000_00),
  email: z.string().email().optional(),
});

function secretOk(request: Request): boolean {
  const expected = process.env.BOOKING_SECRET;
  if (!expected) return false;
  const given = request.headers.get('x-tk-secret') ?? '';
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  if (!secretOk(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'validation' }, { status: 400 });

  try {
    const res = await resolveDiscount({
      code: parsed.data.code,
      subtotalCents: parsed.data.subtotalCents,
      email: parsed.data.email ?? null,
    });

    if (!res.ok) {
      return Response.json({
        ok: false,
        reason: res.error,
        message: DISCOUNT_ERROR_TEXT[res.error],
        minTotalCents: res.minTotalCents,
      });
    }

    return Response.json({
      ok: true,
      code: res.discount.code,
      amountCents: res.discount.amountCents,
    });
  } catch (err) {
    console.error('public/discount POST:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
