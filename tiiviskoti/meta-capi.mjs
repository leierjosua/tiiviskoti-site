// TiivisKoti — Meta Conversions API (CAPI) -lähetin.
//
// Miksi CAPI eikä selaimen Meta Pixel: sama periaate kuin gclidissä (_shared.js)
// ja create-booking.mjs:n kommenteissa — emme lataa selaimeen seurantaskriptiä
// emmekä aseta seurantaevästeitä. CAPI lähettää palvelimelta VAIN toteutuneet
// tapahtumat (varaus, taloyhtiöliidi), ja vasta kun ne oikeasti tapahtuivat.
// Kävijöistä joista ei tule asiakasta ei kerrota Metalle mitään —
// tietosuojaseloste pysyy voimassa.
//
// Kaikki henkilötieto hashataan SHA-256:lla ennen lähetystä (Metan vaatimus).
// Puuttuva konfiguraatio tai Metan virhe EI KOSKAAN kaada varausta: kaikki on
// try/catchin sisällä ja epäonnistuminen vain lokitetaan.
//
// Ympäristömuuttujat (Vercel → Project Settings → Environment Variables):
//   META_PIXEL_ID         Events Managerin datajoukon (pixelin) tunnus
//   META_CAPI_TOKEN       Events Manager → Asetukset → Luo pääsytoken
//   META_TEST_EVENT_CODE  (valinnainen) vain testaukseen Events Managerissa
//   META_GRAPH_VERSION    (valinnainen) oletus v21.0

import crypto from 'node:crypto';

const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN;
const TEST_CODE = process.env.META_TEST_EVENT_CODE;
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

export function metaConfigured() {
  return Boolean(PIXEL_ID && ACCESS_TOKEN);
}

// SHA-256 hex normalisoidusta arvosta. Tyhjä → undefined, jottei Metalle
// lähetetä tyhjien kenttien hasheja (ne huonontaisivat osumatarkkuutta).
function sha(value) {
  if (value == null) return undefined;
  const s = String(value).trim().toLowerCase();
  if (!s) return undefined;
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Puhelin Metan vaatimaan muotoon: pelkät numerot maakoodilla, ei +-merkkiä.
// Suomalainen 0-alkuinen numero → 358 + loppuosa.
function normalizePhone(phone) {
  if (!phone) return undefined;
  let d = String(phone).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '358' + d.slice(1);
  d = d.replace(/\D/g, '');
  return d || undefined;
}

// "Matti Meikäläinen" → { fn: 'matti', ln: 'meikäläinen' }.
function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  const fn = parts.shift();
  const ln = parts.join(' ');
  return { fn, ln: ln || undefined };
}

function clientIp(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req?.socket?.remoteAddress || undefined;
}

// Rakentaa hashatun user_data-lohkon lomakkeen kentistä + selaimen tunnisteista.
// fbc/fbp/IP/user-agent EIVÄT ole hashattavia — Meta ottaa ne raakana.
export function buildUserData({ email, phone, name, postal, city, fbc, fbp, req } = {}) {
  const { fn, ln } = splitName(name);
  const ud = {
    em: sha(email),
    ph: sha(normalizePhone(phone)),
    fn: sha(fn),
    ln: sha(ln),
    zp: sha(postal),
    ct: sha(city),
    country: sha('fi'),
  };
  if (fbc) ud.fbc = fbc;
  if (fbp) ud.fbp = fbp;
  if (req) {
    const ip = clientIp(req);
    const ua = req.headers?.['user-agent'];
    if (ip) ud.client_ip_address = ip;
    if (ua) ud.client_user_agent = ua;
  }
  for (const k of Object.keys(ud)) if (ud[k] == null) delete ud[k];
  return ud;
}

// Lähettää yhden tapahtuman Metan CAPIiin. Palauttaa true jos meni läpi.
// Ei koskaan heitä: virheet lokitetaan ja palautetaan false, jottei
// markkinointiseuranta voi kaataa varausta tai liidiä.
export async function sendMetaEvent({
  eventName,
  eventId,
  eventSourceUrl,
  actionSource = 'website',
  userData = {},
  customData = {},
} = {}) {
  if (!metaConfigured()) return false;
  try {
    const event = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: actionSource,
      user_data: userData,
    };
    // event_id mahdollistaa deduplikoinnin, jos selaimen Pixel joskus lähettää
    // saman tapahtuman: Meta yhdistää saman event_name + event_id -parin.
    if (eventId) event.event_id = String(eventId);
    if (eventSourceUrl) event.event_source_url = eventSourceUrl;
    if (customData && Object.keys(customData).length) event.custom_data = customData;

    const payload = { data: [event] };
    if (TEST_CODE) payload.test_event_code = TEST_CODE;

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`
      + `?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('meta-capi:', eventName, 'HTTP', r.status, JSON.stringify(data).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error('meta-capi:', eventName, 'lähetys epäonnistui:', String(e).slice(0, 200));
    return false;
  }
}
