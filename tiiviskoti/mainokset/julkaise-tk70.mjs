#!/usr/bin/env node
/* TK70–72: uudet kuvat voittavasta hinta-ankkurikulmasta + tekstikorjaus (19.10.2026).

   Kaksi tapaa:
     node tiiviskoti/mainokset/julkaise-tk70.mjs            kuiva-ajo (oletus, ei muuta mitään)
     node tiiviskoti/mainokset/julkaise-tk70.mjs --live     TESTIJOUKKO: uusi mainosjoukko 10 €/pv,
                                                           TK29 30 → 20 €/pv (kokonaisbudjetti 30 €)
     ... --live --vaihda                                   VAIHDA: TK70–72 pääjoukkoon TK29,
                                                           TK39/TK55/TK65 pois, budjetti ennallaan

   Molemmissa: nyt pyörivien mainosten teksti korjataan ("…ja ikkunan käynti
   säädetään" pois — Josua 19.10.: ikkunoita ei säädetä). Metan creative on
   muuttumaton, joten korjaus = uusi creative samalla kuvalla/videolla ja
   mainos osoitetaan siihen.

   Uudet creativet kopioidaan TK37:n rakenteesta (sivu, @tiiviskoti-IG,
   liidilomake, url_tags), vain kuva ja teksti vaihtuvat. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(fs.readFileSync(path.join(HERE, '..', '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const T = env.META_CAPI_TOKEN, V = 'v23.0', ACT = 'act_205952163658187';
const LIVE = process.argv.includes('--live'), VAIHDA = process.argv.includes('--vaihda');

const PAA_JOUKKO = '120247977245210132';            // TK29 - Liidilomake (tekstikuvat)
const MALLI_AD = '120248139697990132';              // TK37 — creativen rakenne kopioidaan tästä
const KORJATTAVAT = {                               // nyt pyörivät
  '120248139697990132': 'TK37', '120248277568300132': 'TK39',
  '120248402794590132': 'TK55', '120248633338450132': 'TK65',
};
const POIS_VAIHDOSSA = ['120248277568300132', '120248402794590132', '120248633338450132']; // TK39, TK55, TK65
const UUDET = [
  ['TK70 - Asentaja ikkunalla (kuva)', 'mainos-tk70-asentaja-ikkuna.png'],
  ['TK71 - Ikkuna auki, tiiviste paikalleen (kuva)', 'mainos-tk71-ikkuna-auki.png'],
  ['TK72 - Lippis ikkunalla (kuva)', 'mainos-tk72-lippis.png'],
];
const OTSIKKO = 'Ikkunan tiivistys alk. 75 € — uusi ikkuna maksaisi 1 200 €';
const TEKSTI = `Lämmityskausi alkoi. Vetoinen ikkuna maksaa joka pakkaspäivä — ja ikkunaremontti maksaa tuhansia euroja.

Jos lasi ja karmi ovat ehjät, riittää että tiivisteet uusitaan.

Ikkunan tiivistys alkaen 75 €, ja mitä useampi ikkuna kerralla, sitä halvempi kappalehinta. Pienin käynti 149 €, joka sisältää käynnin, matkat ja lämpökamerakuvauksen. Näet summan ennen kuin päätät.

Jätä numerosi, niin lasketaan hinta sinun ikkunoillesi. Sanomme suoraan, jos tiivistys ei sinun kohdallasi riitä.`;
/* Korjaus olemassa oleviin teksteihin: säätölupaus pois, muu ennallaan. */
const korjaa = (s) => s.replace(/ ja ikkunan käynti säädetään\./g, '.').replace(/ ja käynti säädetään\./g, '.');

