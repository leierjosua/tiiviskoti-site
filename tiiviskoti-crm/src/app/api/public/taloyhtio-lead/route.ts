import { z } from 'zod';
import { json, preflight } from '../cors';
import { insertLead, campaignPreprocess, gclidPreprocess } from '../lead-insert';
import { campaignFromVisitorTrail, fbcFromVisitorTrail } from '@/lib/visitor';

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
  /* Mainoskampanja ja Google Ads -klikin tunniste, välitettynä sivuston
     `create-lead.mjs`:stä. Taloyhtiökauppa alkaa liidistä ja työ syntyy
     kuukausia myöhemmin — ilman tätä taloyhtiömainosten tuotto näkyisi
     raportissa vasta kaupan jälkeen. */
  campaign: z.preprocess(campaignPreprocess, z.string().optional()),
  gclid: z.preprocess(gclidPreprocess, z.string().optional()),
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

  await insertLead({
    full_name: d.full_name,
    email: d.email || null,
    phone: d.phone,
    postal_code: d.postal_code || null,
    city: d.city || null,
    message: d.message || null,
    campaign: d.campaign ?? (await campaignFromVisitorTrail(request)),
    gclid: d.gclid ?? null,
  });

  /* Sivuston funktio käyttää tätä Metan Lead-tapahtumassa jos selaimen oma
     fbc puuttui. Taloyhtiöliidi on arvokkain konversio, joten juuri sen
     attribuutio kannattaa saada kohdalleen. */
  return json({ ok: true, fbc: await fbcFromVisitorTrail(request) }, { origin });
}
