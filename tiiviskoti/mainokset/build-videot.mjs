#!/usr/bin/env node
/* =========================================================
   Videomainokset samoista kulmista kuin still-mainokset.

   MIKSI LEIKKEITÄ EIKÄ KOKO VIDEOTA: valmiissa exporteissa
   (tiiviskoti-ikkuna-4x5.mp4) on teksti poltettuna kuvaan, ja
   raakamateriaali on kadonnut. Käyttökelpoista on siis vain se osa
   jossa tekstiä ei näy. Kartoitin ne ruutu ruudulta 28.9.2026 —
   neljä puhdasta jaksoa, yhteensä noin 13 sekuntia.

   MIKSI TEKSTI ON PNG EIKÄ drawtext: ffmpegin drawtext ei osaa Manropen
   kirjainvälejä eikä monirivistä latoa, ja lopputulos eroaisi
   still-mainoksista. Tekstitaso renderöidään samasta HTML-pohjasta
   läpinäkyvänä (RENDER_ALPHA=1), jolloin videon ja kuvan lato on
   TÄSMÄLLEEN sama ja ero mainosten välillä on vain liike.

   Sanamuodot ovat samat kuin vastaavissa still-mainoksissa. Se on
   tarkoituksellista: kun video ja kuva testaavat samaa väitettä, ero
   kertoo formaatista eikä sanavalinnasta.

   Aja repon juuresta:
     node tiiviskoti/mainokset/build-videot.mjs
   ========================================================= */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const SRC = path.join(homedir(), 'Desktop', 'tiiviskoti-mainosvideot', 'tiiviskoti-ikkuna-4x5.mp4');

