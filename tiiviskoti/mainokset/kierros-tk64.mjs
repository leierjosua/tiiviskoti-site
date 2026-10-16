#!/usr/bin/env node
/* =========================================================
   14.10.2026: kaksi uutta lähikuvamainosta + budjetti 45 -> 30 e/vrk.

   MIKSI. Videot (TK58-TK63) saavat linkkien CTR:n 0,3-0,6 %, kun
   kuvamainokset ovat ajaneet 0,6-1,9 %. Liidiksi muuttuu klikeistä yhä
   ~6-10 %, joten vika on klikin hinnassa eli luovassa. Mitattu voittaja
   on lähikuva itse tiivisteestä (TK38-A 7 liidiä ~22 e).

     1. TK29-mainosjoukon budjetti 45 -> 30 e/vrk.
     2. Kaksi uutta kuvamainosta, SAMA teksti, vain kuva vaihtuu:
        TK64 tiivistekela, TK65 urallinen tiiviste uraan.
     3. Pois: TK60 huurtuminen, TK63 kuuletko tuon (vähiten jakelua,
        0 liidiä). Päälle jää 4: TK58, TK62, TK64, TK65.

   Aja repon juuresta:
     node tiiviskoti/mainokset/kierros-tk64.mjs            # näyttää
     node tiiviskoti/mainokset/kierros-tk64.mjs --apply    # tekee
   ========================================================= */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const APPLY = process.argv.includes('--apply');
const V = 'v21.0';

