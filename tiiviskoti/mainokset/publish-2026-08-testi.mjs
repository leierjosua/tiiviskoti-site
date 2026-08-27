#!/usr/bin/env node
/* Julkaisee 25.8.2026 tehdyn mainoserän Metaan ja järjestää tilin testiä varten.
 *
 * Aja: node tiiviskoti/mainokset/publish-2026-08-testi.mjs [--live]
 * Ilman --live tulostaa vain mitä tekisi.
 *
 * RATKAISUT JOTKA ON TEHTY TIETOISESTI:
 *
 * 1. UUDET MAINOKSET MENEVÄT OLEMASSA OLEVIIN AD SETTEIHIN. Josua pyysi että
 *    kaikki Shorts-videot jäävät pyörimään ja Reelsin 20 € säilyy. Uusi ad set
 *    tarkoittaisi vanhojen mainosten luomista uusiksi, jolloin ne menettäisivät
 *    historiansa ja sosiaalisen todisteensa (tykkäykset, kommentit).
 *
 * 2. TAVOITETTA (optimization_goal) EI MUUTETA. Molemmat kuluttaja-ad setit
 *    optimoivat PURCHASE-konversiota, mikä ei toimi 1–2 varauksella viikossa
 *    (Meta haluaa ~50). Oikea korjaus olisi LANDING_PAGE_VIEWS, mutta se ei
 *    ole sallittu OUTCOME_SALES-kampanjassa — se vaatisi ad settien siirron
 *    Traffic-kampanjaan eli käytännössä uudelleenluonnin. Se rikkoisi kohdan 1.
 *    Jätetään Josuan päätettäväksi erikseen.
 *
 * 3. SIJOITTELUT LUKITAAN. Kuluttaja-ad seteillä ei ollut sijoitteluja
 *    lainkaan (Advantage+ = kaikki), joten 9:16-videot rajautuivat syötteeseen
 *    ja 4:5-kuvat venyivät Reelsiin. Palvelurivi on videoissa 250 px:n
 *    kohdalla ja se on juuri se rivi joka kertoo mitä myydään — rajautuminen
 *    veisi sen. Videot → Reels + Stories, kuvat → syöte.
 *
 * 4. CTA on BOOK_TRAVEL eikä BOOK_NOW. Meta hyväksyy BOOK_NOWin mutta
 *    renderöi sen muotoon "Lue lisää". Ks. publish-2026-08.mjs.
 *
 * 5. url_tags mukaan JOKAISEEN creativeen, muuten mainostason attribuutio
 *    katoaa. Mainosten nimissä on ääkkösiä tarkoituksella: sivuston
 *    kampanjatunnistus korjattiin 25.8. purkamaan Metan kaksoiskoodaus.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const TOKEN = env.match(/^META_CAPI_TOKEN=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const LIVE = process.argv.includes('--live');

const V = 'v21.0';
const ACT = 'act_205952163658187';
const PAGE = '556560117546812';
const IG = '17841437143913657';
const PIXEL = '1102837850103694';
const CAMP_SALES = '120247788747000132';
const g = (p) => `https://graph.facebook.com/${V}/${p}`;

const AS_SHORTS = '120247886647400132';   // TK26 - Shorts-videot, 20 €
const AS_KUVAT  = '120247886647840132';   // TK26 - Kuvamainokset, 10 €
const AS_TALO   = '120247886648110132';   // TK26 - Taloyhtiö kuvat, 5 €
const AS_ABT    = ['120247865210840132', '120247865210090132'];
/* Jos yleisö on jo luotu, anna sen id tässä — luonti ei ole idempotentti. */
const AUD_ID = process.env.TK_AUD_ID || '';

const URL_TAGS = 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}';
const BOOK = 'https://tiiviskoti.fi/varaa.html';
const TALO = 'https://tiiviskoti.fi/taloyhtio.html';
const HL = 'Ovien ja ikkunoiden tiivistys';

/* Videot ovat mainokset/video/… eivät sisarhakemistossa. */
const VID = (f) => path.join('video', 'remotion', 'out', `${f}-valmis.mp4`);

