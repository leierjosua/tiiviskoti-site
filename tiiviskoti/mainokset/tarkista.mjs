#!/usr/bin/env node
/* =========================================================
   Tarkistaa etta jokainen paalla oleva mainos TOIMII.

   Kenttien lukeminen ei riita. Kerran jo livena mainoksessa oli
   oikea CTA ja oikea lomake, mutta se renderoityi Instagramissa
   VAARALLA TILILLA (flowi), koska creativesta puuttui
   instagram_user_id. Siksi tassa haetaan myos Metan oma esikatselu
   ja katsotaan mika tilinimi siina nakyy.

   Tarkistetaan:
     1. Mainoksen tila ja mahdolliset hylkaykset (issues_info)
     2. Painike = GET_QUOTE
     3. Liidilomake = oikea JA lomake itse on aktiivinen
     4. instagram_user_id = TiivisKoti
     5. Esikatselu renderoityy: nakyyko oikea tilinimi, ei flowi
     6. Kuva/video on olemassa ja luettavissa

   Aja repon juuresta:
     node tiiviskoti/mainokset/tarkista.mjs
   ========================================================= */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V = 'v21.0';
const env = Object.fromEntries(
  readFileSync(path.join(HERE, '..', '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const TOK = env.META_CAPI_TOKEN;
const ACT = 'act_205952163658187';
const IG = '17841437143913657';
const FORM = '1505410584942736';
const PAGE = '556560117546812';

async function get(polku, params = {}) {
  const u = new URL(`https://graph.facebook.com/${V}/${polku}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOK);
  for (let y = 0; y < 5; y++) {
    const j = await (await fetch(u)).json();
    if (!j.error) return j;
    if (!/limit reached/i.test(j.error.message)) return { _virhe: j.error.message };
    await new Promise((r) => setTimeout(r, 45000));
  }
  return { _virhe: 'kutsuraja' };
}

/* Esikatselu palauttaa <iframe src="...">. Haetaan se sivu ja
   katsotaan mika tilinimi siina esiintyy. */
async function esikatselu(adId, muoto) {
  const r = await get(`${adId}/previews`, { ad_format: muoto });
  const html = r?.data?.[0]?.body;
  if (!html) return { muoto, tila: 'ei esikatselua' };
  const m = /src="([^"]+)"/.exec(html);
  if (!m) return { muoto, tila: 'ei iframea' };
  const url = m[1].replace(/&amp;/g, '&');
  try {
    const sivu = await (await fetch(url)).text();
    const tk = /TiivisKoti/i.test(sivu);
    const flowi = /flowi/i.test(sivu);
    return { muoto, tila: flowi ? 'FLOWI!' : tk ? 'TiivisKoti' : 'nimeä ei löytynyt', koko: sivu.length };
  } catch (e) { return { muoto, tila: 'haku epäonnistui' }; }
}

console.log('\n=== Liidilomake ===');
const lomake = await get(FORM, { fields: 'name,status,locale,questions' });
if (lomake._virhe) console.log('  virhe:', lomake._virhe);
else {
  console.log(`  ${lomake.name}`);
  console.log(`  tila: ${lomake.status}${lomake.status === 'ACTIVE' ? ' ✓' : ' ← EI AKTIIVINEN'}`);
  console.log(`  kysymykset: ${(lomake.questions || []).map((q) => q.type || q.key).join(', ')}`);
}

const ads = await get(`${ACT}/ads`, {
  fields: 'name,status,effective_status,issues_info,adset{name,effective_status,daily_budget},' +
    'creative{id,instagram_user_id,object_story_spec,image_hash,video_id,effective_object_story_id}',
  limit: '300',
});
const paalla = (ads.data || []).filter((a) => ['ACTIVE', 'PENDING_REVIEW', 'IN_PROCESS'].includes(a.effective_status));

console.log(`\n=== ${paalla.length} mainosta päällä ===`);
let virheita = 0;
for (const a of paalla.sort((x, y) => x.name.localeCompare(y.name))) {
  const cr = a.creative || {};
  const sp = cr.object_story_spec || {};
  const ld = sp.link_data || sp.video_data || {};
  const cta = ld.call_to_action || {};
  const tarkat = [
    ['tila', a.effective_status === 'ACTIVE', a.effective_status],
    ['ei hylkäyksiä', !(a.issues_info || []).length, (a.issues_info || []).map((i) => i.error_summary).join('; ') || 'ei mitään'],
    ['painike', cta.type === 'GET_QUOTE', cta.type || '—'],
    ['lomake', (cta.value || {}).lead_gen_form_id === FORM, (cta.value || {}).lead_gen_form_id || '—'],
    ['IG-tili', cr.instagram_user_id === IG, cr.instagram_user_id || 'PUUTTUU'],
    ['sivu', sp.page_id === PAGE, sp.page_id || '—'],
    ['media', !!(ld.image_hash || ld.video_id), ld.video_id ? `video ${ld.video_id}` : `kuva ${(ld.image_hash || '').slice(0, 10)}`],
  ];
  const ok = tarkat.every(([, k]) => k);
  if (!ok) virheita++;
  console.log(`\n${ok ? '✓' : '✗'} ${a.name}`);
  console.log(`    joukko: ${(a.adset || {}).name}  ${Number((a.adset || {}).daily_budget || 0) / 100} €/vrk`);
  for (const [nimi, kunnossa, arvo] of tarkat) {
    console.log(`    ${kunnossa ? ' ' : '  ✗'} ${nimi.padEnd(14)} ${arvo}`);
  }
  for (const muoto of ['INSTAGRAM_STANDARD', 'MOBILE_FEED_STANDARD']) {
    const e = await esikatselu(a.id, muoto);
    const hyva = e.tila === 'TiivisKoti';
    if (!hyva && e.tila === 'FLOWI!') virheita++;
    console.log(`    ${hyva ? ' ' : '  !'} esikatselu ${muoto.padEnd(22)} ${e.tila}`);
  }
}
console.log(`\n${virheita === 0 ? '✓ Kaikki kunnossa.' : `✗ ${virheita} ongelmaa.`}`);
