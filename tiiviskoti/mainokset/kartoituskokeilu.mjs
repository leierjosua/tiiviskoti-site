#!/usr/bin/env node
/* =========================================================
   KARTOITUSKOKEILU 16.10.–30.10.2026: Meta mainostaa vain ilmaista
   kotikartoitusta (Josuan päätös 16.10.).

   MITÄ TEHDÄÄN
     1. Uusi kampanja "TK67 Kartoituskokeilu" (OUTCOME_TRAFFIC) + mainosjoukko
        15 e/vrk, sama kohdennus kuin TK29:ssä. Mainosjoukko PÄÄTTYY
        ITSESTÄÄN 30.10.2026 klo 23.59 — rahaa ei kulu vahingossa yli.
     2. Kaksi mainosta (15 e/vrk ei riitä neljälle): kuva TK67 sakset ja
        video TK69 "Ilmainen kartoituskäynti". TK68/TK70-materiaali on valmiina.
        Linkki https://tiiviskoti.fi/kartoitus.html?src=meta-kartoitus-tk6x,
        jolloin jokainen varaus kantaa CRM:ssä mainoksen tunnuksen.
     3. TK29 (liidilomake) JATKAA 30 e/vrk rinnalla (Josua 16.10.) — 30.10.
        verrataan samojen viikkojen tuloksia: € / maksava työ kummastakin.

   MIKSI LINK_CLICKS EIKÄ KONVERSIO-OPTIMOINTI: sivustolla ei ole selaimen
   Pixeliä, ja Schedule-tapahtumia tulisi kahdessa viikossa liian vähän
   Metan oppimiseen (elokuussa konversio-optimointi nosti CPM:n 0,45 -> 11 e
   ilman tuloksia). Klikkioptimointi tuo ennustettavan liikenteen; mittari on
   CRM:n kartoitusvaraukset (campaign = meta-kartoitus-*).

   Aja repon juuresta:
     node tiiviskoti/mainokset/kartoituskokeilu.mjs            # näyttää
     node tiiviskoti/mainokset/kartoituskokeilu.mjs --apply    # tekee
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
const OTSIKKO = 'Ilmainen kartoituskäynti kotiin';
const KUVAUS = 'Kiinteä hinta paikan päällä · Uusimaa';

/* Videot: Remotion `video/remotion/src/Kartoitus.tsx` (a = "Ilmainen kartoituskäynti",
   b = "Vetääkö ikkuna tai ovi?") — sama kuvamateriaali kuin TK58:ssa. */
