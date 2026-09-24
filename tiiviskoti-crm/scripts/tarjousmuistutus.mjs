#!/usr/bin/env node
/* =========================================================
   Tarjousmuistutus — avoimet tarjoukset joihin ei ole kuulunut mitään.

   MIKSI VASTAANOTTAJIA EI POIMITA PELKÄSTÄ TILASTA: tk.offers tuntee vain
   `sent` / `accepted`, eikä se kerro onko asiakas vastannut. Moni on
   vastannut sähköpostitse ilman että tarjouksen tila muuttui — ja heille
   muistutus olisi töykeä, pahimmillaan keskellä käynnissä olevaa
   keskustelua. Siksi jokainen vastaanottaja tarkistetaan postilaatikosta
   (`gmail.readonly`) ennen lähetystä:

     - jos viimeisin viesti on ASIAKKAALTA  -> ohitetaan, pallo on meillä
     - jos olemme jo lähettäneet muistutuksen -> ohitetaan
     - jos vain alkuperäinen tarjous meni    -> muistutus lähtee

   24.9.2026 tämä karsi kahdeksan hengen listan viiteen: Maaret Stenstrom
   oli jo hyväksynyt ajan (eikä sitä ollut kirjattu kalenteriin), Risto
   Aspegren oli kertonut odottavansa muita tarjouksia, ja kahdelle oli jo
   lähetetty muistutus aiemmin.

   Aja repon juuresta tai tästä kansiosta:
     node scripts/tarjousmuistutus.mjs            # näyttää, ei lähetä
     node scripts/tarjousmuistutus.mjs --send     # lähettää
   ========================================================= */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const SEND = process.argv.includes('--send');
const MIN_VALI_VRK = 14;
const SENDER = env.GOOGLE_SENDER_EMAIL ?? 'info@tiiviskoti.fi';
const CRM_BASE = 'https://admin.tiiviskoti.fi';

const GREEN = '#215A43';
const CREAM = '#F7F5F0';
const INK = '#1B2422';
const MUTED = '#5F6D68';
const PHONE = '045 875 5996';
const PHONE_HREF = '+358458755996';

const sql = postgres(env.DATABASE_URL, {
  prepare: false, ssl: 'require', max: 2, idle_timeout: 5, transform: { undefined: null },
});

/* ---------- Google ---------- */

let tokenCache = null;
async function accessToken() {
  if (tokenCache) return tokenCache;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google token: ${res.status} ${text.slice(0, 200)}`);
  tokenCache = JSON.parse(text).access_token;
  return tokenCache;
}

async function gmail(path, params = {}) {
  const t = await accessToken();
  const u = new URL(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(SENDER)}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${t}` } });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

/** Kuka kirjoitti viimeksi ja montako kertaa me olemme kirjoittaneet.
 *  Tämä on koko skriptin ydin: ilman tätä muistutus menisi myös niille
 *  jotka ovat jo vastanneet. */
async function postihistoria(email) {
  const l = await gmail('messages', { q: `{to:${email} from:${email}} newer_than:60d`, maxResults: '25' });
  const viestit = [];
  for (const m of (l.messages || [])) {
    const d = await gmail(`messages/${m.id}`, { format: 'metadata', metadataHeaders: 'From' });
    const from = (d.payload?.headers || []).find((h) => h.name.toLowerCase() === 'from')?.value ?? '';
    viestit.push({ ts: Number(d.internalDate), meilta: from.includes('tiiviskoti.fi') });
  }
  viestit.sort((a, b) => a.ts - b.ts);
  const viim = viestit[viestit.length - 1];
  return {
    kpl: viestit.length,
    viimeinenMeilta: viim ? viim.meilta : null,
    meiltaKpl: viestit.filter((v) => v.meilta).length,
  };
}

const encodeHeader = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;

function buildMime({ to, subject, html, text }) {
  const boundary = `tk_${Date.now().toString(36)}`;
  return Buffer.from([
    `From: TiivisKoti <${SENDER}>`, `To: ${to}`, `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(html, 'utf8').toString('base64'),
    `--${boundary}--`, '',
  ].join('\r\n'), 'utf8').toString('base64url');
}

async function sendMail(opts) {
  const t = await accessToken();
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(SENDER)}/messages/send`,
    { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: buildMime(opts) }) },
  );
  const text = await r.text();
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).id;
}

/* ---------- Sisältö ---------- */

