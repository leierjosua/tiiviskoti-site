#!/usr/bin/env node
/* Julkaisee 24.8.2026 uudistetun mainoskuvaston Metaan (Marketing API).
 *
 * OTSIKOT JA KUVAUKSET: jokaisessa mainoksessa lukee otsikossa JA kuvauksessa
 * että kyse on ovien ja ikkunoiden tiivistyksestä. Josua huomautti 24.8. ettei
 * se käynyt ilmi — aiemmat otsikot olivat "Ammattiasennus samana päivänä" ja
 * "Kiinteä hinta · lämpökamera sisältyy", joista lukija ei tiedä mitä myydään.
 *
 * EI TAKUUTA. Kahden vuoden takuu ei ole mainoskärki (ks. muistiinpano
 * tiiviskoti-mainoskielto-takuu). Älä lisää sitä teksteihin.
 * EI "alk. 65 €". Se hinta pätee vasta 20 ikkunasta ylöspäin → sano 95 €.
 *
 * Aja: node tiiviskoti/mainokset/publish-2026-08.mjs [--live]
 * Ilman --live tulostaa vain mitä tekisi.
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
const CAMP_SALES = '120247788747000132';   // TiivisKoti - Ostot (varaukset) - Uusimaa
const CAMP_TALO  = '120247811532430132';   // TiivisKoti - Taloyhtiöt - Uusimaa
const g = (p) => `https://graph.facebook.com/${V}/${p}`;

const URL_TAGS = 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}';
const BOOK = 'https://tiiviskoti.fi/varaa.html';
const TALO = 'https://tiiviskoti.fi/taloyhtio.html';

/* Sama kohdennus kuin nykyisellä kuluttaja-ad setillä. */
const TARGETING = {
  age_min: 25, age_max: 65,
  geo_locations: { regions: [{ key: '4978', name: 'Uusimaa', country: 'FI' }], location_types: ['home', 'recent'] },
  targeting_automation: { advantage_audience: 1 },
};

const HL_KULUTTAJA = 'Ovien ja ikkunoiden tiivistys';
const HL_TALO = 'Taloyhtiön ovet ja ikkunat tiiviiksi';

const VIDEOS = [
  { file: 'tiiviskoti-shorts-1.mp4', thumb: 'thumbs/shorts-1.jpg', adName: 'TK26 - Video ikkunakoukku',
    headline: HL_KULUTTAJA, description: 'Ikkuna 95 €, ulko-ovi 119 €. Kiinteä hinta heti.',
    message: 'Ovien ja ikkunoiden tiivistys kiinteään hintaan. 🥶 Vetikö sun ikkunat viime talvena? Vetävä ovi tai ikkuna nostaa lämmityskuluja jopa 15 %. Vaihdamme tiivisteet — näet summan heti, ei arviolaskuria. Lämpökamerakuvaus sisältyy, koko Uusimaa.\n\n👉 Varaa aika: tiiviskoti.fi' },
  { file: 'tiiviskoti-shorts-2.mp4', thumb: 'thumbs/shorts-2.jpg', adName: 'TK26 - Video jalkakoukku',
    headline: HL_KULUTTAJA, description: 'Yksi käynti, kiinteä hinta, koko Uusimaa.',
    message: 'Ovien ja ikkunoiden tiivistys yhdellä käynnillä. Paleliko sun pikkuvarpaat viime talvena? Vaihdamme ovien ja ikkunoiden tiivisteet kiinteään hintaan: ikkuna 95 €, ulko-ovi 119 €, pienin käynti 149 € (sis. lämpökamerakuvauksen). Kotitalousvähennys −40 %.\n\n👉 tiiviskoti.fi' },
  { file: 'tiiviskoti-shorts-3.mp4', thumb: 'thumbs/shorts-3.jpg', adName: 'TK26 - Video olohuonekoukku',
    headline: HL_KULUTTAJA, description: 'Näet hinnan heti, varaat ajan alle minuutissa.',
    message: 'Ovien ja ikkunoiden tiivistys kiinteään hintaan. Oliko sulla peitto päällä viime talvella telkkarin edessä? Ei tarvitse ensi talvena. Tiivistämme ovet ja ikkunat, ja ajan varaat verkosta alle minuutissa. Koko Uusimaa.\n\n👉 tiiviskoti.fi' },
];

