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
/* Verkkovarauksen alkupäivä: asennukset vasta 9.11.2026 alkaen, kotikartoitukset
   20.10. alkaen (kartoituskokeilu, CRM:n availability.ts). Ilman tätä tarkistus
   hälyttäisi "ei yhtään aikaa" koko kokeilun ajan. */
const ASENNUS_ALKAA = new Date('2026-11-09T00:00:00+02:00');
await check('varaus', 'saatavuus', async () => {
  const r = await get('https://admin.tiiviskoti.fi/api/public/availability?postal=00120&days=60',
    { headers: { origin: 'https://tiiviskoti.fi' } });
  if (r.status !== 200) return fail('varaus', `saatavuusrajapinta ${r.status}`);
  const j = JSON.parse(r.text);
  if (!j.served) return fail('varaus', 'Helsinkiä ei palvella — tarkista tk.areas');
  const n = j.slots?.length ?? 0;
  /* Nolla aikaa = kalenteri on käytännössä kiinni eikä kukaan voi varata.
     Näin kävi 25.8.–7.9., jolloin mainokset pyörivät tyhjää vastaan. */
  if (n === 0) return fail('varaus', 'EI YHTÄÄN vapaata asennusaikaa 60 vrk:lle — kukaan ei voi varata');
  if (n < 5) return warn('varaus', `vain ${n} vapaata asennusaikaa 60 vrk:lle`);
  const eka = new Date(j.slots[0].startsAt);
  const alku = Math.max(Date.now(), ASENNUS_ALKAA.getTime());
  const paivia = Math.round((eka - alku) / 86400000);
  if (paivia > 10) warn('varaus', `ensimmäinen vapaa asennusaika vasta ${eka.toLocaleDateString('fi-FI')}`);
  else ok('varaus', `${n} vapaata asennusaikaa, ensimmäinen ${eka.toLocaleDateString('fi-FI')}`);

  const kalenterit = new Set(j.slots.map((s) => s.calendarId));
  ok('varaus', `asennusaikoja ${kalenterit.size} eri kalenterista`);
});

