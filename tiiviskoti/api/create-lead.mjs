// TiivisKoti — taloyhtiöiden tarjouspyyntö.
// Aiemmin taloyhtio.html:n lomake oli VALE: e.preventDefault(), ei yhtään
// verkkokutsua, viite Math.random():lla — joten jokainen taloyhtiöliidi katosi.
// Tämä tallentaa pyynnön `form_submissions`-tauluun, josta se näkyy adminissa.
//
// Käyttää service_role-avainta vain palvelinpuolella, kuten create-booking.mjs.

import { sendMetaEvent, buildUserData } from '../meta-capi.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FORM_SLUG = 'taloyhtio-tarjouspyynto';

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

// Jonottaa ilmoituksen info@tiiviskoti.fi:lle. Käyttää valmista `contact`-tyyppiä,
// jonka buildContactEmail osaa jo renderöidä (kentät name/email/phone/postalCode/
// role/association/message) ja joka lähettää oletuksena SENDER_EMAILiin.
// Edge-funktioihin ei siis tarvinnut koskea.
// Try/catch: ilmoituksen epäonnistuminen ei saa kaataa liidin tallennusta.
async function queueLeadNotification(submissionId, f) {
  try {
    // Ovien määrä, aikataulu ja osoite eivät ole rakentajan omia kenttiä,
    // joten ne liitetään viestiin — ei väärän otsikon alle.
    const extra = [
      f.addr ? `Osoite: ${f.addr}` : null,
      f.doors ? `Ovien määrä (arvio): ${f.doors}` : null,
      f.when ? `Aikataulutoive: ${f.when}` : null,
    ].filter(Boolean).join(' · ');

    await sb('email_outbox', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        type: 'contact',
        payload: {
          formSlug: FORM_SLUG,
          name: f.contact,
          email: f.email,
          phone: f.phone,
          postalCode: f.postalCode || undefined,
          role: f.role || undefined,
          association: f.yhtio,
          message: [f.message, extra].filter(Boolean).join('\n\n'),
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
    console.error('create-lead: ilmoituksen jonotus epäonnistui:', e);
  }
}

// Peilaa liidi CRM:n tk.leads-tauluun, jotta se näkyy adminin Liidit-sivulla
// (admin.tiiviskoti.fi/liidit). form_submissions-taulua CRM ei lue. Palvelin­
// puolen kutsu CRM:n avoimeen endpointtiin; try/catch — ei saa kaataa liidin
// tallennusta jos CRM on hetkellisesti nurin.
const CRM_LEAD_URL = process.env.CRM_LEAD_URL || 'https://admin.tiiviskoti.fi/api/public/taloyhtio-lead';
async function mirrorToCrmLeads(f) {
  try {
    const extra = [
      f.role ? `Rooli: ${f.role}` : null,
      f.addr ? `Osoite: ${f.addr}` : null,
      f.doors ? `Ovien määrä (arvio): ${f.doors}` : null,
      f.when ? `Aikataulutoive: ${f.when}` : null,
    ].filter(Boolean).join(' · ');
    await fetch(CRM_LEAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: `${f.yhtio} — ${f.contact}`,
        email: f.email || '',
        phone: f.phone,
        postal_code: f.postalCode || '',
        message: ['Taloyhtiö-tarjouspyyntö', f.message, extra].filter(Boolean).join('\n'),
        campaign: f.campaign || undefined,
        gclid: f.gclid || undefined,
      }),
    });
  } catch (e) {
    console.error('create-lead: CRM-peilaus epäonnistui:', e);
  }
}

// Taloyhtiön osoite on yksi vapaa kenttä ("Katuosoite, postinumero"),
// joten postinumero poimitaan siitä jos se on tunnistettavissa.
function postalFrom(addr) {
  const m = String(addr || '').match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('create-lead: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const yhtio   = clean(body.yhtio, 200);
    const contact = clean(body.contact, 200);
    const role    = clean(body.role, 100);
    const phone   = clean(body.phone, 60);
    const email   = clean(body.email, 200);
    const addr    = clean(body.addr, 300);
    const doors   = clean(body.doors, 100);
    const when    = clean(body.when, 200);
    const message = clean(body.message, 4000);
    const pageUrl = clean(body.pageUrl, 500);

    // Mainoskampanja ja Google Ads -klikin tunniste osoiterivistä. Sama
    // muotorajaus kuin varausreitillä ja kannan rajoitteissa. Kelvoton
    // pudotetaan pois eikä liidiä hylätä: arvo tulee julkisesta
    // osoiterivistä, eikä rikkinäinen mainoslinkki saa hukata yhteydenottoa.
    const campaignRaw = /^[a-z0-9][a-z0-9._-]{0,59}$/.test(clean(body.campaign, 60))
      ? clean(body.campaign, 60)
      : '';
    const gclid = /^[A-Za-z0-9_-]{10,200}$/.test(clean(body.gclid, 200))
      ? clean(body.gclid, 200)
      : '';
    const campaign = campaignRaw || (gclid ? 'google-ads' : '');

    const fields = [];
    if (!yhtio) fields.push('yhtio');
    if (!contact) fields.push('contact');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.push('email');
    if (!phone) fields.push('phone');
    if (!addr) fields.push('addr');
    if (fields.length) return res.status(400).json({ error: 'validation', fields });

    const created = await sb('form_submissions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        form_slug: FORM_SLUG,
        // `name` on adminin päänäyttökenttä — taloyhtiö + yhteyshenkilö kertoo eniten.
        name: `${yhtio} — ${contact}`,
        email,
        phone,
        postal_code: postalFrom(addr),
        message: message || null,
        page_url: pageUrl || null,
        // Loput kentät payloadiin, jottei mikään syöte katoa.
        payload: {
          taloyhtio: yhtio,
          yhteyshenkilo: contact,
          rooli: role || null,
          osoite: addr,
          ovien_maara_arvio: doors || null,
          aikataulutoive: when || null,
          // Kampanja mahtuu payloadiin sellaisenaan — jsonb, ei migraatiota.
          kampanja: campaign || null,
          gclid: gclid || null,
        },
        status: 'new',
      }),
    });

    const row = Array.isArray(created) ? created[0] : created;

    await queueLeadNotification(row.id, {
      contact, email, phone, role, yhtio, addr, doors, when, message,
      postalCode: postalFrom(addr), pageUrl,
    });

    // Peilaa CRM:n Liidit-sivulle (tk.leads) — sinne minne admin oikeasti katsoo.
    await mirrorToCrmLeads({
      contact, email, phone, role, yhtio, addr, doors, when, message,
      postalCode: postalFrom(addr), campaign, gclid,
    });

    /* Meta CAPI: taloyhtiön tarjouspyyntö on liidi (Lead). Sama periaate kuin
       varauksessa — vain toteutuneesta liidistä, ei kaadu jos Meta pettää. */
    await sendMetaEvent({
      eventName: 'Lead',
      eventId: row.id,
      eventSourceUrl: pageUrl || req.headers?.referer || 'https://tiiviskoti.fi/taloyhtio.html',
      userData: buildUserData({
        email, phone, name: contact, postal: postalFrom(addr),
        fbc: typeof body.fbc === 'string' ? body.fbc : undefined,
        fbp: typeof body.fbp === 'string' ? body.fbp : undefined,
        req,
      }),
      customData: { content_category: 'taloyhtio-lead' },
    });

    const ref = 'TK-YHT-' + String(row.id).replace(/-/g, '').slice(0, 6).toUpperCase();
    return res.status(200).json({ ok: true, ref, id: row.id });
  } catch (e) {
    console.error('create-lead error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
}
