// TiivisKoti — taloyhtiön veloituksettoman kartoituskäynnin varaus.
//
// Ohut sovitin, kuten `create-booking.mjs`: validoi lomakkeen ja antaa
// varauksen CRM:lle, joka varaa ajan (`tk.jobs`), lähettää vahvistuksen ja
// työmääräimen sekä luo kalenteritapahtuman.
//
// Miksi tämä on erillään `create-booking.mjs`:stä: varausreitti laskee hinnan
// `pricing.mjs`:stä ja hylkää nollahintaisen tilauksen tarkoituksella
// ("Emme tee ilmaisia kartoituskäyntejä"). Kartoitus on nimenomaan
// veloitukseton eikä siinä ole hinnoiteltuja kohteita — sen ajaminen
// varausreitin läpi vaatisi juuri sen nollahintapoikkeuksen, joka sinne
// kirjoitettiin estämään hiljaiset 0 €:n varaukset.
//
// Liidi on jo tallennettu `create-lead.mjs`:ssä ennen kuin tänne päästään.
// Jos ajan varaus epäonnistuu, tarjouspyyntö ei siis katoa — asiakas vain
// jää soittolistalle, kuten ennenkin.

import { sendMetaEvent, buildUserData } from '../meta-capi.mjs';

const CRM_BASE_URL = process.env.CRM_BASE_URL;
const BOOKING_SECRET = process.env.BOOKING_SECRET;

async function reserveKartoitus(payload, client) {
  if (!CRM_BASE_URL || !BOOKING_SECRET) {
    return { misconfigured: true, reason: 'CRM_BASE_URL / BOOKING_SECRET puuttuu' };
  }
    /* Kävijän oma IP ja selain mukaan: tämä kutsu on palvelimelta
       palvelimelle, joten CRM näkisi muuten TÄMÄN funktion — ei asiakasta.
       CRM laskee niistä saman anonyymin kävijähashin kuin analytiikka ja
       löytää kampanjan kävijän omasta käynnistä silloin kun selaimen
       tallennustila ei säilynyt (Instagramin ja Facebookin sovellusselaimet).
       CRM hashaa arvot heti eikä talleta niitä. */
  const r = await fetch(`${CRM_BASE_URL}/api/public/kartoitus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tk-secret': BOOKING_SECRET,
      ...(client?.ip ? { 'x-tk-client-ip': client.ip } : {}),
      ...(client?.ua ? { 'x-tk-client-ua': client.ua } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  // 409 tarkoittaa montaa asiaa: aika ehdittiin varata, postinumero ei ole
  // palvelualueella, tai kalenteri ei palvele sitä aluetta. Ne on erotettava,
  // muuten asiakkaalle valitetaan varatusta ajasta kun kyse on alueesta.
  if (r.status === 409) {
    return { conflict: data.error || 'slot_taken', area: data.area, postal: data.postal };
  }
  if (!r.ok) return { failed: true, status: r.status, error: data.error };
  return data;
}

async function releaseKartoitus(jobId) {
  if (!jobId || !CRM_BASE_URL || !BOOKING_SECRET) return;
  try {
    await fetch(`${CRM_BASE_URL}/api/public/kartoitus?jobId=${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
      headers: { 'x-tk-secret': BOOKING_SECRET },
    });
  } catch (e) {
    console.error('create-kartoitus: peruutus ei onnistunut:', jobId, String(e).slice(0, 200));
  }
}

