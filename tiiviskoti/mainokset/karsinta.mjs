#!/usr/bin/env node
/* =========================================================
   Karsinta + saastotekstin tarkennus.

   1. TK53 (kuva) ja TK56 (video) uusiksi. Saastomainosten teksti
      elaa tassa tiedostossa - aja skripti uudelleen kun se muuttuu,
      sammutusosio ei tee mitaan jos ne on jo sammutettu.
      28.9. v3: "Ikkunoiden tiivistys voi saastaa 10-15 %
      lammityskuluissa." Aiempi "Vetava ikkuna maksaa 10-15 %
      lammityskuluista" oli Josuan mielesta liian pitka, eika se
      kertonut ensimmaisella sanalla mista palvelusta on kyse.
      Lampokamerakuvaus pois kuvasta ja tekstista.
   2. TK31 karsitaan yhdestatoista neljaan. Josua vaihtoi TK47:n
      (oma porukka) tilalle TK58:n (video, saastaa 200-300 e/v).
      Sammutetaan 7, ei poisteta - ne saa takaisin yhdella ajolla.

   SAANTO: yksi mainos mekanismia kohti. Pois lahtevat eivat ole
   huonoja vaan paallekkaisia jonkin jaavan kanssa.

   Aja repon juuresta:
     node tiiviskoti/mainokset/karsinta.mjs            # nayttaa
     node tiiviskoti/mainokset/karsinta.mjs --apply    # tekee
   ========================================================= */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
const PAGE = '556560117546812';
const IG = '17841437143913657';
const FORM = '1505410584942736';

/* Prosentti sidottu siihen mista se on prosentti - kolmessa kohdassa:
   kuvan otsikko, mainoksen otsikko ja leipateksti. */
const SAASTO_OTSIKKO = 'Ikkunoiden tiivistys voi säästää 10–15 % lämmityskuluissa';
const SAASTO_KUVAUS = 'Tiivistys alk. 75 €. Kotitalousvähennys −40 %. Oma porukka.';
const SAASTO_TEKSTI =
`Ikkunoiden tiivistys voi säästää 10–15 % lämmityskuluissa. Emme lupaa enempää — se on se mitä tiivistys oikeasti tekee.

Jos lasi ja karmi ovat ehjät, riittää että tiivisteet uusitaan ja ikkunan käynti säädetään. Ikkunat jäävät paikoilleen.

Ikkunan tiivistys 75–90 € / kpl määrän mukaan. Pienin käynti 149 €. Uusi ikkuna maksaisi noin 1 200 €.

Jätä numerosi, niin lasketaan hinta sinun ikkunoillesi. Sanomme suoraan, jos tiivistys ei sinun kohdallasi riitä.`;

const PAIVITA = [
  { alku: 'TK53', tiedosto: 'mainos-tk53-saasto-menetys.png' },
  { alku: 'TK56', tiedosto: 'video-menetys.mp4', video: true },
];

/* Sammutettavat ja syy. TK58 EI ole listalla: Josua vaihtoi sen
   TK47:n tilalle, koska euro voi olla konkreettisempi kuin prosentti. */
const SAMMUTA = [
  ['TK47', 'luottamuskulma — vaihdettu TK58:aan'],
  ['TK48', 'säästökulma — TK53 ja TK56 mittaavat sen'],
  ['TK49', 'pienin käynti on hinnan yksityiskohta, ei kulma'],
  ['TK51', 'hinta-ankkuri — TK43 tekee saman terävämmin'],
  ['TK52', 'hinta-ankkuri — TK37 on kontrolli ja sillä on historiaa'],
  ['TK54', 'sama väite kuin TK58:lla, kuvana'],
  ['TK57', 'sama väite kuin TK43:lla, videona'],
];