const api = async (method, p, params = {}) => {
  const url = new URL(`https://graph.facebook.com/${V}/${p}`);
  const body = new URLSearchParams({ access_token: T });
  for (const [k, v] of Object.entries(params)) (method === 'GET' ? url.searchParams : body).set(k, typeof v === 'string' ? v : JSON.stringify(v));
  if (method === 'GET') url.searchParams.set('access_token', T);
  const r = await fetch(url, method === 'GET' ? {} : { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`${p}: ${j.error.message} ${j.error.error_user_msg ?? ''}`);
  return j;
};
const teko = async (kuvaus, fn) => { console.log((LIVE ? '▶ ' : '· (kuiva) ') + kuvaus); return LIVE ? fn() : null; };

const malli = (await api('GET', MALLI_AD, { fields: 'creative{object_story_spec,url_tags}' })).creative;
const oss = malli.object_story_spec;
if (!oss?.link_data?.call_to_action?.value?.lead_gen_form_id) throw new Error('TK37:n creativesta ei löytynyt liidilomaketta');
if (oss.instagram_user_id !== '17841437143913657') console.warn('⚠ mallin IG-identiteetti ei ole @tiiviskoti — tarkista');

/* 1. Tekstikorjaus nyt pyöriviin (vaihdossa vain niihin jotka jäävät päälle). */
for (const [adId, nimi] of Object.entries(KORJATTAVAT)) {
  if (VAIHDA && POIS_VAIHDOSSA.includes(adId)) continue;
  const c = (await api('GET', adId, { fields: 'creative{object_story_spec,url_tags}' })).creative;
  const spec = structuredClone(c.object_story_spec);
  const kohde = spec.link_data ?? spec.video_data;
  const uusi = korjaa(kohde.message);
  if (uusi === kohde.message) { console.log(`= ${nimi}: teksti jo kunnossa`); continue; }
  kohde.message = uusi;
  if (spec.video_data) delete spec.video_data.image_url; // Meta palauttaa sekä hashin että urlin; vain toinen sallittu
  await teko(`${nimi}: uusi creative korjatulla tekstillä ja mainos siihen`, async () => {
    const cr = await api('POST', `${ACT}/adcreatives`, { name: `${nimi} teksti korjattu 19.10.`, object_story_spec: spec, ...(c.url_tags ? { url_tags: c.url_tags } : {}) });
    await api('POST', adId, { creative: { creative_id: cr.id } });
  });
}

/* 2. Mainosjoukko uusille. */
let joukko = PAA_JOUKKO;
if (!VAIHDA) {
  const s = await api('GET', PAA_JOUKKO, { fields: 'campaign_id,optimization_goal,billing_event,bid_strategy,promoted_object,targeting,destination_type' });
  const r = await teko('uusi mainosjoukko "TK70 - Uudet kuvat (testi)" 10 €/pv, asetukset TK29:stä', () =>
    api('POST', `${ACT}/adsets`, {
      name: 'TK70 - Uudet kuvat (testi)', campaign_id: s.campaign_id, daily_budget: '1000', status: 'ACTIVE',
      optimization_goal: s.optimization_goal, billing_event: s.billing_event, targeting: s.targeting,
      ...(s.bid_strategy ? { bid_strategy: s.bid_strategy } : {}), ...(s.promoted_object ? { promoted_object: s.promoted_object } : {}),
      ...(s.destination_type ? { destination_type: s.destination_type } : {}),
    }));
  joukko = r?.id ?? '(uusi joukko)';
  await teko('TK29 30 → 20 €/vrk (kokonaisbudjetti pysyy 30 €)', () => api('POST', PAA_JOUKKO, { daily_budget: '2000' }));
}

/* 3. Uudet mainokset. */
for (const [nimi, png] of UUDET) {
  const tiedosto = path.join(HERE, 'out', png);
  if (!fs.existsSync(tiedosto)) throw new Error(`puuttuu ${tiedosto} — aja render.mjs`);
  await teko(`${nimi}: kuva + creative + mainos joukkoon ${VAIHDA ? 'TK29' : 'TK70-testi'}`, async () => {
    const img = await api('POST', `${ACT}/adimages`, { bytes: fs.readFileSync(tiedosto).toString('base64') });
    const hash = Object.values(img.images)[0].hash;
    const spec = structuredClone(oss);
    spec.link_data.image_hash = hash; delete spec.link_data.picture;
    spec.link_data.message = TEKSTI; spec.link_data.name = OTSIKKO;
    const cr = await api('POST', `${ACT}/adcreatives`, { name: nimi, object_story_spec: spec, ...(malli.url_tags ? { url_tags: malli.url_tags } : {}) });
    await api('POST', `${ACT}/ads`, { name: nimi, adset_id: joukko, creative: { creative_id: cr.id }, status: 'ACTIVE' });
  });
}

/* 4. Vaihdossa vanhat pois. */
if (VAIHDA) for (const id of POIS_VAIHDOSSA) await teko(`${KORJATTAVAT[id]} pois päältä`, () => api('POST', id, { status: 'PAUSED' }));

console.log(LIVE ? '\nValmis. Uudet mainokset ovat ensin tarkistuksessa (IN_PROCESS) noin tunnin.' : '\nKuiva-ajo: mitään ei muutettu. Lisää --live julkaistaksesi.');
