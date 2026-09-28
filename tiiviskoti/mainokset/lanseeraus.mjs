#!/usr/bin/env node
/* =========================================================
   Lanseeraa loput uudet mainokset omaan mainosjoukkoonsa.

   MIKSI OMA JOUKKO, VAIKKA SUOSITTELIN YHTA. Suosittelin aiemmin
   pitamaan kaiken yhdessa joukossa, koska Meta oppii joukkotasolla ja
   me olemme jo alle oppimisrajan. Se suositus patee edelleen TK29:aan,
   jossa on neljan mainoksen hallittu 2x2-asetelma.

   Nama 11 ovat eri asia: ne ovat TESTIVARASTO, ei hallittu asetelma.
   Jos ne tyonnetaan TK29:aan, ne vievat budjetin nelikolta joka on
   juuri asetettu mittaamaan kulmaa vastaan muotoa, ja se mittaus
   menetetaan. Omassa joukossa ne kilpailevat keskenaan eivatka
   TK29:aa vastaan.

   MITA TASTA EI SAA ODOTTAA: 20 e/vrk yhdelletoista mainokselle on
   1,8 e/mainos/vrk. Meta keskittaa rahan 2-3 mainokseen muutamassa
   paivassa, ja loput jaavat kaytannossa ilman dataa. Tama joukko
   vastaa kysymykseen "onko joukossa lapimurtoa", EI kysymykseen
   "mika naista on paras".

   Aja repon juuresta:
     node tiiviskoti/mainokset/lanseeraus.mjs            # nayttaa
     node tiiviskoti/mainokset/lanseeraus.mjs --apply    # tekee
   ========================================================= */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const APPLY = process.argv.includes('--apply');
const V = 'v21.0';