const firstName = (full) => (full || '').trim().split(/\s+/)[0] || 'hei';
const fiDate = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
const eur = (c) => (c / 100).toLocaleString('fi-FI', { maximumFractionDigits: 0 }) + ' €';

async function ensimmainenVapaa() {
  try {
    const r = await fetch(`${CRM_BASE}/api/public/availability?first=1&minutes=60&days=21`);
    if (!r.ok) return null;
    const { firstSlot } = await r.json();
    if (!firstSlot) return null;
    const t = new Date(firstSlot);
    const kello = t.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Helsinki' }).replace(':', '.');
    const paiva = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const ero = Math.round((paiva(t) - paiva(new Date())) / 86400000);
    if (ero <= 0) return `jo tänään klo ${kello}`;
    if (ero === 1) return `jo huomenna klo ${kello}`;
    return `${fiDate(t)} klo ${kello}`;
  } catch { return null; }
}

const subject = (o) => o.vanhentunut
  ? `Tarjous ${o.offer_number} — pidämmekö hinnan voimassa?`
  : `Tarjous ${o.offer_number} — vielä voimassa ${fiDate(o.valid_until)} asti`;

function voimassaLause(o) {
  return o.vanhentunut
    ? `Tarjous ehti vanhentua ${fiDate(o.valid_until)}, mutta teemme sen samalla hinnalla uudelleen, jos työ on yhä ajankohtainen.`
    : `Tarjous on voimassa ${fiDate(o.valid_until)} asti.`;
}

function textBody(o, vapaa) {
  return [
    `Hei ${firstName(o.contact_name || o.customer_name)},`,
    '',
    `lähetimme ${fiDate(o.sent_at)} tarjouksen ${o.offer_number}, yhteensä ${eur(o.total_cents)} (sis. ALV 25,5 %).`,
    voimassaLause(o),
    '',
    `Jos haluat varata ajan, vastaa tähän viestiin tai soita ${PHONE} — katsotaan kalenterista sinulle sopiva päivä.`,
    ...(vapaa ? [`Ensimmäinen vapaa aika on ${vapaa}.`] : []),
    '',
    'Jos työ ei ole ajankohtainen, riittää että kerrot sen tässä viestissä. Emme muistuta uudestaan.',
    '',
    'Ystävällisin terveisin,',
    'Josua Leier',
    'TiivisKoti · Y-tunnus 3652671-7',
    `${PHONE} · info@tiiviskoti.fi`,
  ].join('\n');
}

