#!/usr/bin/env node
/* Palauta 28.9.–4.10. voittoviikon kokoonpano YHDELLÄ muutoksella (19.10.2026).
   Voittoviikko: TK37 + TK53 + TK55, 45 €/vrk → 15 liidiä, 21 €/liidi.

   Tekee:
   - TK37, TK53, TK55 päälle — tekstistä pois "…ja ikkunan käynti säädetään"
     (uusi creative samalla kuvalla/videolla, mainos osoitetaan siihen)
   - TK39 ja TK65 pois (eivät olleet voittoviikolla mukana; TK39 vei 19.10. 75 % budjetista)
   - TK29 → 45 €/vrk

   node tiiviskoti/mainokset/palauta-voittajat.mjs          kuiva-ajo
   node tiiviskoti/mainokset/palauta-voittajat.mjs --live   tekee muutokset */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(fs.readFileSync(path.join(HERE, '..', '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const T = env.META_CAPI_TOKEN, V = 'v23.0', ACT = 'act_205952163658187', LIVE = process.argv.includes('--live');
const JOUKKO = '120247977245210132';
const PAALLE = { '120248139697990132': 'TK37', '120248402790760132': 'TK53', '120248402794590132': 'TK55' };
const POIS = { '120248277568300132': 'TK39', '120248633338450132': 'TK65' };

const api = async (method, p, params = {}) => {
  const body = new URLSearchParams({ access_token: T });
  for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const r = method === 'GET'
    ? await fetch(`https://graph.facebook.com/${V}/${p}${p.includes('?') ? '&' : '?'}access_token=${T}`)
    : await fetch(`https://graph.facebook.com/${V}/${p}`, { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`${p}: ${j.error.message} ${j.error.error_user_msg ?? ''}`);
  return j;
};
const teko = async (k, fn) => { console.log((LIVE ? '▶ ' : '· (kuiva) ') + k); return LIVE ? fn() : null; };

for (const [id, nimi] of Object.entries(PAALLE)) {
  const c = (await api('GET', `${id}?fields=creative{object_story_spec,url_tags}`)).creative;
  const spec = structuredClone(c.object_story_spec);
  const kohde = spec.link_data ?? spec.video_data;
  const uusi = kohde.message.replace(/ ja ikkunan käynti säädetään\./g, '.').replace(/ ja käynti säädetään\./g, '.');
  if (uusi !== kohde.message) {
    kohde.message = uusi;
    if (spec.video_data?.image_hash) delete spec.video_data.image_url;
    await teko(`${nimi}: teksti korjattu (ei ikkunan säätöä) + päälle`, async () => {
      const cr = await api('POST', `${ACT}/adcreatives`, { name: `${nimi} teksti korjattu 19.10.`, object_story_spec: spec, ...(c.url_tags ? { url_tags: c.url_tags } : {}) });
      await api('POST', id, { creative: { creative_id: cr.id }, status: 'ACTIVE' });
    });
  } else {
    await teko(`${nimi}: päälle`, () => api('POST', id, { status: 'ACTIVE' }));
  }
}
for (const [id, nimi] of Object.entries(POIS)) await teko(`${nimi}: pois`, () => api('POST', id, { status: 'PAUSED' }));
await teko('TK29 → 45 €/vrk', () => api('POST', JOUKKO, { daily_budget: '4500' }));

if (LIVE) {
  const ads = await api('GET', `${JOUKKO}/ads?fields=name,status,effective_status&limit=50`);
  console.log('\nPäällä nyt:', ads.data.filter((a) => a.status === 'ACTIVE').map((a) => `${a.name} [${a.effective_status}]`).join(' | '));
  console.log('Korjatut mainokset ovat tarkistuksessa (IN_PROCESS) noin tunnin.');
} else console.log('\nKuiva-ajo: mitään ei muutettu. Lisää --live.');
