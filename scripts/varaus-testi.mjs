#!/usr/bin/env node
/* Varauspolun ja nappien testi oikeassa selaimessa.
 *
 * Aja: `node scripts/varaus-testi.mjs`
 *
 * EI TEE OIKEAA VARAUSTA: `/api/create-booking` katkaistaan ja pyynnön runko
 * luetaan talteen, joten näet täsmälleen mitä olisi lähtenyt eikä kantaan
 * synny mitään. Sama koskee liidejä, chattia ja kartoituspyyntöä.
 *
 * VARAUSPOLKU (todennettu 14.9.2026):
 *   laskuri (.stp.plus) -> hinta #cpPrice -> #cpBtn "Valitse aika kalenterista"
 *   -> postinumeroportti #fPostal + #gShow -> kalenteri -> aika -> #toDetails
 * A/B-testi vaihtaa VAIN sen kumpi näkyy ensin. `#fPostal` on DOM:issa aina,
 * joten versio on pääteltävä NÄKYVYYDESTÄ (`offsetParent`), ei olemassaolosta —
 * tähän kompastuin kerran jo.
 */
import { chromium } from '../node_modules/playwright/index.mjs';

/* ms-playwrightin chromium ei vastaa asennettua versiota → Chrome käsin. */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SITE = 'https://tiiviskoti.fi';
const POSTI = '00120';

const loki = [];
const ok = (m, x) => loki.push({ t: 'OK', m, x });
const warn = (m, x) => loki.push({ t: 'WARN', m, x });
const fail = (m, x) => loki.push({ t: 'FAIL', m, x });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

let bookingPayload = null;
for (const r of ['**/api/create-booking', '**/api/create-lead', '**/api/ask',
                 '**/api/create-kartoitus', '**/api/track-intent']) {
  await page.route(r, (route) => {
    if (route.request().url().includes('create-booking')) bookingPayload = route.request().postData();
    route.abort();
  });
}

