import 'server-only';
import { createHash } from 'node:crypto';

/* =========================================================
   Google-integraatio: Gmail-lähetys ja Calendar-tapahtumat.

   Tunnistautuminen OAuth refresh tokenilla, ei service accountilla:
   Google-organisaation policy voi estää service account -avainten luonnin,
   ja refresh token toimii ilman domain-wide delegationia. Kaikki kutsut
   tehdään sen tilin oikeuksilla joka antoi suostumuksen
   (info@tiiviskoti.fi), joten lähettäjä on aina se.

   Refresh token voi vanheta: se raukeaa jos salasana vaihdetaan, käyttäjä
   perruu oikeudet tai sitä ei käytetä 6 kk. Silloin Google vastaa
   `invalid_grant` ja uusi suostumus on haettava komennolla
   `node scripts/google-oauth-setup.mjs <CLIENT_ID> <CLIENT_SECRET>`.
   Virheilmoitus kertoo tämän suoraan, jotta syy ei jää arvailtavaksi.
   ========================================================= */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const SENDER_EMAIL = process.env.GOOGLE_SENDER_EMAIL ?? 'info@tiiviskoti.fi';
export const DEFAULT_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? SENDER_EMAIL;

/** Access token on voimassa ~tunnin. Pidetään muistissa, jottei joka
 *  lähetys tee turhaa token-kutsua. */
const globalForToken = globalThis as unknown as {
  __tkGoogleToken?: { token: string; expiresAt: number };
};

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN &&
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
}

type TokenResponse = { access_token: string; expires_in?: number; scope?: string };

/** Vaihtaa refresh tokenin käyttötokeniin. Erillään `accessToken`:sta,
 *  koska kuntotarkistus tarvitsee vastauksen `scope`-kentän — siitä näkee
 *  mitkä oikeudet ovat oikeasti yhä voimassa. */
async function exchangeRefreshToken(): Promise<TokenResponse> {
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Google-tunnukset puuttuvat (GOOGLE_OAUTH_REFRESH_TOKEN / CLIENT_ID / CLIENT_SECRET)');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    if (text.includes('invalid_grant')) {
      throw new Error(
        'Google refresh token ei ole enää voimassa (invalid_grant). Hae uusi: ' +
        'node scripts/google-oauth-setup.mjs <CLIENT_ID> <CLIENT_SECRET>',
      );
    }
    throw new Error(`Google token vaihto epäonnistui: ${res.status} ${text.slice(0, 200)}`);
  }

  return JSON.parse(text) as TokenResponse;
}

async function accessToken(): Promise<string> {
  const cached = globalForToken.__tkGoogleToken;
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const data = await exchangeRefreshToken();
  globalForToken.__tkGoogleToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

/* ---------- Kunnon tarkistus ---------- */

/** Refresh tokenin tunniste lokitusta varten. Pelkkä tiiviste, ei itse
 *  tokenia: kannasta ei saa lukea tunnuksia, mutta on nähtävä MILLOIN
 *  token vaihtui — siitä lasketaan sen ikä. */
export function credentialFingerprint(): string | null {
  const token = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!token) return null;
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/** Oikeudet joita varauksen jälkitoimet vaativat: `gmail.send` vahvistus-
 *  ja työmääräinpostiin, `calendar` kalenteritapahtumaan. Sama lista kuin
 *  `scripts/google-oauth-setup.mjs`:ssä pyydetään. */
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
];

/**
 * Koettaa Google-yhteyden oikeasti.
 *
 * MIKSI VÄLIMUISTI OHITETAAN: `accessToken()` pitää tuntia vanhan tokenin
 * muistissa. Sillä kutsu onnistuisi vaikka refresh token olisi jo kuollut,
 * eli tarkistus näyttäisi vihreää juuri silloin kun se ei saa.
 *
 * MIKSI GMAILIA EI KUTSUTA: myönnetty oikeus on `gmail.send`, joka ei salli
 * yhtään lukukutsua — profiilihaku vastaa sillä 403:lla vaikka lähetys
 * toimisi täysin. Ainoa aito Gmail-koe olisi lähettää viesti, ja päivittäin
 * lähetetty koeposti olisi roskaa. Sen sijaan tarkistetaan token-vastauksen
 * `scope`-kenttä: se kertoo mitkä oikeudet ovat yhä voimassa, eli sen
 * paljastaa myös peruttu suostumus. Calendar-kutsu on aito savukoe siitä
 * että token kelpaa rajapinnalle asti, ja se mahtuu myönnettyihin
 * oikeuksiin.
 */
