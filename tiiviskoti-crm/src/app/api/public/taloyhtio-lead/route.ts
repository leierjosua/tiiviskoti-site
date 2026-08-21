import { z } from 'zod';
import { sql } from '@/lib/db';
import { json, preflight } from '../cors';

/* POST /api/public/taloyhtio-lead

   Taloyhtiön tarjouspyyntö → tk.leads, jotta se näkyy CRM:n Liidit-sivulla.
   Kutsutaan palvelinpuolelta tiiviskoti-sivuston `api/create-lead.mjs`:stä
   (joka tallentaa myös public.form_submissions + Meta CAPI). Toisin kuin
   /api/public/lead, tätä EI rajata palvelualueen mukaan — taloyhtiöliidi
   otetaan aina vastaan — ja postinumero on valinnainen (taloyhtiön osoite on
   vapaa kenttä). full_name ja message tulevat valmiiksi koostettuina. */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const OPTIONS = preflight;

const schema = z.object({
  full_name: z.string().min(1).max(300),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().min(1).max(60),
  postal_code: z.string().regex(/^\d{5}$/).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  message: z.string().max(4000).optional().or(z.literal('')),
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

  await sql`
    insert into tk.leads (full_name, email, phone, postal_code, city, message)
    values (${d.full_name}, ${d.email || null}, ${d.phone}, ${d.postal_code || null},
            ${d.city || null}, ${d.message || null})
  `;

  return json({ ok: true }, { origin });
}