const konsoli = [];
page.on('console', (m) => { if (m.type() === 'error') konsoli.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => konsoli.push('JS: ' + String(e).slice(0, 160)));
const rikki = [];
page.on('response', (r) => { if (r.status() >= 400) rikki.push(`${r.status()} ${r.url().slice(0, 110)}`); });

const nakyy = (sel) => page.evaluate((s) => {
  const e = document.querySelector(s); return e ? e.offsetParent !== null : false;
}, sel);

await page.goto(SITE + '/?cb=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

/* ---------- 1. Napit ja ankkurit ---------- */
const ankkurit = await page.evaluate(() => {
  const out = [];
  for (const a of document.querySelectorAll('a[href^="#"]')) {
    const id = a.getAttribute('href').slice(1);
    if (id && !document.getElementById(id)) out.push(`"${a.textContent.trim().slice(0, 36)}" -> #${id}`);
  }
  return out;
});
if (ankkurit.length) fail(`${ankkurit.length} ankkurilinkkiä osoittaa olemattomaan kohteeseen`, ankkurit.join(' · '));
else ok('kaikki ankkurilinkit osuvat olemassa olevaan osioon');

const napit = await page.evaluate(() =>
  [...document.querySelectorAll('a.btn, button, .cta, [role="button"]')]
    .filter((e) => e.offsetParent !== null)
    .map((e) => ({ teksti: e.textContent.trim().slice(0, 30), href: e.getAttribute('href') })));
ok(`${napit.length} näkyvää nappia etusivulla`);
const tyhjat = napit.filter((n) => n.href === '' || n.href === '#');
if (tyhjat.length) warn(`${tyhjat.length} linkkinappia ilman kohdetta`, tyhjat.map((n) => n.teksti).join(', '));

/* ---------- 2. Laskuri ---------- */
const versio = (await nakyy('#fPostal')) ? 'A (postinumero ensin)' : 'B (laskuri ensin)';
ok(`A/B-versio tällä latauksella: ${versio}`);

if (versio.startsWith('A')) {
  await page.fill('#fPostal', POSTI);
  await page.click('#gShow');
  await page.waitForTimeout(2000);
}

const plus = page.locator('.stp.plus').first();
if (!(await plus.count())) fail('laskurin plus-nappia (.stp.plus) ei löytynyt');
else {
  for (let i = 0; i < 5; i++) { await plus.click(); await page.waitForTimeout(140); }
  await page.waitForTimeout(1000);
  const hinta = Number((await page.textContent('#cpPrice').catch(() => '0')).replace(/\D/g, ''));
  /* 5 ikkunaa osuu portaaseen 5–9 = 85 €/kpl. Jos tämä muuttuu, joko hinnasto
     on muuttunut tai portaiden rajat ovat rikki — kumpikin on syytä huomata. */
  if (hinta === 425) ok(`laskuri: 5 ikkunaa = ${hinta} € (85 €/kpl, porras 5–9 oikein)`);
  else if (hinta > 0) warn(`laskuri: 5 ikkunaa = ${hinta} €, odotettiin 425 € — tarkista hinnasto`);
  else fail('laskuri ei näyttänyt hintaa');
}

/* ---------- 3. Kalenteri ---------- */
const cta = page.locator('#cpBtn');
if (await cta.count()) {
  ok(`jatkonappi: "${(await cta.textContent()).trim()}"`);
  await cta.click();
  await page.waitForTimeout(2000);
}

/* B-versiossa portti tulee vasta tässä. */
if (await nakyy('#fPostal')) {
  await page.fill('#fPostal', POSTI);
  await page.click('#gShow');
  await page.waitForTimeout(2500);
  ok(`postinumeroportti läpi (${POSTI})`);
}

const alue = await page.textContent('#areaNote').catch(() => null);
if (alue && /ei palvel|emme palvele/i.test(alue)) fail('postinumero hylättiin: ' + alue.trim().slice(0, 80));

const slotit = page.locator('.slot, [data-slot], .bk-slot, button[data-starts]');
const n = await slotit.count();
if (n === 0) {
  fail('kalenterissa EI vapaita aikoja — asiakas ei pääse varaamaan');
} else {
  ok(`kalenterissa ${n} valittavaa aikaa`);
  await slotit.first().click();
  await page.waitForTimeout(800);
  /* Ajan klikkaus EI yksin siirrä eteenpäin — erillinen nappi. */
  const eteen = page.locator('#toDetails');
  if (await eteen.count() && await eteen.isVisible()) {
    await eteen.click();
    await page.waitForTimeout(1500);
    const lomake = await page.locator('input[type="email"], #fEmail, input[name="email"]').count();
    if (lomake) ok('"Jatka yhteystietoihin" avasi yhteystietolomakkeen');
    else warn('yhteystietolomaketta ei löytynyt jatkon jälkeen');
  } else warn('#toDetails-nappia ei näkynyt ajan valinnan jälkeen');
}

/* ---------- 4. Yhteenveto ---------- */
if (bookingPayload) ok('create-booking olisi lähtenyt (katkaistu, mitään ei syntynyt)', bookingPayload.slice(0, 180));

const omat = rikki.filter((r) => /tiiviskoti\.fi/.test(r));
if (omat.length) fail(`${omat.length} omaa pyyntöä epäonnistui`, omat.slice(0, 5).join(' · '));
else ok('ei epäonnistuneita pyyntöjä omiin osoitteisiin');

/* Katkaistut rajapinnat tuottavat odotetusti verkkovirheen konsoliin. */
const oikeat = konsoli.filter((c) => !/ERR_FAILED|ERR_ABORTED|Failed to fetch|NetworkError|Load failed/i.test(c));
if (oikeat.length) fail(`${oikeat.length} konsolivirhettä`, oikeat.slice(0, 4).join(' · '));
else ok('ei konsolivirheitä (katkaisujen aiheuttamat suodatettu)');

await browser.close();

const V = { OK: '\x1b[32m', WARN: '\x1b[33m', FAIL: '\x1b[31m' }, R = '\x1b[0m';
console.log(`\nVarauspolku ja napit — ${new Date().toLocaleString('fi-FI')}\n${'─'.repeat(64)}`);
for (const l of loki) console.log(`${V[l.t]}${l.t.padEnd(4)}${R} ${l.m}` + (l.x ? `\n       ${l.x}` : ''));
const f = loki.filter((l) => l.t === 'FAIL').length;
console.log('─'.repeat(64));
console.log(`${f} FAIL · ${loki.filter((l) => l.t === 'WARN').length} WARN · ${loki.filter((l) => l.t === 'OK').length} OK`);
process.exit(f ? 1 : 0);