const KUVAT = [
  { file: 'mainos-veto.png', adName: 'TK26 - Veto (kipukärki)', headline: HL_KULUTTAJA,
    description: 'Ikkuna 95 €, ulko-ovi 119 €. Kiinteä hinta heti.',
    message: 'Ovien ja ikkunoiden tiivistys kiinteään hintaan. Karkaako lämpö ulos ovista? Usein pieni tiivistys — ei kallis remontti — säästää eniten lämmityksessä. Näet hinnan heti, lämpökamerakuvaus sisältyy. Koko Uusimaa.\n\n👉 Varaa aika: tiiviskoti.fi' },
  { file: 'mainos-ovi.png', adName: 'TK26 - Ovi (lähikuva)', headline: HL_KULUTTAJA,
    description: 'Karmitiiviste ja kynnyskumi vaihtuvat tunnissa.',
    message: 'Ovien ja ikkunoiden tiivistys kiinteään hintaan. Veto tulee ulko-oven karmitiivisteestä ja kynnyskumista — ne ovat halvin kohta korjata ja yleisin syy vetoon. Vaihto kestää tunnin, hinnan näet ennen varausta. Ulko-ovi 119 €, ikkuna 95 €.\n\n👉 tiiviskoti.fi' },
  { file: 'mainos-asentaja.png', adName: 'TK26 - Asentaja (luottamus)', headline: HL_KULUTTAJA,
    description: 'Ammattiasennus samana päivänä, kiinteä hinta.',
    message: 'Ovien ja ikkunoiden tiivistys samana päivänä. Tiivisteiden vaihto, oven käynnin säätö ja lämpökamerakuvaus — kiinteään hintaan, ei arvioita. Koko Uusimaa.\n\n👉 Varaa aika: tiiviskoti.fi' },
  { file: 'mainos-porukka.png', adName: 'TK26 - Oma porukka', headline: HL_KULUTTAJA,
    description: 'Oma porukka, ei alihankintaa. Kiinteä hinta.',
    message: 'Ovien ja ikkunoiden tiivisteet vaihtaa oma porukkamme. Sama porukka vastaa puhelimeen, tekee kartoituksen ja asentaa tiivisteet — ei myyntimiehiä eikä alihankintaa, siksi hinta on kiinteä ja vastuu selvä. Ikkuna 95 €, ulko-ovi 119 €.\n\n👉 tiiviskoti.fi' },
  { file: 'mainos-syksy.png', adName: 'TK26 - Syksy (kausi)', headline: HL_KULUTTAJA,
    description: 'Tiivistä ennen pakkasia. Ikkuna 95 €, ovi 119 €.',
    message: 'Ovien ja ikkunoiden tiivistys ennen pakkasia. Vetävät ovet ja ikkunat tulevat talvella kalliiksi. Kiinteä hinta, lämpökamerakuvaus sisältyy, ammattiasennus samana päivänä.\n\n👉 tiiviskoti.fi' },
];