const VIDEOT = path.join(process.env.HOME, 'Desktop', 'tiiviskoti-mainosvideot');
const UUDET = [
  { nimi: 'TK67 - Kartoitus sakset (kuva)', tyyppi: 'kuva', tiedosto: path.join(OUT, 'mainos-k-sakset.png'), src: 'meta-kartoitus-tk67' },
  { nimi: 'TK69 - Kartoitus video (ilmainen käynti)', tyyppi: 'video', tiedosto: path.join(VIDEOT, 'tk-kartoitus-a-45.mp4'), src: 'meta-kartoitus-tk69' },
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

/* ---------- Tarkistukset ennen mitään ---------- */

/* Sivun ja CRM:n on oltava tuotannossa ENNEN kuin rahaa käytetään:
   ilman kotikartoitusta CRM hylkää varaukset (calendar_not_kartoitus). */
const sivu = await fetch(SIVU + '?cb=' + Date.now());
const sivuOk = sivu.status === 200 && (await sivu.text()).includes("mode: 'koti'");
const saat = await (await fetch('https://admin.tiiviskoti.fi/api/public/availability?postal=00120&days=14&kartoitus=koti',
  { headers: { origin: 'https://tiiviskoti.fi' } })).json().catch(() => ({}));
const crmOk = saat.durationMinutes === 45 && (saat.slots?.length ?? 0) > 0;

const tk29 = await get(TK29, { fields: 'name,effective_status,targeting,daily_budget' });
const kaikki = await get(`${ACT}/ads`, { fields: 'name', limit: '200' });
const jo = kaikki.data.filter((a) => UUDET.some((u) => u.nimi === a.name));

console.log(`Kartoitussivu tuotannossa:  ${sivuOk ? 'OK' : 'EI — deployaa sivusto ensin'}`);
console.log(`CRM kotikartoitus:          ${crmOk ? `OK (${saat.slots.length} aikaa 14 vrk, 45 min)` : 'EI — deployaa CRM ensin'}`);
console.log(`\n1. Uusi kampanja + mainosjoukko ${BUDJETTI / 100} €/vrk, päättyy ${LOPPU}`);
console.log(`   kohdennus kopioidaan: ${tk29.name}`);
console.log('2. Uudet:');
for (const u of UUDET) console.log(`     ${u.nimi}  ← ${path.basename(u.tiedosto)}  → ${SIVU}?src=${u.src}${existsSync(u.tiedosto) ? '' : '  PUUTTUU'}`);
console.log(`     otsikko: ${OTSIKKO}\n     kuvaus:  ${KUVAUS}\n     CTA:     Varaa nyt (BOOK_TRAVEL)`);
console.log(`3. Ennallaan rinnalla: ${tk29.name} (${tk29.effective_status}, ${Number(tk29.daily_budget) / 100} €/vrk)`);

if (jo.length) { console.error(`\nMainokset ovat jo olemassa (${jo.map((a) => a.name).join(', ')}) — ei luoda tuplia.`); process.exit(1); }
if (UUDET.some((u) => !existsSync(u.tiedosto))) { console.error('\nMateriaalia puuttuu.'); process.exit(1); }
if (!sivuOk || !crmOk) { console.error('\nKeskeytetään: sivu tai CRM ei ole vielä tuotannossa.'); process.exit(1); }
if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

/* ---------- Ajo ---------- */

console.log('\n--- ajetaan ---');
const DOF = await haeDof();

const kampanja = await post(`${ACT}/campaigns`, {
  name: 'TK67 - Kartoituskokeilu (koti) 10/2026', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE',
  special_ad_categories: [], is_adset_budget_sharing_enabled: false,
});
console.log(`  ✓ kampanja ${kampanja.id}`);

/* Kohdennus sellaisenaan TK29:stä (Uusimaa + ikärajat). */
const { targeting } = tk29;
const joukko = await post(`${ACT}/adsets`, {
  name: 'TK67 - Kartoitus kotiin (linkkiklikit)', campaign_id: kampanja.id, status: 'ACTIVE',
  daily_budget: BUDJETTI, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS',
  bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'WEBSITE',
  targeting, end_time: LOPPU,
});
console.log(`  ✓ mainosjoukko ${joukko.id}`);

for (const u of UUDET) {
  const linkki = `${SIVU}?src=${u.src}`;
  let story;
  if (u.tyyppi === 'kuva') {
    const r = upload(`${ACT}/adimages`, 'file', u.tiedosto);
    const hash = Object.values(r.images)[0].hash;
    story = { page_id: PAGE, instagram_user_id: IG, link_data: {
      link: linkki, message: TEKSTI, name: OTSIKKO, description: KUVAUS, image_hash: hash,
      /* BOOK_NOW ei renderöidy linkkimainoksessa ("Lue lisää") — BOOK_TRAVEL = "Varaa nyt". */
      call_to_action: { type: 'BOOK_TRAVEL', value: { link: linkki } },
    } };
  } else {
    const vid = upload(`${ACT}/advideos`, 'source', u.tiedosto).id;
    /* Pikkukuva image_hashina (video_data.image_url on vain luku). 2,4 s:ssa
       koukkuteksti on jo ruudulla, ja kuvassa näkyy työ eikä kasvoja. */
    const thumb = u.tiedosto.replace(/\.mp4$/, '-thumb.jpg');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '2.4', '-i', u.tiedosto, '-frames:v', '1', '-q:v', '2', thumb]);
    const thash = Object.values(upload(`${ACT}/adimages`, 'file', thumb).images)[0].hash;
    for (let i = 0; i < 60; i++) {
      const st = await get(vid, { fields: 'status' });
      if (st.status?.video_status === 'ready') break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    story = { page_id: PAGE, instagram_user_id: IG, video_data: {
      video_id: vid, message: TEKSTI, title: OTSIKKO, link_description: KUVAUS, image_hash: thash,
      /* Videolla linkki kuuluu call_to_actionin sisään. */
      call_to_action: { type: 'BOOK_TRAVEL', value: { link: linkki } },
    } };
    console.log(`  video ladattu: ${vid}`);
  }
  const luova = await luoLuova(`${u.nimi} creative`, story, DOF);
  const mainos = await post(`${ACT}/ads`, { name: u.nimi, adset_id: joukko.id, creative: { creative_id: luova.id }, status: 'ACTIVE' });
  console.log(`  ✓ ${u.nimi} → mainos ${mainos.id}`);
}

/* TK29 jää päälle rinnalle (Josua 16.10.): vertailu samoilla viikoilla. */

/* ---------- Tarkistus ---------- */

console.log('\n--- tarkistus ---');
const js = await get(joukko.id, { fields: 'name,effective_status,daily_budget,end_time,optimization_goal' });
console.log(`${js.name}: ${js.effective_status}, ${Number(js.daily_budget) / 100} €/vrk, ${js.optimization_goal}, päättyy ${js.end_time}`);
const t29 = await get(TK29, { fields: 'effective_status' });
console.log(`TK29: ${t29.effective_status}`);
const ads = await get(`${joukko.id}/ads`, { fields: 'name,effective_status,creative{instagram_user_id,object_story_spec}' });
for (const a of ads.data) {
  const ld = a.creative?.object_story_spec?.link_data || a.creative?.object_story_spec?.video_data || {};
  const ig = a.creative?.instagram_user_id || a.creative?.object_story_spec?.instagram_user_id;
  console.log(`  ${a.name} [${a.effective_status}] CTA=${ld.call_to_action?.type} IG=${ig}${ig === IG ? ' ✓' : ' ← TARKISTA'}\n      ${ld.link || ld.call_to_action?.value?.link}`);
}
