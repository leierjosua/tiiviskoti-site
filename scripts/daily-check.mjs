#!/usr/bin/env node
/* TiivisKoti — päivittäinen kuntotarkistus.
 *
 * Aja: `node scripts/daily-check.mjs`  (lisää `--verbose` niin näet myös OK-rivit)
 *
 * Tarkistaa neljä asiaa jotka voivat hajota huomaamatta ja joiden rikko näkyy
 * vasta rahassa: sivusto ja varauspolku, CRM, tietokannan eheys ja liiketoiminnan
 * signaalit (tuleeko liidejä, onko kalenterissa aikoja, jäikö vahvistus lähtemättä).
 *
 * Ei kirjoita mitään mihinkään. Turvallinen ajaa milloin tahansa.
 * Paluuarvo 1 jos yksikin FAIL — sopii cronin hälytykseksi.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRM = path.join(ROOT, 'tiiviskoti-crm');
const VERBOSE = process.argv.includes('--verbose');

/* .env.local on CRLF-muodossa — \r jää arvojen perään ja rikkoo tokenit. */
const env = {};
for (const raw of fs.readFileSync(path.join(CRM, '.env.local'), 'utf8').split('\n')) {
  const m = raw.replace(/\r$/, '').match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { default: postgres } = await import(path.join(CRM, 'node_modules/postgres/src/index.js'));
const sql = postgres(env.DATABASE_URL, { ssl: 'require', prepare: false });

const results = [];
const add = (level, area, msg, extra) => results.push({ level, area, msg, extra });
const ok = (a, m, x) => add('OK', a, m, x);
const warn = (a, m, x) => add('WARN', a, m, x);
const fail = (a, m, x) => add('FAIL', a, m, x);

const check = async (area, name, fn) => {
  try { await fn(); } catch (e) { fail(area, `${name} — tarkistus kaatui: ${e.message.slice(0, 200)}`); }
};

/* Reunavälimuisti näyttää vanhaa minuutteja → aina välimuistinmurtaja. */
const bust = (u) => u + (u.includes('?') ? '&' : '?') + 'cb=' + Math.floor(Math.random() * 1e9);
const get = async (url, opts = {}) => {
  const t0 = Date.now();
  const r = await fetch(bust(url), { redirect: 'follow', ...opts });
  return { status: r.status, ms: Date.now() - t0, text: await r.text(), url: r.url };
};

/* ========== 1. SIVUSTO ========== */
const SIVUT = [
  ['etusivu', 'https://tiiviskoti.fi/'],
  ['hinta', 'https://tiiviskoti.fi/hinta.html'],
  ['ajanvaraus', 'https://tiiviskoti.fi/ajanvaraus.html'],
  ['ikkunoiden tiivistys', 'https://tiiviskoti.fi/ikkunoiden-tiivistys.html'],
  ['ovien tiivistys', 'https://tiiviskoti.fi/ovien-tiivistys.html'],
  ['taloyhtiö', 'https://tiiviskoti.fi/taloyhtio.html'],
  ['artikkelit', 'https://tiiviskoti.fi/artikkelit.html'],
  ['meistä', 'https://tiiviskoti.fi/meista.html'],
  ['ota yhteyttä', 'https://tiiviskoti.fi/ota-yhteytta.html'],
];
for (const [nimi, url] of SIVUT) {
  await check('sivusto', nimi, async () => {
    const r = await get(url);
    if (r.status !== 200) return fail('sivusto', `${nimi} ${r.status}`, url);
    if (r.ms > 3000) return warn('sivusto', `${nimi} hidas: ${r.ms} ms`, url);
    ok('sivusto', `${nimi} 200 (${r.ms} ms)`);
  });
}

/* ========== 2. VARAUSPOLKU ==========
   Tämä on se joka tuo rahan. Saatavuus tarkistetaan oikealla postinumerolla;
   itse varausta EI tehdä, koska se loisi työn ja lähettäisi postia. */
await check('varaus', 'saatavuus', async () => {
  const r = await get('https://admin.tiiviskoti.fi/api/public/availability?postal=00120&days=21',
    { headers: { origin: 'https://tiiviskoti.fi' } });
  if (r.status !== 200) return fail('varaus', `saatavuusrajapinta ${r.status}`);
  const j = JSON.parse(r.text);
  if (!j.served) return fail('varaus', 'Helsinkiä ei palvella — tarkista tk.areas');
  const n = j.slots?.length ?? 0;
  /* Nolla aikaa = kalenteri on käytännössä kiinni eikä kukaan voi varata.
     Näin kävi 25.8.–7.9., jolloin mainokset pyörivät tyhjää vastaan. */
  if (n === 0) return fail('varaus', 'EI YHTÄÄN vapaata aikaa 21 vrk:lle — kukaan ei voi varata');
  if (n < 5) return warn('varaus', `vain ${n} vapaata aikaa 21 vrk:lle`);
  const eka = new Date(j.slots[0].startsAt);
  const paivia = Math.round((eka - Date.now()) / 86400000);
  if (paivia > 10) warn('varaus', `ensimmäinen vapaa aika vasta ${paivia} vrk päässä (${eka.toLocaleDateString('fi-FI')})`);
  else ok('varaus', `${n} vapaata aikaa, ensimmäinen ${eka.toLocaleDateString('fi-FI')} (${paivia} vrk)`);

  const kalenterit = new Set(j.slots.map((s) => s.calendarId));
  ok('varaus', `aikoja ${kalenterit.size} eri kalenterista`);
});

await check('varaus', 'CORS', async () => {
  const r = await fetch('https://admin.tiiviskoti.fi/api/public/availability?postal=00120',
    { headers: { origin: 'https://tiiviskoti.fi' } });
  const acao = r.headers.get('access-control-allow-origin');
  /* Ilman tätä otsaketta selain estää vastauksen ja sivu sanoo
     "Alueen tarkistus ei onnistunut" — varaus pysähtyy heti ensimmäiseen ruutuun. */
  if (!acao) fail('varaus', 'saatavuusvastauksesta puuttuu access-control-allow-origin → selain estää');
  else ok('varaus', `CORS kunnossa (${acao})`);
});

/* ========== 3. CRM ========== */
await check('crm', 'admin', async () => {
  const r = await get('https://admin.tiiviskoti.fi/tyot');
  /* Kirjautumaton ohjataan /login-sivulle — se on oikea tila, ei vika. */
  if (r.status === 200 && r.url.includes('/login')) ok('crm', 'admin vastaa, ohjaa kirjautumiseen');
  else if (r.status === 200) ok('crm', 'admin vastaa 200');
  else fail('crm', `admin ${r.status}`);
});

await check('crm', 'tietokanta', async () => {
  const [r] = await sql`select now() as nyt, current_user as kayttaja`;
  ok('crm', `tietokanta vastaa (${r.kayttaja})`);
});

/* ========== 4. TIETOKANNAN EHEYS ========== */
await check('eheys', 'päällekkäiset varaukset', async () => {
  const rows = await sql`
    select a.job_number a_num, b.job_number b_num, s.full_name staff, a.starts_at
      from tk.jobs a join tk.jobs b
        on a.calendar_id = b.calendar_id and a.id < b.id
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
      join tk.calendars c on c.id = a.calendar_id
      join tk.staff s on s.id = c.staff_id
     where a.status <> 'cancelled' and b.status <> 'cancelled'`;
  if (rows.length) fail('eheys', `${rows.length} päällekkäistä varausta samassa kalenterissa`,
    rows.map((r) => `${r.a_num}+${r.b_num} ${r.staff}`).join(', '));
  else ok('eheys', 'ei päällekkäisiä varauksia');
});

await check('eheys', 'työryhmät', async () => {
  const yksin = await sql`
    select job_number, crew_group_id from tk.jobs
     where crew_group_id is not null
       and crew_group_id in (
         select crew_group_id from tk.jobs where crew_group_id is not null
          group by crew_group_id having count(*) < 2)`;
  if (yksin.length) warn('eheys', `${yksin.length} työtä merkitty työpariksi ilman paria`,
    yksin.map((r) => r.job_number).join(', '));
  else ok('eheys', 'ei yksinäisiä työpareja');

  const tupla = await sql`
    select crew_group_id, count(*) n from tk.jobs j
      join tk.calendars c on c.id = j.calendar_id
     where crew_group_id is not null and j.status <> 'cancelled'
     group by crew_group_id, c.staff_id having count(*) > 1`;
  if (tupla.length) fail('eheys', `${tupla.length} työryhmää joissa sama asentaja kahdesti`);
  else ok('eheys', 'ei tuplattuja asentajia työryhmissä');
});

await check('eheys', 'klikkitunnisteet', async () => {
  /* Työparin rivi EI saa kantaa gclidia: ads-sync lähettää jokaisen gclidin
     kantavan työn, joten pari raportoisi saman kaupan Adsille kahdesti. */
  const rows = await sql`
    select job_number from tk.jobs
     where gclid is not null and price_cents = 0 and crew_group_id is not null`;
  if (rows.length) fail('eheys', `${rows.length} nollahintaista työparia kantaa gclidia → tuplaraportointi Adsiin`,
    rows.map((r) => r.job_number).join(', '));
  else ok('eheys', 'työpareilla ei klikkitunnisteita');
});

/* ========== 5. LIIKETOIMINNAN SIGNAALIT ========== */
await check('toiminta', 'liidit', async () => {
  const [r] = await sql`
    select max(created_at) viimeisin,
           count(*) filter (where created_at > now() - interval '24 hours') vrk,
           count(*) filter (where created_at > now() - interval '7 days') vk
      from tk.leads`;
  const tunnit = r.viimeisin ? Math.round((Date.now() - new Date(r.viimeisin)) / 3600000) : null;
  if (tunnit === null) fail('toiminta', 'liidejä ei ole lainkaan');
  else if (tunnit > 48) fail('toiminta', `viimeisin liidi ${tunnit} h sitten — liidiputki voi olla poikki`);
  else if (tunnit > 24) warn('toiminta', `viimeisin liidi ${tunnit} h sitten`);
  else ok('toiminta', `liidejä: ${r.vrk} (24 h), ${r.vk} (7 vrk), viimeisin ${tunnit} h sitten`);
});

await check('toiminta', 'soittamatta', async () => {
  const rows = await sql`
    select full_name, created_at from tk.leads
     where status = 'new' and created_at < now() - interval '24 hours'
     order by created_at`;
  if (rows.length) warn('toiminta', `${rows.length} liidiä yli vrk:n soittamatta`,
    rows.slice(0, 5).map((r) => r.full_name).join(', '));
  else ok('toiminta', 'ei vanhoja soittamattomia liidejä');
});

await check('toiminta', 'tulevat työt', async () => {
  const [r] = await sql`
    select count(*) filter (where starts_at between now() and now() + interval '7 days') vk,
           count(*) filter (where starts_at between now() and now() + interval '14 days') kaksivk
      from tk.jobs where status in ('confirmed','tentative')`;
  if (Number(r.vk) === 0) warn('toiminta', 'ei yhtään työtä seuraavalle 7 vrk:lle');
  else ok('toiminta', `tulevia töitä: ${r.vk} (7 vrk), ${r.kaksivk} (14 vrk)`);
});

await check('toiminta', 'vahvistukset', async () => {
  const rows = await sql`
    select job_number, starts_at from tk.jobs
     where status = 'confirmed' and confirmation_sent_at is null
       and starts_at > now() and starts_at < now() + interval '14 days'
     order by starts_at`;
  if (rows.length) warn('toiminta', `${rows.length} tulevaa työtä ilman vahvistusta asiakkaalle`,
    rows.map((r) => r.job_number).join(', '));
  else ok('toiminta', 'kaikilla tulevilla töillä vahvistus lähetetty');
});

await check('toiminta', 'epäonnistuneet viestit', async () => {
  const rows = await sql`
    select kind, to_email, error, created_at from tk.mail_log
     where error is not null and created_at > now() - interval '7 days'
     order by created_at desc`;
  if (rows.length) warn('toiminta', `${rows.length} epäonnistunutta viestiä 7 vrk:ssa`,
    rows.slice(0, 3).map((r) => `${r.kind}->${r.to_email}`).join(', '));
  else ok('toiminta', 'ei epäonnistuneita viestejä 7 vrk:ssa');
});

await check('toiminta', 'vanhenevat tarjoukset', async () => {
  const rows = await sql`
    select offer_number, customer_name, total_cents, valid_until from tk.offers
     where status in ('sent','draft') and valid_until between current_date and current_date + 7
     order by valid_until`;
  if (rows.length) warn('toiminta', `${rows.length} tarjousta vanhenee 7 vrk:ssa`,
    rows.map((r) => `${r.offer_number} ${(r.total_cents / 100).toLocaleString('fi-FI')} € (${String(r.valid_until).slice(0, 10)})`).join(', '));
  else ok('toiminta', 'ei pian vanhenevia tarjouksia');
});

/* ========== 6. GOOGLE-YHTEYS ==========
   Varaus onnistuu vaikka tämä on poikki — asiakas näkee kiitossivun mutta
   vahvistus, työmääräin ja kalenteritapahtuma jäävät kaikki tulematta. */
await check('google', 'terveystarkistus', async () => {
  const [r] = await sql`select ok, detail, checked_at from tk.health_checks
     where kind = 'google' order by checked_at desc limit 1`;
  if (!r) return warn('google', 'terveystarkistusta ei ole koskaan ajettu');
  const tunnit = Math.round((Date.now() - new Date(r.checked_at)) / 3600000);
  if (!r.ok) fail('google', `Google-yhteys POIKKI: ${r.detail ?? ''} (${tunnit} h sitten)`);
  else if (tunnit > 48) warn('google', `viimeisin tarkistus ${tunnit} h sitten — cron ei ehkä aja`);
  else ok('google', `Google-yhteys kunnossa (tarkistettu ${tunnit} h sitten)`);
});

/* ========== 7. HINNASTON YHTENÄISYYS ==========
   `pricing.ts` on KÄSINKOPIO `pricing.mjs`:stä. Jos ne eroavat, verkkosivun
   laskuri ja CRM:n tarjous antavat eri hinnan samalle työlle — ja ero
   huomataan vasta kun asiakas vertaa. Verrataan rakenteellisesti, ei
   tekstinä: tiedostot saavat poiketa muotoilultaan, eivät luvuiltaan. */
await check('hinnasto', 'kopiot samassa', async () => {
  const a = path.join(ROOT, 'tiiviskoti', 'pricing.mjs');
  const b = path.join(CRM, 'src', 'lib', 'pricing.ts');
  if (!fs.existsSync(a) || !fs.existsSync(b)) return warn('hinnasto', 'pricing-tiedostoa ei löydy');

  /* Poimitaan vain hinnoittelun kannalta merkitsevät luvut: minimi,
     ikkunaportaat ja jokaisen tuotteen id -> price/combo. */
  const poimi = (file) => {
    const t = fs.readFileSync(file, 'utf8');
    const min = t.match(/MIN_PRICE\s*=\s*(\d+)/)?.[1];
    const tiers = [...t.matchAll(/\{\s*upTo:\s*([\w.]+),\s*price:\s*(\d+)\s*\}/g)]
      .map((m) => `${m[1]}:${m[2]}`).join(',');
    const items = [...t.matchAll(/id:\s*'([a-z]+)'[^\n]*?price:\s*(\d+)([^\n]*?combo:\s*(\d+))?/g)]
      .map((m) => `${m[1]}=${m[2]}${m[4] ? '/' + m[4] : ''}`).sort().join(',');
    const ded = t.match(/DEDUCTION_RATE\s*=\s*([\d.]+)/)?.[1];
    return { min, tiers, items, ded };
  };
  const A = poimi(a), B = poimi(b);

  const erot = [];
  if (A.min !== B.min) erot.push(`minimi ${A.min} vs ${B.min}`);
  if (A.tiers !== B.tiers) erot.push(`ikkunaportaat ${A.tiers} vs ${B.tiers}`);
  if (A.items !== B.items) erot.push(`tuotehinnat ${A.items} vs ${B.items}`);
  /* Kotitalousvähennys on vain sivustolla — sen puuttuminen CRM:stä ei ole vika. */
  if (A.ded && B.ded && A.ded !== B.ded) erot.push(`vähennys ${A.ded} vs ${B.ded}`);

  if (erot.length) fail('hinnasto', 'pricing.mjs ja pricing.ts EROAVAT', erot.join(' · '));
  else ok('hinnasto', `hinnastot täsmäävät (min ${A.min} €, portaat ${A.tiers})`);
});

/* ========== 8. MAINOSTEN LASKEUTUMISSIVUT ==========
   Rikkinäinen laskeutumissivu palaa suoraan rahana: klikki maksetaan silti.
   Osoitteet haetaan Adsista, jotta muutos mainoksessa ei jää huomaamatta. */
await check('mainokset', 'laskeutumissivut', async () => {
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN || !env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN) {
    return warn('mainokset', 'Google Ads -tunnuksia ei ole — laskeutumissivuja ei tarkistettu');
  }
  const tok = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  })).json();
  if (!tok.access_token) return warn('mainokset', 'Ads-tunnus ei uusiutunut');

  /* v25: v26+ vastaa "Method not found", v24 ja vanhemmat HTML-404:llä. */
  const r = await fetch(
    `https://googleads.googleapis.com/v25/customers/${env.GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream`,
    { method: 'POST',
      headers: { authorization: `Bearer ${tok.access_token}`,
                 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
                 'content-type': 'application/json' },
      body: JSON.stringify({ query:
        `SELECT ad_group_ad.ad.final_urls FROM ad_group_ad
          WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED'
            AND campaign.status = 'ENABLED'` }) });
  if (!r.ok) return warn('mainokset', `Ads-kysely ${r.status} — laskeutumissivuja ei tarkistettu`);

  const urlit = [...new Set(JSON.parse(await r.text())
    .flatMap((c) => c.results ?? [])
    .flatMap((x) => x.adGroupAd?.ad?.finalUrls ?? []))];
  if (urlit.length === 0) return warn('mainokset', 'ei aktiivisia mainoksia');

  for (const u of urlit) {
    const res = await get(u);
    if (res.status !== 200) fail('mainokset', `mainoksen laskeutumissivu ${res.status}: ${u}`);
    else ok('mainokset', `${u} 200 (${res.ms} ms)`);
  }
});

