#!/usr/bin/env node
/* Google Ads -korjaukset 9.11.2026 (analyysi: ks. muisti tiiviskoti-ads-konversiot).

   2. Klikkihintakatto 1,40 → 2,20 €. Keskiklikki oli 1,33 € eli katossa:
      näyttöosuus 50 %, josta 46 % menetetty sijoituksen takia ja budjetista
      jäi ~5 €/vrk käyttämättä.
   3. Soittolaajennus 045 7831 1972 (aukioloaikoina). Kampanjassa ei ollut
      yhtään soittonäyttöä. Vanhan numeron (045 875 5996) laajennus irrotetaan,
      jos sellainen on kytkettynä.
   4. Avainsanat:
      - "ikkunoiden tiivistäminen" [tarkka] Ikkunat-ryhmään (3/5 varauksesta)
      - "ikkunoiden ja ovien tiivistäminen" ohjataan etusivulle (sivukokemus
        "keskitasoa heikompi", koska ikkunasivu ei puhu ovista)
      - laatupisteen 3 oviavainsanat tauolle

   Aja:  node tiiviskoti/mainokset/google-ads-11-2026.mjs           (kuiva-ajo, Google tarkistaa)
         node tiiviskoti/mainokset/google-ads-11-2026.mjs --apply   (tekee muutokset)
   Palautus: katto 1400000, avainsanat status ENABLED, final_urls tyhjäksi. */
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const env = {};
for (const raw of readFileSync(new URL('../../tiiviskoti-crm/.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = raw.replace(/\r$/, '').match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const CID = env.GOOGLE_ADS_CUSTOMER_ID.replace(/\D/g, '');
const API = `https://googleads.googleapis.com/v25/customers/${CID}`;
const tok = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN, grant_type: 'refresh_token' }) })).json()).access_token;
if (!tok) throw new Error('Ads-tunnus ei uusiutunut');
const headers = { authorization: `Bearer ${tok}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'content-type': 'application/json' };

async function q(query) {
  const r = await fetch(`${API}/googleAds:searchStream`, { method: 'POST', headers, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 500));
  return JSON.parse(t).flatMap((c) => c.results ?? []);
}
async function mutate(service, operations, label) {
  const r = await fetch(`${API}/${service}:mutate`, { method: 'POST', headers,
    body: JSON.stringify({ operations, validateOnly: !APPLY, partialFailure: false }) });
  const j = await r.json();
  if (j.error) {
    const msgs = (j.error.details ?? []).flatMap((d) => d.errors ?? []).map((e) => e.message).join(' | ');
    throw new Error(`${label}: ${msgs || j.error.message}`);
  }
  console.log(`  ${APPLY ? '✓ tehty' : '✓ Google hyväksyy (kuiva-ajo)'}: ${label}`);
  return j.results ?? [];
}

const NEW_NUMBER = '+3584578311972';
const OLD_DIGITS = '8755996';
const CAP_MICROS = '2200000';

console.log(APPLY ? '=== TEHDÄÄN MUUTOKSET ===' : '=== KUIVA-AJO (lisää --apply tehdäksesi) ===');

/* ---------- kampanja ---------- */
const [camp] = await q(`SELECT campaign.resource_name, campaign.name, campaign.target_spend.cpc_bid_ceiling_micros
  FROM campaign WHERE campaign.status = 'ENABLED' AND campaign.name = 'Haku - Tiivistys - PKS'`);
if (!camp) throw new Error('Kampanjaa "Haku - Tiivistys - PKS" ei löytynyt');
const campRn = camp.campaign.resourceName;

/* ---------- 2. klikkihintakatto ---------- */
console.log(`\n2. Klikkihintakatto ${Number(camp.campaign.targetSpend?.cpcBidCeilingMicros ?? 0) / 1e6} € → ${Number(CAP_MICROS) / 1e6} €`);
await mutate('campaigns', [{ update: { resourceName: campRn, targetSpend: { cpcBidCeilingMicros: CAP_MICROS } },
  updateMask: 'target_spend.cpc_bid_ceiling_micros' }], 'klikkihintakatto 2,20 €');

/* ---------- 3. soittolaajennus ---------- */
console.log('\n3. Soittolaajennus');
const linked = [
  ...(await q(`SELECT campaign.resource_name, campaign_asset.resource_name, asset.call_asset.phone_number FROM campaign_asset
     WHERE campaign_asset.field_type = 'CALL' AND campaign_asset.status = 'ENABLED' AND campaign.resource_name = '${campRn}'`))
    .map((x) => ({ rn: x.campaignAsset.resourceName, num: x.asset.callAsset?.phoneNumber ?? '', svc: 'campaignAssets' })),
  ...(await q(`SELECT customer_asset.resource_name, asset.call_asset.phone_number FROM customer_asset
     WHERE customer_asset.field_type = 'CALL' AND customer_asset.status = 'ENABLED'`))
    .map((x) => ({ rn: x.customerAsset.resourceName, num: x.asset.callAsset?.phoneNumber ?? '', svc: 'customerAssets' })),
];
for (const l of linked) console.log(`  nykyinen: ${l.num} (${l.svc === 'customerAssets' ? 'koko tili' : 'kampanja'})`);
const digits = (s) => s.replace(/\D/g, '');
for (const l of linked.filter((l) => digits(l.num).endsWith(OLD_DIGITS))) {
  await mutate(l.svc, [{ remove: l.rn }], `vanha numero ${l.num} irti`);
}
if (linked.some((l) => digits(l.num).endsWith('78311972'))) {
  console.log('  uusi numero on jo kytketty — ei lisätä uudelleen');
} else {
  /* Aukioloajat ma–pe 8–20, la–su 8–18.30: soittonappi näkyy vain kun joku vastaa. */
  const day = (d, eh, em) => ({ dayOfWeek: d, startHour: 8, startMinute: 'ZERO', endHour: eh, endMinute: em });
  const schedule = [...['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map((d) => day(d, 20, 'ZERO')),
    ...['SATURDAY', 'SUNDAY'].map((d) => day(d, 18, 'THIRTY'))];
  if (APPLY) {
    const [a] = await mutate('assets', [{ create: { name: 'Soitto 045 7831 1972',
      callAsset: { countryCode: 'FI', phoneNumber: NEW_NUMBER, adScheduleTargets: schedule } } }], 'soittolaajennus luotu');
    await mutate('campaignAssets', [{ create: { campaign: campRn, asset: a.resourceName, fieldType: 'CALL' } }],
      'soittolaajennus kampanjaan');
  } else {
    await mutate('assets', [{ create: { name: 'Soitto 045 7831 1972',
      callAsset: { countryCode: 'FI', phoneNumber: NEW_NUMBER, adScheduleTargets: schedule } } }],
      `soittolaajennus ${NEW_NUMBER}, ma–pe 8–20, la–su 8–18.30`);
    console.log('  (kampanjaan kytkentä tehdään --apply-ajossa, kun laajennuksella on tunniste)');
  }
}

/* ---------- 4. avainsanat ---------- */
console.log('\n4. Avainsanat');
const kws = await q(`SELECT ad_group.resource_name, ad_group.name, ad_group_criterion.resource_name,
    ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status,
    ad_group_criterion.quality_info.quality_score, ad_group_criterion.final_urls
  , campaign.resource_name FROM keyword_view WHERE campaign.resource_name = '${campRn}' AND ad_group_criterion.status != 'REMOVED'`);
const find = (text, match) => kws.find((k) => k.adGroupCriterion.keyword.text === text
  && (!match || k.adGroupCriterion.keyword.matchType === match));

// a) uusi tarkka avainsana
const ikkunat = kws.find((k) => k.adGroup.name === 'Ikkunat')?.adGroup.resourceName;
if (!ikkunat) throw new Error('Ikkunat-mainosryhmää ei löytynyt');
if (find('ikkunoiden tiivistäminen', 'EXACT')) console.log('  [ikkunoiden tiivistäminen] on jo olemassa');
else await mutate('adGroupCriteria', [{ create: { adGroup: ikkunat, status: 'ENABLED',
  keyword: { text: 'ikkunoiden tiivistäminen', matchType: 'EXACT' } } }], 'lisätty [ikkunoiden tiivistäminen] → Ikkunat');

// b) yhdistelmähaku etusivulle
const combo = find('ikkunoiden ja ovien tiivistäminen', 'PHRASE');
if (!combo) console.log('  "ikkunoiden ja ovien tiivistäminen" ei löytynyt — ohitettu');
else if ((combo.adGroupCriterion.finalUrls ?? [])[0] === 'https://tiiviskoti.fi/') console.log('  yhdistelmähaku ohjaa jo etusivulle');
else await mutate('adGroupCriteria', [{ update: { resourceName: combo.adGroupCriterion.resourceName,
  finalUrls: ['https://tiiviskoti.fi/'] }, updateMask: 'final_urls' }],
  '"ikkunoiden ja ovien tiivistäminen" → https://tiiviskoti.fi/');

// c) laatupiste 3 oviavainsanat tauolle
const weak = kws.filter((k) => k.adGroup.name === 'Ovet' && k.adGroupCriterion.status === 'ENABLED'
  && Number(k.adGroupCriterion.qualityInfo?.qualityScore ?? 10) <= 3);
if (!weak.length) console.log('  ei laatupisteen ≤ 3 oviavainsanoja');
for (const k of weak) {
  await mutate('adGroupCriteria', [{ update: { resourceName: k.adGroupCriterion.resourceName, status: 'PAUSED' },
    updateMask: 'status' }], `tauolle "${k.adGroupCriterion.keyword.text}" (QS ${k.adGroupCriterion.qualityInfo.qualityScore})`);
}

console.log(APPLY ? '\nValmis. Tarkista 2 viikon päästä: varauskohtainen hinta ja näyttöosuus.'
  : '\nKuiva-ajo valmis — mitään ei muutettu. Aja uudelleen --apply.');
