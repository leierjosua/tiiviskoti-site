#!/usr/bin/env node
/**
 * TiivisKoti — Lausunto ikkunoiden tiivisteiden kunnosta (HTML → A4 PDF).
 *
 *   node tiiviskoti/asiakirjat/lausunto.mjs [data.json] [out.pdf]
 *
 * TÄYTTÄMÄTTÖMIÄ KENTTIÄ EI OLE. Lausunto on asiakirja, joka luetaan
 * yhtiökokouksessa — siinä ei saa olla tyhjiä viivoja eikä ohjetekstiä.
 * Jos pakollinen tieto puuttuu, generaattori kaatuu ennen renderöintiä.
 *
 * MENETELMÄ: silmämääräinen tarkastus paikan päällä. Lämpökameraa EI mainita
 * (Josua 16.9.2026: käynnillä ei kuvattu lämpökameralla). Älä lisää sitä
 * takaisin ilman että kuvaus on oikeasti tehty.
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataFile = process.argv[2] || path.join(__dirname, 'lausunto-data.json')
const d = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
const outFile = process.argv[3] || path.join(__dirname, `lausunto-${d.numero}.pdf`)

const PAKOLLISET = [
  ['numero', d.numero], ['paivays', d.paivays], ['tarkastuspaiva', d.tarkastuspaiva],
  ['tarkastaja.nimi', d.tarkastaja?.nimi], ['kohde.osoite', d.kohde?.osoite],
  ['kohde.huoneisto', d.kohde?.huoneisto], ['tilaaja', d.tilaaja],
  ['ikkunoita', d.ikkunoita], ['havainto', d.havainto], ['suositus', d.suositus],
]
const puuttuu = PAKOLLISET.filter(([, v]) => !String(v ?? '').trim() || /^TÄYTÄ/i.test(String(v)))
if (puuttuu.length) {
  console.error('✗ Lausuntoa ei renderöity, koska näitä tietoja ei ole:')
  for (const [k] of puuttuu) console.error('   · ' + k)
  process.exit(1)
}

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

const html = `<!doctype html><html lang="fi"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 16mm 16mm 14mm; }
  * { box-sizing: border-box }
  body { margin:0; font-family:"Manrope",system-ui,sans-serif; font-size:10.3pt; line-height:1.55; color:#16231C }
  .head { display:flex; justify-content:space-between; align-items:flex-start; gap:20px;
          border-bottom:2px solid #217A4E; padding-bottom:9px; margin-bottom:18px }
  .logo { display:flex; align-items:center; gap:9px }
  .logo svg { width:30px; height:30px }
  .logo b { font-size:16pt; letter-spacing:-.02em; color:#16231C }
  .yht { text-align:right; font-size:8.6pt; line-height:1.5; color:#5B6B60 }
  h1 { font-size:15.5pt; letter-spacing:-.02em; margin:0 0 3px }
  .meta { font-size:9pt; color:#5B6B60; margin-bottom:16px }
  .osoitelohko { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:18px }
  .osoitelohko div { background:#F3F6F2; border-radius:8px; padding:12px 14px }
  .osoitelohko b { display:block; font-size:8.2pt; letter-spacing:.09em; text-transform:uppercase;
                   color:#5B6B60; margin-bottom:4px; font-weight:700 }
  h2 { font-size:10.8pt; margin:15px 0 5px; color:#1A5F3D }
  h2 .n { color:#9FB4A6; margin-right:6px }
  p { margin:0 0 8px }
  .rajaus { background:#F3F6F2; border-left:3px solid #217A4E; border-radius:0 8px 8px 0;
            padding:10px 13px; font-size:9pt; line-height:1.45; margin-top:14px }
  .allekirjoitus { margin-top:26px; display:grid; grid-template-columns:1fr 1fr; gap:24px; align-items:end }
  .viiva { border-top:1px solid #16231C; padding-top:6px; font-size:9.2pt }
  .foot { margin-top:22px; border-top:1px solid #DCE3DA; padding-top:8px; font-size:8.2pt; color:#5B6B60 }
</style></head><body>
  <div class="head">
    <div class="logo">
      <svg viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#217A4E"/>
        <rect x="31" y="20" width="38" height="60" rx="3" fill="none" stroke="#fff" stroke-width="5"/>
        <rect x="35" y="20" width="4" height="60" fill="#fff"/></svg>
      <b>TiivisKoti</b>
    </div>
    <div class="yht">Tiiviskoti Oy · Y-tunnus 3652671-7<br>info@tiiviskoti.fi · 045 875 5996<br>tiiviskoti.fi</div>
  </div>

  <h1>Lausunto ikkunoiden tiivisteiden kunnosta</h1>
  <div class="meta">Lausunto ${esc(d.numero)} · ${esc(d.paivays)} · tarkastus tehty ${esc(d.tarkastuspaiva)}</div>

  <div class="osoitelohko">
    <div><b>Kohde</b>${d.kohde.taloyhtio ? esc(d.kohde.taloyhtio) + '<br>' : ''}${esc(d.kohde.osoite)}<br>Huoneisto ${esc(d.kohde.huoneisto)}</div>
    <div><b>Lausunnon tilaaja</b>${esc(d.tilaaja)}<br><b style="margin-top:8px">Vastaanottaja</b>${esc(d.vastaanottaja || 'Isännöitsijä ja hallitus')}</div>
  </div>

  <h2><span class="n">1</span>Tarkastus</h2>
  <p>Kävimme tarkastamassa huoneiston ikkunat paikan päällä ${esc(d.tarkastuspaiva)}. Tarkastus tehtiin
  silmämääräisesti: tarkastimme tiivisteiden kunnon ja kiinnityksen, tiivisteen puristuksen puitteen ja
  karmin välissä sekä ikkunoiden käynnin. Tarkastus kattoi huoneiston kaikki ikkunat, ${esc(d.ikkunoita)}.</p>

  <h2><span class="n">2</span>Havainnot</h2>
  <p>${esc(d.havainto)}</p>

  <h2><span class="n">3</span>Johtopäätös</h2>
  <p>Tiivisteet ovat tulleet käyttöikänsä päähän eivätkä enää täytä tehtäväänsä: ne eivät tiivistä puitteen
  ja karmin väliä, jolloin ikkunoista pääsee lämmitettyä sisäilmaa ulos ja kylmää ilmaa sisään. Tilanne ei
  korjaannu säätämällä eikä huoltamalla, vaan tiivisteet on uusittava.</p>

  <h2><span class="n">4</span>Suositeltu toimenpide</h2>
  <p>${esc(d.suositus)}</p>
  ${d.huomiot ? `<p>${esc(d.huomiot)}</p>` : ''}

  <div class="rajaus">
    <b>Lausunnon rajaus.</b> Lausunto koskee ainoastaan huoneiston ikkunoiden tiivisteiden kuntoa ja niiden
    vaikutusta ilmanpitävyyteen. Lausunto ei ota kantaa ikkunoiden muuhun kuntoon, rakenteiden kuntoon eikä
    siihen, miten kunnossapitovastuu jakautuu taloyhtiön ja osakkaan välillä — vastuunjako ratkaistaan
    yhtiöjärjestyksen ja asunto-osakeyhtiölain perusteella.
  </div>

  <div class="allekirjoitus">
    <div class="viiva">${esc(d.tarkastaja.nimi)}<br>${esc(d.tarkastaja.asema || 'TiivisKoti')}</div>
    <div class="viiva">${esc(d.paikka || 'Helsinki')} ${esc(d.paivays)}</div>
  </div>

  <div class="foot">Tiiviskoti Oy · Y-tunnus 3652671-7 · info@tiiviskoti.fi · 045 875 5996 · tiiviskoti.fi<br>
  Tiivistystyöt tekee oma asentajamme. Kotitalousvähennys koskee työn osuutta osakkaan itse tilaamasta työstä.</div>
</body></html>`

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
try { await page.evaluate(() => document.fonts && document.fonts.ready) } catch {}
await page.pdf({ path: outFile, format: 'A4', printBackground: true })
await browser.close()
console.log('✓ ' + outFile)
