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
  avaus:      [1.90, 3.90],   // ikkunan avaus, laaja - LYHENNETTY 3,85 -> 2,00 s
  massaLaaja: [11.55, 13.20], // saumapuristin karmia pitkin, profiili - 1,65 s
  massaLahi:  [13.32, 15.05], // sama tyo lahempaa - 1,73 s
  uraPysty:   [17.00, 18.85], // tiiviste painetaan PYSTYURAAN - 1,85 s
  uraAla:     [18.95, 20.70], // tiiviste painetaan ALAKARMIIN - 1,75 s
};

/* KOLME OSIOTA, EI VIITTA LEIKKAUSTA. Josua halusi massan laitosta ja
   tiivisteesta pidempaa ja avauksesta lyhyempaa. Yksittaiset otokset
   ovat kaikki vain 1,6-1,9 s, joten pituutta saa vain liittamalla
   kaksi rajausta samasta tyosta yhteen.

   Siksi haivytyksia on kahta pituutta:
     0,55 s OSIOIDEN valilla (ikkuna -> massa -> tiiviste). Iso
       visuaalinen hyppy, tarvitsee kunnon sulautuksen.
     0,25 s OSION SISALLA (laaja -> lahi samasta tyosta). Kuva on
       melkein sama, joten lyhyt sulautus riittaa peittamaan leikkauksen
       ja osio lukee yhtena jatkuvana otoksena.
   Katsojalle tama on kolme kuvaa, ei viitta.

   ALA KAYTA 20,9 s ETEENPAIN: siina leikataan nauhaa saksilla.
   ALA KAYTA 4,05-6,30: kasi vain pitelee nauhaa, tuotekuva eika tyota. */
const PALAT = [
  { p: 'avaus' },
  { p: 'massaLaaja', hv: 1.20 },
  { p: 'massaLahi',  hv: 0.45 },
  { p: 'uraPysty',   hv: 1.20 },
  { p: 'uraAla',     hv: 0.45 },
];

/* KEVYT HIDASTUS, JOTTA HAIVYTYKSET MAHTUVAT. Josua on sanonut kolme
   kertaa etta vaihdot ovat liian nopeita. Olin menossa vaaraan
   suuntaan: lyhensin niita 0,90 -> 0,55, koska palat ovat lyhyita
   eivatka kestaneet pitkaa haivytysta. Oikea ratkaisu on tehda
   paloista pidempia.

   Hylkasin hidastuksen aiemmin koska se monisti ruutuja ja nykii.
   minterpolate valttaa sen: se LASKEE valiruudut liikkeesta sen
   sijaan etta monistaisi olemassa olevia. Tarkistettu ruuduittain,
   kasissa ei nay vaantymaa. 0,85x ei lue hidastukseksi mutta antaa
   17 % lisaa aikaa joka palaan.

   Hinta on renderointiaika: minterpolate on hidas, joten pohja
   rakennetaan KERRAN ja nelja tekstitasoa lisataan siihen erikseen. */
const NOPEUS = 0.65;

/* KAIKISSA SAMA KUVA, ERI TEKSTI. Kun kuva on vakio, ero tuloksissa
   kertoo vaitteesta eika materiaalista. Jarjestys avaus -> tiiviste:
   laaja avaa tilanteen ja makro jaa paalle korjauksena. */
const VIDEOT = [
  { nimi: 'video-ankkuri',   overlay: 'overlay-ankkuri',   miksi: 'Ankkuri: ikkunan tiivistys alk. 75 e.' },
  { nimi: 'video-prosentti', overlay: 'overlay-prosentti', miksi: 'Suhdeluku: 8 % remontista.' },
  { nimi: 'video-menetys',   overlay: 'overlay-menetys',   miksi: 'Menetys: 10-15 % lammityksesta.' },
  { nimi: 'video-euro',      overlay: 'overlay-euro',      miksi: 'Euro: 200-300 e vuodessa.' },
];


/* Lahde on 25 fps. Ala aja sita lapi muulla ruutunopeudella: 25->30
   monistaa joka viidennen ruudun ja nykii. Samasta syysta ei myoskaan
   hidastusta ilman liikkeen interpolointia. */
