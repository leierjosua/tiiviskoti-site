/* Tuottaa mainos-a6.html:stä painokelpoisen PDF:n.

   Aja kansiosta print:  node build-mainos.mjs

   Miksi tämä on olemassa: selaimen Ctrl+P ei osaa mielivaltaista arkkikokoa
   eikä säilytä leikkuuvaraa, joten A6 + 2 mm bleed ei synny sillä oikein.
   Chromium osaa, kun koko annetaan suoraan.
*/
import { chromium } from 'file:///C:/Users/josua/projects/loppusiivous-main-new/node_modules/playwright/index.mjs';
import { statSync } from 'node:fs';
import path from 'node:path';

const TRIM = { w: 105, h: 148 };
const BLEED = 2;
const PAGE = { w: TRIM.w + 2 * BLEED, h: TRIM.h + 2 * BLEED };

const src = path.resolve('mainos-a6.html');
const out = path.resolve('mainos-a6.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();

/* networkidle: Manrope tulee Google Fontsista, ja väärällä fontilla
   ladottu PDF menisi painoon huomaamatta. */
await page.goto('file:///' + src.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

/* Varmistetaan ettei taitto vuoda arkin ulkopuolelle. Ylivuoto ei näy
   PDF:ssä mitenkään — se vain leikkautuu pois — joten se on tarkistettava
   täällä eikä silmämääräisesti valmiista tiedostosta. */
const vuoto = await page.evaluate(() => {
  const s = document.querySelector('.sheet'), f = document.querySelector('.flyer');
  return {
    arkki: { w: s.getBoundingClientRect().width, h: s.getBoundingClientRect().height },
    sisalto: { h: f.scrollHeight, box: f.getBoundingClientRect().height },
  };
});
const ylivuotoMm = (vuoto.sisalto.h - vuoto.sisalto.box / 0.72381) * 0.2646;
if (ylivuotoMm > 0.5) {
  console.warn(`  VAROITUS: taitto vuotaa ${ylivuotoMm.toFixed(1)} mm arkin yli — teksti leikkautuu`);
}

/* Arkkikoko otetaan CSS:n @page-säännöstä. width/height-parametreilla
   Chromium pyöristää millimetrit pisteiksi epätarkasti (109 mm → 109,39 mm),
   mikä siirtäisi leikkuurajaa. @page antaa mitan tarkalleen. */
await page.pdf({
  path: out,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  printBackground: true,
  preferCSSPageSize: true,
});

await browser.close();

console.log(`mainos-a6.pdf  ${PAGE.w} × ${PAGE.h} mm  (leikattuna ${TRIM.w} × ${TRIM.h} mm, bleed ${BLEED} mm)`);
console.log(`               ${(statSync(out).size / 1024).toFixed(0)} kt`);