/* ========== RAPORTTI ========== */
await sql.end();

const fails = results.filter((r) => r.level === 'FAIL');
const warns = results.filter((r) => r.level === 'WARN');
const oks = results.filter((r) => r.level === 'OK');

const VARI = { OK: '\x1b[32m', WARN: '\x1b[33m', FAIL: '\x1b[31m' };
const R = '\x1b[0m';
const rivi = (r) => `${VARI[r.level]}${r.level.padEnd(4)}${R} ${r.area.padEnd(9)} ${r.msg}`
  + (r.extra ? `\n${' '.repeat(15)}${r.extra}` : '');

console.log(`\nTiivisKoti — kuntotarkistus ${new Date().toLocaleString('fi-FI')}\n${'─'.repeat(64)}`);
for (const r of fails) console.log(rivi(r));
for (const r of warns) console.log(rivi(r));
if (VERBOSE) for (const r of oks) console.log(rivi(r));
console.log('─'.repeat(64));
console.log(`${VARI.FAIL}${fails.length} FAIL${R} · ${VARI.WARN}${warns.length} WARN${R} · ${VARI.OK}${oks.length} OK${R}`
  + (VERBOSE ? '' : '   (--verbose näyttää OK-rivit)'));

process.exit(fails.length ? 1 : 0);
