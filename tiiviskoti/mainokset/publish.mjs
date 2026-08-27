#!/usr/bin/env node
/* CTA-arvo on BOOK_TRAVEL eikä BOOK_NOW, vaikka jälkimmäinen näyttää
   oikealta nimeltä. Meta HYVÄKSYY BOOK_NOWin rajapinnassa mutta ei renderöi
   sitä linkkimainoksessa: painikkeeksi tulee "Lue lisää". Ads Managerin
   valikon "Varaa nyt" kirjoittaa nimenomaan BOOK_TRAVELin — se on tämän
   painikkeen oikea tunnus.

   Todettu 24.8.2026: 11 skriptillä julkaistua mainosta näytti "Lue lisää",
   kun taas Ads Managerissa tehdyt ABT-mainokset näyttivät "Varaa nyt".
   Ainoa ero oli tämä arvo. ÄLÄ vaihda takaisin BOOK_NOWiin. */

/* Julkaisee 5 uutta TiivisKoti-mainosta Metaan (Marketing API) ja pausettaa vanhat.
 * Käyttää META_CAPI_TOKENia (sillä on ads_management). Aja: node mainokset/publish.mjs */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const TOKEN = env.match(/^META_CAPI_TOKEN=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const V = 'v21.0';
const ACT = 'act_205952163658187';
const PAGE = '556560117546812';
const ADSET = '120247794086480132';
const g = (p) => `https://graph.facebook.com/${V}/${p}`;

/* URL-parametrit jotka Meta liittää jokaiseen klikkiin. ILMAN NÄITÄ kaikki
   Meta-liikenne kirjautuu sivustolla yhtenä `meta-ads`-kasana eikä
   mainoskohtaisesti — sivusto osaa kyllä tunnistaa fbclidistä että kävijä
   tuli Metasta, mutta ei mistä mainoksesta.

   {{campaign.name}} ja {{ad.name}} ovat Metan omia paikanvaraajia, jotka se
   korvaa klikkihetkellä. Sivusto siivoaa nimen muotoon jonka kanta hyväksyy
   ("Taloyhtiö | Uusimaa" → taloyhti-uusimaa), joten välilyönnit ja isot
   kirjaimet nimissä eivät haittaa.

   HUOM: url_tags on osa creativea, eikä olemassa olevan mainoksen creativea
   voi muokata — Ads Managerissa tehty muutos luo uuden creativen ja nollaa
   mainoksen oppimisvaiheen. Siksi tämä lisätään uusiin mainoksiin täällä
   eikä käydä koskemassa käynnissä oleviin. */
const URL_TAGS = 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}';

const BOOK = 'https://tiiviskoti.fi/varaa.html';
const TALO = 'https://tiiviskoti.fi/taloyhtio.html';

const ADS = [
  { file: 'mainos-veto.png', adName: 'TK25 - Veto (kipukärki)', headline: 'Kiinteä hinta · lämpökamera sisältyy', link: BOOK, cta: 'BOOK_TRAVEL',
    message: 'Vetääkö ulko-ovista tai ikkunoista? 🥶 Usein pieni tiivistys — ei kallis remontti — säästää eniten lämmityksessä. Kiinteä hinta heti, lämpökamerakuvaus sisältyy, oma porukka ilman alihankintaa. Koko Uusimaa.\n\n👉 Varaa aika: tiiviskoti.fi' },
  { file: 'mainos-hinta.png', adName: 'TK25 - Hinta (kiinteä)', headline: 'Ikkuna alk. 65 € · ulko-ovi 99 €', link: BOOK, cta: 'BOOK_TRAVEL',
    message: 'Ovien ja ikkunoiden tiivistys kiinteään hintaan — ei arviolaskuria, näet summan heti. Ikkuna alk. 65 €, ulko-ovi 99 €, pienin käynti 149 € (sis. lämpökamerakuvauksen). Kotitalousvähennys −40 %.\n\n👉 Katso hinnat: tiiviskoti.fi' },
  { file: 'mainos-asentaja.png', adName: 'TK25 - Asentaja (luottamus)', headline: 'Ammattiasennus samana päivänä', link: BOOK, cta: 'BOOK_TRAVEL',
    message: 'Ammattiasennus samana päivänä. Ovien ja ikkunoiden tiivisteiden vaihto, oven käynnin säätö ja lämpökamerakuvaus — kiinteään hintaan, ei arvioita. Oma porukka, koko Uusimaa.\n\n👉 Varaa aika: tiiviskoti.fi' },
  { file: 'mainos-taloyhtio.png', adName: 'TK25 - Taloyhtiö', headline: 'Taloyhtiön ovet & ikkunat kuntoon', link: TALO, cta: 'GET_QUOTE',
    message: 'Taloyhtiön ovet ja ikkunat kuntoon — vähemmän vetoa ja lämpöhukkaa koko kiinteistössä. Kiinteä tarjous, yksi yhteyshenkilö, oma porukka ilman alihankintaa.\n\n👉 Pyydä tarjous: tiiviskoti.fi' },
  { file: 'mainos-lupaus.png', adName: 'TK25 - Lupaus', headline: 'Veto pois ovista ja ikkunoista', link: BOOK, cta: 'BOOK_TRAVEL',
    message: 'Veto pois — tai tulemme uudestaan veloituksetta. Ovien ja ikkunoiden tiivistys kiinteään hintaan ilman yllätyksiä. Koko Uusimaa.\n\n👉 Varaa aika: tiiviskoti.fi' },
];

const OLD_ACTIVE = [
  ['Kuva Kynnys', '120247801919110132'],
  ['Kuva Mittaus', '120247801920080132'],
  ['Kuva Tiiviste', '120247801919590132'],
  ['Syksy', '120247794095810132'],
  ['Veto edut', '120247794094770132'],
];

async function post(url, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(url, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code}${j.error.error_subcode ? '/' + j.error.error_subcode : ''})`);
  return j;
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('access_token', TOKEN);
  fd.append('filename', new Blob([fs.readFileSync(path.join(__dirname, 'out', file))]), file);
  const r = await fetch(g(`${ACT}/adimages`), { method: 'POST', body: fd });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.images[file].hash;
}

const results = [];
for (const a of ADS) {
  try {
    const hash = await uploadImage(a.file);
    const oss = { page_id: PAGE, instagram_user_id: '17841437143913657', link_data: { image_hash: hash, link: a.link, message: a.message, name: a.headline, call_to_action: { type: a.cta, value: { link: a.link } } } };
    const cr = await post(g(`${ACT}/adcreatives`), { name: a.adName + ' — creative', object_story_spec: JSON.stringify(oss), url_tags: URL_TAGS });
    const ad = await post(g(`${ACT}/ads`), { name: a.adName, adset_id: ADSET, creative: JSON.stringify({ creative_id: cr.id }), status: 'ACTIVE' });
    results.push(`✓ ${a.adName}  → ad ${ad.id} (creative ${cr.id})`);
  } catch (e) {
    results.push(`✗ ${a.adName}  FAILED: ${e.message}`);
  }
}

console.log('\n=== NEW ADS (created ACTIVE, enter Meta review) ===');
results.forEach((r) => console.log(r));

console.log('\n=== PAUSING OLD ADS ===');
for (const [name, id] of OLD_ACTIVE) {
  try { await post(g(id), { status: 'PAUSED' }); console.log(`✓ paused: ${name} (${id})`); }
  catch (e) { console.log(`✗ pause failed: ${name} — ${e.message}`); }
}
console.log('\nDone.');
