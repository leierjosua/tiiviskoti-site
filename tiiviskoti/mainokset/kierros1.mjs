#!/usr/bin/env node
/* =========================================================
   Meta-kierros 1: budjetti 45 e/vrk + neljan mainoksen setti.

   MITA TEHDAAN
     1. TK29-mainosjoukon budjetti 35 -> 45 e/vrk.
     2. Kolme uutta mainosta: TK53 (kuva), video-ankkuri, video-menetys.
     3. Kolme vanhaa pois: TK38-A, TK38-B, TK39.
     4. TK37 jaa koskematta kontrolliksi.

   MIKSI NELJA JA MIKSI NAMA. Meta jakaa budjetin mainosten kesken, ja
   45 e/vrk riittaa noin neljalle ennen kuin siivut menevat niin ohuiksi
   ettei mikaan ehdi kertoa mitaan. Asetelma on 2x2: kaksi kulmaa
   (hinta-ankkuri, saasto-%) kertaa kaksi muotoa (kuva, video). Koska
   videoissa on TAYSIN samat sanat kuin kuvissa, sarakkeiden ero kertoo
   muodosta ja rivien ero kulmasta.

   KAKSI ANSAA JOTKA TASSA VALTETAAN
     - instagram_user_id ON PAKKO asettaa luovaan. Ilman sita mainos
       renderoityy Instagramissa tilin oletusprofiililla (flowi), ei
       TiivisKotina. Tama on kaatunut kerran jo livena.
     - Luonti Graph APIlla ohittaa Ads Managerin luonnoskerroksen.
       Jos mainosta kaytetaan paalle Managerista silloin kun siina on
       "julkaisemattomia muokkauksia", muokkaukset julkaistaan mukana.

   Aja repon juuresta:
     node tiiviskoti/mainokset/kierros1.mjs            # nayttaa
     node tiiviskoti/mainokset/kierros1.mjs --apply    # tekee
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
  readFileSync(path.join(HERE, '..', '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const TOK = env.META_CAPI_TOKEN;
if (!TOK) { console.error('META_CAPI_TOKEN puuttuu tiiviskoti/.env:sta'); process.exit(1); }

const ACT = 'act_205952163658187';
const ADSET = '120247977245210132';        // TK29 - Liidilomake (tekstikuvat)
const PAGE = '556560117546812';
const IG = '17841437143913657';            // TiivisKoti IG - ilman tata renderoityy flowina
const FORM = '1505410584942736';
const BUDJETTI = 4500;                     // sentteja = 45 e/vrk

/* Advantage+ pois kaikesta: mainokset on ladottu pikselilleen, ja Metan
   automaattiset tekstilisaykset ja rajaukset rikkovat aseman.

   SPEKKIA EI KIRJOITETA KASIN. Kirjoitin ensin oman listan avaimia ja
   Meta hylkasi sen ("visual_touchups must be one of..."): sallitut
   avaimet vaihtelevat tilin ja API-version mukaan. Luetaan siis se
   spekki jonka Meta itse on tuottanut TK37:lle - se on takuulla
   kelvollinen tassa tilissa - ja karsitaan siita lennossa ne avaimet
   jotka kirjoitettaessa hylataan. */
async function haeDof() {
  const r = await get(`${ACT}/ads`, {
    fields: 'name,creative{degrees_of_freedom_spec}', limit: '50',
    filtering: JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: 'TK37' }]),
  });
  const spec = r.data?.[0]?.creative?.degrees_of_freedom_spec;
  if (!spec?.creative_features_spec) return null;
  return spec;
}

/* Yritetaan luoda luova; jos Meta valittaa yksittaisesta avaimesta,
   pudotetaan se ja yritetaan uudelleen. Nain spekki supistuu itsestaan
   siihen mita tama tili oikeasti hyvaksyy. */
async function luoLuova(nimi, story, dof) {
  const spec = dof ? JSON.parse(JSON.stringify(dof)) : null;
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
  throw new Error('luovan luonti ei onnistunut 25 yrityksella');
}

/* ---------- Mainokset ---------- */

const ANKKURI_TEKSTI =
`Lämmityskausi alkoi. Vetoinen ikkuna maksaa joka pakkaspäivä — ja ikkunaremontti maksaa tuhansia euroja.

Jos lasi ja karmi ovat ehjät, riittää että tiivisteet uusitaan ja ikkunan käynti säädetään.

Ikkunan tiivistys alkaen 75 €, ja mitä useampi ikkuna kerralla, sitä halvempi kappalehinta. Pienin käynti 149 €, joka sisältää käynnin, matkat ja lämpökamerakuvauksen. Näet summan ennen kuin päätät.

Jätä numerosi, niin lasketaan hinta sinun ikkunoillesi. Sanomme suoraan, jos tiivistys ei sinun kohdallasi riitä.`;

