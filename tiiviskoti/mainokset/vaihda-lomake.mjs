#!/usr/bin/env node
/* =========================================================
   Liidilomakkeen vaihto käynnissä oleviin mainoksiin.

   MIKSI TÄMÄ ON OLEMASSA: Metan liidilomaketta EI VOI MUOKATA sen jälkeen
   kun sille on tullut liidejä. Graph API vastaa `{"success":true}` ja
   jättää muutoksen hiljaa tekemättä — testattu sekä system user- että
   page-tokenilla lomakkeella 1621236702767244 (34 liidiä). Ainoa tapa
   korjata lomakkeen teksti on tehdä uusi lomake ja osoittaa mainokset
   siihen.

   Mainoksen creative on niin ikään muuttumaton, ja `lead_gen_form_id`
   asuu creativen sisällä. Siksi jokaiselle mainokselle luodaan uusi
   creative vanhan speksin pohjalta ja vaihdetaan vain lomake ja linkki.

   ⚠ instagram_user_id ON PAKKO ASETTAA EKSPLISIITTISESTI. Jos kenttä
   puuttuu object_story_specistä, Meta EI jätä IG-sijoittelua pois vaan
   valitsee jonkin muun tilin — TK33 ajoi näin "flowi"-nimissä. Tämä
   skripti kirjoittaa sen joka creativeen ja tarkistaa lopuksi
   esikatselusta mikä nimi oikeasti renderöityy.

   Aja repon juuresta:
     node tiiviskoti/mainokset/vaihda-lomake.mjs            # näyttää, ei muuta
     node tiiviskoti/mainokset/vaihda-lomake.mjs --apply    # tekee muutoksen
   ========================================================= */

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const GV = 'v21.0';
const TOKEN = env.META_CAPI_TOKEN;
const ACC = '205952163658187';

/** @tiiviskoti — tilin ainoa oikea IG-identiteetti. */
const IG = '17841437143913657';
/** Uusi lomake: "alk. 75 €" + "Pienin käynti 149 €". */
const LOMAKE = '1505410584942736';

const APPLY = process.argv.includes('--apply');

async function g(path, params = {}, method = 'GET') {
  const u = new URL(`https://graph.facebook.com/${GV}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const val = typeof v === 'string' ? v : JSON.stringify(v);
    if (method === 'GET') u.searchParams.set(k, val); else body.set(k, val);
  }
  if (method === 'GET') u.searchParams.set('access_token', TOKEN); else body.set('access_token', TOKEN);
  const r = await fetch(u, method === 'GET' ? {} : { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code})`);
  return j;
}

/** Renderöi IG-esikatselun ja palauttaa tilin nimen jonka katsoja näkee.
 *  Speksin kenttä ei riitä todisteeksi — TK33:lla se oli tyhjä ja
 *  esikatselu paljasti flowin. */
async function esikatseluNimi(adId) {
  const r = await g(`${adId}/previews`, { ad_format: 'INSTAGRAM_STANDARD' });
  const m = /src="([^"]+)"/.exec(r.data?.[0]?.body || '');
  if (!m) return '(ei esikatselua)';
  const html = await (await fetch(m[1].replace(/&amp;/g, '&'))).text();
  return [...new Set((html.match(/tiiviskoti|flowi/gi) || []).map((s) => s.toLowerCase()))].join(',') || '(ei nimeä)';
}

const ADS = [
  '120248139697990132', // TK37 - Ankkuri ikkuna (lämmityskausi)
  '120248236534710132', // TK38 - kuvatesti A: työn lähikuva
  '120248236535040132', // TK38 - kuvatesti B: oma asentaja
  '120248277568300132', // TK39 - Video hinta-ankkuri 15 s
];

console.log(`\nLiidilomakkeen vaihto -> ${LOMAKE}  ${APPLY ? '(TEHDÄÄN)' : '(kuivaharjoittelu)'}\n`);

for (const id of ADS) {
  const a = await g(id, { fields: 'name,status,creative{id,name,object_story_spec}' });
  const vanha = a.creative.object_story_spec;
  const ldVanha = vanha.link_data || vanha.video_data || {};
  const vanhaLomake = ldVanha.call_to_action?.value?.lead_gen_form_id;

  console.log(`${a.name}`);
  console.log(`   lomake nyt : ${vanhaLomake}`);
  console.log(`   IG nyt     : ${vanha.instagram_user_id ?? '*** PUUTTUU ***'}`);

  if (!APPLY) { console.log(''); continue; }

  const spec = JSON.parse(JSON.stringify(vanha));
  const ld = spec.link_data || spec.video_data;
  ld.call_to_action.value.lead_gen_form_id = LOMAKE;
  /* Linkki on kahdessa eri paikassa riippuen muodosta: kuvamainoksella
     `link_data.link`, videolla `call_to_action.value.link`. Molemmat on
     päivitettävä, muuten mainos veisi yhä vanhaan lomakkeeseen. */
  if (ld.link) ld.link = `https://fb.me/${LOMAKE}`;
  if (ld.call_to_action.value.link) ld.call_to_action.value.link = `https://fb.me/${LOMAKE}`;
  /* `image_url` on Metan palauttama vain-luku-kenttä. Jos sen lähettää
     takaisin `image_hash`:n rinnalla, koko luonti kaatuu virheeseen
     "Invalid parameter (code 100)" kertomatta mistä kentästä on kyse. */
  delete ld.image_url;
  spec.instagram_user_id = IG;

  const c = await g(`act_${ACC}/adcreatives`, {
    name: `${a.creative.name || a.name} (lomake v2)`,
    object_story_spec: spec,
  }, 'POST');
  await g(id, { creative: { creative_id: c.id } }, 'POST');

  const jalkeen = await g(id, { fields: 'creative{id,object_story_spec}' });
  const ldUusi = jalkeen.creative.object_story_spec.link_data || jalkeen.creative.object_story_spec.video_data;
  console.log(`   -> creative ${c.id}`);
  console.log(`   -> lomake   ${ldUusi.call_to_action?.value?.lead_gen_form_id}`);
  console.log(`   -> IG       ${jalkeen.creative.object_story_spec.instagram_user_id === IG ? 'tiiviskoti OK' : 'VIKA'}`);
  console.log(`   -> renderöi ${await esikatseluNimi(id)}\n`);
}

if (!APPLY) console.log('Tee muutos:  node tiiviskoti/mainokset/vaihda-lomake.mjs --apply\n');
