#!/usr/bin/env node
/* =========================================================
   Liidimuistutus — sähköposti soittamatta jääneille liideille.

   MIKSI SKRIPTI EIKÄ NAPPI ADMINISSA: muistutus lähtee koko joukolle
   kerralla ja harvoin, ei yhdelle liidille kerrallaan. Nappi työn sivulla
   olisi väärä muoto sille, ja tämän ajaa ihminen joka näkee listan ennen
   lähetystä.

   KAKSI SUOJAA KAKSOISLÄHETYSTÄ VASTAAN:
     1. Kuivaharjoittelu on oletus. Ilman `--send` mitään ei lähde, vaan
        näytetään kenelle ja mitä oltaisiin lähettämässä.
     2. Sama osoite ei saa toista muistutusta `MIN_VALI_VRK` päivään.
        Tarkistus tehdään tk.mail_log:sta, joka on sama loki johon kaikki
        muukin posti kirjautuu — ei siis erillistä tilaa joka voi eksyä.

   Muistutus EI ole markkinointikirje vaan vastaus yhteydenottopyyntöön:
   vastaanottaja on itse jättänyt tietonsa ja pyytänyt yhteydenottoa,
   eikä sitä ole vielä saanut.

   Aja repon juuresta tai tästä kansiosta:
     node scripts/liidimuistutus.mjs            # näyttää, ei lähetä
     node scripts/liidimuistutus.mjs --send     # lähettää
   ========================================================= */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* Ympäristö .env.local:sta. Skripti ajetaan koneelta eikä Verceliltä,
   joten Next.js:n oma lataus ei ole käytössä. */
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
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
  prepare: false, ssl: 'require', max: 2, idle_timeout: 5,
  transform: { undefined: null },
});

/* ---------- Google / Gmail ---------- */

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google token: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text).access_token;
}

/* Otsikko base64-koodattuna: ääkköset otsikkorivillä hajoavat muuten
   osassa postiohjelmista. */
const encodeHeader = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;

