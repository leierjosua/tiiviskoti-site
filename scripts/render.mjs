#!/usr/bin/env node
/**
 * Loppusiivous.fi — assettien renderöinti (HTML/CSS → PNG/PDF, Playwright).
 * Sama malli kuin AaltoAirin scripts/render-*.mjs.
 *
 * Käyttö:
 *   node scripts/render.mjs logo-light stamp-navy            # → assets/_out/<name>.png
 *   RENDER_DSF=3 node scripts/render.mjs og                  # retina 3x
 *   node scripts/render.mjs esite --pdf                      # PDF (A4/oma koko)
 *   node scripts/render.mjs all                              # renderöi kaikki assets/_html/*.html
 *
 * Templatet: assets/_html/<name>.html
 *   - Läpinäkyvä tausta oletuksena (omitBackground). Aseta body{background:...} jos haluat täytön.
 *   - body-elementin mitat määräävät leikkauksen (clip), kuten AaltoAirissa.
 */
import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HTML_DIR = path.join(ROOT, 'assets/_html')
const OUT_DIR = process.env.RENDER_OUT || path.join(ROOT, 'assets/_out')
const DSF = Number(process.env.RENDER_DSF) || 2

const args = process.argv.slice(2)
const pdf = args.includes('--pdf')
let names = args.filter(a => !a.startsWith('--'))

if (names.length === 0) {
  console.error('usage: node scripts/render.mjs <name...|all> [--pdf]')
  process.exit(1)
}
if (names.includes('all')) {
  names = fs.readdirSync(HTML_DIR).filter(f => f.endsWith('.html')).map(f => f.replace(/\.html$/, ''))
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const browser = await chromium.launch()
const ctx = await browser.newContext({ deviceScaleFactor: pdf ? 1 : DSF })

for (const name of names) {
  const html = path.join(HTML_DIR, `${name}.html`)
  if (!fs.existsSync(html)) { console.error(`✗ MISSING: ${html}`); continue }
  const page = await ctx.newPage()
  await page.goto('file://' + html, { waitUntil: 'networkidle' })
  try { await page.evaluate(() => document.fonts && document.fonts.ready) } catch {}
  await page.waitForTimeout(350)

  if (pdf) {
    const out = path.join(OUT_DIR, `${name}.pdf`)
    await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true })
    console.log(`✓ ${out} (PDF)`)
  } else {
    const dims = await page.evaluate(() => {
      const b = document.body, cs = getComputedStyle(b)
      return { w: Math.ceil(parseFloat(cs.width)), h: Math.ceil(parseFloat(cs.height)) }
    })
    await page.setViewportSize({ width: dims.w, height: dims.h })
    await page.waitForTimeout(80)
    const out = path.join(OUT_DIR, `${name}.png`)
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: dims.w, height: dims.h } })
    console.log(`✓ ${out}  (${dims.w}×${dims.h} @ ${DSF}x)`)
  }
  await page.close()
}
await browser.close()
