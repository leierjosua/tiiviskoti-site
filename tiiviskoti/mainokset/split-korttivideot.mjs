#!/usr/bin/env node
/* Erottaa TK27-videot omaan ad settiinsä TK26-shortsien joukosta.
 *
 * MIKSI: "TK26 - Shorts-videot" (20 €/vrk) sisälsi kaksi eri asiaa — kolme
 * alkuperäistä shortsia ja kuusi uudempaa TK27-videota. Yhdessä joukossa
 * Meta jakaa budjetin niiden kesken oman optimointinsa mukaan, jolloin
 * kumpaakaan ei voi lukea erikseen eikä TK27:lle voi antaa omaa budjettia.
 *
 * MIKSI UUSI MAINOS EIKÄ SIIRTO: Metassa mainosta ei voi siirtää ad setistä
 * toiseen. Uusi mainos SAMALLA creative_id:llä on lähin vastine — julkaisu
 * on sama, joten tykkäykset ja kommentit säilyvät. Vanhat pausetetaan (ei
 * poisteta), jotta sama mainos ei pyöri kahdessa joukossa ja jotta paluu
 * on mahdollinen.
 *
 * Budjetti: uusi joukko 5 €/vrk otetaan Kuvamainoksista (20 → 15), joten
 * tilin kokonaisbudjetti pysyy 50 €:ssa/vrk.
 *
 * Ajo: node tiiviskoti/mainokset/split-korttivideot.mjs        (kuiva-ajo)
 *      node tiiviskoti/mainokset/split-korttivideot.mjs --live (tekee muutokset)
 *
 * IDEMPOTENSSI: mainosten luonti EI ole idempotenttia (opittu 25.8.), joten
 * skripti tarkistaa nimet ennen luontia ja ohittaa jo olemassa olevat.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const TOKEN = env.match(/^META_CAPI_TOKEN=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const V = 'v21.0';
const ACT = 'act_205952163658187';
const LIVE = process.argv.includes('--live');
const g = (p) => `https://graph.facebook.com/${V}/${p}`;

const SHORTS_SET = '120247886647400132';   // TK26 - Shorts-videot (jää shortseille)
const KUVA_SET = '120247886647840132';     // TK26 - Kuvamainokset (20 → 15 €/vrk)
const CAMPAIGN = '120247788747000132';     // TiivisKoti - Ostot (varaukset), OUTCOME_SALES
const NEW_SET_NAME = 'TK27 - Korttivideot';
const NEW_BUDGET = 500;                    // 5 €/vrk sentteinä
const KUVA_BUDGET = 1500;                  // 15 €/vrk sentteinä

/* Siirrettävät: kaikki TK27-videot. Tunnistus nimen alusta, ei id-listasta —
   id:t muuttuvat jos mainokset joskus luodaan uudestaan, nimet eivät. */
const MOVE = /^TK27 - (Kortti |Säästöarvio|Lämpötila)/;

async function get(p, params = {}) {
  const u = new URL(g(p));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  u.searchParams.set('access_token', TOKEN);
  const j = await (await fetch(u)).json();
  if (j.error) throw new Error(`${j.error.error_user_msg || j.error.message} (code ${j.error.code})`);
  return j;
}
async function post(p, params) {
  if (!LIVE) { console.log(`   [kuiva-ajo] POST ${p}`, JSON.stringify(params).slice(0, 160)); return { id: 'dry-run' }; }
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const j = await (await fetch(g(p), { method: 'POST', body })).json().catch(() => ({}));
  if (j.error) throw new Error(`${j.error.error_user_msg || j.error.message} (code ${j.error.code})`);
  return j;
}

/* 1) Mitkä mainokset siirtyvät */
const ads = (await get(`${SHORTS_SET}/ads`, { fields: 'id,name,effective_status,creative{id}', limit: '100' })).data;
const moving = ads.filter((a) => MOVE.test(a.name) && a.effective_status !== 'DELETED');
const staying = ads.filter((a) => !MOVE.test(a.name));
console.log(`Siirtyy ${moving.length}: ${moving.map((a) => a.name).join(', ')}`);
console.log(`Jää shortseihin ${staying.length}: ${staying.map((a) => a.name).join(', ')}`);
if (!moving.length) { console.log('Ei siirrettävää — jo tehty?'); process.exit(0); }

/* 2) Uusi ad set — samat asetukset kuin lähtöjoukossa, jotta ainoa muuttuja
      on budjetti ja erillisyys. Asetukset luetaan lähtöjoukosta eikä
      kirjoiteta käsin: käsin kirjoitettu kopio erkanee ensimmäisessä
      muutoksessa. */
const src = await get(SHORTS_SET, {
  fields: 'optimization_goal,billing_event,bid_strategy,promoted_object,targeting,attribution_spec,destination_type',
});
const existing = (await get(`${ACT}/adsets`, { fields: 'id,name', limit: '200' })).data
  .find((s) => s.name === NEW_SET_NAME);

let setId;
if (existing) {
  setId = existing.id;
  console.log(`\n• Ad set ${NEW_SET_NAME} on jo olemassa (${setId}) — käytetään sitä.`);
} else {
  const created = await post(`${ACT}/adsets`, {
    name: NEW_SET_NAME,
    campaign_id: CAMPAIGN,
    optimization_goal: src.optimization_goal,
    billing_event: src.billing_event,
    bid_strategy: src.bid_strategy,
    daily_budget: String(NEW_BUDGET),
    promoted_object: JSON.stringify({
      pixel_id: src.promoted_object.pixel_id,
      custom_event_type: src.promoted_object.custom_event_type,
    }),
    targeting: JSON.stringify(src.targeting),
    attribution_spec: JSON.stringify(src.attribution_spec),
    destination_type: src.destination_type,
    status: 'ACTIVE',
  });
  setId = created.id;
  console.log(`\n✓ Ad set ${NEW_SET_NAME} luotu: ${setId} (${NEW_BUDGET / 100} €/vrk, ${src.optimization_goal}/${src.promoted_object.custom_event_type})`);
}

/* 3) Mainokset uuteen joukkoon samoilla creativeilla + vanhat pauselle */
const already = LIVE && existing
  ? new Set((await get(`${setId}/ads`, { fields: 'name', limit: '100' })).data.map((a) => a.name))
  : new Set();

for (const a of moving) {
  if (already.has(a.name)) { console.log(`   ~ ${a.name} on jo uudessa joukossa — ohitetaan`); continue; }
  const nu = await post(`${ACT}/ads`, {
    name: a.name,
    adset_id: setId,
    creative: JSON.stringify({ creative_id: a.creative.id }),
    status: 'ACTIVE',
  });
  console.log(`   ✓ ${a.name} → ${nu.id}`);
  await post(a.id, { status: 'PAUSED' });
  console.log(`   ⏸ vanha ${a.id} pausetettu`);
}

/* 4) Budjetti Kuvamainoksista uudelle joukolle */
await post(KUVA_SET, { daily_budget: String(KUVA_BUDGET) });
console.log(`\n✓ TK26 - Kuvamainokset → ${KUVA_BUDGET / 100} €/vrk`);
console.log(LIVE ? '\nValmis.' : '\nKuiva-ajo — aja --live tehdäksesi muutokset.');