function buildMime({ to, subject, html, text }) {
  const boundary = `tk_${Date.now().toString(36)}`;
  const mime = [
    `From: TiivisKoti <${SENDER}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

async function sendMail(token, opts) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(SENDER)}/messages/send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: buildMime(opts) }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).id;
}

/* ---------- Sisältö ---------- */

const firstName = (full) => (full || '').trim().split(/\s+/)[0] || 'hei';
const fiDate = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;

/* Liidilomakkeen kohde tulee viestikenttään rivinä "Kohde: ikkunat". */
function kohdeSana(message) {
  const m = /Kohde:\s*(\w+)/i.exec(message || '');
  const k = (m?.[1] || '').toLowerCase();
  if (k === 'ovet') return 'ovien';
  if (k === 'molemmat') return 'ovien ja ikkunoiden';
  return 'ikkunoiden';
}

/* Kaksi eri tilannetta, kaksi eri lausetta. "Emme ole ehtineet soittaa" on
   väärin sille jolle on soitettu — ja se huomataan. */
const avausLause = (status) =>
  status === 'no_answer'
    ? 'Yritimme soittaa, mutta emme saaneet sinua kiinni. Laitetaan siis tiedot tällä tavalla.'
    : 'Emme ole vielä ehtineet soittaa, joten laitetaan tiedot tällä välin sähköpostilla.';

/* Ensimmäinen vapaa aika sivuston omasta rajapinnasta. Jos haku ei onnistu,
   lause jätetään pois — puuttuva lupaus on parempi kuin väärä. */
async function ensimmainenVapaa() {
  try {
    const r = await fetch(`${CRM_BASE}/api/public/availability?first=1&minutes=60&days=21`);
    if (!r.ok) return null;
    const { firstSlot } = await r.json();
    if (!firstSlot) return null;
    const t = new Date(firstSlot);
    const kello = t.toLocaleTimeString('fi-FI', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Helsinki',
    }).replace(':', '.');
    const paiva = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const ero = Math.round((paiva(t) - paiva(new Date())) / 86400000);
    if (ero <= 0) return `jo tänään klo ${kello}`;
    if (ero === 1) return `jo huomenna klo ${kello}`;
    return `${fiDate(t)} klo ${kello}`;
  } catch {
    return null;
  }
}

const HINNAT = [
  ['Ikkuna', '75–90 € / kpl (mitä useampi, sitä halvempi)'],
  ['Ulko- tai parvekeovi', '99 € / kpl'],
  ['Väli- tai huoneovi', '59 € / kpl'],
];

function subject(lead) {
  return `Tiivistys — ${firstName(lead.full_name)}, saitko meidät kiinni?`;
}

function textBody(lead, vapaa) {
  return [
    `Hei ${firstName(lead.full_name)},`,
    '',
    `jätit ${fiDate(lead.created_at)} yhteystietosi ${kohdeSana(lead.message)} tiivistyksestä Facebookin kautta.`,
    avausLause(lead.status),
    '',
    'Hinnat ovat kiinteitä eikä niihin tule matkalisää:',
    ...HINNAT.map(([n, h]) => `  - ${n}: ${h}`),
    'Hinta sisältää tiivisteet, työn, säädön ja ALV 25,5 %. Pienin veloitus on',
    '149 €. Työn osuudesta saa kotitalousvähennyksen.',
    '',
    'Näet oman hintasi ja vapaat ajat minuutissa täältä:',
    'https://tiiviskoti.fi/#laskuri',
    '',
    ...(vapaa ? [`Ensimmäinen vapaa aika on ${vapaa}.`] : []),
    `Voit myös vastata tähän viestiin tai soittaa ${PHONE}, niin hoidetaan varaus puhelimessa.`,
    '',
    'Ystävällisin terveisin,',
    'Josua Leier',
    'TiivisKoti · Y-tunnus 3652671-7',
    `${PHONE} · info@tiiviskoti.fi`,
  ].join('\n');
}

function htmlBody(lead, vapaa) {
  const rows = HINNAT.map(([n, h]) => `
      <tr>
        <td style="padding:7px 0;color:${INK};font-size:15px">${n}</td>
        <td style="padding:7px 0;text-align:right;color:${INK};font-size:15px;font-weight:600;white-space:nowrap">${h}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">

  <tr><td style="background:${GREEN};padding:22px 28px;color:#FFFFFF;font-size:19px;font-weight:700">
    TiivisKoti
  </td></tr>

  <tr><td style="padding:26px 28px 6px;color:${INK};font-size:16px;line-height:1.65">
    <p style="margin:0 0 14px">Hei ${firstName(lead.full_name)},</p>
    <p style="margin:0 0 14px">
      jätit ${fiDate(lead.created_at)} yhteystietosi ${kohdeSana(lead.message)} tiivistyksestä
      Facebookin kautta. ${avausLause(lead.status)}
    </p>
  </td></tr>

  <tr><td style="padding:0 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${CREAM};border-radius:10px;padding:14px 18px">
      <tr><td colspan="2" style="padding-bottom:6px;color:${MUTED};font-size:13px;font-weight:700;letter-spacing:.04em">
        KIINTEÄT HINNAT · EI MATKALISÄÄ
      </td></tr>
      ${rows}
      <tr><td colspan="2" style="padding-top:10px;color:${MUTED};font-size:13.5px;line-height:1.6">
        Sisältää tiivisteet, työn, säädön ja ALV 25,5 %. Pienin veloitus 149 €.
        Työn osuudesta saa kotitalousvähennyksen.
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:22px 28px 6px" align="center">
    <a href="https://tiiviskoti.fi/#laskuri"
       style="display:inline-block;background:${GREEN};color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 28px;border-radius:10px">
      Katso hinta ja varaa aika
    </a>
  </td></tr>

  <tr><td style="padding:10px 28px 24px;color:${MUTED};font-size:14.5px;line-height:1.7;text-align:center">
    ${vapaa ? `Ensimmäinen vapaa aika on <strong style="color:${INK}">${vapaa}</strong>.<br>` : ''}
    Voit myös vastata tähän viestiin tai soittaa
    <a href="tel:${PHONE_HREF}" style="color:${GREEN};font-weight:700;text-decoration:none">${PHONE}</a>,
    niin hoidetaan varaus puhelimessa.
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

const leads = await sql`
  select id, full_name, email, phone, status::text as status, message, created_at
    from tk.leads
   where status in ('new', 'no_answer')
     and email is not null and email <> ''
   order by created_at
`;

/* Aiemmin muistutetut pois. Vertailu sähköpostilla eikä liidin id:llä:
   sama ihminen voi olla kannassa kahtena liidinä, eikä hän saa silloin
   kahta samaa viestiä. */
const jo = new Set(
  (await sql`
    select distinct lower(to_email) as e
      from tk.mail_log
     where kind = 'reminder'
       and error is null
       and created_at > now() - ${`${MIN_VALI_VRK} days`}::interval
  `).map((r) => r.e),
);

const vapaa = await ensimmainenVapaa();
const kohteet = leads.filter((l) => !jo.has(l.email.toLowerCase()));
const ohitetut = leads.filter((l) => jo.has(l.email.toLowerCase()));

console.log(`\nLiidimuistutus — ${SEND ? 'LÄHETETÄÄN' : 'KUIVAHARJOITTELU (ei lähetetä)'}`);
console.log(`Ensimmäinen vapaa aika: ${vapaa ?? '(ei saatu — lause jätetään pois)'}`);
console.log('─'.repeat(72));
for (const l of kohteet) {
  console.log(`  ${l.status === 'no_answer' ? 'Soita uudelleen' : 'Uusi           '}  ` +
              `${l.full_name.padEnd(24)} ${l.email}`);
}
if (ohitetut.length) {
  console.log(`\n  Ohitettu (muistutettu jo ${MIN_VALI_VRK} vrk:n sisällä):`);
  for (const l of ohitetut) console.log(`    ${l.full_name} — ${l.email}`);
}
console.log('─'.repeat(72));
console.log(`${kohteet.length} lähetettävää, ${ohitetut.length} ohitettu\n`);

if (!SEND) {
  if (kohteet[0]) {
    console.log('Esimerkkiviesti ensimmäiselle vastaanottajalle:\n');
    console.log(`Aihe: ${subject(kohteet[0])}\n`);
    console.log(textBody(kohteet[0], vapaa));
    console.log('\n' + '─'.repeat(72));
  }
  console.log('\nLähetä oikeasti:  node scripts/liidimuistutus.mjs --send\n');
  await sql.end();
  process.exit(0);
}

const token = await accessToken();
let ok = 0;
const virheet = [];

for (const l of kohteet) {
  const aihe = subject(l);
  try {
    const id = await sendMail(token, {
      to: l.email,
      subject: aihe,
      html: htmlBody(l, vapaa),
      text: textBody(l, vapaa),
    });
    await sql`
      insert into tk.mail_log (job_id, kind, to_email, subject, provider_id, sent_at)
      values (null, 'reminder', ${l.email}, ${aihe}, ${id}, now())
    `;
    ok++;
    console.log(`  ok    ${l.full_name} — ${l.email}`);
  } catch (e) {
    const viesti = e instanceof Error ? e.message : String(e);
    /* Epäonnistunutkin yritys lokiin: ilman sitä uusintayritys ei tiedä
       kenelle viesti oikeasti meni ja kenelle ei. */
    await sql`
      insert into tk.mail_log (job_id, kind, to_email, subject, error)
      values (null, 'reminder', ${l.email}, ${aihe}, ${viesti})
    `;
    virheet.push({ nimi: l.full_name, email: l.email, viesti });
    console.log(`  VIRHE ${l.full_name} — ${l.email}: ${viesti}`);
  }
  /* Pieni tauko: Gmailin API ei tykkää purskeesta, eikä kiirettä ole. */
  await new Promise((r) => setTimeout(r, 700));
}

console.log('─'.repeat(72));
console.log(`Lähetetty ${ok}/${kohteet.length}${virheet.length ? `, virheitä ${virheet.length}` : ''}\n`);
await sql.end();
process.exit(virheet.length ? 1 : 0);
