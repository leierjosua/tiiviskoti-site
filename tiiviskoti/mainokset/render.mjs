#!/usr/bin/env node
/**
 * TiivisKoti — Meta-mainosten renderöinti (HTML → PNG @2x).
 * OMASSA kansiossaan, erillään Loppusiivouksen asset-labista.
 * Käyttää järjestelmän Google Chromea (channel:'chrome').
 *
 *   node tiiviskoti/mainokset/render.mjs mainos-veto mainos-koti mainos-hinta
 *   node tiiviskoti/mainokset/render.mjs all
 *
 * Värit, logo ja fontti tulevat tiiviskoti/index.html:stä (Manrope, #217A4E,
 * #F6F7F3, oikea squircle-logo). ÄLÄ käytä brändiohjeen (Gabarito/amber) arvoja.
 */
import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'out')
const DSF = Number(process.env.RENDER_DSF) || 2

let names = process.argv.slice(2)
if (names.length === 0) { console.error('usage: node tiiviskoti/mainokset/render.mjs <name...|all>'); process.exit(1) }
if (names.includes('all')) {
  names = fs.readdirSync(__dirname).filter(f => f.startsWith('mainos-') && f.endsWith('.html')).map(f => f.replace(/\.html$/, ''))
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ deviceScaleFactor: DSF })

for (const name of names) {
  const html = path.join(__dirname, `${name}.html`)
  if (!fs.existsSync(html)) { console.error(`✗ MISSING: ${html}`); continue }
  const page = await ctx.newPage()
  await page.goto('file://' + html, { waitUntil: 'networkidle' })
  try { await page.evaluate(() => document.fonts && document.fonts.ready) } catch {}
  await page.waitForTimeout(400)
  const dims = await page.evaluate(() => {
    const b = document.body, cs = getComputedStyle(b)
    return { w: Math.ceil(parseFloat(cs.width)), h: Math.ceil(parseFloat(cs.height)) }
  })
  await page.setViewportSize({ width: dims.w, height: dims.h })
  await page.waitForTimeout(80)
  const out = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: dims.w, height: dims.h } })
  console.log(`✓ ${out}  (${dims.w}×${dims.h} @ ${DSF}x)`)
  await page.close()
}
await browser.close()
