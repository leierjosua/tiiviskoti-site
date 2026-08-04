/*  Renderöi brand/ads/fb-mainokset.html → 1080 × 1080 PNG:t brand-kansioon.
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
  ['ad-veto',   'fb-mainos-veto-1080.png'],
  ['ad-hinta',  'fb-mainos-hinta-1080.png'],
  ['ad-saasto', 'fb-mainos-saasto-1080.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1280 }, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

for (const [id, file] of ads) {
  await page.locator('#' + id).screenshot({ path: `${OUT}/${file}` });
  console.log('✓', file);
}

await browser.close();
