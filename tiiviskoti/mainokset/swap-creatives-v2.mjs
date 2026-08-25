#!/usr/bin/env node
/* Vaihtaa 25.8. korjatut aineistot elävien mainosten alle SAMOILLE mainoksille.
 * Mainos-id säilyy → tykkäykset ja kommentit säilyvät.
 *
 * Creativea EI voi muokata, se on korvattava. Resepti (ks. muisti):
 *  1. hae vanha creative: url_tags + degrees_of_freedom_spec talteen
 *  2. rakenna uusi object_story_spec uudella medialla
 *  3. POISTA video_data.image_url — vain luku, kaataa luonnin
 *  4. POST /adcreatives  MUKAAN url_tags (muuten mainostason attribuutio
 *     katoaa) ja alkuperäinen degrees_of_freedom_spec (siinä ovat
 *     Advantage+ opt-outit; ilman niitä Meta voi ylikirjoittaa CTA:n)
 *  5. POST /{ad} creative={creative_id}
 *
 * Vaihto palauttaa mainoksen arvioon muutamaksi minuutiksi (IN_PROCESS).
 *
 * Aineistot luetaan kansiosta out/v2/, joka EI ole repossa (samat tiedostot
 * ovat out/ ja video/remotion/out/ alla). Vaihe ennen ajoa:
 *   mkdir -p out/v2
 *   for n in kortti-*; cp video/remotion/out/$n-valmis.mp4 out/v2/$n-v2.mp4
 *   cp out/thumbs/$n.jpg out/v2/$n-v2.jpg
 *   cp out/mainos-<nimi>.png out/v2/mainos-<nimi>-v2.png
 *
 * Aja: node tiiviskoti/mainokset/swap-creatives-v2.mjs [--live]
 */
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const TOKEN = env.match(/^META_CAPI_TOKEN=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const LIVE = process.argv.includes('--live');
const V='v21.0', ACT='act_205952163658187';
const g=(p)=>`https://graph.facebook.com/${V}/${p}`;

const JOBS = [
  { ad:'TK27 - Kortti veto',        video:'kortti-veto-v2' },
  { ad:'TK27 - Kortti hinta',       video:'kortti-hinta-v2' },
  { ad:'TK27 - Kortti käynti',      video:'kortti-saasto-v2' },
  { ad:'TK27 - Kortti varaus',      video:'kortti-koti-v2' },
  { ad:'TK27 - Taloyhtiö asukas',   video:'kortti-taloyhtio-v2' },
  { ad:'TK27 - Taloyhtiö hallitus', video:'kortti-taloyhtio-kartoitus-v2' },
  { ad:'TK27 - Rako',               image:'mainos-t1-rako-v2.png' },
  { ad:'TK27 - Lämmityskulu',       image:'mainos-t2-lampo-v2.png' },
];

async function post(url, params){
  const r=await fetch(url,{method:'POST',body:new URLSearchParams({...params,access_token:TOKEN})});
  const j=await r.json().catch(()=>({}));
  if(j.error) throw new Error(`${j.error.message} (${j.error.code}${j.error.error_subcode?'/'+j.error.error_subcode:''})`);
  return j;
}
const get=async(u)=>(await fetch(u)).json();
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

async function uploadImage(rel){
  const fd=new FormData(); fd.append('access_token',TOKEN);
  const name=path.basename(rel);
  fd.append('filename',new Blob([fs.readFileSync(path.join(__dirname,'out','v2',rel))]),name);
  const j=await(await fetch(g(`${ACT}/adimages`),{method:'POST',body:fd})).json();
  if(j.error) throw new Error(j.error.message);
  return j.images[name].hash;
}
async function uploadVideo(rel){
  const fd=new FormData(); fd.append('access_token',TOKEN);
  const name=path.basename(rel);
  fd.append('source',new Blob([fs.readFileSync(path.join(__dirname,'out','v2',rel))]),name);
  const j=await(await fetch(g(`${ACT}/advideos`),{method:'POST',body:fd})).json();
  if(j.error) throw new Error(j.error.message);
  for(let i=0;i<90;i++){
    const s=await get(g(`${j.id}?fields=status&access_token=${TOKEN}`));
    const st=s.status?.video_status;
    if(st==='ready') return j.id;
    if(st==='error') throw new Error('videon käsittely epäonnistui: '+name);
    await sleep(5000);
  }
  throw new Error('videon käsittely ei valmistunut: '+name);
}

const ADSETS=['120247886647400132','120247886647840132','120247902169790132','120247902170770132'];
async function findAds(){
  const map={};
  for(const as of ADSETS){
    const d=await get(g(`${as}/ads?fields=name,creative&limit=50&access_token=${TOKEN}`));
    for(const a of d.data||[]) map[a.name]={id:a.id,creative:a.creative?.id};
    await sleep(2000);
  }
  return map;
}

const ads=await findAds();
if(!LIVE){
  console.log('KUIVA-AJO — lisää --live\n');
  for(const j of JOBS) console.log(`  ${j.ad.padEnd(30)} ${ads[j.ad]?'ad '+ads[j.ad].id:'EI LÖYDY'}  ← ${j.video||j.image}`);
  process.exit(0);
}
for(const j of JOBS){
  const hit=ads[j.ad];
  if(!hit){ console.log(`✗ ei löydy: ${j.ad}`); continue; }
  try{
    const old=await get(g(`${hit.creative}?fields=url_tags,object_story_spec,degrees_of_freedom_spec&access_token=${TOKEN}`));
    const oss=JSON.parse(JSON.stringify(old.object_story_spec||{}));
    if(j.video){
      const vid=await uploadVideo(j.video+'.mp4');
      const th=await uploadImage(j.video+'.jpg');
      oss.video_data.video_id=vid; oss.video_data.image_hash=th;
      delete oss.video_data.image_url;          // vain luku, kaataa luonnin
    }else{
      oss.link_data.image_hash=await uploadImage(j.image);
      delete oss.link_data.picture;
    }
    const params={ name:`${j.ad} — creative v2`, object_story_spec:JSON.stringify(oss) };
    if(old.url_tags) params.url_tags=old.url_tags;
    if(old.degrees_of_freedom_spec) params.degrees_of_freedom_spec=JSON.stringify(old.degrees_of_freedom_spec);
    const cr=await post(g(`${ACT}/adcreatives`),params);
    await post(g(hit.id),{creative:JSON.stringify({creative_id:cr.id})});
    console.log(`✓ ${j.ad}  → creative ${cr.id}`);
  }catch(e){ console.log(`✗ ${j.ad}: ${e.message}`); }
  await sleep(2000);
}
