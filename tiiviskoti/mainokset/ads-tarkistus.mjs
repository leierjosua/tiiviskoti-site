#!/usr/bin/env node
/* Google Adsin tila: kampanja, avainsanat, konversiot ja se ettako
   CRM:n lahettamat konversiot oikeasti nakyvat Adsin paassa.
   Aja: node tiiviskoti/mainokset/ads-tarkistus.mjs */
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync(new URL('../../tiiviskoti-crm/.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const V = 'v23';
const CID = (env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/\D/g, '');
let tok = null;
async function token() {
  if (tok) return tok;
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token',
      refresh_token: env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN || env.GOOGLE_OAUTH_REFRESH_TOKEN,
      client_id: env.GOOGLE_ADS_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_OAUTH_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET }) })).json();
  if (!j.access_token) throw new Error('token: ' + JSON.stringify(j).slice(0, 200));
  return (tok = j.access_token);
}
async function gaql(query) {
  const t = await token();
  const r = await fetch(`https://googleads.googleapis.com/${V}/customers/${CID}/googleAds:search`, {
    method: 'POST', headers: { Authorization: `Bearer ${t}`,
      'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
  return j.results || [];
}
const e = (n) => (Number(n || 0) / 1e6).toFixed(0);

console.log('=== KAMPANJAT 30 pv ===');
for (const x of await gaql(`
  SELECT campaign.name, campaign.status, campaign.advertising_channel_type,
         campaign_budget.amount_micros, metrics.cost_micros, metrics.clicks,
         metrics.impressions, metrics.conversions, metrics.conversions_value
    FROM campaign WHERE segments.date DURING LAST_30_DAYS`)) {
  const m = x.metrics || {};
  console.log(`  ${x.campaign.status.padEnd(8)} ${x.campaign.name.slice(0, 34).padEnd(36)} ` +
    `budj ${e(x.campaignBudget?.amountMicros)} e/vrk  kulu ${e(m.costMicros)} e  ` +
    `${m.clicks || 0} klik  ${Number(m.conversions || 0).toFixed(1)} konv  arvo ${Number(m.conversionsValue || 0).toFixed(0)} e`);
}

console.log('\n=== KONVERSIOTOIMINNOT (30 pv) ===');
for (const x of await gaql(`
  SELECT conversion_action.name, conversion_action.status, conversion_action.type,
         conversion_action.primary_for_goal, metrics.all_conversions
    FROM conversion_action WHERE segments.date DURING LAST_30_DAYS`)) {
  const c = x.conversionAction;
  console.log(`  ${c.status.padEnd(9)} ${(c.primaryForGoal ? 'ensisij.' : 'toissij.').padEnd(9)} ` +
    `${c.name.slice(0, 38).padEnd(40)} ${Number(x.metrics?.allConversions || 0).toFixed(1)} kpl  ${c.type}`);
}

console.log('\n=== VIIMEISET 14 pv paivittain ===');
for (const x of await gaql(`
  SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions
    FROM customer WHERE segments.date DURING LAST_14_DAYS ORDER BY segments.date DESC`)) {
  const m = x.metrics || {};
  console.log(`  ${x.segments.date}  ${e(m.costMicros).padStart(4)} e  ${String(m.clicks || 0).padStart(3)} klik  ${Number(m.conversions || 0).toFixed(1)} konv`);
}