/* ---- Reelsiin, kylmä yleisö (nykyiseen Shorts-ad settiin) ---- */
const REELS = [
  { file: 'kortti-veto', adName: 'TK27 - Kortti veto', headline: HL,
    description: 'Lämpökamerakuvaus sisältyy joka käyntiin.',
    message: 'Vetääkö kotona? Lämpökamera näyttää mistä kohdista lämpö karkaa, ja tiivisteet vaihdetaan samalla käynnillä. Ikkuna 95 €, ulko-ovi 99 €.\n\n👉 tiiviskoti.fi' },
  { file: 'kortti-hinta', adName: 'TK27 - Kortti hinta', headline: HL,
    description: 'Kiinteä hinta ennen varausta.',
    message: 'Näet hinnan ennen kuin varaat — ei arviolaskuria eikä tarjouspyyntöä. Valitset ovet ja ikkunat, summa päivittyy heti.\n\n👉 tiiviskoti.fi' },
  { file: 'kortti-saasto', adName: 'TK27 - Kortti käynti', headline: HL,
    description: 'Ovet ja ikkunat samalla käynnillä.',
    message: 'Veto loppuu yhdellä käynnillä: lämpökamerakuvaus, tiivisteiden vaihto ja oven käynnin säätö. Jäljet siivotaan lähtiessä.\n\n👉 tiiviskoti.fi' },
  { file: 'kortti-koti', adName: 'TK27 - Kortti varaus', headline: HL,
    description: 'Varaus verkossa alle minuutissa.',
    message: 'Neljä vaihetta: postinumero, ovet ja ikkunat, vapaa aika kalenterista, yhteystiedot. Ei soittokierrosta.\n\n👉 tiiviskoti.fi' },
  { file: 'kortti-lampotila', adName: 'TK27 - Lämpötila', headline: HL,
    description: 'Pidä lämpö sisällä.',
    message: 'Pakkasta ulkona, lämmin sisällä — tiiviste on se raja niiden välissä. Kun se on kulunut, lämpö karkaa. Ikkuna 95 €, ulko-ovi 99 €.\n\n👉 tiiviskoti.fi' },
  { file: 'kortti-saasto-arvio', adName: 'TK27 - Säästöarvio', headline: HL,
    description: 'Lämpökamera näyttää vuotokohdat.',
    message: 'Vetävä ovi ja ikkuna nostavat lämmityskulua tyypillisesti 10–15 %. Emme lupaa tiettyä säästöä — lopputulos riippuu talosta ja vuotokohdista, ja lämpökamera näyttää ne.\n\n👉 tiiviskoti.fi' },
];

/* ---- Syötteeseen, kylmä yleisö ---- */
const SYOTE = [
  { file: 'mainos-niukka-lampo.png', adName: 'TK27 - Niukka lämpö', headline: HL,
    description: 'Kiinteä hinta, lämpökamera sisältyy.',
    message: 'Pidä lämpö sisällä tänä talvena. Ovien ja ikkunoiden tiivistys kiinteään hintaan, koko Uusimaa.\n\n👉 tiiviskoti.fi' },
  { file: 'mainos-niukka-veto.png', adName: 'TK27 - Niukka veto', headline: HL,
    description: 'Ulko-ovi 99 €, ikkuna 95 €.',
    message: 'Vetävä ovi tuntuu joka päivä. Tiivisteiden vaihto kestää tunnin eikä vaadi remonttia.\n\n👉 tiiviskoti.fi' },
  { file: 'mainos-niukka-hinta.png', adName: 'TK27 - Niukka hinta', headline: HL,
    description: 'Ei arviolaskuria eikä tarjouspyyntöä.',
    message: 'Hinta ennen varausta. Valitset ovet ja ikkunat, näet kiinteän summan heti ja varaat ajan samalla.\n\n👉 tiiviskoti.fi' },
  { file: 'mainos-niukka-syksy.png', adName: 'TK27 - Niukka syksy', headline: HL,
    description: 'Vapaita aikoja koko Uudellamaalla.',
    message: 'Ennen ensimmäisiä pakkasia. Tiivisteet kannattaa vaihtaa kun ulkona on vielä lämmintä.\n\n👉 tiiviskoti.fi' },
  { file: 'mainos-t1-rako.png', adName: 'TK27 - Rako', headline: HL,
    description: 'Ikkuna 95 €, ulko-ovi 99 €.',
    message: 'Talvi tulee tästä raosta. Karmin ja puitteen väliin jäänyt rako on se kohta josta vetää.\n\n👉 tiiviskoti.fi' },
  { file: 'mainos-t2-lampo.png', adName: 'TK27 - Lämmityskulu', headline: HL,
    description: 'Lämpökamerakuvaus sisältyy.',
    message: 'Vetävä ikkuna maksaa joka kuu. Emme lupaa tiettyä säästöä — lämpökamera näyttää mistä juuri sinun kodissasi vuotaa.\n\n👉 tiiviskoti.fi' },
];