await check('varaus', 'kotikartoitus', async () => {
  const r = await get('https://admin.tiiviskoti.fi/api/public/availability?postal=00120&days=21&kartoitus=koti',
    { headers: { origin: 'https://tiiviskoti.fi' } });
  if (r.status !== 200) return fail('varaus', `kotikartoituksen saatavuus ${r.status}`);
  const n = JSON.parse(r.text).slots?.length ?? 0;
  if (n === 0) fail('varaus', 'kotikartoitukselle EI YHTÄÄN aikaa 21 vrk:lle (kartoitus.html)');
  else ok('varaus', `kotikartoitus: ${n} aikaa 21 vrk:lle`);
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
    select j.job_number, j.starts_at from tk.jobs j
     where j.status = 'confirmed' and j.confirmation_sent_at is null
       and j.starts_at > now() and j.starts_at < now() + interval '14 days'
       -- Työparin toinen rivi ei saa omaa vahvistusta: asiakas saa sen
       -- päärivistä. Hälytetään vain jos koko parilta puuttuu vahvistus.
       and not exists (
         select 1 from tk.jobs m
          where j.crew_group_id is not null and m.crew_group_id = j.crew_group_id
            and m.id <> j.id and m.confirmation_sent_at is not null)
     order by j.starts_at`;
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

/* ========== 7. METAN LIIDITUONTI ==========
   Maksettu liidi on kannassa vasta kun tuonti on hakenut sen Metasta.
   Tuonti kirjaa jokaisen ajon tk.health_checks:iin (kind = 'meta_leads'),
   ja tässä luetaan se merkintä.

   MIKSI MYÖS IKÄ EIKÄ VAIN TULOS: varsinainen ajastus on Supabasen
   pg_cronissa 5 minuutin välein. Pysähtynyt ajastin ei kirjaa virhettä —
   se ei kirjaa mitään — joten pelkkä `ok` näyttäisi vanhaa hyvää uutista
   loputtomiin. Onnistuminen kirjataan korkeintaan puolen tunnin välein,
   joten tuore merkintä ei koskaan ole kolmea tuntia vanhempi. */
await check('meta', 'liidituonti', async () => {
  const [r] = await sql`select ok, detail, checked_at from tk.health_checks
     where kind = 'meta_leads' order by checked_at desc limit 1`;
  if (!r) return warn('meta', 'liidituonnista ei ole yhtään merkintää — onko uusi versio julkaistu?');
  const tunnit = (Date.now() - new Date(r.checked_at)) / 3600000;
  const ika = tunnit < 1 ? `${Math.round(tunnit * 60)} min` : `${Math.round(tunnit)} h`;
  if (!r.ok) fail('meta', `Metan liidituonti POIKKI: ${r.detail ?? ''} (${ika} sitten)`);
  else if (tunnit > 3) fail('meta', `liidituontia ei ole ajettu ${ika} — ajastus poikki, liidit jäävät Metaan`);
  else ok('meta', `liidituonti kunnossa (${r.detail ?? ''}, ${ika} sitten)`);
});

/* ========== 8. HINNASTON YHTENÄISYYS ==========
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

/* ========== 9. MAINOSTEN LASKEUTUMISSIVUT ==========
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

/* ========== 10. SIVUJEN LINKIT JA PUHELINNUMERO ==========
   Varaustesti (check:varaus) kokeilee etusivun napit selaimessa. Tämä käy
   läpi KAIKKI yllä listatut sivut: jokainen sisäinen linkki vastaa 200,
   ankkuri osuu olemassa olevaan osioon, ja tel:-linkit ovat uutta numeroa
   (vaihdettu 14.10.2026 — vanha 045 875 5996 ei saa palata). */
const PUHELIN = '+3584578311972';
await check('linkit', 'sivujen linkit', async () => {
  const sivut = new Map();   // url ilman hashia -> html
  const hae = async (u) => {
    if (!sivut.has(u)) { const r = await get(u); sivut.set(u, r.status === 200 ? r.text : null); if (r.status !== 200) sivut.set(u + '#status', r.status); }
    return sivut.get(u);
  };
  const rikki = [], ankkurit = [], numerot = new Set();
  let linkkeja = 0;
  for (const [nimi, url] of SIVUT) {
    const html = await hae(url);
    if (!html) continue;
    for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
      if (href.startsWith('tel:')) { numerot.add(href.slice(4).replace(/[\s-]/g, '')); continue; }
      if (/^(mailto:|javascript:|https?:\/\/(?!tiiviskoti\.fi))/.test(href)) continue;
      const abs = new URL(href, url);
      const kohde = abs.origin + abs.pathname;
      const hash = abs.hash.slice(1);
      linkkeja++;
      const kohdeHtml = await hae(kohde);
      if (!kohdeHtml) { rikki.push(`${nimi}: ${href} → ${sivut.get(kohde + '#status')}`); continue; }
      if (hash && !new RegExp(`id=["']${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(kohdeHtml)) ankkurit.push(`${nimi}: ${href}`);
    }
  }
  const uniq = (a) => [...new Set(a)];
  if (rikki.length) fail('linkit', `${uniq(rikki).length} rikkinäistä linkkiä`, uniq(rikki).slice(0, 6).join(' · '));
  else ok('linkit', `${linkkeja} sisäistä linkkiä ${SIVUT.length} sivulla, kaikki vastaavat (${sivut.size} eri sivua)`);
  if (ankkurit.length) warn('linkit', `${uniq(ankkurit).length} ankkuria osoittaa olemattomaan osioon`, uniq(ankkurit).slice(0, 6).join(' · '));
  const vaarat = [...numerot].filter((n) => n !== PUHELIN);
  if (vaarat.length) fail('linkit', `väärä puhelinnumero soittonapissa: ${vaarat.join(', ')}`);
  else if (numerot.size) ok('linkit', `soittonapit oikeaan numeroon (${PUHELIN})`);
});

/* ========== 11. META-MAINOKSET ==========
   Token on sivuston .env:ssä (META_CAPI_TOKEN, ads_read). Mainos voi pysähtyä
   hiljaa: hylätty arvio, maksuvirhe, tai jakelu lakkaa ilman ilmoitusta.
   Eilinen kulu = 0 vaikka mainoksia on päällä on varmin merkki siitä. */
