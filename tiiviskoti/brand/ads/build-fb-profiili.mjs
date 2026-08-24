/*  Renderöi brand/ads/fb-profiili.html → Facebook-profiilikuva ja kansikuva.
 *
 *  Aja repon juuresta (loppusiivous-main-new):
 *      node tiiviskoti/brand/ads/build-fb-profiili.mjs
 *
 *  Ei vaadi dev-palvelinta: sivu avataan file://-osoitteesta.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = 'file://' + path.join(__dirname, 'fb-profiili.html');
const OUT  = path.resolve(__dirname, '..');

const targets = [
  ['fb-profiili',  'fb-profiilikuva-1080.png'],
  ['fb-kansikuva', 'fb-kansikuva-1640x856.png'],
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

// ympyrärajauksen apuviiva on vain esikatselua varten
await page.evaluate(() => {
  document.querySelectorAll('.guide').forEach((el) => { el.style.display = 'none'; });
});

for (const [id, file] of targets) {
  await page.locator('#' + id).screenshot({ path: `${OUT}/${file}` });
  console.log('✓', file);
}

await browser.close();