const env = Object.fromEntries(
  readFileSync(path.join(HERE, '..', '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const TOK = env.META_CAPI_TOKEN;
if (!TOK) { console.error('META_CAPI_TOKEN puuttuu tiiviskoti/.env:sta'); process.exit(1); }

const ACT = 'act_205952163658187';
const ADSET = '120247977245210132';        // TK29 - Liidilomake (tekstikuvat)
const PAGE = '556560117546812';
const IG = '17841437143913657';            // TiivisKoti IG - ilman tätä renderöityy flowina
const FORM = '1505410584942736';
const BUDJETTI = 3000;                     // senttejä = 30 e/vrk

/* TK58:n teksti (paras mainos 30 pv), jotta ovi 99 e on mukana. */
const TEKSTI =
`Lämmityskausi alkoi. Vetoinen ikkuna tai ulko-ovi maksaa joka pakkaspäivä — ja uusi ikkuna tai ovi maksaa tuhansia euroja.

Jos lasi, karmi ja ovi ovat ehjät, riittää että tiivisteet uusitaan ja käynti säädetään.

Ikkunan tiivistys alkaen 75 €, ja mitä useampi ikkuna kerralla, sitä halvempi kappalehinta. Ulko-oven tiivistys 99 €: tiivisteiden vaihto, lukkojen ja saranoiden öljyäminen ja oven säätö. Pienin käynti 149 €, joka sisältää käynnin, matkat ja lämpökamerakuvauksen. Näet summan ennen kuin päätät.

Jätä numerosi, niin lasketaan hinta sinun ikkunoillesi ja ovillesi. Sanomme suoraan, jos tiivistys ei sinun kohdallasi riitä.`;
const OTSIKKO = 'Ikkunan tiivistys alk. 75 € — ulko-ovi 99 €';
const KUVAUS = 'Kiinteä hinta. Kotitalousvähennys −40 %. Oma porukka, ei alihankintaa.';

const UUDET = [
  { nimi: 'TK64 - Lähikuva tiivistekela (kuva)', tiedosto: 'mainos-tk64-kela.png' },
  { nimi: 'TK65 - Lähikuva tiiviste uraan (kuva)', tiedosto: 'mainos-tk65-uratiiviste.png' },
];
const SAMMUTETTAVAT = ['TK60 - Video huurtuminen', 'TK63 - Video kuuletko tuon'];

/* ---------- Graph-apurit (kuten kierros1.mjs) ---------- */

async function get(polku, params = {}) {
  const u = new URL(`https://graph.facebook.com/${V}/${polku}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOK);
  const j = await (await fetch(u)).json();
  if (j.error) throw new Error(`${polku}: ${j.error.message}`);
  return j;
}
async function post(polku, body) {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) fd.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  fd.set('access_token', TOK);
  const j = await (await fetch(`https://graph.facebook.com/${V}/${polku}`, { method: 'POST', body: fd })).json();
  if (j.error) throw new Error(`${polku}: ${j.error.message} ${JSON.stringify(j.error.error_user_msg || '')}`);
  return j;
}
function upload(polku, kentta, tiedosto) {
  const ulos = execFileSync('curl', ['-s', '-F', `${kentta}=@${tiedosto}`, '-F', `access_token=${TOK}`,
    `https://graph.facebook.com/${V}/${polku}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const j = JSON.parse(ulos);
  if (j.error) throw new Error(`${polku}: ${j.error.message}`);
  return j;
}

/* Advantage+ pois: luetaan TK37:n (kuvamainos) spekki ja karsitaan
   lennossa avaimet jotka Meta hylkää kirjoitettaessa. */
async function haeDof() {
  const r = await get(`${ACT}/ads`, {
    fields: 'name,creative{degrees_of_freedom_spec}', limit: '50',
    filtering: JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: 'TK37' }]),
  });
  const spec = r.data?.[0]?.creative?.degrees_of_freedom_spec;
  return spec?.creative_features_spec ? spec : null;
}
async function luoLuova(nimi, story, dof) {
  const spec = dof ? JSON.parse(JSON.stringify(dof)) : null;
  if (spec) delete spec.creative_features_spec.standard_enhancements;
  for (let yritys = 0; yritys < 25; yritys++) {
    const body = { name: nimi, object_story_spec: story };
    if (spec && Object.keys(spec.creative_features_spec).length) body.degrees_of_freedom_spec = spec;
    try {
      return await post(`${ACT}/adcreatives`, body);
    } catch (e) {
      const m = /Param key '([^']+)' in degrees_of_freedom_spec/.exec(e.message);
      if (!m || !spec) throw e;
      delete spec.creative_features_spec[m[1]];
      console.log(`      (pudotettu kelpaamaton DOF-avain: ${m[1]})`);
    }
  }
  throw new Error('luovan luonti ei onnistunut 25 yrityksellä');
}

/* ---------- Ajo ---------- */

const adset = await get(ADSET, { fields: 'name,daily_budget,effective_status' });
const kaikki = await get(`${ACT}/ads`, { fields: 'name,status,effective_status', limit: '200' });
const sammuta = kaikki.data.filter((a) => SAMMUTETTAVAT.includes(a.name) && a.status === 'ACTIVE');
const jo = kaikki.data.filter((a) => UUDET.some((u) => u.nimi === a.name));

console.log(`Mainosjoukko: ${adset.name} (${adset.effective_status})`);
console.log(`\n1. Budjetti ${Number(adset.daily_budget) / 100} € → ${BUDJETTI / 100} € /vrk`);
console.log('\n2. Uudet:');
for (const u of UUDET) console.log(`     ${u.nimi}  ← out/${u.tiedosto}${existsSync(path.join(OUT, u.tiedosto)) ? '' : '  PUUTTUU'}`);
console.log(`     otsikko: ${OTSIKKO}\n     kuvaus:  ${KUVAUS}`);
console.log('\n3. Pois:');
for (const a of sammuta) console.log(`     ${a.name}`);

if (jo.length) { console.error(`\nUudet mainokset ovat jo olemassa (${jo.map((a) => a.name).join(', ')}) — ei luoda tuplia.`); process.exit(1); }
if (UUDET.some((u) => !existsSync(path.join(OUT, u.tiedosto)))) { console.error('\nMateriaalia puuttuu, keskeytetään.'); process.exit(1); }
if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

console.log('\n--- ajetaan ---');
const DOF = await haeDof();

for (const u of UUDET) {
  const r = upload(`${ACT}/adimages`, 'file', path.join(OUT, u.tiedosto));
  const hash = Object.values(r.images)[0].hash;
  const story = { page_id: PAGE, instagram_user_id: IG, link_data: {
    link: `https://fb.me/${FORM}`, message: TEKSTI, name: OTSIKKO, description: KUVAUS, image_hash: hash,
    call_to_action: { type: 'GET_QUOTE', value: { lead_gen_form_id: FORM } },
  } };
  const luova = await luoLuova(`${u.nimi} creative`, story, DOF);
  const mainos = await post(`${ACT}/ads`, { name: u.nimi, adset_id: ADSET, creative: { creative_id: luova.id }, status: 'ACTIVE' });
  console.log(`  ✓ ${u.nimi} → mainos ${mainos.id} (kuva ${hash})`);
}

for (const a of sammuta) {
  await post(a.id, { status: 'PAUSED' });
  console.log(`  ✗ pausella: ${a.name}`);
}

await post(ADSET, { daily_budget: BUDJETTI });

/* ---------- Tarkistus ---------- */

console.log('\n--- tarkistus ---');
const as = await get(ADSET, { fields: 'daily_budget' });
console.log(`budjetti: ${Number(as.daily_budget) / 100} €/vrk\n`);
const jalkeen = await get(`${ACT}/ads`, {
  fields: 'name,status,effective_status,creative{instagram_user_id,object_story_spec}', limit: '200',
});
for (const a of jalkeen.data.filter((x) => x.status === 'ACTIVE' && x.effective_status !== 'ADSET_PAUSED')) {
  const sp = a.creative?.object_story_spec || {};
  const ld = sp.link_data || sp.video_data || {};
  const ig = a.creative?.instagram_user_id || sp.instagram_user_id || 'PUUTTUU';
  console.log(`  ${a.name}  [${a.effective_status}]`);
  console.log(`      CTA=${ld.call_to_action?.type || '-'}  lomake=${ld.call_to_action?.value?.lead_gen_form_id || '-'}  IG=${ig}${ig === IG ? ' ✓' : ' ← TARKISTA'}`);
}
