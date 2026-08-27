#!/usr/bin/env node
/* Vaihtaa taloyhtiö-helppous-mainoksen kuvan livenä. Yrittää päivittää olemassa
 * olevan adin creativen; jos Meta ei salli, luo uuden adin ja poistaa vanhan. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const TOKEN = env.match(/^META_CAPI_TOKEN=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const V = 'v21.0';
const ACT = 'act_205952163658187';
const PAGE = '556560117546812';
const TALO_ADSET = '120247811532860132';
const OLD_AD = '120247811662790132';
const TALO = 'https://tiiviskoti.fi/taloyhtio.html';
const g = (p) => `https://graph.facebook.com/${V}/${p}`;

const message = 'Taloyhtiön ovet ja ikkunat kuntoon ilman remonttia. Yksi yhteyshenkilö, kiinteä tarjous, siisti jälki ja oma porukka ilman alihankintaa — tiivistys sovittuna päivänä.\n\n👉 Pyydä tarjous: tiiviskoti.fi';
const headline = 'Yksi yhteyshenkilö, ei remonttia';

async function post(url, params) {
  const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ ...params, access_token: TOKEN }) });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code})`);
  return j;
}
async function del(url) {
  const r = await fetch(url + `?access_token=${encodeURIComponent(TOKEN)}`, { method: 'DELETE' });
  return r.json().catch(() => ({}));
}

// upload uusi kuva
const fd = new FormData();
fd.append('access_token', TOKEN);
fd.append('filename', new Blob([fs.readFileSync(path.join(__dirname, 'out/mainos-taloyhtio-helppo.png'))]), 'mainos-taloyhtio-helppo.png');
const up = await (await fetch(g(`${ACT}/adimages`), { method: 'POST', body: fd })).json();
const hash = up.images['mainos-taloyhtio-helppo.png'].hash;
console.log('✓ uploaded image', hash);

// uusi creative
const oss = { page_id: PAGE, link_data: { image_hash: hash, link: TALO, message, name: headline, call_to_action: { type: 'GET_QUOTE', value: { link: TALO } } } };
const cr = await post(g(`${ACT}/adcreatives`), { name: 'TK25 - Taloyhtiö (helppous) — creative v2', object_story_spec: JSON.stringify(oss) });
console.log('✓ new creative', cr.id);

// yritä päivittää olemassa oleva ad
try {
  await post(g(OLD_AD), { creative: JSON.stringify({ creative_id: cr.id }) });
  console.log('✓ updated existing ad', OLD_AD, 'with new creative (same ad kept)');
} catch (e) {
  console.log('… in-place update ei onnistunut:', e.message, '→ luodaan uusi ad + poistetaan vanha');
  const ad = await post(g(`${ACT}/ads`), { name: 'TK25 - Taloyhtiö (helppous)', adset_id: TALO_ADSET, creative: JSON.stringify({ creative_id: cr.id }), status: 'ACTIVE' });
  console.log('✓ new ad', ad.id);
  const d = await del(g(OLD_AD));
  console.log('✓ deleted old ad', OLD_AD, JSON.stringify(d));
}
console.log('Done.');