const clean = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let crmJobId = null;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const association = clean(body.association, 200);
    const contactName = clean(body.contactName, 200);
    const role        = clean(body.role, 100);
    const email       = clean(body.email, 200);
    const phone       = clean(body.phone, 60);
    const address     = clean(body.address, 300);
    const postal      = clean(body.postal, 10);
    const doors       = clean(body.doors, 100);
    const notes       = clean(body.notes, 4000);
    const leadRef     = clean(body.leadRef, 40);
    const startsAt    = typeof body.startsAt === 'string' ? body.startsAt : null;
    const calendarId  = typeof body.calendarId === 'string' ? body.calendarId : null;

    // Mainoskampanja ja Google Ads -klikin tunniste osoiterivistä. Sama
    // muotorajaus kuin `create-booking.mjs`:ssä ja kannan rajoitteissa.
    // Kelvoton arvo pudotetaan pois eikä varausta hylätä: arvo tulee
    // julkisesta osoiterivistä, eikä rikkinäinen mainoslinkki saa estää
    // sovittua käyntiä. Mittari on toissijainen käyntiin nähden.
    const campaignRaw = typeof body.campaign === 'string'
      && /^[a-z0-9][a-z0-9._-]{0,59}$/.test(body.campaign)
      ? body.campaign
      : undefined;
    const gclid = typeof body.gclid === 'string'
      && /^[A-Za-z0-9_-]{10,200}$/.test(body.gclid)
      ? body.gclid
      : undefined;
    // Ilman kampanjaa CRM:n "Lähde"-kenttä jäisi tyhjäksi vaikka klikki
    // tiedetään Googlen mainoksesta tulleeksi.
    const campaign = campaignRaw || (gclid ? 'google-ads' : undefined);

    const fields = [];
    if (!association) fields.push('association');
    if (!contactName) fields.push('contactName');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.push('email');
    if (!phone) fields.push('phone');
    if (!address) fields.push('address');
    if (!/^\d{5}$/.test(postal)) fields.push('postal');
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) fields.push('startsAt');
    if (!calendarId || !/^[0-9a-f-]{36}$/i.test(calendarId)) fields.push('calendarId');
    if (fields.length) return res.status(400).json({ error: 'validation', fields });

    // Mennyt aika ei ole varattavissa. CRM tarkistaa saman, mutta virhe on
    // selkeämpi täällä.
    if (Date.parse(startsAt) < Date.now()) {
      return res.status(400).json({ error: 'in_past' });
    }

    const reservation = await reserveKartoitus({
      calendarId,
      startsAt,
      association,
      contactName,
      role: role || undefined,
      email,
      phone,
      address,
      postalCode: postal,
      doors: doors || undefined,
      notes: notes || undefined,
      leadRef: leadRef || undefined,
      campaign,
      gclid,
    }, {
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim(),
      ua: req.headers['user-agent'] || '',
    });

    if (reservation.conflict) {
      return res.status(409).json({
        error: reservation.conflict,
        area: reservation.area,
        postal: reservation.postal,
      });
    }
    if (reservation.misconfigured) {
      console.error('create-kartoitus: CRM-asetukset puuttuvat —', reservation.reason);
      return res.status(500).json({ error: 'server_misconfigured' });
    }
    if (reservation.failed) {
      console.error('create-kartoitus: CRM-varaus epäonnistui:', reservation.status, reservation.error);
      return res.status(503).json({ error: 'booking_unavailable' });
    }
    crmJobId = reservation.jobId ?? null;

    // Posti tai kalenteri voi pettää ilman että käynti on pilalla. Asiakkaalle
    // näytetään onnistuminen — aika on varattu — mutta syy on saatava lokista.
    if (reservation.mailSent === false) {
      console.error('create-kartoitus: vahvistusta EI lähetetty:', reservation.jobNumber, reservation.mailError);
    }
    if (reservation.workOrderSent === false) {
      console.error('create-kartoitus: työmääräintä EI lähetetty:', reservation.jobNumber, reservation.workOrderError);
    }
    if (reservation.calendarCreated === false) {
      console.error('create-kartoitus: kalenteritapahtumaa EI luotu:', reservation.jobNumber, reservation.calendarError);
    }

    /* Meta CAPI: sovittu käynti on `Schedule`, ei `Purchase` eikä `Lead`.
       Purchase olisi väärin — mitään ei myyty, ja arvoksi menisi 0 €, mikä
       opettaisi Metan optimoimaan nollan arvoisia tapahtumia. Lead lähti jo
       lomakkeen lähetyksestä (`create-lead.mjs`), joten sama tapahtuma
       kahdesti vääristäisi liidien määrän. sendMetaEvent ei koskaan heitä,
       joten seuranta ei voi kaataa jo sovittua käyntiä. */
    await sendMetaEvent({
      eventName: 'Schedule',
      eventId: reservation.jobId || reservation.jobNumber,
      eventSourceUrl: req.headers?.referer || 'https://tiiviskoti.fi/taloyhtio.html',
      userData: buildUserData({
        email, phone, name: contactName, postal,
        fbc: typeof body.fbc === 'string' ? body.fbc : undefined,
        fbp: typeof body.fbp === 'string' ? body.fbp : undefined,
        req,
      }),
      customData: { content_category: 'taloyhtio-kartoitus' },
    });

    return res.status(200).json({
      ok: true,
      ref: reservation.jobNumber,
      job_id: reservation.jobId,
      starts_at: reservation.startsAt,
      ends_at: reservation.endsAt,
      duration_minutes: reservation.durationMinutes,
    });
  } catch (e) {
    console.error('create-kartoitus error:', e);
    // Aika ehdittiin varata, mutta ketju katkesi — vapautetaan se, jottei
    // kalenteriin jää haamukäyntiä.
    await releaseKartoitus(crmJobId);
    return res.status(500).json({ error: 'server_error' });
  }
}
