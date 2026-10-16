#!/usr/bin/env node
/* =========================================================
   Julkaisee kulmavideot (12.10.2026) mainosjoukkoon TK29 ja
   pysäyttää TK37, TK53 ja TK55 (Josuan valinta: 4 uutta + TK58).

   Tekstit luetaan video/KULMAT-TEKSTIT.md:stä, videot 4:5 työpöydältä.
   Asetukset kopioidaan TK58:sta (tilin paras): sivu, IG, lomake,
   GET_QUOTE ja degrees_of_freedom_spec (Advantage+ -opt-outit — ilman
   niitä Meta voi kirjoittaa CTA:n ja tekstit uusiksi).

   Aja repon juuresta:
     node tiiviskoti/mainokset/julkaise-kulmat.mjs lammitys arvostelu viheltaa          (kuiva)
     node tiiviskoti/mainokset/julkaise-kulmat.mjs lammitys arvostelu viheltaa --apply
   Vanhat pysäytetään vain jos kaikki uudet onnistuivat (--pysayta-vanhat).
   ========================================================= */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const PAUSE_OLD = process.argv.includes('--pysayta-vanhat');
const WANT = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const V = 'v21.0';

const env = Object.fromEntries(
  readFileSync(path.join(HERE, '..', '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const TOK = env.META_CAPI_TOKEN;
const ACT = 'act_205952163658187';
const ADSET = '120247977245210132';
const TK58 = '120248505470060132';
const OLD = ['TK37', 'TK53', 'TK55'];
const DESK = path.join(os.homedir(), 'Desktop', 'tiiviskoti-mainosvideot');

async function get(polku, params = {}) {
  const u = new URL(`https://graph.facebook.com/${V}/${polku}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOK);
  const j = await (await fetch(u)).json();
  if (j.error) throw new Error(`${polku}: ${j.error.message} ${j.error.error_user_msg || ''}`);
  return j;
}
async function post(polku, body) {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) fd.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  fd.set('access_token', TOK);
  const j = await (await fetch(`https://graph.facebook.com/${V}/${polku}`, { method: 'POST', body: fd })).json();
  if (j.error) throw new Error(`${polku}: ${j.error.message} ${j.error.error_user_msg || ''}`);
  return j;
}
function upload(polku, kentta, tiedosto) {
  const ulos = execFileSync('curl', ['-s', '-F', `${kentta}=@${tiedosto}`, '-F', `access_token=${TOK}`,
    `https://graph.facebook.com/${V}/${polku}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const j = JSON.parse(ulos);
  if (j.error) throw new Error(`${polku}: ${j.error.message}`);
  return j;
}

/* --- tekstit md:stä --- */
const md = readFileSync(path.join(HERE, 'video', 'KULMAT-TEKSTIT.md'), 'utf8');
const ADS = md.split(/\n## /).slice(1).map((b) => {
  const head = b.split('\n')[0];
  const name = head.replace(/\s*\(.*\)\s*$/, '').trim();          // "TK59 – Video lämmityskulut"
  const id = (head.match(/\((\w+)-45/) || [])[1];                  // "lammitys"
  const title = (b.match(/^Otsikko: (.+)$/m) || [])[1];
  const message = b.split(/^Teksti:\n/m)[1]?.trim();
  return { id, name: name.replace(' – ', ' - '), title, message };
});

const LINK_DESC = 'Kiinteä hinta. Kotitalousvähennys −40 %. Oma porukka, ei alihankintaa.';
/* Kansikuva: hetki jolloin koukku on kokonaan ruudulla. */
const THUMB_AT = { lammitys: 2.6, huurtuu: 2.4, arvostelu: 2.4, viheltaa: 2.2 };

const valitut = ADS.filter((a) => WANT.includes(a.id));
if (!valitut.length) { console.log('Anna videot: lammitys huurtuu arvostelu viheltaa'); process.exit(1); }

const base = await get(TK58, { fields: 'creative{object_story_spec,degrees_of_freedom_spec}' });
const oss = base.creative.object_story_spec;
const dof = base.creative.degrees_of_freedom_spec;
if (dof?.creative_features_spec) delete dof.creative_features_spec.standard_enhancements; // deprekoitu, kaataa luonnin
const cta = oss.video_data.call_to_action;

const nykyiset = (await get(`${ADSET}/ads`, { fields: 'id,name,effective_status', limit: '200' })).data;

console.log(`\nKulmavideot — ${APPLY ? 'JULKAISTAAN' : 'KUIVAHARJOITTELU'}\n`);
for (const a of valitut) {
  const file = path.join(DESK, `tk-kulma-${a.id}-4x5.mp4`);
  readFileSync(file); // kaatuu jos puuttuu
  const dup = nykyiset.find((x) => x.name.startsWith(a.name.split(' ')[0]));
  console.log(`  ${a.name}${dup ? `  ⚠ nimi jo käytössä: ${dup.name} — ohitetaan` : ''}`);
  console.log(`    otsikko: ${a.title}`);
  console.log(`    teksti:  ${a.message.slice(0, 90).replace(/\n/g, ' ')}…`);
  console.log(`    video:   ${path.basename(file)}   CTA ${cta.type} → lomake ${cta.value.lead_gen_form_id}`);
  a.skip = !!dup; a.file = file;
}
const vanhat = nykyiset.filter((x) => OLD.some((o) => x.name.startsWith(o)) && x.effective_status !== 'PAUSED');
console.log(`\n  Pysäytettävät${PAUSE_OLD ? '' : ' (vain --pysayta-vanhat)'}: ${vanhat.map((x) => x.name).join(', ') || '—'}`);
if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

let ok = 0;
for (const a of valitut.filter((x) => !x.skip)) {
  const vid = upload(`${ACT}/advideos`, 'source', a.file).id;
  const thumb = path.join(os.tmpdir(), `thumb-${a.id}.jpg`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(THUMB_AT[a.id] ?? 2.4), '-i', a.file, '-frames:v', '1', '-q:v', '2', thumb]);
  const thash = Object.values(upload(`${ACT}/adimages`, 'file', thumb).images)[0].hash;
  for (let i = 0; i < 60; i++) {
    const s = await get(vid, { fields: 'status' });
    if (s.status?.video_status === 'ready') break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const luova = await post(`${ACT}/adcreatives`, {
    name: `${a.name} creative`,
    object_story_spec: {
      page_id: oss.page_id, instagram_user_id: oss.instagram_user_id,
      video_data: {
        video_id: vid, image_hash: thash, message: a.message, title: a.title, link_description: LINK_DESC,
        call_to_action: { type: cta.type, value: { link: cta.value.link, lead_gen_form_id: cta.value.lead_gen_form_id } },
      },
    },
    ...(dof ? { degrees_of_freedom_spec: dof } : {}),
  });
  const ad = await post(`${ACT}/ads`, { name: a.name, adset_id: ADSET, creative: { creative_id: luova.id }, status: 'ACTIVE' });
  console.log(`  ✓ ${a.name}  ad ${ad.id}  video ${vid}  luova ${luova.id}`);
  ok++;
}

if (PAUSE_OLD && ok === valitut.filter((x) => !x.skip).length) {
  for (const x of vanhat) { await post(x.id, { status: 'PAUSED' }); console.log(`  ⏸ ${x.name}`); }
}

console.log('\n--- tarkistus ---');
const j = await get(`${ADSET}/ads`, {
  fields: 'name,status,effective_status,creative{instagram_user_id,object_story_spec{video_data{call_to_action}}}', limit: '200',
});
for (const a of j.data.filter((x) => x.status === 'ACTIVE')) {
  const c = a.creative?.object_story_spec?.video_data?.call_to_action || {};
  console.log(`  ${a.name.padEnd(36)} ${a.effective_status.padEnd(15)} CTA=${c.type ?? '-'} lomake=${c.value?.lead_gen_form_id ?? '-'} IG=${a.creative?.instagram_user_id}`);
}
