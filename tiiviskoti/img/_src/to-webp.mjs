/* Muuntaa sivuston sisältökuvat WebP-muotoon Chromiumin canvas-enkooderilla.
   Playwright on ainoa käytettävissä oleva kuvatyökalu (ei sharpia/ffmpegiä).

   og-tiiviskoti.jpg jätetään tarkoituksella JPG:ksi: some-palveluiden
   linkkiesikatselut eivät lue WebPiä luotettavasti.

   Aja kansiosta tiiviskoti:  node img/_src/to-webp.mjs
*/
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

/* maxW = suurin leveys johon kuva skaalataan. Lähdekuvat ovat selvästi
   isompia kuin mihin ne sivulla piirretään; leveyden pudotus tuottaa
   paljon suuremman säästön kuin laadun kiristäminen. Katteet on mitoitettu
   n. 2× näyttöleveydelle, jotta retina-näytöt pysyvät terävinä. */
const IMAGES = [
  { file: 'hero-entrance.jpg',  maxW: 1100, q: 0.80 },
  { file: 'ikkunat.jpg',        maxW: 1000, q: 0.82 },
  { file: 'ulko-ovet.jpg',      maxW: 1000, q: 0.82 },
  { file: 'taloyhtiot.jpg',     maxW:  900, q: 0.82 },
  { file: 'miksi-tyo.jpg',      maxW: 1000, q: 0.82 },
  { file: 'taloyhtio-hero.jpg', maxW: 1100, q: 0.82 },
];
const IMG_DIR = path.resolve('img');

const browser = await chromium.launch();
const page = await browser.newPage();

for (const { file, maxW, q } of IMAGES) {
  const src = path.join(IMG_DIR, file);
  const out = src.replace(/\.jpe?g$/i, '.webp');
  const dataUrl = 'data:image/jpeg;base64,' + readFileSync(src).toString('base64');

  const encoded = await page.evaluate(
    async ([url, q, maxW]) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, maxW / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return { w: c.width, h: c.height, data: c.toDataURL('image/webp', q).split(',')[1] };
    },
    [dataUrl, q, maxW],
  );

  writeFileSync(out, Buffer.from(encoded.data, 'base64'));

  const before = statSync(src).size, after = statSync(out).size;
  const kb = (n) => (n / 1024).toFixed(0).padStart(4) + ' KB';
  console.log(
    `${path.basename(out).padEnd(22)} ${encoded.w}×${encoded.h}  ` +
    `${kb(before)} → ${kb(after)}  (−${Math.round((1 - after / before) * 100)} %)`,
  );
}

await browser.close();
