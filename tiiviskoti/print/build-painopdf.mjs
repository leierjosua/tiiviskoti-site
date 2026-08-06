/* Tekee mainos-a6.pdf:stä painokelpoisen version painon vaatimusten mukaan:
   CMYK-värit, ICC-profiili upotettuna ja tekstit poluiksi.

   Aja kansiosta print:
     node build-painopdf.mjs                 (päällystetty paperi, Fogra39L)
     node build-painopdf.mjs --uncoated      (päällystämätön / kierrätys, Fogra47L)

   Ajojärjestys: build-mainos.mjs ensin (tekee RGB-PDF:n), sitten tämä.

   MIKSI ERILLINEN VAIHE
     Chromium osaa tuottaa vain RGB-PDF:ää eikä osaa muuntaa tekstiä poluiksi.
     Ghostscript tekee molemmat. Lähde-PDF pidetään RGB:nä, koska sitä on
     helpompi katsoa ruudulla ja koska paperin vaihtuessa vain tämä vaihe
     ajetaan uusiksi toisella profiililla.

   PAINON VAATIMUKSET (2026-08) ja miten ne täyttyvät:
     Väh. 300 dpi ................ kuva on 760 dpi lopullisessa koossa
     CMYK-värit .................. -sColorConversionStrategy=CMYK
     ICC-profiili sisällytettynä . OutputIntent PDFX_def.ps:n kautta
     Tekstit poluiksi ............ -dNoOutputFonts
     Ei leikkausmerkkejä ......... lähde-PDF:ssä ei ole niitä
     Ei apulinjoja ............... leikkuuraja on CSS:ssä @media screen
     Ei koriste-/erikoisvärejä ... taitossa on vain prosessivärejä
     Ei lomake-ominaisuuksia ..... lähteessä ei ole lomakekenttiä
*/
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const UNCOATED = process.argv.includes('--uncoated');

/* Fogra39L = päällystetty paperi (esim. 170 g silk).
   Fogra47L = päällystämätön offset- tai kierrätyspaperi. */
const PROFILE = UNCOATED
  ? { file: 'PSO_Uncoated_ISO12647_eci.icc', name: 'PSO Uncoated ISO12647 (ECI)', fogra: 'Fogra47L' }
  : { file: 'ISOcoated_v2_eci.icc',          name: 'ISO Coated v2 (ECI)',          fogra: 'Fogra39L' };

const SRC = path.resolve('mainos-a6.pdf');
const OUT = path.resolve(UNCOATED ? 'mainos-a6-paino-uncoated.pdf' : 'mainos-a6-paino.pdf');
const ICC = path.resolve('icc', PROFILE.file);

/* Ghostscript ei ole PATHissa oletusasennuksen jälkeen, joten etsitään se. */
function findGs() {
  const kandidaatit = [
    'gswin64c',
    ...['C:/Program Files/gs', 'C:/Program Files (x86)/gs', 'C:/Users/josua/gs10071']
      .flatMap((base) => [`${base}/bin/gswin64c.exe`, `${base}/gs10.07.1/bin/gswin64c.exe`]),
  ];
  for (const c of kandidaatit) {
    try {
      execFileSync(c, ['--version'], { stdio: 'pipe' });
      return c;
    } catch { /* seuraava */ }
  }
  return null;
}

const GS = findGs();
if (!GS) {
  console.error('Ghostscriptiä ei löydy. Asenna se ja aja uudelleen.');
  process.exit(1);
}
for (const [nimi, p] of [['lähde-PDF', SRC], ['ICC-profiili', ICC]]) {
  if (!existsSync(p)) { console.error(`${nimi} puuttuu: ${p}`); process.exit(1); }
}

/* OutputIntent kertoo painolle mille väriavaruudelle tiedosto on tehty.
   Ghostscript lisää sen vain PostScript-määrittelyn kautta — pelkkä
   -sOutputICCProfile muuntaa värit mutta ei kirjaa profiilia tiedostoon. */
const defPs = path.resolve('_pdfx_def.ps');
writeFileSync(defPs, `%!
/ICCProfile (${ICC.replace(/\\/g, '/')}) def
[ /GTS_PDFXVersion (PDF/X-3:2002)
  /Title (TiivisKoti postilaatikkomainos A6)
  /Trapped /False
  /DOCINFO pdfmark
[ /_objdef {icc_PDFX} /type /stream /OBJ pdfmark
[ {icc_PDFX} <</N 4>> /PUT pdfmark
[ {icc_PDFX} ICCProfile (r) file /PUT pdfmark
[ /_objdef {OutputIntent_PDFX} /type /dict /OBJ pdfmark
[ {OutputIntent_PDFX} <<
    /Type /OutputIntent /S /GTS_PDFX
    /OutputCondition (${PROFILE.name})
    /OutputConditionIdentifier (${PROFILE.fogra})
    /RegistryName (http://www.color.org)
    /DestOutputProfile {icc_PDFX}
  >> /PUT pdfmark
[ {Catalog} <</OutputIntents [ {OutputIntent_PDFX} ]>> /PUT pdfmark
`);

