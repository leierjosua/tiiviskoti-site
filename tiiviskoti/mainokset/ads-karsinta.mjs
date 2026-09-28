#!/usr/bin/env node
/* =========================================================
   Google Ads: tuhlaavan avainsanan pysäytys + tuotehakujen torjunta.

   MIKSI: 30 pv:n analyysi 28.9.2026. Kampanja on hakukampanja, jonka
   mainokset toimivat hyvin (CTR 9,1 %, mainoksen osuvuus ABOVE/AVERAGE
   26/30 avainsanassa). Raha ei kuitenkaan tuota, ja syy ei ole
   mainosteksteissä vaan siinä mihin klikit kohdistuvat:

     - "ikkunoiden tiivistys" PHRASE: 180 € / 170 klikkiä / 0 konversiota.
       40 % koko budjetista yhteen sanaan ilman yhtään kauppaa. Yksikössä
       oleva "ikkunan tiivistys" EXACT teki 1,7 konversiota 34 eurolla.
     - 76 hakutermiä 79:stä tuotti nollan; niihin meni 229 € / 278 €.
       Selvä kuvio: haetaan TUOTETTA eikä palvelua ("ikkunatiiviste",
       "ovitiiviste", "ulko oven tiiviste tokmanni").

   MIKSI EXACT-NEGATIIVISET EIKÄ PHRASE: `ikkunatiivisteiden vaihto`
   KONVERTOI (1 konversio / 16 €), joten laaja "tiiviste"-negatiivi
   tappaisi toimivan haun. Google ei laajenna negatiivisia lähivariantteihin,
   joten EXACT osuu vain täsmälleen siihen hakuun jossa ostoaie puuttuu.
   Tokmanni on PHRASE, koska kauppa esiintyy aina väärässä seurassa.

   EI KOSKE: "ikkunoiden tiivistys" EXACT jää päälle — se on sama haku
   ilman fraasilaajennusta. Pysäytys on peruttavissa yhdellä
   status-muutoksella.

   Aja repon juuresta:
     node tiiviskoti/mainokset/ads-karsinta.mjs            # näyttää
     node tiiviskoti/mainokset/ads-karsinta.mjs --apply    # tekee
   ========================================================= */

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../tiiviskoti-crm/.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const V = 'v23';
const CID = (env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/\D/g, '');
const APPLY = process.argv.includes('--apply');

let tok = null;
async function token() {
  if (tok) return tok;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN || env.GOOGLE_OAUTH_REFRESH_TOKEN,
      client_id: env.GOOGLE_ADS_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_OAUTH_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token: ' + JSON.stringify(j).slice(0, 200));
  tok = j.access_token;
  return tok;
}

