/*  Renderöi brand/ads/google-yritysprofiili.html → Google-yritysprofiilin kansikuva.
 *
 *  Aja repon juuresta (loppusiivous-main-new):
 *      node tiiviskoti/brand/ads/build-google-yritysprofiili.mjs
 *
 *  Ei vaadi dev-palvelinta: sivu avataan file://-osoitteesta.
 *
 *  Logoruutuun (720×720) ei tarvita omaa ajoa: brand/fb-profiilikuva-1080.png
 *  kelpaa sellaisenaan, koska se on neliö ja pelkkä merkki.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = 'file://' + path.join(__dirname, 'google-yritysprofiili.html');
const OUT  = path.resolve(__dirname, '..');

const targets = [
  ['google-kansikuva', 'google-kansikuva-1200x675.png'],
  ['google-logo',      'google-logo-720.png'],
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1700 }, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

for (const [id, file] of targets) {
  await page.locator('#' + id).screenshot({ path: `${OUT}/${file}` });
  console.log('✓', file);
}

await browser.close();