const FPS = 25;

const FADE_IN = 0.40;
const FADE_OUT = 0.60;

/* Musiikki tulee lahteen omasta aaniraidasta - sama kappale joka on
   muissakin TiivisKoti-videoissa. Tarkistettu spektrogrammista ettei
   raidalla ole puhetta vaan tasainen rytminen musiikki. Otetaan
   kappaleen ALUSTA, jolloin aloitus osuu musiikin omaan alkuun eika
   keskelle tahtia. */
const MUSA_ALKU = 0.0;
const MUSA_TASO = 0.5;   // n. -6 dB: kuuluu, muttei peita mitaan
const MUSA_OUT = 0.8;

/* ---------- 1. Pohja (kuva + musiikki) kerran ---------- */

const kestot = PALAT.map((x) => (PALA[x.p][1] - PALA[x.p][0]) / NOPEUS);
const kesto = kestot.reduce((a, b) => a + b, 0) - PALAT.reduce((n, x) => n + (x.hv || 0), 0);

const haarat = PALAT.map((x, i) =>
  `[0:v]trim=start=${PALA[x.p][0]}:end=${PALA[x.p][1]},setpts=(PTS-STARTPTS)/${NOPEUS},` +
  `minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,` +
  `scale=1080:1350,format=yuv420p[c${i}]`).join(';');

/* xfaden offset lasketaan YHDISTETYN virran alusta, ei palan alusta:
   jokainen haivytys lyhentaa tulosta oman kestonsa verran. */
const ketju = [];
let edellinen = 'c0';
let pituus = kestot[0];
for (let i = 1; i < PALAT.length; i++) {
  const hv = PALAT[i].hv;
  const ulos = i === PALAT.length - 1 ? 'cat' : `x${i}`;
  ketju.push(`[${edellinen}][c${i}]xfade=transition=fade:duration=${hv}:offset=${(pituus - hv).toFixed(3)}[${ulos}]`);
  pituus = pituus + kestot[i] - hv;
  edellinen = ulos;
}

const pohja = path.join(OUT, '_pohja.mp4');
console.log(`Rakennetaan pohja (${kesto.toFixed(1)} s, minterpolate — kestää hetken)…`);
execFileSync('ffmpeg', [
  '-loglevel', 'error', '-y', '-i', SRC,
  '-filter_complex', [
    haarat, ...ketju,
    `[cat]fade=t=in:st=0:d=${FADE_IN},fade=t=out:st=${(kesto - FADE_OUT).toFixed(2)}:d=${FADE_OUT}[out]`,
    /* Musiikki YHTENA palana: paloiteltuna saumaan tulisi naksahdus. */
    `[0:a]atrim=start=${MUSA_ALKU}:end=${(MUSA_ALKU + kesto).toFixed(3)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=0.4,afade=t=out:st=${(kesto - MUSA_OUT).toFixed(2)}:d=${MUSA_OUT},` +
      `volume=${MUSA_TASO},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`,
  ].join(';'),
  '-map', '[out]', '-map', '[aout]',
  '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k',
  pohja,
], { stdio: 'inherit' });

/* ---------- 2. Tekstitaso jokaiseen ---------- */

for (const v of VIDEOT) {
  const ov = path.join(OUT, `${v.overlay}.png`);
  if (!existsSync(ov)) {
    console.error(`✗ tekstitaso puuttuu: ${ov}\n  aja ensin: RENDER_ALPHA=1 node tiiviskoti/mainokset/render.mjs ${v.overlay}`);
    continue;
  }
  const dest = path.join(OUT, `${v.nimi}.mp4`);
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', pohja, '-i', ov,
    '-filter_complex', '[1:v]scale=1080:1350[ov];[0:v][ov]overlay=0:0:format=auto,format=yuv420p[out]',
    '-map', '[out]', '-map', '0:a',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-c:a', 'copy',
    '-movflags', '+faststart', dest,
  ], { stdio: 'inherit' });

  console.log(`✓ ${v.nimi}.mp4  ${kesto.toFixed(1)} s  ${v.miksi}`);
}