async function get(polku, params = {}) {
  const u = new URL(`https://graph.facebook.com/${V}/${polku}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOK);
  for (let y = 0; y < 6; y++) {
    const j = await (await fetch(u)).json();
    if (!j.error) return j;
    if (!/limit reached/i.test(j.error.message)) throw new Error(`${polku}: ${j.error.message}`);
    await new Promise((r) => setTimeout(r, 60000));
  }
  throw new Error(`${polku}: kutsuraja`);
}
async function post(polku, body) {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) fd.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  fd.set('access_token', TOK);
  for (let y = 0; y < 6; y++) {
    const j = await (await fetch(`https://graph.facebook.com/${V}/${polku}`, { method: 'POST', body: fd })).json();
    if (!j.error) return j;
    if (!/limit reached/i.test(j.error.message)) throw new Error(`${polku}: ${j.error.message}`);
    await new Promise((r) => setTimeout(r, 60000));
  }
  throw new Error(`${polku}: kutsuraja`);
}
function upload(polku, kentta, tiedosto) {
  const j = JSON.parse(execFileSync('curl', ['-s', '-F', `${kentta}=@${tiedosto}`, '-F', `access_token=${TOK}`,
    `https://graph.facebook.com/${V}/${polku}`], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  if (j.error) throw new Error(`${polku}: ${j.error.message}`);
  return j;
}

const kaikki = await get(`${ACT}/ads`, { fields: 'id,name,effective_status,adset{name}', limit: '300' });
const elava = (a) => ['ACTIVE', 'PENDING_REVIEW', 'IN_PROCESS'].includes(a.effective_status);

console.log(`\nKarsinta + säästötekstin tarkennus — ${APPLY ? 'TEHDÄÄN' : 'KUIVAHARJOITTELU'}`);
console.log(`\n1. Päivitetään teksti "${SAASTO_OTSIKKO}":`);
const pv = PAIVITA.map((p) => ({ ...p, ad: kaikki.data.find((a) => a.name.startsWith(p.alku) && elava(a)) }));
for (const p of pv) console.log(`     ${p.ad ? '✓' : '✗'} ${p.alku}  ${p.ad?.name || 'EI LÖYDY'}`);

console.log(`\n2. Sammutetaan ${SAMMUTA.length}:`);
const sam = SAMMUTA.map(([k, syy]) => ({ k, syy, ad: kaikki.data.find((a) => a.name.startsWith(k) && elava(a)) }));
for (const s of sam) console.log(`     ${s.ad ? '✓' : '·'} ${s.k}  ${s.syy}`);

const jaa = kaikki.data.filter((a) => elava(a) && !SAMMUTA.some(([k]) => a.name.startsWith(k)));
console.log(`\n3. Jää päälle ${jaa.length}:`);
for (const a of jaa.sort((x, y) => x.name.localeCompare(y.name))) console.log(`     ${a.name.padEnd(42)} ${(a.adset || {}).name}`);

if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

console.log('\n--- ajetaan ---');
for (const p of pv) {
  if (!p.ad) continue;
  const tiedosto = path.join(OUT, p.tiedosto);
  let story;
  if (p.video) {
    const vid = upload(`${ACT}/advideos`, 'source', tiedosto).id;
    const thumb = path.join(OUT, 'thumb-menetys.jpg');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '0.8', '-i', tiedosto, '-frames:v', '1', '-q:v', '2', thumb]);
    const th = Object.values(upload(`${ACT}/adimages`, 'file', thumb).images)[0].hash;
    for (let i = 0; i < 40; i++) {
      const s = await get(vid, { fields: 'status' });
      if (s.status?.video_status === 'ready') break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    story = { page_id: PAGE, instagram_user_id: IG, video_data: {
      video_id: vid, image_hash: th, message: SAASTO_TEKSTI, title: SAASTO_OTSIKKO, link_description: SAASTO_KUVAUS,
      call_to_action: { type: 'GET_QUOTE', value: { link: `https://fb.me/${FORM}`, lead_gen_form_id: FORM } } } };
  } else {
    const hash = Object.values(upload(`${ACT}/adimages`, 'file', tiedosto).images)[0].hash;
    story = { page_id: PAGE, instagram_user_id: IG, link_data: {
      link: `https://fb.me/${FORM}`, message: SAASTO_TEKSTI, name: SAASTO_OTSIKKO, description: SAASTO_KUVAUS, image_hash: hash,
      call_to_action: { type: 'GET_QUOTE', value: { lead_gen_form_id: FORM } } } };
  }
  const luova = await post(`${ACT}/adcreatives`, { name: `${p.ad.name} creative (lämmityskulut)`, object_story_spec: story });
  await post(p.ad.id, { creative: { creative_id: luova.id } });
  console.log(`  ✓ ${p.alku} päivitetty`);
}

for (const s of sam) {
  if (!s.ad) continue;
  await post(s.ad.id, { status: 'PAUSED' });
  console.log(`  ✗ ${s.k} sammutettu`);
}

console.log('\n--- tarkistus ---');
const j = await get(`${ACT}/ads`, {
  fields: 'name,effective_status,adset{name,daily_budget},creative{instagram_user_id,object_story_spec}', limit: '300' });
const paalla = j.data.filter(elava).sort((x, y) => x.name.localeCompare(y.name));
for (const a of paalla) {
  const sp = a.creative?.object_story_spec || {};
  const ld = sp.link_data || sp.video_data || {};
  const cta = ld.call_to_action || {};
  const ok = a.creative?.instagram_user_id === IG && cta.type === 'GET_QUOTE' && cta.value?.lead_gen_form_id === FORM;
  console.log(`  ${ok ? '✓' : '✗'} ${a.name.padEnd(42)} ${(a.adset || {}).name}`);
  if (/TK53|TK56/.test(a.name)) console.log(`        otsikko: ${ld.name || ld.title}`);
}
const joukot = await get(`${ACT}/adsets`, { fields: 'name,daily_budget,effective_status', limit: '50' });
const akt = joukot.data.filter((x) => x.effective_status === 'ACTIVE');
console.log(`\n  ${paalla.length} mainosta päällä, budjetti ${akt.reduce((n, x) => n + Number(x.daily_budget || 0), 0) / 100} €/vrk`);
