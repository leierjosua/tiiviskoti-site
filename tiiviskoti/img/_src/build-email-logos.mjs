// Rasteroi TiivisKoti-sähköpostilogot PNG:ksi.
// Pohjana tiiviskoti-admin/public/logo-white.svg (ovisymboli + amber-tiiviste + sanamerkki),
// mutta kirjasin vaihdettu Manropeen = sama kuin julkisella sivustolla.
// Sähköpostiasiakkaat eivät renderöi SVG:tä, siksi PNG.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, readFileSync } from 'node:fs';

const FONT = './Manrope-ExtraBold.ttf';
const OUT = 'C:/Users/josua/projects/loppusiivous-main-new/tiiviskoti/img';

// HUOM: Sähköpostilogoja EI enää generoida tästä vanhasta ovi-ikoni-SVG:stä.
// Kaikki kolme tehdään uusista brändilogoista (moderni badge):
//   sips --resampleWidth 1080 brand/logo-vihrea-4000.png    --out img/logo-email.png        # vaalea pohja / kuitti-PDF
//   sips --resampleWidth 1080 brand/logo-valkoinen-4000.png --out img/logo-email-white.png  # tumma sähköpostipalkki
//   sips --resampleWidth 1200 brand/logo-valkoinen-4000.png --out img/logo-email-badge.png  # iso valkoinen
// Älä lisää variantteja takaisin — vanha ovi-ikoni ylikirjoittaisi uuden badgen.
const variants = {};

const svg = (v) => `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="120" viewBox="0 0 560 120" fill="none">
  <rect x="18" y="20" width="60" height="88" rx="8" fill="none" stroke="${v.door}" stroke-width="8"/>
  <rect x="30" y="34" width="36" height="26" rx="3" fill="none" stroke="${v.win}" stroke-width="5" opacity=".65"/>
  <circle cx="66" cy="72" r="4.5" fill="${v.door}"/>
  <line x1="90" y1="22" x2="90" y2="106" stroke="${v.seal}" stroke-width="8" stroke-linecap="round"/>
  <text x="112" y="84" font-family="Manrope" font-weight="800" font-size="62" letter-spacing="-2.5" fill="${v.w1}">Tiivis<tspan fill="${v.w2}">Koti</tspan></text>
</svg>`;

for (const [name, v] of Object.entries(variants)) {
  const r = new Resvg(svg(v), {
    fitTo: { mode: 'width', value: v.width },
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Manrope' },
    background: 'rgba(0,0,0,0)', // läpinäkyvä — toimii kaikilla palkkiväreillä
  });
  const png = r.render().asPng();
  writeFileSync(`${OUT}/${name}`, png);
  console.log(`${name.padEnd(24)} ${v.width}px  ${(png.length / 1024).toFixed(1)} kB`);
}
