import 'server-only';

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

async function accessToken(): Promise<string> {
  const cached = globalForToken.__tkGoogleToken;
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

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

  const data = JSON.parse(text) as { access_token: string; expires_in?: number };
  globalForToken.__tkGoogleToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

/* ---------- Gmail ---------- */

/** RFC 2047 -otsake: ääkköset eivät kuulu raakana otsakkeisiin. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** Gmail haluaa base64url-koodatun RFC 822 -viestin. */
function buildMime(opts: { to: string; subject: string; html: string; text: string }): string {
  const boundary = `tk_${Math.random().toString(36).slice(2)}`;
  const message = [
    `From: ${encodeHeader('TiivisKoti')} <${SENDER_EMAIL}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.text, 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.html, 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return Buffer.from(message, 'utf8').toString('base64url');
}

export async function sendMail(opts: {
  to: string; subject: string; html: string; text: string;
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