const env = Object.fromEntries(
  readFileSync(path.join(HERE, '..', '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const TOK = env.META_CAPI_TOKEN;
const ACT = 'act_205952163658187';
const MALLI = '120247977245210132';   // TK29, josta kohdennus kopioidaan
const PAGE = '556560117546812';
const IG = '17841437143913657';
const FORM = '1505410584942736';
const JOUKKO_NIMI = 'TK31 - Kulmatesti (uudet kuvat ja videot)';
const JOUKKO_BUDJETTI = 2000;          // 20 e/vrk

/* Yhteinen loppukappale. Sama joka mainoksessa, jotta ero tuloksissa
   tulee kulmasta eika kehotuksesta. */
const CTA = 'Jätä numerosi, niin lasketaan hinta sinun ikkunoillesi. Sanomme suoraan, jos tiivistys ei sinun kohdallasi riitä.';
const HINTA = 'Ikkunan tiivistys 75–90 € / kpl määrän mukaan, ulko- ja parvekeovi 99 €. Pienin käynti 149 €, joka sisältää käynnin, matkat ja lämpökamerakuvauksen.';

const UUDET = [
  { nimi: 'TK43 - Suhdeluku 8 % (kuva)', tiedosto: 'mainos-tk43-prosentti.png',
    otsikko: 'Tiivistys maksaa 8 % remontista', kuvaus: '998 € vastaan 12 000 €. Kotitalousvähennys −40 %.',
    teksti: `Koko talon ikkunoiden ja ovien tiivistys maksaa noin 998 €. Samojen ikkunoiden vaihtaminen maksaa noin 12 000 €.\n\nTiivistys on siis 8 % remontin hinnasta. Jos lasi ja karmi ovat ehjät, se riittää: tiivisteet uusitaan ja ikkunan käynti säädetään.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK45 - Hinta ilman tarjouspyyntöä (kuva)', tiedosto: 'mainos-tk45-ei-tarjouspyyntoa.png',
    otsikko: 'Tiivistyksen hinta ilman tarjouspyyntöä', kuvaus: 'Näet summan ja varaat ajan alle minuutissa.',
    teksti: `Et joudu odottamaan tarjousta etkä myyntikäyntiä. Hinnasto on julkinen ja näet oman summasi heti.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK46 - Pakkanen (kuva)', tiedosto: 'mainos-tk46-pakkanen.png',
    otsikko: 'Tiivistys nyt, ei keväällä', kuvaus: 'Veto maksaa joka pakkaspäivä. Työ sisäkautta, n. 20 min / ikkuna.',
    teksti: `Vetoinen ikkuna maksaa jokaisen pakkaspäivän, ei vain kylmimpien. Keväällä tiivistäminen ei enää palauta talven laskua.\n\nTyö tehdään sisäkautta, noin 20 minuuttia ikkunaa kohti. Telineitä ei tarvita.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK47 - Oma porukka (kuva)', tiedosto: 'mainos-tk47-oma-porukka.png',
    otsikko: 'Tiivistyksen tekee oma porukka', kuvaus: 'Ei alihankintaa, ei myyntikäyntiä ennen työtä.',
    teksti: `Tiivistyksen tekee meidän oma asentajamme. Emme käytä alihankintaa emmekä lähetä myyjää ennen työtä.\n\nSama tekijä hoitaa varauksesta raporttiin, ja näet hinnan ennen kuin päätät.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK48 - Säästö euroina (kuva)', tiedosto: 'mainos-tk48-saasto.png',
    otsikko: 'Mitä ikkunoiden tiivistys säästää euroina?', kuvaus: '10–15 % lämmityslaskusta. Emme lupaa enempää.',
    teksti: `Tiivisteiden uusiminen leikkaa ikkunoista karkaavaa lämpöä tyypillisesti 10–15 %. Emme lupaa enempää — se on se mitä tiivistys oikeasti tekee.\n\nSen näkee lämpökamerasta ennen ja jälkeen, ja kuvaus sisältyy käyntiin.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK49 - Pienin käynti 149 € (kuva)', tiedosto: 'mainos-tk49-minimi.png',
    otsikko: 'Ikkunoiden tiivistys: pienin käynti 149 €', kuvaus: 'Sisältää käynnin, matkat ja lämpökamerakuvauksen.',
    teksti: `Pienin käynti on 149 €, ja se sisältää käynnin, matkat ja lämpökamerakuvauksen. Yhtä ikkunaa varten ei siis tarvitse tilata erikseen.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK51 - Ankkuri koko talo (kuva)', tiedosto: 'mainos-tk51-ankkuri-talo.png',
    otsikko: 'Koko talon ikkunat tiivistettynä 998 €', kuvaus: 'Vaihdettuna 12 000 €. Tiivisteet uusitaan, ikkunat jäävät.',
    teksti: `Koko talon ikkunat tiivistettynä noin 998 €. Samat ikkunat vaihdettuna noin 12 000 €.\n\nTiivisteet uusitaan ja ikkunan käynti säädetään yhdellä käynnillä. Ikkunat jäävät paikoilleen.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK52 - Ankkuri yksi ikkuna (kuva)', tiedosto: 'mainos-tk52-ankkuri-yksi.png',
    otsikko: 'Ikkunan tiivistys alkaen 75 €', kuvaus: 'Uusi ikkuna maksaisi 1 200 €. Kotitalousvähennys −40 %.',
    teksti: `Yhden ikkunan tiivistys alkaen 75 €. Sama ikkuna uutena maksaisi noin 1 200 €.\n\nMitä useampi ikkuna kerralla, sitä halvempi kappalehinta.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK54 - Säästö 200-300 € (kuva)', tiedosto: 'mainos-tk54-saasto-euro.png',
    otsikko: 'Tiivistys säästää 200–300 € vuodessa', kuvaus: '10–15 % lämmityslaskusta, joka vuosi.',
    teksti: `Ikkunoiden tiivistys säästää tyypillisesti 10–15 % lämmityslaskusta. Kahden tuhannen euron laskulla se on 200–300 € vuodessa — joka vuosi.\n\nLopputulos riippuu talosta, ja sanomme suoraan jos tiivistys ei sinun kohdallasi riitä.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK57 - Video suhdeluku 8 %', tiedosto: 'video-prosentti.mp4', video: true,
    otsikko: 'Tiivistys maksaa 8 % remontista', kuvaus: '998 € vastaan 12 000 €. Kotitalousvähennys −40 %.',
    teksti: `Koko talon ikkunoiden ja ovien tiivistys maksaa noin 998 €. Samojen ikkunoiden vaihtaminen maksaa noin 12 000 €.\n\nTiivistys on siis 8 % remontin hinnasta.\n\n${HINTA}\n\n${CTA}` },

  { nimi: 'TK58 - Video säästö 200-300 €', tiedosto: 'video-euro.mp4', video: true,
    otsikko: 'Tiivistys säästää 200–300 € vuodessa', kuvaus: '10–15 % lämmityslaskusta, joka vuosi.',
    teksti: `Ikkunoiden tiivistys säästää tyypillisesti 10–15 % lämmityslaskusta. Kahden tuhannen euron laskulla se on 200–300 € vuodessa.\n\n${HINTA}\n\n${CTA}` },
];

/* ---------- Graph ---------- */
async function get(polku, params = {}) {
  const u = new URL(`https://graph.facebook.com/${V}/${polku}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOK);
  const j = await (await fetch(u)).json();
  if (j.error) throw new Error(`${polku}: ${j.error.message}`);
  return j;
}
async function post(polku, body) {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) fd.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  fd.set('access_token', TOK);
  const j = await (await fetch(`https://graph.facebook.com/${V}/${polku}`, { method: 'POST', body: fd })).json();
  if (j.error) throw new Error(`${polku}: ${j.error.message} ${JSON.stringify(j.error.error_user_msg || '')}`);
  return j;
}
function upload(polku, kentta, tiedosto) {
  const ulos = execFileSync('curl', ['-s', '-F', `${kentta}=@${tiedosto}`, '-F', `access_token=${TOK}`,
    `https://graph.facebook.com/${V}/${polku}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const j = JSON.parse(ulos);
  if (j.error) throw new Error(`${polku}: ${j.error.message}`);
  return j;
}

const malli = await get(MALLI, {
  fields: 'campaign_id,targeting,optimization_goal,billing_event,destination_type,promoted_object,bid_strategy,attribution_spec',
});

console.log(`\nLanseeraus — ${APPLY ? 'TEHDÄÄN' : 'KUIVAHARJOITTELU'}`);
console.log(`\nUusi joukko: ${JOUKKO_NIMI}  ${JOUKKO_BUDJETTI / 100} €/vrk`);
console.log(`Kohdennus kopioidaan TK29:stä (Uusimaa, 25–65, FB+IG).`);
console.log(`\n${UUDET.length} mainosta, kaikki GET_QUOTE + lomake ${FORM} + IG ${IG}:\n`);
let puuttuu = 0;
for (const u of UUDET) {
  const on = existsSync(path.join(OUT, u.tiedosto));
  if (!on) puuttuu++;
  console.log(`  ${on ? '✓' : '✗ PUUTTUU'} ${u.nimi.padEnd(38)} ${u.tiedosto}`);
}
if (puuttuu) { console.error('\nMateriaalia puuttuu, keskeytetään.'); process.exit(1); }
if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

console.log('\n--- ajetaan ---');
const joukko = await post(`${ACT}/adsets`, {
  name: JOUKKO_NIMI,
  campaign_id: malli.campaign_id,
  daily_budget: JOUKKO_BUDJETTI,
  billing_event: malli.billing_event,
  optimization_goal: malli.optimization_goal,
  destination_type: malli.destination_type,
  promoted_object: malli.promoted_object,
  targeting: malli.targeting,
  bid_strategy: malli.bid_strategy,
  status: 'ACTIVE',
});
console.log(`  joukko luotu: ${joukko.id}`);

for (const u of UUDET) {
  const tiedosto = path.join(OUT, u.tiedosto);
  let story;
  if (u.video) {
    const vid = upload(`${ACT}/advideos`, 'source', tiedosto).id;
    const thumb = path.join(OUT, `thumb-${path.basename(u.tiedosto, '.mp4')}.jpg`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '0.8', '-i', tiedosto, '-frames:v', '1', '-q:v', '2', thumb]);
    const thash = Object.values(upload(`${ACT}/adimages`, 'file', thumb).images)[0].hash;
    for (let i = 0; i < 40; i++) {
      const s = await get(vid, { fields: 'status' });
      if (s.status?.video_status === 'ready') break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    story = { page_id: PAGE, instagram_user_id: IG, video_data: {
      video_id: vid, image_hash: thash, message: u.teksti, title: u.otsikko, link_description: u.kuvaus,
      call_to_action: { type: 'GET_QUOTE', value: { link: `https://fb.me/${FORM}`, lead_gen_form_id: FORM } } } };
  } else {
    const hash = Object.values(upload(`${ACT}/adimages`, 'file', tiedosto).images)[0].hash;
    story = { page_id: PAGE, instagram_user_id: IG, link_data: {
      link: `https://fb.me/${FORM}`, message: u.teksti, name: u.otsikko, description: u.kuvaus, image_hash: hash,
      call_to_action: { type: 'GET_QUOTE', value: { lead_gen_form_id: FORM } } } };
  }
  const luova = await post(`${ACT}/adcreatives`, { name: `${u.nimi} creative`, object_story_spec: story });
  const mainos = await post(`${ACT}/ads`, { name: u.nimi, adset_id: joukko.id, creative: { creative_id: luova.id }, status: 'ACTIVE' });
  console.log(`  ✓ ${u.nimi} → ${mainos.id}`);
}

console.log('\n--- tarkistus: kaikki mika on paalla ---');
const j = await get(`${ACT}/ads`, {
  fields: 'name,effective_status,adset{name,daily_budget},creative{instagram_user_id,object_story_spec}', limit: '300',
});
let yht = 0;
for (const a of j.data.filter((x) => ['ACTIVE', 'PENDING_REVIEW', 'IN_PROCESS'].includes(x.effective_status))) {
  const sp = a.creative?.object_story_spec || {};
  const ld = sp.link_data || sp.video_data || {};
  const cta = ld.call_to_action || {};
  const ig = a.creative?.instagram_user_id;
  const ok = ig === IG && cta.type === 'GET_QUOTE' && cta.value?.lead_gen_form_id === FORM;
  yht++;
  console.log(`  ${ok ? '✓' : '✗'} ${a.name.padEnd(42)} ${a.effective_status.padEnd(15)} ${(a.adset || {}).name}`);
}
const joukot = await get(`${ACT}/adsets`, { fields: 'name,daily_budget,effective_status', limit: '50' });
const paalla = joukot.data.filter((x) => x.effective_status === 'ACTIVE');
console.log(`\n  mainoksia päällä: ${yht}`);
console.log(`  joukkoja päällä: ${paalla.length}, budjetti yhteensä ${paalla.reduce((n, x) => n + Number(x.daily_budget || 0), 0) / 100} €/vrk`);
