/*  Renderöi brand/ads/fb-mainokset.html → PNG:t brand-kansioon.
 *
 *  Jokainen mainos renderöidään kahdessa koossa:
 *    1080 × 1080  (neliö)        — toimii kaikkialla
 *    1080 × 1350  (4:5, pysty)   — vie enemmän tilaa Facebookin syötteessä
 *
 *  Aja repon juuresta (loppusiivous-main-new), jotta playwright löytyy:
 *      node tiiviskoti/brand/ads/build-fb-mainokset.mjs
 *
 *  Vaatii dev-palvelimen päällä:  cd tiiviskoti && node _serve.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8799/brand/ads/fb-mainokset.html';
const OUT  = 'C:/Users/josua/projects/loppusiivous-main-new/tiiviskoti/brand';

const ads = [
  ['ad-veto',      'veto'],
  ['ad-veto-edut', 'veto-edut'],
  ['ad-hinta',     'hinta'],
  ['ad-saasto',    'saasto'],
  ['ad-taloyhtio', 'taloyhtio'],
  ['ad-vahennys',  'vahennys'],
  ['ad-syksy',     'syksy'],
  ['ad-varaus',    'varaus'],
];

const sizes = [
  [1080, 'fb-mainos-%s-1080.png'],
  [1350, 'fb-mainos-%s-1080x1350.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

for (const [height, pattern] of sizes) {
  await page.evaluate((h) => {
    document.querySelectorAll('.ad').forEach((el) => { el.style.height = h + 'px'; });
  }, height);

  for (const [id, name] of ads) {
    const file = pattern.replace('%s', name);
    await page.locator('#' + id).screenshot({ path: `${OUT}/${file}` });
    console.log('✓', file);
  }
}

await browser.close();