/* Ghostscript 10:n hiekkalaatikko estää oletuksena lukemisen työhakemiston
   ulkopuolelta, ja ICC-profiili luetaan pdfmark-määrittelystä. Annetaan lupa
   nimenomaan näihin tiedostoihin sen sijaan että -dSAFER kytkettäisiin pois. */
const args = [
  `--permit-file-read=${ICC}`,
  `--permit-file-read=${defPs}`,
  '-dBATCH', '-dNOPAUSE', '-dQUIET', '-dSAFER',
  '-sDEVICE=pdfwrite',
  '-dPDFSETTINGS=/prepress',
  '-dNoOutputFonts',                      // tekstit poluiksi
  '-sColorConversionStrategy=CMYK',
  '-dProcessColorModel=/DeviceCMYK',
  '-dOverrideICC=true',
  `-sOutputICCProfile=${ICC}`,
  '-dRenderIntent=1',                     // relative colorimetric
  '-dAutoRotatePages=/None',
  '-dDownsampleColorImages=false',
  '-dDownsampleGrayImages=false',
  '-dDownsampleMonoImages=false',
  '-dCompatibilityLevel=1.4',
  `-sOutputFile=${OUT}`,
  defPs,
  SRC,
];

try {
  execFileSync(GS, args, { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  /* Varsinainen syy tulee Ghostscriptin stdoutiin, ei stderriin — stderr
     kertoo vain että jokin meni pieleen. Näytetään molemmat. */
  console.error('Ghostscript epäonnistui:');
  console.error(e.stdout?.toString() || '');
  console.error(e.stderr?.toString() || e.message);
  process.exit(1);
} finally {
  try { unlinkSync(defPs); } catch { /* ei väliä */ }
}

console.log(`${path.basename(OUT)}`);
console.log(`  profiili : ${PROFILE.name} (${PROFILE.fogra})`);
console.log(`  koko     : ${(statSync(OUT).size / 1024).toFixed(0)} kt`);

/* ---------- tarkistus ----------
   Ghostscriptin onnistunut ajo ei todista että tulos kelpaa painoon.
   Tämä lukee valmiin tiedoston rakenteen ja kaatuu jos jokin vaatimus
   jäi täyttymättä — muuten virhe huomattaisiin vasta painon hylätessä. */
const pdf = readFileSync(OUT, 'latin1');
const kpl = (re) => (pdf.match(re) || []).length;

/* Musteenpeitto ajetaan Ghostscriptillä: se on ainoa tapa todistaa että
   sivu tosiaan piirtyy CMYK:na eikä vain sisällä CMYK-määrittelyjä. */
let inkcov = '';
try {
  inkcov = execFileSync(GS, ['-q', '-o', '-', '-sDEVICE=inkcov', OUT], { stdio: 'pipe' }).toString();
} catch { /* tarkistus jää tekemättä, muut kohdat kertovat silti paljon */ }

const mediaBox = pdf.match(/MediaBox\s*\[\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)\s*\]/);
const mm = (p) => +(p * 25.4 / 72).toFixed(1);
const koko = mediaBox ? [mm(mediaBox[1]), mm(mediaBox[2])] : [0, 0];

const tarkistukset = [
  ['sivukoko 109 × 152 mm',      Math.abs(koko[0] - 109) < 0.5 && Math.abs(koko[1] - 152) < 0.5, `${koko[0]} × ${koko[1]} mm`],
  ['yksi sivu',                  kpl(/\/Type\s*\/Page[^s]/g) === 1,   kpl(/\/Type\s*\/Page[^s]/g) + ' sivua'],
  ['CMYK-värit',                 /CMYK OK/.test(inkcov),              inkcov.trim().split('\n').pop() || 'ei tarkistettu'],
  ['ei RGB-väriavaruutta',       kpl(/\/DeviceRGB/g) === 0,           `DeviceRGB ${kpl(/\/DeviceRGB/g)}`],
  ['ICC-profiili upotettu',      /\/OutputIntents/.test(pdf),         /\/OutputIntents/.test(pdf) ? 'OutputIntent löytyy' : 'PUUTTUU'],
  ['profiilin tunniste',         pdf.includes(PROFILE.fogra),         PROFILE.fogra],
  ['tekstit poluiksi',           kpl(/\/FontFile\d?[\s\/]/g) === 0,   kpl(/\/FontFile\d?[\s\/]/g) + ' upotettua fonttia'],
  ['ei erikoisvärejä',           kpl(/\/Separation/g) === 0 && kpl(/\/DeviceN/g) === 0, 'Separation/DeviceN 0'],
  ['ei lomakekenttiä',           !/\/AcroForm/.test(pdf),             'ei AcroFormia'],
];

console.log('\n  painon vaatimukset:');
let virheita = 0;
for (const [nimi, ok, tila] of tarkistukset) {
  if (!ok) virheita++;
  console.log(`  ${ok ? 'ok   ' : 'EI   '} ${nimi.padEnd(24)} ${tila}`);
}
if (virheita) {
  console.error(`\n  ${virheita} vaatimusta ei täyty — älä lähetä painoon.`);
  process.exit(1);
}
console.log('\n  Valmis painoon.');
