#!/usr/bin/env node
/* =========================================================
   Arkistoi vanhat kayttamattomat mainokset ja mainosjoukot,
   ja tarkistaa etta paivabudjetti on tasmalleen 45 e.

   MIKSI ARCHIVED EIKA DELETED: arkistointi piilottaa rivin
   nakymasta mutta SAILYTTAA historian, joten vanhat tulokset
   pysyvat raporteissa ja vertailu onnistuu jalkikateen. Poisto
   ei ole peruttavissa eika sille ole tassa mitaan syyta.

   MITA EI KOSKETA
     - Kaikki mika on ACTIVE / PENDING_REVIEW / IN_PROCESS.
     - TK37, TK38-A, TK38-B, TK39: talla viikolla ajossa olleet.
       Ne ovat pysaytettyja mutta tuoreita, ja ne voi haluta
       herattaa. Arkistointi on turhaa niille.

   BUDJETIN TARKISTUS: pysaytetty joukko ei kuluta, mutta
   kampanjatason budjetti (CBO) ja tilin kulutusraja voivat silti
   yllattaa. Ne luetaan ja raportoidaan erikseen.

   Aja repon juuresta:
     node tiiviskoti/mainokset/siivous.mjs            # nayttaa
     node tiiviskoti/mainokset/siivous.mjs --apply    # tekee
   ========================================================= */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const V = 'v21.0';
const env = Object.fromEntries(
  readFileSync(path.join(HERE, '..', '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const TOK = env.META_CAPI_TOKEN;
const ACT = 'act_205952163658187';
const ELAVA = ['ACTIVE', 'PENDING_REVIEW', 'IN_PROCESS'];
/* Talla viikolla ajossa olleet: pysaytetaan mutta ei arkistoida. */
const SAASTA = ['TK37', 'TK38', 'TK39'];
const TAVOITE = 4500;

async function get(polku, params = {}) {
  const u = new URL(`https://graph.facebook.com/${V}/${polku}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOK);
  for (let y = 0; y < 6; y++) {
    const j = await (await fetch(u)).json();
    if (!j.error) return j;
    if (!/limit reached/i.test(j.error.message)) throw new Error(`${polku}: ${j.error.message}`);
    process.stdout.write('  (Metan kutsuraja — odotetaan 60 s)\n');
    await new Promise((r) => setTimeout(r, 60000));
  }
  throw new Error(`${polku}: kutsuraja ei vapautunut`);
}
async function post(polku, body) {
  const fd = new URLSearchParams(body);
  fd.set('access_token', TOK);
  for (let y = 0; y < 6; y++) {
    const j = await (await fetch(`https://graph.facebook.com/${V}/${polku}`, { method: 'POST', body: fd })).json();
    if (!j.error) return j;
    if (!/limit reached/i.test(j.error.message)) throw new Error(`${polku}: ${j.error.message}`);
    await new Promise((r) => setTimeout(r, 60000));
  }
  throw new Error(`${polku}: kutsuraja ei vapautunut`);
}

const tili = await get(ACT, { fields: 'name,spend_cap,amount_spent,currency,account_status' });
const kampanjat = await get(`${ACT}/campaigns`, { fields: 'name,status,effective_status,objective,daily_budget,lifetime_budget,spend_cap', limit: '100' });
const joukot = await get(`${ACT}/adsets`, { fields: 'name,status,effective_status,daily_budget,campaign_id', limit: '200' });
const mainokset = await get(`${ACT}/ads`, { fields: 'name,status,effective_status,adset_id', limit: '400' });

/* ---------- Budjetti ---------- */
console.log(`\nTili: ${tili.name} (${tili.currency})`);
console.log(`Tilin kulutusraja: ${tili.spend_cap && tili.spend_cap !== '0' ? Number(tili.spend_cap) / 100 + ' €' : 'ei asetettu'}`);

console.log('\n--- Kampanjat ---');
let cbo = 0;
for (const c of kampanjat.data) {
  const elava = ELAVA.includes(c.effective_status);
  const b = Number(c.daily_budget || 0);
  if (elava && b) cbo += b;
  if (elava || b) {
    console.log(`  ${elava ? '▶' : '·'} ${c.name.slice(0, 42).padEnd(44)} ${c.effective_status.padEnd(16)} ` +
      `${b ? `CBO ${b / 100} €/vrk` : 'ei kampanjabudjettia'}${c.lifetime_budget && c.lifetime_budget !== '0' ? ` KOKONAIS ${Number(c.lifetime_budget) / 100} €` : ''}`);
  }
}

const elavatJoukot = joukot.data.filter((s) => ELAVA.includes(s.effective_status));
const abo = elavatJoukot.reduce((n, s) => n + Number(s.daily_budget || 0), 0);
console.log('\n--- Käynnissä olevat mainosjoukot ---');
for (const s of elavatJoukot) console.log(`  ▶ ${s.name.slice(0, 46).padEnd(48)} ${Number(s.daily_budget || 0) / 100} €/vrk`);
console.log(`\n  Vuorokausibudjetti yhteensä: ${(abo + cbo) / 100} €  (tavoite ${TAVOITE / 100} €)` +
  `${abo + cbo === TAVOITE ? '  ✓' : '  ← EI TÄSMÄÄ'}`);

/* ---------- Arkistoitavat ---------- */
const arkMainokset = mainokset.data.filter((a) =>
  !ELAVA.includes(a.effective_status) && a.status !== 'ARCHIVED' && !SAASTA.some((p) => a.name.startsWith(p)));
const arkJoukot = joukot.data.filter((s) =>
  !ELAVA.includes(s.effective_status) && s.status !== 'ARCHIVED');

console.log(`\n--- Arkistoitavaa ---`);
console.log(`  ${arkMainokset.length} mainosta, ${arkJoukot.length} mainosjoukkoa`);
const saastetyt = mainokset.data.filter((a) => !ELAVA.includes(a.effective_status) && SAASTA.some((p) => a.name.startsWith(p)));
console.log(`  säästetään pysäytettynä (tämän viikon testi): ${saastetyt.map((a) => a.name.split(' ')[0]).join(', ') || '—'}`);
console.log(`  koskematta: ${mainokset.data.filter((a) => ELAVA.includes(a.effective_status)).length} elävää mainosta`);

if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

console.log('\n--- arkistoidaan ---');
let n = 0;
for (const a of arkMainokset) { await post(a.id, { status: 'ARCHIVED' }); n++; if (n % 10 === 0) console.log(`  ${n}/${arkMainokset.length} mainosta`); }
console.log(`  ${n} mainosta arkistoitu`);
let m = 0;
for (const s of arkJoukot) { await post(s.id, { status: 'ARCHIVED' }); m++; }
console.log(`  ${m} mainosjoukkoa arkistoitu`);