const ME = 'act_205952163658187';
const ME_IG = '17841437143913657';   // @tiiviskoti — ilman tätä IG näyttää flowin
await check('meta-ads', 'mainostili', async () => {
  const siteEnv = {};
  for (const raw of fs.readFileSync(path.join(ROOT, 'tiiviskoti', '.env'), 'utf8').split('\n')) {
    const m = raw.replace(/\r$/, '').match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) siteEnv[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const T = siteEnv.META_CAPI_TOKEN;
  if (!T) return warn('meta-ads', 'META_CAPI_TOKEN puuttuu tiiviskoti/.env:sta — Meta-mainoksia ei tarkistettu');
  const g = async (p, q = {}) => {
    const u = new URL(`https://graph.facebook.com/v23.0/${p}`);
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    u.searchParams.set('access_token', T);
    const j = await (await fetch(u)).json();
    if (j.error) throw new Error(j.error.message);
    return j;
  };

  const acc = await g(ME, { fields: 'account_status,disable_reason' });
  /* 1 = ACTIVE; 2 = disabled, 3 = unsettled (maksu), 7/9 = arvioinnissa/grace. */
  if (acc.account_status !== 1) return fail('meta-ads', `mainostili EI aktiivinen (status ${acc.account_status}, syy ${acc.disable_reason}) — tarkista maksutapa`);
  ok('meta-ads', 'mainostili aktiivinen');

  const sets = (await g(`${ME}/adsets`, { fields: 'name,effective_status,daily_budget', limit: '50' })).data
    .filter((s) => s.effective_status === 'ACTIVE');
  if (!sets.length) return fail('meta-ads', 'yksikään mainosjoukko ei ole päällä — Meta ei näytä mitään');
  for (const s of sets) ok('meta-ads', `${s.name}: ${Number(s.daily_budget) / 100} €/vrk`);

  const ads = (await g(`${ME}/ads`, {
    fields: 'name,effective_status,created_time,adset_id,creative{instagram_user_id,object_story_spec}', limit: '100',
    effective_status: ['ACTIVE', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES', 'DISAPPROVED', 'PENDING_BILLING_INFO'],
  })).data;
  const huonot = ads.filter((a) => ['DISAPPROVED', 'WITH_ISSUES', 'PENDING_BILLING_INFO'].includes(a.effective_status));
  for (const a of huonot) fail('meta-ads', `${a.name}: ${a.effective_status}`);
  /* Arvio kestää yleensä minuutteja–tunteja; yli vuorokausi on jumissa. */
  for (const a of ads.filter((x) => ['PENDING_REVIEW', 'IN_PROCESS'].includes(x.effective_status))) {
    const h = (Date.now() - new Date(a.created_time)) / 3600000;
    if (h > 24) warn('meta-ads', `${a.name} ollut arvioinnissa ${Math.round(h)} h`);
  }
  for (const a of ads) {
    const ig = a.creative?.instagram_user_id || a.creative?.object_story_spec?.instagram_user_id;
    if (ig !== ME_IG) fail('meta-ads', `${a.name}: Instagram-identiteetti väärä (${ig ?? 'puuttuu'}) — näkyy flowina`);
  }
  const aktiiviset = ads.filter((a) => a.effective_status === 'ACTIVE');
  if (!aktiiviset.length) fail('meta-ads', 'ei yhtään aktiivista mainosta');
  else {
    /* Raja on mainosjoukkoa kohden: budjetti jaetaan joukon sisällä. */
    const perJoukko = {};
    for (const a of aktiiviset) (perJoukko[a.adset_id] ??= []).push(a.name.split(' - ')[0]);
    const liikaa = Object.values(perJoukko).filter((l) => l.length > 4);
    if (liikaa.length) warn('meta-ads', `yli 4 mainosta samassa mainosjoukossa — budjetti hajoaa ohueksi`, liikaa.map((l) => l.join(', ')).join(' · '));
    else ok('meta-ads', `${aktiiviset.length} mainosta päällä: ${Object.values(perJoukko).map((l) => l.join(', ')).join(' | ')}`);
  }

  const lead = (a) => +((a || []).find((x) => x.action_type === 'lead')?.value || 0);
  const [eilen] = (await g(`${ME}/insights`, { date_preset: 'yesterday', fields: 'spend,inline_link_clicks,actions' })).data;
  const kulu = +(eilen?.spend || 0);
  if (aktiiviset.length && kulu === 0) fail('meta-ads', 'eilen 0 € kulua vaikka mainoksia on päällä — jakelu pysähtynyt');
  else ok('meta-ads', `eilen ${kulu.toFixed(2)} €, ${eilen?.inline_link_clicks || 0} klikkiä, ${lead(eilen?.actions)} liidiä`);

  const [vko] = (await g(`${ME}/insights`, { date_preset: 'last_7d', fields: 'spend,actions' })).data;
  const l7 = lead(vko?.actions), k7 = +(vko?.spend || 0);
  /* Nollaraja ~78 €/liidi (ks. muisti); 45 € on aikaisen varoituksen raja. */
  if (k7 > 60 && l7 === 0) fail('meta-ads', `7 vrk: ${k7.toFixed(0)} € → 0 liidiä`);
  else if (l7 && k7 / l7 > 45) warn('meta-ads', `7 vrk liidin hinta ${(k7 / l7).toFixed(0)} € (${k7.toFixed(0)} € / ${l7})`);
  else ok('meta-ads', `7 vrk: ${k7.toFixed(0)} € → ${l7} liidiä${l7 ? ` (${(k7 / l7).toFixed(0)} €/liidi)` : ''}`);

  /* Liidikuivuus: kuinka paljon on kulunut viimeisen CRM:ään tulleen
     Meta-liidin jälkeen. ~35 €/liidi tasolla 0 liidiä 70 €:lla on ~14 %
     todennäköisyys pelkkää sattumaa, 105 €:lla ~5 % → silloin jokin on vialla. */
  const [vika] = await sql`select max(created_at) t from tk.leads where campaign = 'meta-liidilomake'`;
  if (vika?.t) {
    /* Seuraavasta päivästä alkaen: liidipäivän kulu syntyi osin ENNEN liidiä
       ja paisutti summaa (13.→15.10. näytti 100 € kun todellinen oli ~55 €). */
    /* Suomen päivät (Metan tili on Helsingin ajassa). Jos liidi tuli tänään,
       "seuraava päivä" on huomenna eikä kulua ole vielä — Meta hylkäisi
       since > until -välin, joten silloin ei kysytä lainkaan. */
    const fiDay = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' }).format(d);
    const since = fiDay(new Date(new Date(vika.t).getTime() + 86400000));
    const until = fiDay(new Date());
    const s = since > until ? null
      : (await g(`${ME}/insights`, { time_range: { since, until }, fields: 'spend' })).data[0];
    const h = Math.round((Date.now() - new Date(vika.t)) / 3600000);
    const k = +(s?.spend || 0);
    const msg = `viimeisin Meta-liidi ${h} h sitten, seuraavasta päivästä alkaen kulunut ${k.toFixed(0)} €`;
    if (k > 105) fail('meta-ads', msg + ' — liidejä ei tule, tarkista lomake ja mainokset');
    else if (k > 70) warn('meta-ads', msg);
    else ok('meta-ads', msg);
  }
});

/* ========== 12. GOOGLE ADS ==========
   Kampanja voi pysähtyä hiljaa (maksu, hylätty mainos, budjetti). Eilinen
   kulu ja mainosten hyväksyntä kertovat sen. */
await check('google-ads', 'kampanja', async () => {
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN || !env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN) return warn('google-ads', 'tunnukset puuttuvat');
  const tok = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  })).json();
  if (!tok.access_token) return fail('google-ads', 'Ads-tunnus ei uusiutunut — raportointi ja konversioiden vienti poikki');
  const q = async (query) => {
    const r = await fetch(`https://googleads.googleapis.com/v25/customers/${env.GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream`, {
      method: 'POST', body: JSON.stringify({ query }),
      headers: { authorization: `Bearer ${tok.access_token}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'content-type': 'application/json' },
    });
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 160));
    return j.flatMap((b) => b.results ?? []);
  };

  const kamp = await q(`SELECT campaign.name, campaign.status, campaign.primary_status, campaign_budget.amount_micros
    FROM campaign WHERE campaign.status = 'ENABLED'`);
  if (!kamp.length) return fail('google-ads', 'yksikään kampanja ei ole päällä');
  for (const c of kamp) {
    const ps = c.campaign.primaryStatus;
    /* LIMITED (esim. tarjousstrategian oppiminen) on normaali; NOT_ELIGIBLE/PAUSED ei. */
    const msg = `${c.campaign.name}: ${ps}, ${(c.campaignBudget.amountMicros / 1e6).toFixed(0)} €/vrk`;
    if (['NOT_ELIGIBLE', 'PAUSED', 'REMOVED', 'ENDED'].includes(ps)) fail('google-ads', msg);
    else ok('google-ads', msg);
  }

  const [e] = await q(`SELECT metrics.cost_micros, metrics.clicks, metrics.conversions FROM customer WHERE segments.date DURING YESTERDAY`);
  const kulu = (e?.metrics?.costMicros ?? 0) / 1e6;
  if (kulu === 0) fail('google-ads', 'eilen 0 € kulua — mainokset eivät näy (maksu? hylkäys?)');
  else ok('google-ads', `eilen ${kulu.toFixed(2)} €, ${e.metrics.clicks ?? 0} klikkiä, ${(+(e.metrics.conversions ?? 0)).toFixed(1)} konv.`);

  const hylatyt = await q(`SELECT ad_group.name, ad_group_ad.ad.id, ad_group_ad.policy_summary.approval_status
    FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED'
      AND ad_group_ad.policy_summary.approval_status IN ('DISAPPROVED', 'AREA_OF_INTEREST_ONLY')`);
  if (hylatyt.length) fail('google-ads', `${hylatyt.length} mainosta hylätty/rajoitettu`, hylatyt.map((h) => `${h.adGroup.name} ${h.adGroupAd.ad.id}`).join(' · '));
  else ok('google-ads', 'kaikki päällä olevat mainokset hyväksytty');

  /* Offline-konversioiden vienti: virhe tarkoittaa ettei Google opi myynneistä. */
  const virheet = await sql`select count(*)::int n from tk.jobs where ads_upload_error is not null and updated_at > now() - interval '7 days'`;
  if (virheet[0].n) warn('google-ads', `${virheet[0].n} työn konversion vienti Adsiin epäonnistui 7 vrk:ssa (tk.jobs.ads_upload_error)`);
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
