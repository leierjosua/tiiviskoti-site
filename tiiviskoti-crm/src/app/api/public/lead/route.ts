import { z } from 'zod';
import { sql } from '@/lib/db';
import { areaForPostal } from '@/lib/data';
import { json, preflight } from '../cors';

/* POST /api/public/lead

   Yhteydenottopyyntö palvelualueen ulkopuolelta. Tämä on selaimelle avoin
   (ei jaettua salaisuutta), koska se ei varaa aikaa eikä koske hintoihin —
   se vain tallentaa yhteystiedot. Näin laajentumisalueiden kysyntä kertyy
   näkyviin sen sijaan että asiakas vain katoaisi sivulta.

   Alue tarkistetaan silti: jos postinumero KUULUU palvelualueeseen, liidiä
   ei oteta vaan asiakas ohjataan varaamaan aika normaalisti. */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const OPTIONS = preflight;

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().min(1).max(60),
  postal: z.string().regex(/^\d{5}$/),
  city: z.string().max(100).optional(),
  message: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400, origin });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: 'validation', fields: parsed.error.issues.map((i) => i.path.join('.')) },
      { status: 400, origin },
    );
  }

  const d = parsed.data;

  const area = await areaForPostal(d.postal);
  if (area) {
    // Alue on palveltu — asiakkaan kuuluu varata aika, ei jättää liidiä.
    return json({ error: 'area_is_served', area: area.name }, { status: 409, origin });
  }

  await sql`
    insert into tk.leads (full_name, email, phone, postal_code, city, message)
    values (${d.name}, ${d.email || null}, ${d.phone}, ${d.postal},
            ${d.city ?? null}, ${d.message ?? null})
  `;

  return json({ ok: true }, { origin });
}