/* ---- Uudelleenmarkkinointi (uusi ad set) ---- */
const UUDELLEEN = [
  { file: 'mainos-b1-varaa.png', adName: 'TK27 - Uudelleen varaus', headline: HL,
    description: 'Varaus verkossa alle minuutissa.',
    message: 'Kävit jo sivullamme — varaus hoituu loppuun asti verkossa, ei tarjouspyyntöä eikä soittokierrosta.\n\n👉 tiiviskoti.fi' },
  { file: 'mainos-b2-syksy.png', adName: 'TK27 - Uudelleen syksy', headline: HL,
    description: 'Kotitalousvähennys −40 % työn osuudesta.',
    message: 'Ennen ensimmäisiä pakkasia. Pienin käynti 149 €, ja kotitalousvähennys pienentää työn osuutta.\n\n👉 tiiviskoti.fi' },
];

/* ---- Taloyhtiö ---- */
const TALOT = [
  { file: 'kortti-taloyhtio', adName: 'TK27 - Taloyhtiö asukas', headline: 'Taloyhtiön ovet ja ikkunat tiiviiksi',
    description: 'Maksuton kartoituskäynti.',
    message: 'Asutko taloyhtiössä? Kartoituskäynti on veloitukseton ja sen voi varata verkosta. Yksi yhteyshenkilö, kiinteä tarjous.\n\n👉 tiiviskoti.fi/taloyhtio.html' },
  { file: 'kortti-taloyhtio-kartoitus', adName: 'TK27 - Taloyhtiö hallitus', headline: 'Taloyhtiön ovet ja ikkunat tiiviiksi',
    description: 'Kartoituksesta asennukseen.',
    message: 'Taloyhtiön hallitukselle: kartoitus veloituksetta, kiinteä hinta kirjallisena ennen työn aloitusta, asennus sovittuna päivänä.\n\n👉 tiiviskoti.fi/taloyhtio.html' },
];

/* ---------------- apurit ---------------- */
async function post(url, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(url, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code}${j.error.error_subcode ? '/' + j.error.error_subcode : ''})`);
  return j;
}
const get = async (url) => (await fetch(url)).json();

let _vidCache = null, _imgCache = null;
async function existingVideos() {
  if (_vidCache) return _vidCache;
  const j = await get(g(`${ACT}/advideos?fields=id,title,status&limit=200&access_token=${TOKEN}`));
  _vidCache = new Map();
  for (const v of j.data || []) if (v.status?.video_status === 'ready' && v.title) _vidCache.set(v.title, v.id);
  return _vidCache;
}
async function existingImages() {
  if (_imgCache) return _imgCache;
  const j = await get(g(`${ACT}/adimages?fields=name,hash&limit=500&access_token=${TOKEN}`));
  _imgCache = new Map();
  for (const im of j.data || []) if (im.name) _imgCache.set(im.name, im.hash);
  return _imgCache;
}

async function uploadImage(rel) {
  const name = path.basename(rel);
  const have = await existingImages();
  if (have.has(name)) { return have.get(name); }
  const fd = new FormData();
  fd.append('access_token', TOKEN);
  fd.append('filename', new Blob([fs.readFileSync(path.join(__dirname, 'out', rel))]), name);
  const j = await (await fetch(g(`${ACT}/adimages`), { method: 'POST', body: fd })).json();
  if (j.error) throw new Error(j.error.message);
  return j.images[name].hash;
}

async function uploadVideo(rel) {
  const name = path.basename(rel);
  const have = await existingVideos();
  if (have.has(name)) { return have.get(name); }
  const fd = new FormData();
  fd.append('access_token', TOKEN);
  fd.append('source', new Blob([fs.readFileSync(path.join(__dirname, rel))]), name);
  const j = await (await fetch(g(`${ACT}/advideos`), { method: 'POST', body: fd })).json();
  if (j.error) throw new Error(j.error.message);
  for (let i = 0; i < 90; i++) {
    const s = await get(g(`${j.id}?fields=status&access_token=${TOKEN}`));
    const st = s.status?.video_status;
    if (st === 'ready') return j.id;
    if (st === 'error') throw new Error(`videon käsittely epäonnistui: ${name}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`videon käsittely ei valmistunut: ${name}`);
}