async function call(path, body) {
  const t = await token();
  const r = await fetch(`https://googleads.googleapis.com/${V}/customers/${CID}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 500));
  return j;
}

const gaql = (query) => call('googleAds:search', { query }).then((j) => j.results || []);

/* ---------- 1. Pysäytettävä avainsana ---------- */

const PYSAYTA = { teksti: 'ikkunoiden tiivistys', tyyppi: 'PHRASE' };

/* ---------- 2. Lisättävät negatiiviset ----------
   Vain hakuja joissa 30 pv:n datassa on kulua ja nolla konversiota, ja
   joiden sanamuoto kertoo ostoaikeen olevan tuotteessa eikä työssä. */
const NEGATIIVISET = [
  { teksti: 'ikkunatiiviste', tyyppi: 'EXACT' },     // 13 € / 12 klikkiä / 0
  { teksti: 'ikkunatiivisteet', tyyppi: 'EXACT' },   //  6 € /  6 klikkiä / 0
  { teksti: 'ulko oven tiiviste', tyyppi: 'EXACT' }, //  5 € /  5 klikkiä / 0
  { teksti: 'ovitiiviste', tyyppi: 'EXACT' },        //  4 € /  3 klikkiä / 0
  { teksti: 'ikkuna tiiviste', tyyppi: 'EXACT' },    //  3 € /  2 klikkiä / 0
  { teksti: 'tokmanni', tyyppi: 'PHRASE' },          // kauppa, aina väärä aie
];

/* ---------- Ajo ---------- */

const [kampanja] = await gaql(
  "SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH'",
);
if (!kampanja) { console.error('Aktiivista hakukampanjaa ei löytynyt'); process.exit(1); }
const campaignId = kampanja.campaign.id;

/* Vain käynnissä olevien mainosryhmien avainsanat: pysäytetyn ryhmän rivi
   ei kuluta mitään, eikä sen muuttaminen kerro mitään. */
const kohteet = await gaql(`
  SELECT ad_group_criterion.resource_name, ad_group_criterion.status,
         ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group.id, ad_group.name, ad_group.status
    FROM ad_group_criterion
   WHERE ad_group_criterion.type = 'KEYWORD'
     AND ad_group_criterion.keyword.text = '${PYSAYTA.teksti}'
     AND ad_group_criterion.keyword.match_type = '${PYSAYTA.tyyppi}'
     AND ad_group_criterion.status = 'ENABLED'
     AND ad_group.status = 'ENABLED'`);

const nykyiset = new Set(
  (await gaql("SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'"))
    .map((x) => `${x.campaignCriterion.keyword.text}|${x.campaignCriterion.keyword.matchType}`),
);
const lisattavat = NEGATIIVISET.filter((n) => !nykyiset.has(`${n.teksti}|${n.tyyppi}`));

console.log(`\nGoogle Ads -karsinta — ${APPLY ? 'TEHDÄÄN' : 'KUIVAHARJOITTELU (ei muuteta)'}`);
console.log(`Kampanja: ${kampanja.campaign.name} (${campaignId})\n`);
console.log(`1. Pysäytetään "${PYSAYTA.teksti}" [${PYSAYTA.tyyppi}] — ${kohteet.length} riviä:`);
for (const k of kohteet) console.log(`     ryhmä ${k.adGroup.name}  ${k.adGroupCriterion.resourceName}`);
if (kohteet.length === 0) console.log('     (ei löytynyt käynnissä olevaa riviä — ehkä jo pysäytetty)');
console.log(`\n2. Lisätään ${lisattavat.length} negatiivista (${NEGATIIVISET.length - lisattavat.length} oli jo):`);
for (const n of lisattavat) console.log(`     ${n.teksti}  [${n.tyyppi}]`);

if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

if (kohteet.length) {
  await call('adGroupCriteria:mutate', {
    operations: kohteet.map((k) => ({
      update: { resourceName: k.adGroupCriterion.resourceName, status: 'PAUSED' },
      updateMask: 'status',
    })),
  });
  console.log(`\n  pysäytetty ${kohteet.length} avainsanariviä`);
}

if (lisattavat.length) {
  await call('campaignCriteria:mutate', {
    operations: lisattavat.map((n) => ({
      create: {
        campaign: `customers/${CID}/campaigns/${campaignId}`,
        negative: true,
        keyword: { text: n.teksti, matchType: n.tyyppi },
      },
    })),
  });
  console.log(`  lisätty ${lisattavat.length} negatiivista`);
}

/* ---------- Tarkistus ---------- */

const jalkeen = await gaql(`
  SELECT ad_group_criterion.status, ad_group.name FROM ad_group_criterion
   WHERE ad_group_criterion.type='KEYWORD' AND ad_group_criterion.keyword.text='${PYSAYTA.teksti}'
     AND ad_group_criterion.keyword.match_type='${PYSAYTA.tyyppi}' AND ad_group_criterion.status != 'REMOVED'`);
console.log('\n  tarkistus — "' + PYSAYTA.teksti + '" [PHRASE]:');
for (const x of jalkeen) console.log(`     ${x.adGroup.name}: ${x.adGroupCriterion.status}`);

const yha = await gaql(`
  SELECT ad_group_criterion.status, ad_group.name FROM ad_group_criterion
   WHERE ad_group_criterion.type='KEYWORD' AND ad_group_criterion.keyword.text='${PYSAYTA.teksti}'
     AND ad_group_criterion.keyword.match_type='EXACT' AND ad_group_criterion.status != 'REMOVED'`);
console.log('  varmistus — sama sana EXACT jää päälle:');
for (const x of yha) console.log(`     ${x.adGroup.name}: ${x.adGroupCriterion.status}`);

const neg = await gaql("SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.negative = TRUE AND campaign_criterion.type='KEYWORD'");
console.log(`  negatiivisia yhteensä nyt: ${neg.length}\n`);