const TALOKUVAT = [
  { file: 'mainos-taloyhtio.png', adName: 'TK26 - Taloyhtiö (pää)', headline: HL_TALO,
    description: 'Kiinteä sopimushinta, yksi yhteyshenkilö.',
    message: 'Taloyhtiön ovien ja ikkunoiden tiivistys sopimushinnalla. Vähemmän vetoa ja lämpöhukkaa koko kiinteistössä. Kiinteä tarjous, yksi yhteyshenkilö, vastuuvakuutettu ammattityö. Kartoituskäynti 0 €.\n\n👉 Pyydä tarjous: tiiviskoti.fi' },
  { file: 'mainos-taloyhtio-saasto.png', adName: 'TK26 - Taloyhtiö (säästö)', headline: HL_TALO,
    description: 'Vähemmän lämpöhukkaa koko kiinteistössä.',
    message: 'Taloyhtiön ovien ja ikkunoiden tiivistys pienentää lämpöhukkaa koko kiinteistössä. Vetävät ovet ja ikkunat nostavat lämmityskuluja. Kiinteä tarjous, vastuuvakuutettu ammattityö, kartoituskäynti 0 €.\n\n👉 tiiviskoti.fi' },
  { file: 'mainos-taloyhtio-helppo.png', adName: 'TK26 - Taloyhtiö (helppous)', headline: HL_TALO,
    description: 'Ei remonttia eikä pölyä. Kartoitus 0 €.',
    message: 'Taloyhtiön ovien ja ikkunoiden tiivistys sovittuna päivänä. Yksi yhteyshenkilö, kiinteä tarjous, siisti jälki — ei pölyistä remonttia. Kartoituskäynti on veloitukseton.\n\n👉 tiiviskoti.fi' },
];

