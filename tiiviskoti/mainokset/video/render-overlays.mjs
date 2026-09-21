#!/usr/bin/env node
/**
 * TiivisKoti — videomainoksen tekstitasot HTML → läpinäkyvä PNG.
 *
 * Sisarus tiedostolle ../render.mjs, mutta kaksi eroa:
 *   1) omitBackground: true → PNG:ssä on alfakanava, jotta ffmpeg voi
 *      ladata sen videon päälle.
 *   2) sama HTML renderöidään molempiin kuvasuhteisiin (9:16 ja 4:5)
 *      vaihtamalla body-luokkaa, joten tekstiä ylläpidetään yhdessä paikassa.
 *
 *   node tiiviskoti/mainokset/video/render-overlays.mjs
 */
import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })

const BEATS = ['beat1', 'beat2', 'beat3', 't-hinta', 't-mekanismi', 't-kaynti', 't-saasto']
const RATIOS = [
  { key: '916', cls: 'r916', w: 1080, h: 1920 },
  { key: '45',  cls: 'r45',  w: 1080, h: 1350 },
]

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ deviceScaleFactor: 1 })

/* CTA ladotaan JavaScriptillä samaan .block-elementtiin eikä omaan
   HTML-tiedostoonsa: muuten jokaisesta iskusta olisi kaksi lähes identtistä
   tiedostoa, jotka ehtivät erkaantua ensimmäisen sanamuodon hionnan aikana. */
const CTA_HTML = `<span class="cta">Pyydä tarjous`
  + `<svg viewBox="0 0 24 24"><path d="M5 12h12M12 6l6 6-6 6"/></svg></span>`

async function shoot(file, cls, w, h, out, cta = false) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: w, height: h })
  await page.goto('file://' + path.join(__dirname, file), { waitUntil: 'networkidle' })
  if (cls) await page.evaluate(c => { document.body.className = c }, cls)
  if (cta) await page.evaluate(html => {
    document.querySelector('.block').insertAdjacentHTML('beforeend', html)
  }, CTA_HTML)
  // Fontti on ladattava ENNEN kuvakaappausta, muuten teksti renderöityy
  // järjestelmän varafontilla ja rivitys muuttuu.
  try { await page.evaluate(() => document.fonts.ready) } catch {}
  await page.waitForTimeout(350)
  const used = await page.evaluate(() =>
    getComputedStyle(document.querySelector('h1, .hinnat')).fontFamily)
  if (!/Manrope/i.test(used)) console.warn(`  ! varafontti käytössä: ${used}`)
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } })
  await page.close()
}

for (const b of BEATS) {
  for (const r of RATIOS) {
    for (const cta of [false, true]) {
      // Jokaisesta iskusta kaksi versiota: tavallinen ja CTA:lla. Videon
      // VIIMEINEN teksti käyttää aina -cta-versiota (build-variations.py).
      const name = cta ? `${b}-cta-${r.key}` : `${b}-${r.key}`
      const out = path.join(OUT, `${name}.png`)
      await shoot(`${b}.html`, r.cls, r.w, r.h, out, cta)
      console.log(`✓ ${path.basename(out)}  (${r.w}×${r.h})`)
    }
  }
}
const stripOut = path.join(OUT, 'outro-hinnat.png')
await shoot('outro-hinnat.html', null, 1080, 64, stripOut)
console.log(`✓ ${path.basename(stripOut)}  (1080×64)`)

await browser.close()
