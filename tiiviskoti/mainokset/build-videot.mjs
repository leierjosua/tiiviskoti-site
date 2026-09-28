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

/* Puhtaat jaksot lähdevideosta. Rajat on vedetty hieman sisäänpäin
   todellisista, jotta tekstin häivytys ei vilahda reunoilla. */
const PALA = {
  avaus:    [0.35, 3.30],   // asentaja kurottaa ikkunalle, laaja
  massa:    [9.25, 11.55],  // lippalakki ja massapuristin lähellä
  /* Rajaus on tarkoituksella tiukka: 15,3-17,0 s on asentajan kasvot
     lahikuvassa, ja kadet tulevat vasta 17,1 s jalkeen. Josua ei halua
     pelkkia kasvokuvia, ja videon ENSIMMAINEN RUUTU on sen pikkukuva —
     eli vaara aloitus on sama virhe kuin kasvomainos. */
  uraan:    [17.15, 18.45], // tiiviste painetaan uraan — paras makro
  kasi:     [22.65, 26.30], // käsi karmilla, asentaja ikkunan ääressä
};

/* Jokaiselle kulmalle oma leikkaus. Sama materiaali, eri järjestys:
   kulma ratkaisee millä kuvalla aloitetaan. Tiivistysmakro ensin
   silloin kun väite koskee itse työtä, laaja kuva silloin kun väite
   koskee koko taloa. */
const VIDEOT = [
  { nimi: 'video-ankkuri',   overlay: 'overlay-ankkuri',
    palat: ['massa', 'uraan', 'avaus'],
    miksi: 'Ankkuri: työ ensin, koska väite on ikkunan hinnasta.' },
  { nimi: 'video-prosentti', overlay: 'overlay-prosentti',
    palat: ['avaus', 'uraan', 'kasi'],
    miksi: 'Suhdeluku: laaja kuva ensin, koska väite koskee koko taloa.' },
  { nimi: 'video-menetys',   overlay: 'overlay-menetys',
    palat: ['kasi', 'avaus', 'massa'],
    miksi: 'Menetys: käsi karmilla ensin — kohta josta vetää.' },
  { nimi: 'video-euro',      overlay: 'overlay-euro',
    palat: ['massa', 'kasi', 'uraan'],
    miksi: 'Euro: työ käynnissä ensin, luku tulee tekstistä.' },
];

const FADE_IN = 0.4;
const FADE_OUT = 0.5;

for (const v of VIDEOT) {
  const ov = path.join(OUT, `${v.overlay}.png`);
  if (!existsSync(ov)) {
    console.error(`✗ tekstitaso puuttuu: ${ov}\n  aja ensin: RENDER_ALPHA=1 node tiiviskoti/mainokset/render.mjs ${v.overlay}`);
    continue;
  }

  const kesto = v.palat.reduce((s, p) => s + (PALA[p][1] - PALA[p][0]), 0);
  const trims = v.palat.map((p, i) =>
    `[0:v]trim=start=${PALA[p][0]}:end=${PALA[p][1]},setpts=PTS-STARTPTS[p${i}]`).join(';');
  const labels = v.palat.map((_, i) => `[p${i}]`).join('');

  const filter = [
    trims,
    `${labels}concat=n=${v.palat.length}:v=1:a=0[cat]`,
    `[cat]scale=1080:1350,fps=30,fade=t=in:st=0:d=${FADE_IN},fade=t=out:st=${(kesto - FADE_OUT).toFixed(2)}:d=${FADE_OUT}[base]`,
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