async function post(url, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(url, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code}${j.error.error_subcode ? '/' + j.error.error_subcode : ''})`);
  return j;
}
const get = async (url) => (await fetch(url)).json();

async function uploadImage(rel) {
  const fd = new FormData();
  fd.append('access_token', TOKEN);
  const name = path.basename(rel);
  fd.append('filename', new Blob([fs.readFileSync(path.join(__dirname, 'out', rel))]), name);
  const j = await (await fetch(g(`${ACT}/adimages`), { method: 'POST', body: fd })).json();
  if (j.error) throw new Error(j.error.message);
  return j.images[name].hash;
}

async function uploadVideo(file) {
  const fd = new FormData();
  fd.append('access_token', TOKEN);
  fd.append('source', new Blob([fs.readFileSync(path.join(__dirname, 'out', file))]), file);
  const j = await (await fetch(g(`${ACT}/advideos`), { method: 'POST', body: fd })).json();
  if (j.error) throw new Error(j.error.message);
  /* Meta koodaa videon taustalla. Creativea ei voi luoda ennen kuin se on
     valmis, joten odotetaan status.video_status === 'ready'. */
  for (let i = 0; i < 60; i++) {
    const s = await get(g(`${j.id}?fields=status&access_token=${TOKEN}`));
    const st = s.status?.video_status;
    if (st === 'ready') return j.id;
    if (st === 'error') throw new Error('videon käsittely epäonnistui Metassa');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('videon käsittely ei valmistunut 5 minuutissa');
}

async function makeAdset({ name, campaign, budgetCents, status, goal, promoted }) {
  return post(g(`${ACT}/adsets`), {
    name, campaign_id: campaign, status,
    daily_budget: String(budgetCents),
    billing_event: 'IMPRESSIONS',
    optimization_goal: goal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    destination_type: 'WEBSITE',
    targeting: JSON.stringify(TARGETING),
    ...(promoted ? { promoted_object: JSON.stringify(promoted) } : {}),
  });
}

async function makeAd(a, adsetId, status, link, cta, media) {
  const link_or_video = media.video_id
    ? { video_data: { video_id: media.video_id, image_hash: media.thumb_hash, title: a.headline,
        message: a.message, link_description: a.description,
        call_to_action: { type: cta, value: { link } } } }
    : { link_data: { image_hash: media.image_hash, link, message: a.message,
        name: a.headline, description: a.description,
        call_to_action: { type: cta, value: { link } } } };
  const oss = { page_id: PAGE, instagram_user_id: IG, ...link_or_video };
  const cr = await post(g(`${ACT}/adcreatives`), {
    name: a.adName + ' — creative', object_story_spec: JSON.stringify(oss), url_tags: URL_TAGS });
  const ad = await post(g(`${ACT}/ads`), {
    name: a.adName, adset_id: adsetId, creative: JSON.stringify({ creative_id: cr.id }), status });
  return ad.id;
}

/* ---------------- ajo ---------------- */
if (!LIVE) {
  console.log('KUIVA-AJO (lisää --live julkaistaksesi)\n');
  console.log(`Videot     ${VIDEOS.length} kpl → uusi ad set 20 €/pv, AKTIIVINEN`);
  console.log(`Kuvat      ${KUVAT.length} kpl → uusi ad set 10 €/pv, PAUSED`);
  console.log(`Taloyhtiö  ${TALOKUVAT.length} kpl → uusi ad set 5 €/pv, PAUSED\n`);
  for (const a of [...VIDEOS, ...KUVAT, ...TALOKUVAT])
    console.log(`  ${a.adName}\n     otsikko:  ${a.headline}\n     kuvaus:   ${a.description}`);
  process.exit(0);
}

const log = [];
try {
  console.log('1/4  Luodaan ad setit…');
  const setVideo = await makeAdset({ name: 'TK26 - Shorts-videot', campaign: CAMP_SALES,
    budgetCents: 2000, status: 'ACTIVE', goal: 'OFFSITE_CONVERSIONS',
    promoted: { pixel_id: PIXEL, custom_event_type: 'PURCHASE' } });
  log.push(`✓ ad set (video, 20 €/pv, AKTIIVINEN): ${setVideo.id}`);

  const setKuva = await makeAdset({ name: 'TK26 - Kuvamainokset', campaign: CAMP_SALES,
    budgetCents: 1000, status: 'PAUSED', goal: 'OFFSITE_CONVERSIONS',
    promoted: { pixel_id: PIXEL, custom_event_type: 'PURCHASE' } });
  log.push(`✓ ad set (kuvat, 10 €/pv, PAUSED): ${setKuva.id}`);

  const setTalo = await makeAdset({ name: 'TK26 - Taloyhtiö kuvat', campaign: CAMP_TALO,
    budgetCents: 500, status: 'PAUSED', goal: 'LINK_CLICKS' });
  log.push(`✓ ad set (taloyhtiö, 5 €/pv, PAUSED): ${setTalo.id}`);

  console.log('2/4  Ladataan videot (Meta koodaa ne, tämä kestää)…');
  for (const a of VIDEOS) {
    try {
      const [video_id, thumb_hash] = [await uploadVideo(a.file), await uploadImage(a.thumb)];
      const id = await makeAd(a, setVideo.id, 'ACTIVE', BOOK, 'BOOK_NOW', { video_id, thumb_hash });
      log.push(`✓ VIDEO ${a.adName} → ad ${id}`);
    } catch (e) { log.push(`✗ VIDEO ${a.adName}: ${e.message}`); }
  }

  console.log('3/4  Ladataan kuluttajakuvat…');
  for (const a of KUVAT) {
    try {
      const image_hash = await uploadImage(a.file);
      const id = await makeAd(a, setKuva.id, 'PAUSED', BOOK, 'BOOK_NOW', { image_hash });
      log.push(`✓ KUVA ${a.adName} → ad ${id}`);
    } catch (e) { log.push(`✗ KUVA ${a.adName}: ${e.message}`); }
  }

  console.log('4/4  Ladataan taloyhtiökuvat…');
  for (const a of TALOKUVAT) {
    try {
      const image_hash = await uploadImage(a.file);
      const id = await makeAd(a, setTalo.id, 'PAUSED', TALO, 'GET_QUOTE', { image_hash });
      log.push(`✓ TALOYHTIÖ ${a.adName} → ad ${id}`);
    } catch (e) { log.push(`✗ TALOYHTIÖ ${a.adName}: ${e.message}`); }
  }
} catch (e) {
  log.push(`✗ KESKEYTYI: ${e.message}`);
}
console.log('\n=== TULOS ===');
log.forEach((l) => console.log(l));
