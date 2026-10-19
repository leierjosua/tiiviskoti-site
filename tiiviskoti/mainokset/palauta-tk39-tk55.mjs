#!/usr/bin/env node
/* =========================================================
   18.10.2026: palautetaan hinta-ankkurivideot TK39 + TK55, pois TK62 + TK66.

   MIKSI (Meta-liidit yhdistetty CRM:n töihin mainoksittain, 1.9.–18.10.):
     TK55  75 e -> 4 liidiä -> 2 592 e maksettua työtä + 1 680 e tarjous auki
     TK39  73 e -> 4 liidiä -> 2 työtä 1 158 e
     TK62  54 e -> 2 liidiä -> 0 työtä, linkki-CTR 0,23-0,29 % (heikoin)
     TK66  23 e -> 0 liidiä, CTR 0,40 %
   TK39/TK55 kertovat hinnan JA pienimmän käynnin 149 e -> karsivat
   pikkukyselyt. Vain ~5 000 näyttöä kumpikin -> eivät ole kuluneet.
   Videoihin poltetut hinnat tarkistettu 18.10. (alk. 75 e, 75-90 e/kpl,
   pienin käynti 149 e) = pricing.mjs.

   Mainosjoukossa pysyy max 4 mainosta: TK58, TK65, TK39, TK55.
   Budjetin muutos 18.10. nollasi oppimisen jo -> vaihto samaan nollaukseen.

   Aja repon juuresta:
     node tiiviskoti/mainokset/palauta-tk39-tk55.mjs            # näyttää
     node tiiviskoti/mainokset/palauta-tk39-tk55.mjs --apply    # tekee
   ========================================================= */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const V = 'v21.0';

const env = Object.fromEntries(
  readFileSync(path.join(HERE, '..', '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
const TOKEN = env.META_CAPI_TOKEN;
if (!TOKEN) throw new Error('META_CAPI_TOKEN puuttuu tiiviskoti/.env:stä');

const TK29_ADSET = '120247977245210132';
const ACTIVATE = ['TK39 - Video hinta-ankkuri 15 s', 'TK55 - Video ankkuri (avaus + tiiviste)'];
const PAUSE = ['TK62 - Video viheltävä ikkuna tai ovi', 'TK66 - Lähikuva sakset (kuva)'];

async function graph(id, method = 'GET', params = {}) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const url = `https://graph.facebook.com/${V}/${id}`;
  const res = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body });
  const json = await res.json();
  if (json.error) throw new Error(`${id}: ${json.error.message}`);
  return json;
}

async function ads() {
  const r = await graph(`${TK29_ADSET}/ads`, 'GET', { fields: 'name,status,effective_status', limit: '100' });
  return r.data;
}

function show(list) {
  for (const a of list.filter((a) => a.status === 'ACTIVE' || [...ACTIVATE, ...PAUSE].includes(a.name))) {
    console.log(`  ${a.status.padEnd(7)} ${a.effective_status.padEnd(15)} ${a.name}`);
  }
}

const before = await ads();
console.log('Nyt:');
show(before);

const byName = (n) => {
  const hits = before.filter((a) => a.name === n);
  if (hits.length !== 1) throw new Error(`"${n}": löytyi ${hits.length} mainosta, odotettiin 1`);
  return hits[0];
};
const toActivate = ACTIVATE.map(byName);
const toPause = PAUSE.map(byName);

if (!APPLY) {
  console.log(`\nKuiva-ajo. --apply: ACTIVE ${ACTIVATE.join(', ')} | PAUSED ${PAUSE.join(', ')}`);
  process.exit(0);
}

// Ensin pois, sitten päälle -> joukossa ei hetkeäkään yli neljää mainosta.
for (const a of toPause) await graph(a.id, 'POST', { status: 'PAUSED' });
for (const a of toActivate) await graph(a.id, 'POST', { status: 'ACTIVE' });

console.log('\nTehty, luettu takaisin:');
show(await ads());
