#!/usr/bin/env node
/* =========================================================
   16.10.2026: kartoitusmainosten TK67 ja TK69 luovat uusiksi (Josua: mainoksessa
   pitää lukea "Varaa ilmainen kartoitus").

   Metan harmaan napin tekstiä EI voi kirjoittaa vapaasti — se on aina jokin
   Metan valmiista (BOOK_TRAVEL = "Varaa nyt"). Siksi lause tulee:
     - otsikkoon, joka on heti napin vieressä,
     - kuvan valkoiseen nappiin (mainos-k-sakset.html),
     - videon lopun nappiin (Kartoitus.tsx).
   Mainokset pysyvät samoina (sama id, linkki ja seuranta); vain creative
   vaihtuu. Vaihto palauttaa mainoksen hetkeksi arvioon (IN_PROCESS).

   Aja repon juuresta:
     node tiiviskoti/mainokset/vaihda-kartoitus-luovat.mjs          # näyttää
     node tiiviskoti/mainokset/vaihda-kartoitus-luovat.mjs --apply  # tekee
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
const TK29 = '120247977245210132';         // liidilomakejoukko, jatkaa rinnalla
const PAGE = '556560117546812';
const IG = '17841437143913657';            // @tiiviskoti — ilman tätä IG näyttää flowin
const BUDJETTI = 1500;                     // senttejä = 15 e/vrk (TK29 jatkaa 30 e/vrk rinnalla)
const LOPPU = '2026-10-30T23:59:00+0200';  // mainosjoukko pysähtyy itsestään
const SIVU = 'https://tiiviskoti.fi/kartoitus.html';

const TEKSTI =
`Vetävätkö ikkunat tai ovet? Varaa ilmainen kartoituskäynti — asentajamme tulee kotiisi, katsoo ikkunat ja ovet ja kertoo kiinteän hinnan paikan päällä.

Käynti on maksuton eikä sido sinua mihinkään. Näet summan ennen kuin päätät.

Ikkunan tiivistys alkaen 75 €, ja mitä useampi ikkuna kerralla, sitä halvempi kappalehinta. Ulko-oven tiivistys 99 €. Työn osuudesta saat kotitalousvähennyksen.

Valitse sopiva aika kalenterista — vahvistus tulee heti sähköpostiin.`;
const OTSIKKO = 'Varaa ilmainen kartoitus';
const KUVAUS = 'Kiinteä hinta paikan päällä · Uusimaa';

/* Videot: Remotion `video/remotion/src/Kartoitus.tsx` (a = "Ilmainen kartoituskäynti",
   b = "Vetääkö ikkuna tai ovi?") — sama kuvamateriaali kuin TK58:ssa. */
const VIDEOT = path.join(process.env.HOME, 'Desktop', 'tiiviskoti-mainosvideot');
const MAINOKSET = [
  { id: '120248655778790132', nimi: 'TK67 - Kartoitus sakset (kuva)', tyyppi: 'kuva', tiedosto: path.join(OUT, 'mainos-k-sakset.png'), src: 'meta-kartoitus-tk67' },
  { id: '120248655785590132', nimi: 'TK69 - Kartoitus video (ilmainen käynti)', tyyppi: 'video', tiedosto: path.join(VIDEOT, 'tk-kartoitus-a-45.mp4'), src: 'meta-kartoitus-tk69' },
];

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
/* Advantage+ pois kuten muissa julkaisuissa: TK37:n spekki, kelpaamattomat karsitaan. */
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

console.log(`Uusi otsikko napin vieressä: "${OTSIKKO}"  (nappi: Varaa nyt)`);
for (const m of MAINOKSET) {
  const a = await get(m.id, { fields: 'name,effective_status' });
  console.log(`  ${a.name} [${a.effective_status}] ← ${path.basename(m.tiedosto)}${existsSync(m.tiedosto) ? '' : '  PUUTTUU'}`);
}
if (MAINOKSET.some((m) => !existsSync(m.tiedosto))) { console.error('Materiaalia puuttuu.'); process.exit(1); }
if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

const DOF = await haeDof();
for (const m of MAINOKSET) {
  const linkki = `${SIVU}?src=${m.src}`;
  let story;
  if (m.tyyppi === 'kuva') {
    const hash = Object.values(upload(`${ACT}/adimages`, 'file', m.tiedosto).images)[0].hash;
    story = { page_id: PAGE, instagram_user_id: IG, link_data: {
      link: linkki, message: TEKSTI, name: OTSIKKO, description: KUVAUS, image_hash: hash,
      call_to_action: { type: 'BOOK_TRAVEL', value: { link: linkki } },
    } };
  } else {
    const vid = upload(`${ACT}/advideos`, 'source', m.tiedosto).id;
    const thumb = m.tiedosto.replace(/\.mp4$/, '-thumb.jpg');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '2.4', '-i', m.tiedosto, '-frames:v', '1', '-q:v', '2', thumb]);
    const thash = Object.values(upload(`${ACT}/adimages`, 'file', thumb).images)[0].hash;
    for (let i = 0; i < 60; i++) {
      const st = await get(vid, { fields: 'status' });
      if (st.status?.video_status === 'ready') break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    story = { page_id: PAGE, instagram_user_id: IG, video_data: {
      video_id: vid, message: TEKSTI, title: OTSIKKO, link_description: KUVAUS, image_hash: thash,
      call_to_action: { type: 'BOOK_TRAVEL', value: { link: linkki } },
    } };
  }
  const luova = await luoLuova(`${m.nimi} creative v2`, story, DOF);
  await post(m.id, { creative: { creative_id: luova.id } });
  console.log(`  ✓ ${m.nimi}: uusi creative ${luova.id}`);
}

console.log('\n--- tarkistus ---');
for (const m of MAINOKSET) {
  const a = await get(m.id, { fields: 'name,effective_status,creative{instagram_user_id,object_story_spec}' });
  const sp = a.creative?.object_story_spec || {}; const ld = sp.link_data || sp.video_data || {};
  const ig = a.creative?.instagram_user_id || sp.instagram_user_id;
  console.log(`  ${a.name} [${a.effective_status}] otsikko="${ld.name || ld.title}" CTA=${ld.call_to_action?.type} IG=${ig}${ig === IG ? ' ✓' : ' ← TARKISTA'}`);
}