/* Saastoluku on 10-15 %, ei enempaa. Se on se mita vetavan ikkunan
   tiivistaminen realistisesti tuo, ja siita pidetaan kiinni vaikka
   kilpailijat lupaavat isompia. */
const SAASTO_TEKSTI =
`Vetävä ikkuna maksaa sinulle joka kuukausi. Tiivisteiden uusiminen leikkaa ikkunoista karkaavaa lämpöä tyypillisesti 10–15 %.

Emme lupaa enempää. Se on se mitä tiivistys oikeasti tekee, ja sen näkee lämpökamerasta ennen ja jälkeen.

Ikkunan tiivistys alkaen 75 €. Pienin käynti 149 €, joka sisältää käynnin, matkat ja lämpökamerakuvauksen. Uusi ikkuna maksaisi noin 1 200 €.

Jätä numerosi, niin lasketaan hinta sinun ikkunoillesi. Sanomme suoraan, jos tiivistys ei sinun kohdallasi riitä.`;

const UUDET = [
  {
    nimi: 'TK53 - Säästö 10-15 % (kuva)',
    tyyppi: 'kuva',
    tiedosto: 'mainos-tk53-saasto-menetys.png',
    otsikko: 'Vetävä ikkuna maksaa 10–15 % lämmityksestä',
    kuvaus: 'Tiivistys alk. 75 €. Kotitalousvähennys −40 %. Oma porukka.',
    teksti: SAASTO_TEKSTI,
  },
  {
    nimi: 'TK55 - Video ankkuri (avaus + tiiviste)',
    tyyppi: 'video',
    tiedosto: 'video-ankkuri.mp4',
    otsikko: 'Ikkunan tiivistys alk. 75 € — uusi ikkuna maksaisi 1 200 €',
    kuvaus: 'Kiinteä hinta. Kotitalousvähennys −40 %. Oma porukka, ei alihankintaa.',
    teksti: ANKKURI_TEKSTI,
  },
  {
    nimi: 'TK56 - Video säästö 10-15 %',
    tyyppi: 'video',
    tiedosto: 'video-menetys.mp4',
    otsikko: 'Vetävä ikkuna maksaa 10–15 % lämmityksestä',
    kuvaus: 'Tiivistys alk. 75 €. Kotitalousvähennys −40 %. Oma porukka.',
    teksti: SAASTO_TEKSTI,
  },
];

/* Pois paalta. TK38:n kuvatesti on ratkaistu, ja TK39:n kulman perii
   video-ankkuri uudella leikkauksella. TK37 EI ole tassa listassa:
   se jaa kontrolliksi, jotta tiedetaan johtuiko muutos mainoksista. */
const SAMMUTETTAVAT = ['TK38 - Ankkuri ikkuna (kuvatesti A', 'TK38 - Ankkuri ikkuna (kuvatesti B', 'TK39 - Video hinta-ankkuri'];

/* ---------- Graph-apurit ---------- */

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
/* Kuva ja video menevat multipartina, ja curl hoitaa sen luotettavammin
   kuin kasin kyhatty FormData isoille tiedostoille. */