async function makeAd(a, adsetId, link, media, status = 'ACTIVE') {
  const spec = media.video_id
    ? { video_data: { video_id: media.video_id, image_hash: media.thumb_hash, title: a.headline,
        message: a.message, link_description: a.description,
        call_to_action: { type: 'BOOK_TRAVEL', value: { link } } } }
    : { link_data: { image_hash: media.image_hash, link, message: a.message,
        name: a.headline, description: a.description,
        call_to_action: { type: 'BOOK_TRAVEL', value: { link } } } };
  const cr = await post(g(`${ACT}/adcreatives`), {
    name: `${a.adName} — creative`,
    object_story_spec: JSON.stringify({ page_id: PAGE, instagram_user_id: IG, ...spec }),
    url_tags: URL_TAGS,
  });
  const ad = await post(g(`${ACT}/ads`), {
    name: a.adName, adset_id: adsetId,
    creative: JSON.stringify({ creative_id: cr.id }), status,
  });
  return ad.id;
}

const PL_REELS = { publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: ['facebook_reels', 'story'], instagram_positions: ['reels', 'story'] };
/* HUOM: instagramin 'explore' on poistettu käytöstä v21:ssä ja kaataa
   päivityksen ("IG Explore placement is deprecated for this API version").
   Käytä pelkkää 'stream'iä. */
const PL_FEED = { publisher_platforms: ['facebook', 'instagram'],
  facebook_positions: ['feed'], instagram_positions: ['stream'] };

async function setPlacements(adsetId, pl) {
  const cur = await get(g(`${adsetId}?fields=targeting&access_token=${TOKEN}`));
  const t = { ...cur.targeting, ...pl };
  return post(g(adsetId), { targeting: JSON.stringify(t) });
}

/* ---------------- kuiva-ajo ---------------- */
if (!LIVE) {
  console.log('KUIVA-AJO — lisää --live julkaistaksesi\n');
  console.log(`Reels-ad set ${AS_SHORTS} (20 €, Shorts jäävät): +${REELS.length} videota`);
  REELS.forEach((a) => console.log(`   ${a.adName}`));
  console.log(`\nSyöte-ad set ${AS_KUVAT} (10 €): +${SYOTE.length} kuvaa`);
  SYOTE.forEach((a) => console.log(`   ${a.adName}`));
  console.log(`\nUusi uudelleenmarkkinointi-ad set (5 €): ${UUDELLEEN.length} kuvaa`);
  UUDELLEEN.forEach((a) => console.log(`   ${a.adName}`));
  console.log(`\nTaloyhtiö-ad set ${AS_TALO} (5 €): +${TALOT.length} videota`);
  TALOT.forEach((a) => console.log(`   ${a.adName}`));
  console.log(`\nSijoittelut: videot → Reels + Stories, kuvat → syöte`);
  console.log(`ABT-ad setit pysäytetään: ${AS_ABT.join(', ')}`);
  console.log(`\nBudjetti yhteensä 20 + 10 + 5 + 5 = 40 €/vrk (sama kuin nyt).`);
  process.exit(0);
}

