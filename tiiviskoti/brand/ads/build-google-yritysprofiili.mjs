/*  Renderöi brand/ads/google-yritysprofiili.html → Google-yritysprofiilin kansikuva.
 *
 *  Aja repon juuresta (loppusiivous-main-new):
 *      node tiiviskoti/brand/ads/build-google-yritysprofiili.mjs
 *
 *  Vaatii dev-palvelimen päällä:  cd tiiviskoti && node _serve.mjs
 *
 *  Logoruutuun (720×720) ei tarvita omaa ajoa: brand/fb-profiilikuva-1080.png
 *  kelpaa sellaisenaan, koska se on neliö ja pelkkä merkki.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8799/brand/ads/google-yritysprofiili.html';
const OUT  = 'C:/Users/josua/projects/loppusiivous-main-new/tiiviskoti/brand';

const targets = [
  ['google-kansikuva', 'google-kansikuva-1200x675.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

for (const [id, file] of targets) {
  await page.locator('#' + id).screenshot({ path: `${OUT}/${file}` });
  console.log('✓', file);
}

await browser.close();