function htmlBody(o, vapaa) {
  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">

  <tr><td style="background:${GREEN};padding:22px 28px;color:#FFFFFF;font-size:19px;font-weight:700">TiivisKoti</td></tr>

  <tr><td style="padding:26px 28px 4px;color:${INK};font-size:16px;line-height:1.65">
    <p style="margin:0 0 14px">Hei ${firstName(o.contact_name || o.customer_name)},</p>
    <p style="margin:0 0 14px">
      lähetimme ${fiDate(o.sent_at)} tarjouksen <strong>${o.offer_number}</strong>,
      yhteensä <strong>${eur(o.total_cents)}</strong> (sis. ALV 25,5 %). ${voimassaLause(o)}
    </p>
  </td></tr>

  <tr><td style="padding:8px 28px 0" align="center">
    <a href="tel:${PHONE_HREF}"
       style="display:inline-block;background:${GREEN};color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 28px;border-radius:10px">
      Soita ${PHONE}
    </a>
  </td></tr>

  <tr><td style="padding:14px 28px 6px;color:${MUTED};font-size:14.5px;line-height:1.7;text-align:center">
    Voit myös vastata suoraan tähän viestiin — katsotaan kalenterista sinulle sopiva päivä.
    ${vapaa ? `<br>Ensimmäinen vapaa aika on <strong style="color:${INK}">${vapaa}</strong>.` : ''}
  </td></tr>

  <tr><td style="padding:10px 28px 24px">
    <div style="border-top:1px solid #E6E2DA;padding-top:16px;color:${MUTED};font-size:14px;line-height:1.7">
      Jos työ ei ole ajankohtainen, riittää että kerrot sen tässä viestissä. Emme muistuta uudestaan.
    </div>
  </td></tr>

  <tr><td style="background:${CREAM};padding:18px 28px;text-align:center;color:${MUTED};font-size:13px">
    TiivisKoti &middot; Uusimaa ja Riihimäki &middot;
    <a href="tel:${PHONE_HREF}" style="color:${GREEN};text-decoration:none">${PHONE}</a> &middot;
    <a href="mailto:info@tiiviskoti.fi" style="color:${GREEN};text-decoration:none">info@tiiviskoti.fi</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/* ---------- Ajo ---------- */

const tanaan = new Date();

/* Ehdokkaat: lähetetty, ei hyväksytty, ei peruttu. Tuoreimmat pois —
   tänään lähetettyyn tarjoukseen ei muistuteta. */
const ehdokkaat = await sql`
  select o.offer_number, o.customer_name, o.contact_name, o.email,
         o.total_cents, o.sent_at, o.valid_until, o.status::text as status
    from tk.offers o
   where o.status = 'sent'
     and o.sent_at is not null
     and o.email is not null and o.email <> ''
     and o.sent_at < now() - interval '3 days'
   order by o.sent_at
`;

const joMuistutettu = new Set(
  (await sql`
    select distinct lower(to_email) as e from tk.mail_log
     where kind = 'reminder' and error is null
       and created_at > now() - ${`${MIN_VALI_VRK} days`}::interval
  `).map((r) => r.e),
);

const vapaa = await ensimmainenVapaa();
const laheta = [];
const ohita = [];

for (const o of ehdokkaat) {
  o.vanhentunut = new Date(o.valid_until) < tanaan;
  if (joMuistutettu.has(o.email.toLowerCase())) { ohita.push([o, 'muistutettu jo CRM:stä']); continue; }
  const h = await postihistoria(o.email);
  if (h.viimeinenMeilta === false) { ohita.push([o, 'ASIAKAS vastasi viimeksi — pallo on meillä']); continue; }
  if (h.meiltaKpl > 1) { ohita.push([o, `olemme jo kirjoittaneet ${h.meiltaKpl} kertaa`]); continue; }
  laheta.push(o);
}

console.log(`\nTarjousmuistutus — ${SEND ? 'LÄHETETÄÄN' : 'KUIVAHARJOITTELU (ei lähetetä)'}`);
console.log(`Ensimmäinen vapaa aika: ${vapaa ?? '(ei saatu)'}`);
console.log('─'.repeat(78));
for (const o of laheta) {
  console.log(`  ${o.offer_number}  ${(o.contact_name || o.customer_name).padEnd(30)} ${eur(o.total_cents).padStart(9)}  ${o.email}`);
}
console.log(`\n  Ohitetaan (${ohita.length}):`);
for (const [o, syy] of ohita) {
  console.log(`    ${o.offer_number}  ${(o.contact_name || o.customer_name).padEnd(30)} — ${syy}`);
}
console.log('─'.repeat(78));
console.log(`${laheta.length} lähetettävää, yhteensä ${eur(laheta.reduce((s, o) => s + o.total_cents, 0))}\n`);

if (!SEND) {
  if (laheta[0]) {
    console.log('Esimerkkiviesti:\n');
    console.log(`Aihe: ${subject(laheta[0])}\n`);
    console.log(textBody(laheta[0], vapaa));
  }
  console.log('\n' + '─'.repeat(78));
  console.log('Lähetä oikeasti:  node scripts/tarjousmuistutus.mjs --send\n');
  await sql.end();
  process.exit(0);
}

let ok = 0;
const virheet = [];
for (const o of laheta) {
  const aihe = subject(o);
  try {
    const id = await sendMail({ to: o.email, subject: aihe, html: htmlBody(o, vapaa), text: textBody(o, vapaa) });
    await sql`
      insert into tk.mail_log (job_id, kind, to_email, subject, provider_id, sent_at)
      values (null, 'reminder', ${o.email}, ${aihe}, ${id}, now())
    `;
    ok++;
    console.log(`  ok    ${o.offer_number} ${o.contact_name || o.customer_name} — ${o.email}`);
  } catch (e) {
    const viesti = e instanceof Error ? e.message : String(e);
    await sql`
      insert into tk.mail_log (job_id, kind, to_email, subject, error)
      values (null, 'reminder', ${o.email}, ${aihe}, ${viesti})
    `;
    virheet.push({ nro: o.offer_number, viesti });
    console.log(`  VIRHE ${o.offer_number} — ${viesti}`);
  }
  await new Promise((r) => setTimeout(r, 700));
}

console.log('─'.repeat(78));
console.log(`Lähetetty ${ok}/${laheta.length}${virheet.length ? `, virheitä ${virheet.length}` : ''}\n`);
await sql.end();
process.exit(virheet.length ? 1 : 0);
