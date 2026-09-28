#!/usr/bin/env node
/* =========================================================
   Vaihtaa TK55:n ja TK56:n videon uuteen leikkaukseen.

   MIKSI: julkaisin videot leikkauksella jossa toinen otos on
   19,1-22,4 s. Se nayttaa kasityolta, mutta siina LEIKATAAN nauhaa
   saksilla. Josua halusi otoksen jossa nauha painetaan uraan
   (17,00-18,85). Mainokset olivat ajossa alle tunnin, joten
   historiaa ei menetetä.

   MIKSI LUOVA VAIHDETAAN EIKA TEHDA UUTTA MAINOSTA: luovaa ei voi
   muokata, mutta mainoksen voi osoittaa uuteen luovaan. Nain
   mainostilille ei jaa kahta samannimista riviä.

   Aja repon juuresta:
     node tiiviskoti/mainokset/vaihda-videot.mjs --apply
   ========================================================= */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const APPLY = process.argv.includes('--apply');
const V = 'v21.0';

const env = Object.fromEntries(
  readFileSync(path.join(HERE, '..', '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const TOK = env.META_CAPI_TOKEN;
const ACT = 'act_205952163658187';
const PAGE = '556560117546812';
const IG = '17841437143913657';
const FORM = '1505410584942736';

const VAIHDA = [
  { mainos: 'TK55 - Video ankkuri', tiedosto: 'video-ankkuri.mp4' },
  { mainos: 'TK56 - Video säästö',  tiedosto: 'video-menetys.mp4' },
];

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
  if (j.error) throw new Error(`${polku}: ${j.error.message}`);
  return j;
}
function upload(polku, kentta, tiedosto) {
  const ulos = execFileSync('curl', ['-s', '-F', `${kentta}=@${tiedosto}`, '-F', `access_token=${TOK}`,
    `https://graph.facebook.com/${V}/${polku}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const j = JSON.parse(ulos);
  if (j.error) throw new Error(`${polku}: ${j.error.message}`);
  return j;
}

const kaikki = await get(`${ACT}/ads`, {
  fields: 'id,name,effective_status,creative{id,object_story_spec}', limit: '200',
});

console.log(`\nVideon vaihto — ${APPLY ? 'TEHDÄÄN' : 'KUIVAHARJOITTELU'}\n`);
const tyot = [];
for (const v of VAIHDA) {
  const a = kaikki.data.find((x) => x.name.startsWith(v.mainos));
  if (!a) { console.log(`  ✗ ei löytynyt: ${v.mainos}`); continue; }
  console.log(`  ${a.name}  (${a.effective_status})  ← ${v.tiedosto}`);
  tyot.push({ ...v, ad: a });
}
if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

for (const t of tyot) {
  const tiedosto = path.join(OUT, t.tiedosto);
  const vanha = t.ad.creative.object_story_spec.video_data;

  const r = upload(`${ACT}/advideos`, 'source', tiedosto);
  const vid = r.id;
  const thumb = path.join(OUT, `thumb-${path.basename(t.tiedosto, '.mp4')}.jpg`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '0.4', '-i', tiedosto, '-frames:v', '1', '-q:v', '2', thumb]);
  const thash = Object.values(upload(`${ACT}/adimages`, 'file', thumb).images)[0].hash;

  for (let i = 0; i < 40; i++) {
    const s = await get(vid, { fields: 'status' });
    if (s.status?.video_status === 'ready') break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  /* Sanamuodot otetaan VANHASTA luovasta sellaisenaan: vain video
     vaihtuu, jotta vertailu kuvamainokseen pysyy puhtaana. */
  const luova = await post(`${ACT}/adcreatives`, {
    name: `${t.ad.name} creative v2`,
    object_story_spec: {
      page_id: PAGE, instagram_user_id: IG,
      video_data: {
        video_id: vid, image_hash: thash,
        message: vanha.message, title: vanha.title, link_description: vanha.link_description,
        call_to_action: { type: 'GET_QUOTE', value: { link: `https://fb.me/${FORM}`, lead_gen_form_id: FORM } },
      },
    },
  });
  await post(t.ad.id, { creative: { creative_id: luova.id } });
  console.log(`  ✓ ${t.ad.name} → uusi video ${vid}, luova ${luova.id}`);
}

console.log('\n--- tarkistus ---');
const j = await get(`${ACT}/ads`, {
  fields: 'name,effective_status,creative{instagram_user_id,object_story_spec{video_data{video_id,call_to_action}}}', limit: '200',
});
for (const a of j.data.filter((x) => x.name.startsWith('TK55') || x.name.startsWith('TK56'))) {
  const vd = a.creative?.object_story_spec?.video_data || {};
  const cta = vd.call_to_action || {};
  console.log(`  ${a.name}`);
  console.log(`      ${a.effective_status}  video=${vd.video_id}  CTA=${cta.type}  lomake=${(cta.value || {}).lead_gen_form_id}  IG=${a.creative?.instagram_user_id}`);
}
