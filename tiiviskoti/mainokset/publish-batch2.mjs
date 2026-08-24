#!/usr/bin/env node
/* CTA-arvo on BOOK_TRAVEL eikä BOOK_NOW, vaikka jälkimmäinen näyttää
   oikealta nimeltä. Meta HYVÄKSYY BOOK_NOWin rajapinnassa mutta ei renderöi
   sitä linkkimainoksessa: painikkeeksi tulee "Lue lisää". Ads Managerin
   valikon "Varaa nyt" kirjoittaa nimenomaan BOOK_TRAVELin — se on tämän
   painikkeen oikea tunnus.

   Todettu 24.8.2026: 11 skriptillä julkaistua mainosta näytti "Lue lisää",
   kun taas Ads Managerissa tehdyt ABT-mainokset näyttivät "Varaa nyt".
   Ainoa ero oli tämä arvo. ÄLÄ vaihda takaisin BOOK_NOWiin. */

/* Julkaisee 3 lisämainosta: 2 taloyhtiötä (Traffic-setti) + 1 syksy (Purchase-setti). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const TOKEN = env.match(/^META_CAPI_TOKEN=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const V = 'v21.0';
const ACT = 'act_205952163658187';
const PAGE = '556560117546812';
const g = (p) => `https://graph.facebook.com/${V}/${p}`;

const PURCHASE_ADSET = '120247794086480132';
const TALO_ADSET = '120247811532860132';
const BOOK = 'https://tiiviskoti.fi/varaa.html';
const TALO = 'https://tiiviskoti.fi/taloyhtio.html';

const ADS = [
  { file: 'mainos-taloyhtio-saasto.png', adset: TALO_ADSET, adName: 'TK25 - Taloyhtiö (säästö)', headline: 'Pienempi lämpölasku taloyhtiölle', link: TALO, cta: 'GET_QUOTE',
    message: 'Taloyhtiön lämpölasku kuriin. Vetävät ovet ja ikkunat nostavat lämmityskuluja — tiivistys pienentää hukkaa koko kiinteistössä. Kiinteä tarjous, vastuuvakuutettu ammattityö, asennustyön takuu.\n\n👉 Pyydä tarjous: tiiviskoti.fi' },
  { file: 'mainos-taloyhtio-helppo.png', adset: TALO_ADSET, adName: 'TK25 - Taloyhtiö (helppous)', headline: 'Yksi yhteyshenkilö, ei remonttia', link: TALO, cta: 'GET_QUOTE',
    message: 'Taloyhtiön ovet ja ikkunat kuntoon ilman remonttia. Yksi yhteyshenkilö, kiinteä tarjous, siisti jälki ja vastuuvakuutettu ammattityö — tiivistys sovittuna päivänä.\n\n👉 Pyydä tarjous: tiiviskoti.fi' },
  { file: 'mainos-syksy.png', adset: PURCHASE_ADSET, adName: 'TK25 - Syksy (ennen pakkasia)', headline: 'Tiivistä ennen pakkasia · alk. 65 €', link: BOOK, cta: 'BOOK_TRAVEL',
    message: 'Tiivistä ovet ja ikkunat ennen pakkasia. 🍂 Vetävät ovet ja ikkunat tulevat talvella kalliiksi — kiinteä hinta, lämpökamerakuvaus sisältyy, ammattiasennus samana päivänä. Ikkuna alk. 65 €, kotitalousvähennys −40 %.\n\n👉 Varaa aika: tiiviskoti.fi' },
];

async function post(url, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(url, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code})`);
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

for (const a of ADS) {
  try {
    const hash = await uploadImage(a.file);
    const oss = { page_id: PAGE, instagram_user_id: '17841437143913657', link_data: { image_hash: hash, link: a.link, message: a.message, name: a.headline, call_to_action: { type: a.cta, value: { link: a.link } } } };
    const cr = await post(g(`${ACT}/adcreatives`), { name: a.adName + ' — creative', object_story_spec: JSON.stringify(oss) });
    const ad = await post(g(`${ACT}/ads`), { name: a.adName, adset_id: a.adset, creative: JSON.stringify({ creative_id: cr.id }), status: 'ACTIVE' });
    console.log(`✓ ${a.adName}  → ad ${ad.id}  (adset ${a.adset})`);
  } catch (e) {
    console.log(`✗ ${a.adName}  FAILED: ${e.message}`);
  }
}
console.log('Done.');
