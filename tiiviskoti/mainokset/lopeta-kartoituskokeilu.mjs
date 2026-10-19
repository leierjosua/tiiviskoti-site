#!/usr/bin/env node
/* =========================================================
   KARTOITUSKOKEILU LOPPUU 18.10.2026 (Josuan päätös).

   3 pv: 34 e -> ~110 kävijää kartoitus.html:llä, keskim. scroll 7 %,
   2 avasi kalenterin, 0 varausta. LINK_CLICKS tuo halpaa matala-aikeista
   liikennettä. Jatkossa: liidilomake -> soitto -> kartoitus puhelimessa.

   MITÄ TEHDÄÄN
     1. Kampanja TK67 Kartoituskokeilu -> PAUSED
     2. TK29 Liidilomake 30 -> 45 e/vrk (kartoituksen 15 e siirtyy sinne)

   Aja repon juuresta:
     node tiiviskoti/mainokset/lopeta-kartoituskokeilu.mjs            # näyttää
     node tiiviskoti/mainokset/lopeta-kartoituskokeilu.mjs --apply    # tekee
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

const KARTOITUS_CAMPAIGN = '120248655774970132';
const TK29_ADSET = '120247977245210132';
const TK29_BUDGET_CENTS = 4500;

async function graph(id, method = 'GET', params = {}) {
  const url = new URL(`https://graph.facebook.com/${V}/${id}`);
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = method === 'GET'
    ? await fetch(`${url}?${body}`)
    : await fetch(url, { method, body });
  const json = await res.json();
  if (json.error) throw new Error(`${id}: ${json.error.message}`);
  return json;
}

async function show() {
  const c = await graph(KARTOITUS_CAMPAIGN, 'GET', { fields: 'name,status,effective_status' });
  const a = await graph(TK29_ADSET, 'GET', { fields: 'name,status,daily_budget' });
  console.log(`  ${c.name}: ${c.status} (${c.effective_status})`);
  console.log(`  ${a.name}: ${a.status}, ${a.daily_budget / 100} e/vrk`);
}

console.log('Nyt:');
await show();

if (!APPLY) {
  console.log(`\nKuiva-ajo. --apply: kartoituskampanja PAUSED + TK29 ${TK29_BUDGET_CENTS / 100} e/vrk`);
  process.exit(0);
}

await graph(KARTOITUS_CAMPAIGN, 'POST', { status: 'PAUSED' });
await graph(TK29_ADSET, 'POST', { daily_budget: String(TK29_BUDGET_CENTS) });

console.log('\nTehty, luettu takaisin:');
await show();
