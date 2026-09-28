#!/usr/bin/env node
/* =========================================================
   Videomainokset samoista kulmista kuin still-mainokset.

   LAHDE: _lahde/notext_4x5.mov, EI tiiviskoti-ikkuna-4x5.mp4.
   Tama on tarkein rivi tassa tiedostossa. Tein videot ensin valmiista
   exportista, jossa myyntiteksti on poltettu kuvaan, ja kiersin sita
   tekstia kunnes kaytettavaa materiaalia oli 2,7 s. _lahde-kansiossa
   oli koko ajan master joka on TAYSIN tekstiton 0-23,5 s; vain
   loppuruutu (varauskortti, n. 24 s ->) on poltettu molempiin.
   Jos jatkat tasta: tarkista AINA onko _lahdetta olemassa ennen kuin
   alat kiertaa poltettua tekstia.

   MIKSI TEKSTI ON PNG EIKA drawtext: ffmpegin drawtext ei osaa Manropen
   kirjainvaleja eika monirivista latoa, ja lopputulos eroaisi
   still-mainoksista. Tekstitaso renderoidaan samasta HTML-pohjasta
   lapinakyvana (RENDER_ALPHA=1), jolloin videon ja kuvan lato on
   TASMALLEEN sama ja ero mainosten valilla on vain liike.

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
const SRC = path.join(homedir(), 'Desktop', 'tiiviskoti-mainosvideot', '_lahde', 'notext_4x5.mov');

if (!existsSync(SRC)) { console.error(`Lähdevideo puuttuu: ${SRC}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

/* Josua valitsi otokset nimelta: ikkunan avaus ja tiivisteen asennus.
   Rajat venytetty niin pitkalle kuin otos pysyy samana ja teravana.

   Puhtaassa masterissa on paljon muutakin kaytettavaa (tiivistenauha
   kadessa 4,5-6 s, saumapuristin 8-9 s ja 13,5-15 s), mutta naissa
   pitaydytaan kahdessa otoksessa: Josua sanoi etta kolme palaa oli
   liikaa ja vaihdot liian nopeita. */
const PALA = {
  avaus:    [0.05, 3.90],   // kasi tyontaa puitteen auki, laaja - 3,85 s
  tiiviste: [17.00, 18.85], // SORMI PAINAA TIIVISTETTA PYSTYURAAN - 1,85 s
};
const PALAT = ['avaus', 'tiiviste'];

/* KAIKISSA SAMA KUVA, ERI TEKSTI. Kun kuva on vakio, ero tuloksissa
   kertoo vaitteesta eika materiaalista. Jarjestys avaus -> tiiviste:
   laaja avaa tilanteen ja makro jaa paalle korjauksena. */
const VIDEOT = [
  { nimi: 'video-ankkuri',   overlay: 'overlay-ankkuri',   miksi: 'Ankkuri: ikkunan tiivistys alk. 75 e.' },
  { nimi: 'video-prosentti', overlay: 'overlay-prosentti', miksi: 'Suhdeluku: 8 % remontista.' },
  { nimi: 'video-menetys',   overlay: 'overlay-menetys',   miksi: 'Menetys: 10-15 % lammityksesta.' },
  { nimi: 'video-euro',      overlay: 'overlay-euro',      miksi: 'Euro: 200-300 e vuodessa.' },
];

/* PITKA ristihaivytys. 0,35 s luki Josualle yha "todella sharppina":
   otokset ovat visuaalisesti kaukana toisistaan (laaja huone vs.
   kasimakro), joten lyhyt haivytys nayttaa silti leikkaukselta.
   0,80 s on sulautus eika siirtyma. Pidempaan ei kannata menna:
   urapala on 1,85 s, ja 0,90 s haivytys sois siita jo niin ison osan
   ettei itse tyota ehdi nahda teravana. */
const XFADE = 0.80;

/* Lahde on 25 fps. Ala aja sita lapi muulla ruutunopeudella: 25->30
   monistaa joka viidennen ruudun ja nykii. Samasta syysta ei myoskaan
   hidastusta ilman liikkeen interpolointia. */
const FPS = 25;

const FADE_IN = 0.25;
const FADE_OUT = 0.35;

/* Musiikki tulee lahteen omasta aaniraidasta - sama kappale joka on
   muissakin TiivisKoti-videoissa. Tarkistettu spektrogrammista ettei
   raidalla ole puhetta vaan tasainen rytminen musiikki. Otetaan
   kappaleen ALUSTA, jolloin aloitus osuu musiikin omaan alkuun eika
   keskelle tahtia. */
const MUSA_ALKU = 0.0;
const MUSA_TASO = 0.5;   // n. -6 dB: kuuluu, muttei peita mitaan
const MUSA_OUT = 0.8;

for (const v of VIDEOT) {
  const ov = path.join(OUT, `${v.overlay}.png`);
  if (!existsSync(ov)) {
    console.error(`✗ tekstitaso puuttuu: ${ov}\n  aja ensin: RENDER_ALPHA=1 node tiiviskoti/mainokset/render.mjs ${v.overlay}`);
    continue;
  }

  const kestot = PALAT.map((p) => PALA[p][1] - PALA[p][0]);
  const kesto = kestot.reduce((a, b) => a + b, 0) - XFADE * (PALAT.length - 1);

  /* Jokainen pala omaksi haarakseen: rajaus, koko ja ruutunopeus on
     pakko yhtenaistaa ennen xfadea, muuten se kieltaytyy. */
  const haarat = PALAT.map((p, i) =>
    `[0:v]trim=start=${PALA[p][0]}:end=${PALA[p][1]},setpts=PTS-STARTPTS,` +
    `scale=1080:1350,fps=${FPS},format=yuv420p[c${i}]`).join(';');

  /* xfaden offset lasketaan YHDISTETYN virran alusta, ei palan alusta:
     jokainen haivytys lyhentaa tulosta XFADEn verran. */
  const ketju = [];
  let edellinen = 'c0';
  let pituus = kestot[0];
  for (let i = 1; i < PALAT.length; i++) {
    const ulos = i === PALAT.length - 1 ? 'cat' : `x${i}`;
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
    /* Musiikki YHTENA yhtenaisena palana. Jos sen leikkaisi kuvan
       mukana kahtia, saumaan tulisi naksahdus. */
    `[0:a]atrim=start=${MUSA_ALKU}:end=${(MUSA_ALKU + kesto).toFixed(3)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=0.3,afade=t=out:st=${(kesto - MUSA_OUT).toFixed(2)}:d=${MUSA_OUT},` +
      `volume=${MUSA_TASO},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`,
  ].join(';');

  const dest = path.join(OUT, `${v.nimi}.mp4`);
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y',
    '-i', SRC, '-i', ov,
    '-filter_complex', filter,
    '-map', '[out]', '-map', '[aout]',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    dest,
  ], { stdio: 'inherit' });

  console.log(`✓ ${v.nimi}.mp4  ${kesto.toFixed(1)} s  (${PALAT.join(' → ')}) + musiikki`);
  console.log(`   ${v.miksi}`);
}
