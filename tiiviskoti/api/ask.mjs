// TiivisKoti — chat-widgetin "Kysy meiltä" -lomake.
//
// Kysymys tallennetaan samaan `form_submissions`-tauluun kuin taloyhtiöiden
// tarjouspyynnöt, jolloin se näkyy adminin Liidit-näkymässä eikä jää pelkän
// sähköpostin varaan. Ilmoitus lähtee `email_outbox`in kautta, eli samaa
// putkea pitkin kuin muutkin lomakkeet — ei omaa lähetystä tässä.
//
// Slug on `chatbot-yhteydenotto`, koska send-contact-email tuntee sen jo
// (FORM_LABELS) ja osaa otsikoida viestin. Uusi slug näkyisi sähköpostissa
// raakana merkkijonona.
//
// Käyttää service_role-avainta vain palvelinpuolella, kuten create-lead.mjs.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FORM_SLUG = 'chatbot-yhteydenotto';

/* Sama peilaus kuin create-lead.mjs:ssä. Ilman tätä chat-kysymys jää vain
   `form_submissions`-tauluun ja sähköpostiin — eli näkyviin vain jos joku
   muistaa käydä katsomassa adminin Lomakkeet-näkymää. Liidit-sivu on se
   paikka jossa liidejä oikeasti työstetään, ja siellä on tila jonka voi
   merkitä hoidetuksi.

   Todettu tarpeelliseksi 26.8.2026: chat-kysymys 24.8. (maksetusta
   Google Ads -klikistä) jäi kahdeksi vuorokaudeksi vastaamatta, vaikka
   ilmoitus lähti sähköpostiin normaalisti. */
const CRM_LEAD_URL = process.env.CRM_LEAD_URL || 'https://admin.tiiviskoti.fi/api/public/taloyhtio-lead';
const BOOKING_SECRET = process.env.BOOKING_SECRET;

/* Mainosklikin tunniste on chat-lomakkeella vain sivun osoitteessa, koska
   widget ei lähetä sitä erikseen. Poimitaan se sieltä: kysymys on liidi
   siinä missä varauskin, ja ilman tunnistetta se ei kohdistu mainokseen. */
function clickIdFrom(pageUrl) {
  try {
    const q = new URL(pageUrl).searchParams;
    for (const k of ['gclid', 'gbraid', 'wbraid']) {
      const v = q.get(k);
      if (v) return { kind: k, id: v.slice(0, 500) };
    }
  } catch { /* ei kelvollista osoitetta — ei tunnistetta */ }
  return null;
}

async function mirrorToCrmLeads(f, client) {
  try {
    const click = clickIdFrom(f.pageUrl || '');
    await fetch(CRM_LEAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BOOKING_SECRET ? { 'x-tk-secret': BOOKING_SECRET } : {}),
        ...(client?.ip ? { 'x-tk-client-ip': client.ip } : {}),
        ...(client?.ua ? { 'x-tk-client-ua': client.ua } : {}),
      },
      body: JSON.stringify({
        full_name: f.name,
        email: f.email || '',
        phone: f.phone || '',
        postal_code: '',
        message: ['Chat-kysymys', f.message, f.pageUrl ? `Sivu: ${f.pageUrl}` : null]
          .filter(Boolean).join('\n'),
        campaign: f.campaign || undefined,
        gclid: click ? click.id : undefined,
      }),
    });
  } catch (e) {
    /* Peilaus ei saa kaataa tallennusta: kysymys on jo kannassa ja
       ilmoitus jonossa, vaikka CRM olisi hetkellisesti nurin. */
    console.error('ask: liidin peilaus CRM:ään epäonnistui', e);
  }
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) throw new Error(`Supabase ${res.status} ${path}: ${text}`);
  return data;
}

const clean = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

/* Ilmoituksen epäonnistuminen ei saa kaataa tallennusta: kysymys on jo
   turvassa kannassa ja näkyy adminissa, vaikka sähköposti jäisi jonoon. */
async function queueNotification(submissionId, f) {
  try {
    await sb('email_outbox', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        type: 'contact',
        payload: {
          formSlug: FORM_SLUG,
          name: f.name,
          email: f.email,
          phone: f.phone || undefined,
          message: f.message,
          pageUrl: f.pageUrl || undefined,
        },
        sender_email: 'info@tiiviskoti.fi',
        status: 'pending',
        max_attempts: 8,
        reference_type: 'form_submission',
        reference_id: submissionId,
      }),
    });
  } catch (e) {
    console.error('ask: ilmoituksen jonotus epäonnistui', e);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('ask: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY puuttuu');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const name    = clean(body.name, 200);
    const email   = clean(body.email, 200);
    const phone   = clean(body.phone, 60);
    const message = clean(body.message, 4000);
    const pageUrl = clean(body.pageUrl, 500);
    /* Mainoskampanja, jos kävijä tuli mainoslinkistä. Sama tunniste kuin
       varauksissa, jotta myös kysymykset voi kohdistaa mainokseen. */
    const campaign = /^[a-z0-9][a-z0-9._-]{0,59}$/.test(clean(body.campaign, 60))
      ? clean(body.campaign, 60)
      : null;

    /* Puhelin on vapaaehtoinen: kysymykseen vastataan sähköpostilla, eikä
       numeron pakottaminen kannata kun kynnys halutaan pitää matalana. */
    const fields = [];
    if (!name) fields.push('name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.push('email');
    if (!message) fields.push('message');
    if (fields.length) return res.status(400).json({ error: 'validation', fields });

    const created = await sb('form_submissions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        form_slug: FORM_SLUG,
        name,
        email,
        phone: phone || null,
        message,
        page_url: pageUrl || null,
        payload: { kampanja: campaign },
        status: 'new',
      }),
    });

    const row = Array.isArray(created) ? created[0] : created;
    await queueNotification(row.id, { name, email, phone, message, pageUrl });
    await mirrorToCrmLeads(
      { name, email, phone, message, pageUrl, campaign },
      {
        ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined,
        ua: req.headers['user-agent'] || undefined,
      },
    );

    const ref = 'TK-KYS-' + String(row.id).replace(/-/g, '').slice(0, 6).toUpperCase();
    return res.status(200).json({ ok: true, ref });
  } catch (e) {
    console.error('ask error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
}
