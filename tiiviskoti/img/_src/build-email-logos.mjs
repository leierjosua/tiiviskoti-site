// Rasteroi TiivisKoti-sähköpostilogot PNG:ksi.
// Pohjana tiiviskoti-admin/public/logo-white.svg (ovisymboli + amber-tiiviste + sanamerkki),
// mutta kirjasin vaihdettu Manropeen = sama kuin julkisella sivustolla.
// Sähköpostiasiakkaat eivät renderöi SVG:tä, siksi PNG.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, readFileSync } from 'node:fs';

const FONT = './Manrope-ExtraBold.ttf';
const OUT = 'C:/Users/josua/projects/loppusiivous-main-new/tiiviskoti/img';

// variantit: door/seal/word1/word2 -värit
const variants = {
  // Valkoinen: tummalle (vihreälle) sähköpostin ylapalkille
  'logo-email-white.png': { door: '#ffffff', win: '#ffffff', seal: '#F2C879', w1: '#ffffff', w2: '#77C6A0', width: 720 },
  // Iso valkoinen: send-booking-email / send-contact-email käyttävät width=200
  'logo-email-badge.png': { door: '#ffffff', win: '#ffffff', seal: '#F2C879', w1: '#ffffff', w2: '#77C6A0', width: 1200 },
  // Tumma: vaalealle pohjalle (allekirjoitukset, PDF-dokumentit)
  'logo-email.png':       { door: '#215A43', win: '#215A43', seal: '#E0A44E', w1: '#163A28', w2: '#217A4E', width: 720 },
};

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