if (!existsSync(SRC)) { console.error(`Lähdevideo puuttuu: ${SRC}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

/* Puhtaat jaksot lahdevideosta, kartoitettu 0,22-0,25 s tarkkuudella.
   Rajat vedetty sisaanpain siita mihin vanhan tekstin HAIVYTYS alkaa.
   Tarkista aina KIRKASTETTUNA, haamu ei nay tavallisesta ruudusta:
     ffmpeg -ss <t> -i lahde.mp4 -frames:v 1 \
       -vf "eq=brightness=0.13:contrast=1.3" tarkistus.jpg

   MITEN VAHAN TYOTA TASSA OIKEASTI ON. Kartoitin jaksot uudelleen
   ruutu ruudulta, ja aiempi merkintani oli vaara:
     - 7,6-9,4 s on paras otos (kasi pitelee saumamassaputkiloa
       makrona) mutta vanha teksti on poltettu sen paalle -> EI KAYTTOON.
     - 9,55-11,20 s ei ole massan puristusta vaan LIPPALAKKI taytta
       ruutua. Puristin nakyy reunassa osittain. Kelpaa brandiotokseksi,
       ei tyootokseksi. Rajaaminen ei auta: lahde on 1080x1350 eli
       rajaus jouduttaisiin skaalaamaan yli 1,5x ja se sumenisi.
     - 4,10-4,68 s (tiiviste kadessa) on 0,58 s eli lyhyempi kuin kaksi
       ristihaivytysta -> ei ehdi nakya teravana. Pois.
   Aitoa tiivistystyota on siis vain uraan (1,55 s) ja kasi (1,10 s),
   plus laaja avaus. Enempaa ei tasta materiaalista saa irti - lisaa
   tyokuvaa varten pitaa kuvata uutta. */
const PALA = {
  avaus: [0.35, 3.90],   // laaja: asentaja tiivistaa ikkunaa, koko tyotilanne nakyy
  massa: [9.55, 11.20],  // lippalakki taytta ruutua, saumapuristin oikeassa reunassa
  uraan: [17.15, 18.70], // KASI PAINAA TIIVISTETTA karmiin - ainoa oikea tyomakro
  kasi:  [23.00, 24.10], // kasi karmilla, laveampi; 24,1 jalkeen han vain seisoo profiilissa
};
/* Jokaiselle kulmalle oma leikkaus. Sama materiaali, eri järjestys:
   kulma ratkaisee millä kuvalla aloitetaan. Tiivistysmakro ensin
   silloin kun väite koskee itse työtä, laaja kuva silloin kun väite
   koskee koko taloa. */
const VIDEOT = [
  { nimi: 'video-ankkuri',   overlay: 'overlay-ankkuri',
    palat: ['uraan', 'avaus', 'massa'],
    miksi: 'Ankkuri: tyomakro koukuksi, koska vaite koskee tyon hintaa.' },
  { nimi: 'video-prosentti', overlay: 'overlay-prosentti',
    palat: ['avaus', 'uraan', 'kasi'],
    miksi: 'Suhdeluku: laaja avaa, koska vaite koskee koko remonttia.' },
  { nimi: 'video-menetys',   overlay: 'overlay-menetys',
    palat: ['avaus', 'massa', 'uraan'],
    miksi: 'Menetys: paattyy tyomakroon eli korjaukseen.' },
  { nimi: 'video-euro',      overlay: 'overlay-euro',
    palat: ['uraan', 'massa', 'avaus'],
    miksi: 'Euro: makro koukuksi, laaja jattaa luvun paalle.' },
];

/* Ristihäivytys kovan leikkauksen tilalle. Klipit ovat lyhyitä, joten
   kova leikkaus kolmen otoksen välillä luki välähdyksenä — pehmeä
   siirtymä sitoo ne yhdeksi otokseksi ja antaa katsojan pysyä mukana. */
const XFADE = 0.35;

/* EI HIDASTUSTA. Lahde on 25 fps, ja hidastus ilman liikkeen
   interpolointia monistaa ruutuja epatasaisesti - juuri sita nykimista
   jota Josua moitti. Palat ovat nyt niin pitkia ettei venyttamista
   tarvita. Samasta syysta ulostulo on 25 fps eika 30: 25->30 monistaa
   joka viidennen ruudun. */
const FPS = 25;

const FADE_IN = 0.4;
const FADE_OUT = 0.5;

for (const v of VIDEOT) {
  const ov = path.join(OUT, `${v.overlay}.png`);
  if (!existsSync(ov)) {
    console.error(`✗ tekstitaso puuttuu: ${ov}\n  aja ensin: RENDER_ALPHA=1 node tiiviskoti/mainokset/render.mjs ${v.overlay}`);
    continue;
  }

  const kestot = v.palat.map((p) => PALA[p][1] - PALA[p][0]);
  const kesto = kestot.reduce((a, b) => a + b, 0) - XFADE * (v.palat.length - 1);

  /* Jokainen pala omaksi haarakseen: rajaus, nopeus, koko ja ruutunopeus
     on pakko yhtenäistää ennen xfadea, muuten se kieltäytyy. */
  const haarat = v.palat.map((p, i) =>
    `[0:v]trim=start=${PALA[p][0]}:end=${PALA[p][1]},setpts=PTS-STARTPTS,` +
    `scale=1080:1350,fps=${FPS},format=yuv420p[c${i}]`).join(';');

  /* xfaden offset lasketaan YHDISTETYN virran alusta, ei palan alusta:
     jokainen häivytys lyhentää tulosta XFADEn verran, ja seuraava
     offset on siksi kumulatiivinen. Tämä on se kohta joka menee
     helposti pieleen ja näkyy nykäyksenä. */
  const ketju = [];
  let edellinen = 'c0';
  let pituus = kestot[0];
  for (let i = 1; i < v.palat.length; i++) {
    const ulos = i === v.palat.length - 1 ? 'cat' : `x${i}`;
    ketju.push(`[${edellinen}][c${i}]xfade=transition=fade:duration=${XFADE}:offset=${(pituus - XFADE).toFixed(3)}[${ulos}]`);
    pituus = pituus + kestot[i] - XFADE;
    edellinen = ulos;
  }

  const filter = [
    haarat,
    ...ketju,
    `[cat]fade=t=in:st=0:d=${FADE_IN},fade=t=out:st=${(kesto - FADE_OUT).toFixed(2)}:d=${FADE_OUT}[base]`,
    `[1:v]scale=1080:1350[ov]`,
    `[base][ov]overlay=0:0:format=auto,format=yuv420p[out]`,
  ].join(';');

  const dest = path.join(OUT, `${v.nimi}.mp4`);
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y',
    '-i', SRC, '-i', ov,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-movflags', '+faststart',
    '-an',
    dest,
  ], { stdio: 'inherit' });

  console.log(`✓ ${v.nimi}.mp4  ${kesto.toFixed(1)} s  (${v.palat.join(' → ')})`);
  console.log(`   ${v.miksi}`);
}