function upload(polku, kentta, tiedosto) {
  const ulos = execFileSync('curl', ['-s', '-F', `${kentta}=@${tiedosto}`, '-F', `access_token=${TOK}`,
    `https://graph.facebook.com/${V}/${polku}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const j = JSON.parse(ulos);
  if (j.error) throw new Error(`${polku}: ${j.error.message}`);
  return j;
}

/* ---------- Ajo ---------- */

const adset = await get(ADSET, { fields: 'name,daily_budget,effective_status' });
const DOF = await haeDof();
const kaikki = await get(`${ACT}/ads`, { fields: 'id,name,effective_status', limit: '200' });
const sammuta = kaikki.data.filter((a) => a.effective_status === 'ACTIVE'
  && SAMMUTETTAVAT.some((s) => a.name.startsWith(s)));

console.log(`\nMeta-kierros 1 — ${APPLY ? 'TEHDÄÄN' : 'KUIVAHARJOITTELU (ei muuteta mitään)'}`);
console.log(`Mainosjoukko: ${adset.name}`);
console.log(`\n1. Budjetti ${Number(adset.daily_budget) / 100} € → ${BUDJETTI / 100} € /vrk`);
console.log(`\n2. Uudet mainokset (kaikki GET_QUOTE + lomake ${FORM}, IG ${IG}):`);
for (const u of UUDET) {
  const p = path.join(OUT, u.tiedosto);
  console.log(`     ${existsSync(p) ? '✓' : '✗ PUUTTUU'} ${u.nimi}  [${u.tyyppi}]  ${u.tiedosto}`);
}
console.log(`\n3. Sammutetaan ${sammuta.length}:`);
for (const a of sammuta) console.log(`     ${a.name}`);
console.log('\n4. TK37 jää päälle kontrolliksi.');

const puuttuu = UUDET.filter((u) => !existsSync(path.join(OUT, u.tiedosto)));
if (puuttuu.length) { console.error('\nMateriaalia puuttuu, keskeytetään.'); process.exit(1); }
if (!APPLY) { console.log('\nTee oikeasti: lisää --apply\n'); process.exit(0); }

console.log('\n--- ajetaan ---');

await post(ADSET, { daily_budget: BUDJETTI });
console.log(`  budjetti → ${BUDJETTI / 100} €/vrk`);

for (const u of UUDET) {
  const tiedosto = path.join(OUT, u.tiedosto);
  let story;

  if (u.tyyppi === 'kuva') {
    const r = upload(`${ACT}/adimages`, 'file', tiedosto);
    const hash = Object.values(r.images)[0].hash;
    story = { page_id: PAGE, instagram_user_id: IG, link_data: {
      link: `https://fb.me/${FORM}`, message: u.teksti, name: u.otsikko,
      description: u.kuvaus, image_hash: hash,
      call_to_action: { type: 'GET_QUOTE', value: { lead_gen_form_id: FORM } },
    } };
    console.log(`  kuva ladattu: ${hash}`);
  } else {
    const r = upload(`${ACT}/advideos`, 'source', tiedosto);
    const vid = r.id;
    /* Videon pikkukuva on pakko antaa image_hashina: video_data.image_url
       on vain luettava kentta eika POST hyvaksy sita. */
    const thumb = path.join(OUT, `thumb-${path.basename(u.tiedosto, '.mp4')}.jpg`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '0.35', '-i', tiedosto,
      '-frames:v', '1', '-q:v', '2', thumb]);
    const th = upload(`${ACT}/adimages`, 'file', thumb);
    const thash = Object.values(th.images)[0].hash;

    /* Odotetaan etta Meta on prosessoinut videon. Luovan luonti
       epaonnistuu hiljaisesti jos video on viela 'processing'. */
    for (let i = 0; i < 40; i++) {
      const s = await get(vid, { fields: 'status' });
      if (s.status?.video_status === 'ready') break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    story = { page_id: PAGE, instagram_user_id: IG, video_data: {
      video_id: vid, message: u.teksti, title: u.otsikko, link_description: u.kuvaus,
      image_hash: thash,
      /* Videolla linkki kuuluu call_to_actionin sisaan, ei ylos. */
      call_to_action: { type: 'GET_QUOTE', value: { link: `https://fb.me/${FORM}`, lead_gen_form_id: FORM } },
    } };
    console.log(`  video ladattu: ${vid}`);
  }

  const luova = await luoLuova(`${u.nimi} creative`, story, DOF);
  const mainos = await post(`${ACT}/ads`, {
    name: u.nimi, adset_id: ADSET, creative: { creative_id: luova.id }, status: 'ACTIVE',
  });
  console.log(`  ✓ ${u.nimi} → mainos ${mainos.id}`);
}

for (const a of sammuta) {
  await post(a.id, { status: 'PAUSED' });
  console.log(`  ✗ sammutettu: ${a.name}`);
}

/* ---------- Tarkistus ---------- */

console.log('\n--- tarkistus: mitä on päällä ---');
const jalkeen = await get(`${ACT}/ads`, {
  fields: 'name,effective_status,creative{instagram_user_id,call_to_action_type,object_story_spec}', limit: '200',
});
const as = await get(ADSET, { fields: 'daily_budget' });
console.log(`budjetti: ${Number(as.daily_budget) / 100} €/vrk\n`);
for (const a of jalkeen.data.filter((x) => x.effective_status === 'ACTIVE')) {
  const sp = a.creative?.object_story_spec || {};
  const ld = sp.link_data || sp.video_data || {};
  const cta = ld.call_to_action?.type || '-';
  const form = ld.call_to_action?.value?.lead_gen_form_id || '-';
  const ig = a.creative?.instagram_user_id || sp.instagram_user_id || 'PUUTTUU';
  console.log(`  ${a.name}`);
  console.log(`      CTA=${cta}  lomake=${form}  IG=${ig}${ig === IG ? ' ✓' : ' ← TARKISTA'}`);
}