export async function probeGoogleAccess(): Promise<{ ok: boolean; error?: string }> {
  if (!googleConfigured()) return { ok: false, error: 'Google-tunnuksia ei ole asetettu' };

  delete globalForToken.__tkGoogleToken;
  let token: TokenResponse;
  try {
    token = await exchangeRefreshToken();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  /* Google jättää `scope`-kentän pois kun se on sama kuin pyydettiin, joten
     puuttuva kenttä ei ole vika — vain läsnä oleva ja vaillinainen on. */
  if (token.scope) {
    const granted = new Set(token.scope.split(' '));
    const missing = REQUIRED_SCOPES.filter((s) => !granted.has(s));
    if (missing.length > 0) {
      return { ok: false, error: `Google-oikeuksia puuttuu: ${missing.join(', ')}` };
    }
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(DEFAULT_CALENDAR_ID)}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  if (!res.ok) {
    return { ok: false, error: `Kalenteri vastasi ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  return { ok: true };
}

/* ---------- Gmail ---------- */

/** RFC 2047 -otsake: ääkköset eivät kuulu raakana otsakkeisiin. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export type MailAttachment = { filename: string; mimeType: string; content: Uint8Array | Buffer };

/** base64 pilkottuna 76 merkin riveihin (RFC 2045). */
function base64Lines(buf: Buffer): string {
  return buf.toString('base64').replace(/(.{76})/g, '$1\r\n');
}

/** Gmail haluaa base64url-koodatun RFC 822 -viestin. Liite → multipart/mixed. */
function buildMime(opts: { to: string; subject: string; html: string; text: string; attachment?: MailAttachment }): string {
  const alt = `alt_${Math.random().toString(36).slice(2)}`;
  const altPart = [
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.text, 'utf8').toString('base64'),
    '',
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.html, 'utf8').toString('base64'),
    '',
    `--${alt}--`,
  ].join('\r\n');

  const headers = [
    `From: ${encodeHeader('TiivisKoti')} <${SENDER_EMAIL}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
  ];

  let message: string;
  if (opts.attachment) {
    const mix = `mix_${Math.random().toString(36).slice(2)}`;
    message = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${mix}"`,
      '',
      `--${mix}`,
      altPart,
      '',
      `--${mix}`,
      `Content-Type: ${opts.attachment.mimeType}; name="${opts.attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${opts.attachment.filename}"`,
      '',
      base64Lines(Buffer.from(opts.attachment.content)),
      '',
      `--${mix}--`,
      '',
    ].join('\r\n');
  } else {
    message = [...headers, altPart, ''].join('\r\n');
  }

  return Buffer.from(message, 'utf8').toString('base64url');
}

export async function sendMail(opts: {
  to: string; subject: string; html: string; text: string; attachment?: MailAttachment;
}): Promise<{ id: string }> {
  const token = await accessToken();
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(SENDER_EMAIL)}/messages/send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: buildMime(opts) }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail-lähetys epäonnistui: ${res.status} ${text.slice(0, 300)}`);
  return { id: (JSON.parse(text) as { id: string }).id };
}

/* ---------- Calendar ---------- */

export type CalendarEvent = {
  summary: string;
  description: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
  calendarId?: string;
  /** Osallistujat. Asentaja lisätään tänne, jotta työ näkyy myös HÄNEN omassa
   *  kalenterissaan eikä vain yrityksen kalenterissa. */
  attendees?: { email: string; displayName?: string }[];
};

export async function createCalendarEvent(ev: CalendarEvent): Promise<{ id: string }> {
  const token = await accessToken();
  const calendarId = ev.calendarId || DEFAULT_CALENDAR_ID;

  // Aika lähetetään UTC:nä ja aikavyöhyke erikseen: näin tapahtuma osuu
  // oikeaan hetkeen riippumatta kalenterin omista asetuksista.
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: ev.summary,
        description: ev.description,
        location: ev.location,
        start: { dateTime: ev.startsAt.toISOString(), timeZone: 'Europe/Helsinki' },
        end: { dateTime: ev.endsAt.toISOString(), timeZone: 'Europe/Helsinki' },
        reminders: { useDefault: true },
        // `sendUpdates=none` yllä: Google ei lähetä kutsuposteja. Asentaja saa
        // oman työmääräimensä meiltä (deliver.ts), ja asiakas vahvistuksen —
        // Googlen kutsuviesti olisi kolmas, hallitsematon posti samasta asiasta.
        attendees: ev.attendees?.length ? ev.attendees : undefined,
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Kalenteritapahtuman luonti epäonnistui: ${res.status} ${text.slice(0, 300)}`);
  return { id: (JSON.parse(text) as { id: string }).id };
}

export async function deleteCalendarEvent(eventId: string, calendarId?: string): Promise<void> {
  const token = await accessToken();
  const id = calendarId || DEFAULT_CALENDAR_ID;
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  // 404/410 = tapahtuma on jo poissa. Se on haluttu lopputila, ei virhe.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Kalenteritapahtuman poisto epäonnistui: ${res.status}`);
  }
}
