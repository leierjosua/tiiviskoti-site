/*  Renderöi brand/ads/fb-profiili.html → Facebook-profiilikuva ja kansikuva.
 *
 *  Aja repon juuresta (loppusiivous-main-new):
 *      node tiiviskoti/brand/ads/build-fb-profiili.mjs
 *
 *  Vaatii dev-palvelimen päällä:  cd tiiviskoti && node _serve.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8799/brand/ads/fb-profiili.html';
const OUT  = 'C:/Users/josua/projects/loppusiivous-main-new/tiiviskoti/brand';

const targets = [
  ['fb-profiili',  'fb-profiilikuva-1080.png'],
  ['fb-kansikuva', 'fb-kansikuva-1640x856.png'],
];

const browser = await chromium.launch();
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
