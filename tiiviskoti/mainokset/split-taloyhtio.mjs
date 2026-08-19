#!/usr/bin/env node
/* Siirtää Taloyhtiö-mainoksen omaan Traffic-kampanjaan (LINK_CLICKS, ei pixel-riippuvuutta)
 * ja pausettaa väärin optimoituun Purchase-settiin luodun kopion. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const TOKEN = env.match(/^META_CAPI_TOKEN=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const V = 'v21.0';
const ACT = 'act_205952163658187';
const g = (p) => `https://graph.facebook.com/${V}/${p}`;

const CREATIVE_ID = '2140311650164200';       // olemassa oleva Taloyhtiö-creative
const OLD_TALO_AD = '120247811470150132';      // Purchase-settiin luotu kopio → pause
const DAILY_BUDGET = '500';                    // 5 €/day (cents)

const targeting = {
  age_min: 25, age_max: 65,
  geo_locations: { regions: [{ key: '4978', country: 'FI' }], location_types: ['home', 'recent'] },
  targeting_automation: { advantage_audience: 1 },
};

async function post(url, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(url, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code})`);
  return j;
}

// 1) Traffic-kampanja
const camp = await post(g(`${ACT}/campaigns`), {
  name: 'TiivisKoti - Taloyhtiöt - Uusimaa',
  objective: 'OUTCOME_TRAFFIC',
  status: 'ACTIVE',
  special_ad_categories: '[]',
  is_adset_budget_sharing_enabled: 'false',
});
console.log('✓ campaign', camp.id);

// 2) Ad set (LINK_CLICKS optimointi, ei pixeliä)
const adset = await post(g(`${ACT}/adsets`), {
  name: 'Taloyhtiöt - Traffic (LP-klikit)',
  campaign_id: camp.id,
  optimization_goal: 'LINK_CLICKS',
  billing_event: 'IMPRESSIONS',
  bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  daily_budget: DAILY_BUDGET,
  targeting: JSON.stringify(targeting),
  status: 'ACTIVE',
});
console.log('✓ ad set', adset.id, `(${Number(DAILY_BUDGET) / 100} €/day)`);

// 3) Uusi ad samalla (olemassa olevalla) creativella
const ad = await post(g(`${ACT}/ads`), {
  name: 'TK25 - Taloyhtiö',
  adset_id: adset.id,
  creative: JSON.stringify({ creative_id: CREATIVE_ID }),
  status: 'ACTIVE',
});
console.log('✓ ad', ad.id, '(ACTIVE, Meta-arvioinnissa)');

// 4) Pausetetaan Purchase-settiin luotu kopio
await post(g(OLD_TALO_AD), { status: 'PAUSED' });
console.log('✓ paused old taloyhtiö copy in Purchase set', OLD_TALO_AD);

console.log('\nDone. Traffic-kampanja:', camp.id, '/ ad set:', adset.id);