/* ---------------- ajo ---------------- */
const done = [];
try {
  console.log('1/6  Videot Metaan (koodaus kestää)…');
  for (const a of [...REELS, ...TALOT]) {
    a.video_id = await uploadVideo(VID(a.file));
    a.thumb_hash = await uploadImage(`thumbs/${a.file}.jpg`);
    console.log(`     ✓ ${a.file}`);
  }

  console.log('2/6  Kuvat Metaan…');
  for (const a of [...SYOTE, ...UUDELLEEN]) {
    a.image_hash = await uploadImage(a.file);
    console.log(`     ✓ ${a.file}`);
  }

  console.log('3/6  Sijoittelut lukkoon…');
  await setPlacements(AS_SHORTS, PL_REELS);
  await setPlacements(AS_TALO, PL_REELS);
  await setPlacements(AS_KUVAT, PL_FEED);
  console.log('     ✓ videot Reels+Stories, kuvat syöte');

  console.log('4/6  Mainokset nykyisiin ad setteihin…');
  for (const a of REELS) { const id = await makeAd(a, AS_SHORTS, BOOK, a); done.push([a.adName, id]); console.log(`     ✓ ${a.adName}`); }
  for (const a of SYOTE) { const id = await makeAd(a, AS_KUVAT, BOOK, a); done.push([a.adName, id]); console.log(`     ✓ ${a.adName}`); }
  for (const a of TALOT) { const id = await makeAd(a, AS_TALO, TALO, a); done.push([a.adName, id]); console.log(`     ✓ ${a.adName}`); }

  console.log('5/6  Uudelleenmarkkinointi: yleisö + ad set + mainokset…');
  /* HUOM: `subtype: 'WEBSITE'` EI kelpaa v21:ssä ("The parameter subtype is
     not supported in the current API version") — pelkkä `rule` määrittää
     verkkosivuyleisön. Virhekoodi oli harhaanjohtava (2654/1870053). */
  const aud = AUD_ID ? { id: AUD_ID } : await post(g(`${ACT}/customaudiences`), {
    name: 'Sivuston kävijät 30 vrk',
    description: 'tiiviskoti.fi kävijät 30 vrk, uudelleenmarkkinointiin',
    rule: JSON.stringify({ inclusions: { operator: 'or', rules: [{
      event_sources: [{ id: PIXEL, type: 'pixel' }],
      retention_seconds: 2592000,
      filter: { operator: 'and', filters: [{ field: 'url', operator: 'i_contains', value: 'tiiviskoti.fi' }] },
    }] } }),
    prefill: 'true',
  });
  console.log(`     ✓ yleisö ${aud.id}`);

  const rtTargeting = {
    age_min: 25, age_max: 65,
    geo_locations: { regions: [{ key: '4978', name: 'Uusimaa', country: 'FI' }], location_types: ['home', 'recent'] },
    custom_audiences: [{ id: aud.id }],
  };
  const rtAdset = await post(g(`${ACT}/adsets`), {
    name: 'TK27 - Uudelleenmarkkinointi', campaign_id: CAMP_SALES, status: 'ACTIVE',
    daily_budget: '500', billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    destination_type: 'WEBSITE',
    promoted_object: JSON.stringify({ pixel_id: PIXEL, custom_event_type: 'PURCHASE' }),
    targeting: JSON.stringify(rtTargeting),
  });
  console.log(`     ✓ ad set ${rtAdset.id}`);
  for (const a of UUDELLEEN) { const id = await makeAd(a, rtAdset.id, BOOK, a); done.push([a.adName, id]); console.log(`     ✓ ${a.adName}`); }

  console.log('6/6  ABT-testi pois…');
  for (const id of AS_ABT) { await post(g(id), { status: 'PAUSED' }); console.log(`     ✓ pysäytetty ${id}`); }

  console.log(`\nVALMIS. ${done.length} uutta mainosta.`);
} catch (e) {
  console.error(`\nVIRHE: ${e.message}`);
  console.error(`Ehdittiin luoda ${done.length} mainosta:`);
  done.forEach(([n, id]) => console.error(`   ${n}  ${id}`));
  process.exit(1);
}
