#!/usr/bin/env node
/* CTA-arvo on BOOK_TRAVEL eikä BOOK_NOW, vaikka jälkimmäinen näyttää
   oikealta nimeltä. Meta HYVÄKSYY BOOK_NOWin rajapinnassa mutta ei renderöi
   sitä linkkimainoksessa: painikkeeksi tulee "Lue lisää". Ads Managerin
   valikon "Varaa nyt" kirjoittaa nimenomaan BOOK_TRAVELin — se on tämän
   painikkeen oikea tunnus.

   Todettu 24.8.2026: 11 skriptillä julkaistua mainosta näytti "Lue lisää",
   kun taas Ads Managerissa tehdyt ABT-mainokset näyttivät "Varaa nyt".
   Ainoa ero oli tämä arvo. ÄLÄ vaihda takaisin BOOK_NOWiin. */

/* Pinnaa @tiiviskoti-Instagramin KAIKKIIN uusiin mainoksiin (oli defaultannut Flowihin).
 * Creativea ei voi muokata → luodaan uusi creative IG-identiteetillä ja päivitetään ad. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const TOKEN = env.match(/^META_CAPI_TOKEN=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const V = 'v21.0';
const ACT = 'act_205952163658187';
const PAGE = '556560117546812';
const IG = '17841437143913657';   // @tiiviskoti
const g = (p) => `https://graph.facebook.com/${V}/${p}`;
const BOOK = 'https://tiiviskoti.fi/varaa.html';
const TALO = 'https://tiiviskoti.fi/taloyhtio.html';

const ADS = [
  { ad: '120247811466530132', file: 'mainos-veto.png', link: BOOK, cta: 'BOOK_TRAVEL', name: 'Kiinteä hinta · lämpökamera sisältyy',
    msg: 'Vetääkö ulko-ovista tai ikkunoista? 🥶 Usein pieni tiivistys — ei kallis remontti — säästää eniten lämmityksessä. Kiinteä hinta heti, lämpökamerakuvaus sisältyy, oma porukka ilman alihankintaa. Koko Uusimaa.\n\n👉 Varaa aika: tiiviskoti.fi' },
  { ad: '120247811467730132', file: 'mainos-hinta.png', link: BOOK, cta: 'BOOK_TRAVEL', name: 'Ikkuna alk. 65 € · ulko-ovi 99 €',
    msg: 'Ovien ja ikkunoiden tiivistys kiinteään hintaan — ei arviolaskuria, näet summan heti. Ikkuna alk. 65 €, ulko-ovi 99 €, pienin käynti 149 € (sis. lämpökamerakuvauksen). Kotitalousvähennys −40 %.\n\n👉 Katso hinnat: tiiviskoti.fi' },
  { ad: '120247811469080132', file: 'mainos-asentaja.png', link: BOOK, cta: 'BOOK_TRAVEL', name: 'Ammattiasennus samana päivänä',
    msg: 'Ammattiasennus samana päivänä. Ovien ja ikkunoiden tiivisteiden vaihto, oven käynnin säätö ja lämpökamerakuvaus — kiinteään hintaan, ei arvioita. Oma porukka, koko Uusimaa.\n\n👉 Varaa aika: tiiviskoti.fi' },
  { ad: '120247811471300132', file: 'mainos-lupaus.png', link: BOOK, cta: 'BOOK_TRAVEL', name: 'Veto pois ovista ja ikkunoista',
    msg: 'Veto pois — tai tulemme uudestaan veloituksetta. Ovien ja ikkunoiden tiivistys kiinteään hintaan ilman yllätyksiä. Koko Uusimaa.\n\n👉 Varaa aika: tiiviskoti.fi' },
  { ad: '120247811664080132', file: 'mainos-syksy.png', link: BOOK, cta: 'BOOK_TRAVEL', name: 'Tiivistä ennen pakkasia · alk. 65 €',
    msg: 'Tiivistä ovet ja ikkunat ennen pakkasia. 🍂 Vetävät ovet ja ikkunat tulevat talvella kalliiksi — kiinteä hinta, lämpökamerakuvaus sisältyy, ammattiasennus samana päivänä. Ikkuna alk. 65 €, kotitalousvähennys −40 %.\n\n👉 Varaa aika: tiiviskoti.fi' },
  { ad: '120247811534650132', file: 'mainos-taloyhtio.png', link: TALO, cta: 'GET_QUOTE', name: 'Taloyhtiön ovet & ikkunat kuntoon',
    msg: 'Taloyhtiön ovet ja ikkunat kuntoon — vähemmän vetoa ja lämpöhukkaa koko kiinteistössä. Kiinteä tarjous, yksi yhteyshenkilö, oma porukka ilman alihankintaa.\n\n👉 Pyydä tarjous: tiiviskoti.fi' },
  { ad: '120247811660960132', file: 'mainos-taloyhtio-saasto.png', link: TALO, cta: 'GET_QUOTE', name: 'Pienempi lämpölasku taloyhtiölle',
    msg: 'Taloyhtiön lämpölasku kuriin. Vetävät ovet ja ikkunat nostavat lämmityskuluja — tiivistys pienentää hukkaa koko kiinteistössä. Kiinteä tarjous, oma porukka ilman alihankintaa.\n\n👉 Pyydä tarjous: tiiviskoti.fi' },
  { ad: '120247811662790132', file: 'mainos-taloyhtio-helppo.png', link: TALO, cta: 'GET_QUOTE', name: 'Yksi yhteyshenkilö, ei remonttia',
    msg: 'Taloyhtiön ovet ja ikkunat kuntoon ilman remonttia. Yksi yhteyshenkilö, kiinteä tarjous, siisti jälki ja oma porukka ilman alihankintaa — tiivistys sovittuna päivänä.\n\n👉 Pyydä tarjous: tiiviskoti.fi' },
];

async function post(url, params) {
  const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ ...params, access_token: TOKEN }) });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code})`);
  return j;
}
async function uploadImage(file) {
  const fd = new FormData();
  fd.append('access_token', TOKEN);
  fd.append('filename', new Blob([fs.readFileSync(path.join(__dirname, 'out', file))]), file);
  const j = await (await fetch(g(`${ACT}/adimages`), { method: 'POST', body: fd })).json();
  if (j.error) throw new Error(j.error.message);
  return j.images[file].hash;
}
async function makeCreative(a, hash) {
  const oss = { page_id: PAGE, instagram_user_id: IG, link_data: { image_hash: hash, link: a.link, message: a.msg, name: a.name, call_to_action: { type: a.cta, value: { link: a.link } } } };
  const base = { name: a.name + ' — creative IG', object_story_spec: JSON.stringify(oss) };
  try { return await post(g(`${ACT}/adcreatives`), base); }
  catch (e) {
    // fallback: vanha instagram_actor_id-kenttä creativen tasolla
    const oss2 = { page_id: PAGE, link_data: oss.link_data };
    return await post(g(`${ACT}/adcreatives`), { ...base, object_story_spec: JSON.stringify(oss2), instagram_actor_id: IG });
  }
}

for (const a of ADS) {
  try {
    const hash = await uploadImage(a.file);
    const cr = await makeCreative(a, hash);
    await post(g(a.ad), { creative: JSON.stringify({ creative_id: cr.id }) });
    console.log(`✓ ${a.file.padEnd(30)} ad ${a.ad} → creative ${cr.id} (@tiiviskoti)`);
  } catch (e) {
    console.log(`✗ ${a.file}  FAILED: ${e.message}`);
  }
}
console.log('Done.');
