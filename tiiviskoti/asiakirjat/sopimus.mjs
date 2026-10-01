#!/usr/bin/env node
/**
 * TiivisKoti — Sopimus tiivistystyöstä (HTML → A4 PDF).
 *
 *   node tiiviskoti/asiakirjat/sopimus.mjs [data.json] [out.pdf]
 *
 * TÄYTTÄMÄTTÖMIÄ KENTTIÄ EI OLE. Sama sääntö kuin lausunnossa: sopimus
 * allekirjoitetaan, joten siinä ei saa olla tyhjiä viivoja eikä
 * ohjetekstiä. Jos pakollinen tieto puuttuu, generaattori kaatuu ennen
 * renderöintiä.
 *
 * MITÄ TÄSSÄ EI LUVATA. Sopimuksessa ei mainita takuuta eikä
 * vastuuvakuutusta — ei siksi ettei niitä olisi, vaan koska niiden ehdot
 * eivät ole tiedossa tässä, eikä sopimukseen saa kirjoittaa ehtoa jonka
 * sisältöä ei ole vahvistettu. Jos takuu halutaan sopimukseen, sen
 * pituus ja kattavuus on saatava Josualta ensin.
 *
 * HYVÄKSYNTÄ ON SÄHKÖINEN, EI PAPERINEN. data.hyvaksynta = 'sahkoposti'
 * (oletus) korvaa allekirjoitusviivat kohdalla, jossa kerrotaan tarkalleen
 * millä viestillä tilaaja hyväksyy sopimuksen. Tyhjiä viivoja ei tulosteta,
 * koska niitä ei ole tarkoitus täyttää kynällä. Jos sopimus halutaan
 * poikkeuksellisesti allekirjoittaa paperille, aseta 'allekirjoitus' —
 * silloin myös ehto kahdesta kappaleesta on kirjoitettava takaisin
 * muutEhdot-listaan, sillä generaattori ei keksi ehtoja itse.
 *
 * SÄHKÖPOSTIHYVÄKSYNTÄ EDELLYTTÄÄ TILAAJAN OSOITTEEN. Ilman sitä sopimuksessa
 * lukisi "vastaa viestiin" osoittamatta mihin — siksi kenttä on pakollinen
 * juuri tässä tilassa.
 *
 * MAKSUEHTO ON SOPIMUKSEN YDIN. Josua pyysi nimenomaan ehdon, jossa
 * tilaaja sitoutuu maksamaan työn valmistuttua. Se on oma kohtansa ja
 * kirjoitettu niin ettei siitä voi olla kahta mieltä: laskutusperuste on
 * valmistuminen, ei aika eikä arvio.
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataFile = process.argv[2] || path.join(__dirname, 'sopimus-data.json')
const d = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
const outFile = process.argv[3] || path.join(__dirname, `sopimus-${d.numero}.pdf`)

const PAKOLLISET = [
  ['numero', d.numero], ['paiva', d.paiva],
  ['toimittaja.nimi', d.toimittaja?.nimi], ['toimittaja.ytunnus', d.toimittaja?.ytunnus],
  ['tilaaja.nimi', d.tilaaja?.nimi], ['tilaaja.edustaja', d.tilaaja?.edustaja],
  ['kohde.osoite', d.kohde?.osoite],
  ['maksuehto.paivia', d.maksuehto?.paivia],
  ['allekirjoittaja', d.allekirjoittaja],
]
const puuttuu = PAKOLLISET.filter(([, v]) => !String(v ?? '').trim() || /^TÄYTÄ/i.test(String(v)))
if (!Array.isArray(d.tyot) || d.tyot.length === 0) puuttuu.push(['tyot'])
const hyvaksynta = d.hyvaksynta || 'sahkoposti'
if (hyvaksynta === 'sahkoposti' && !String(d.tilaaja?.sahkoposti ?? '').trim()) {
  puuttuu.push(['tilaaja.sahkoposti (sähköpostihyväksyntä)'])
}
if (puuttuu.length) {
  console.error('✗ Sopimusta ei renderöity, koska näitä tietoja ei ole:')
  for (const [k] of puuttuu) console.error('   · ' + k)
  process.exit(1)
}

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const eur = n => Number(n).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

const yhteensa = d.tyot.reduce((s, t) => s + t.maara * t.hinta, 0)

const rivit = d.tyot.map(t => `
  <tr>
    <td>${esc(t.nimi)}${t.huom ? `<div class="huom">${esc(t.huom)}</div>` : ''}</td>
    <td class="n">${t.maara === 1 && t.yksikko === 'erä' ? '—' : `${t.maara} ${esc(t.yksikko || 'kpl')}`}</td>
    <td class="n">${t.maara === 1 && t.yksikko === 'erä' ? '—' : eur(t.hinta)}</td>
    <td class="n b">${eur(t.maara * t.hinta)}</td>
  </tr>`).join('')

const html = `<!doctype html><html lang="fi"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 16mm 16mm 16mm; }
  * { box-sizing: border-box }
  body { margin:0; font-family:"Manrope",system-ui,sans-serif; font-size:10.3pt; line-height:1.55; color:#16231C }
  .head { display:flex; justify-content:space-between; align-items:flex-start; gap:20px;
          border-bottom:2px solid #1F7A4C; padding-bottom:9px; margin-bottom:16px }
  .brand { font-size:15pt; font-weight:800; letter-spacing:-.02em; color:#155637 }
  .brand small { display:block; font-size:8.4pt; font-weight:500; color:#5C6B62; letter-spacing:0 }
  .meta { text-align:right; font-size:9pt; color:#5C6B62 }
  .meta b { color:#16231C; font-size:10.5pt }
  h1 { font-size:16pt; font-weight:800; letter-spacing:-.02em; margin:0 0 3px }
  .lead { color:#5C6B62; margin:0 0 16px; font-size:9.6pt }
  h2 { font-size:10.6pt; font-weight:800; margin:16px 0 6px; color:#155637;
       text-transform:uppercase; letter-spacing:.05em }
  p { margin:0 0 7px }
  .cols { display:flex; gap:14px }
  .box { flex:1; border:1px solid #DBE2D8; border-radius:6px; padding:10px 12px; background:#F7F9F6 }
  .box .k { font-size:8pt; text-transform:uppercase; letter-spacing:.07em; color:#5C6B62; margin-bottom:3px }
  .box .v { font-weight:700 }
  .box .r { font-size:9.3pt; color:#32423A }
  table { width:100%; border-collapse:collapse; margin-top:6px }
  th { text-align:left; font-size:8pt; text-transform:uppercase; letter-spacing:.06em;
       color:#5C6B62; border-bottom:1px solid #DBE2D8; padding:0 6px 4px }
  td { padding:6px; border-bottom:1px solid #EDF1EB; vertical-align:top }
  td.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap }
  td.b { font-weight:700 }
  .huom { font-size:8.6pt; color:#5C6B62; margin-top:2px }
  tr.sum td { border-bottom:none; border-top:2px solid #1F7A4C; padding-top:8px;
              font-size:12pt; font-weight:800; color:#155637 }
  .maksu { border:2px solid #1F7A4C; border-radius:7px; padding:11px 13px; background:#EAF4EE; margin-top:4px }
  .maksu h2 { margin-top:0 }
  ol { margin:0; padding-left:16px }
  ol li { margin-bottom:4px }
  .hyvaksy { border:2px solid #1F7A4C; border-radius:7px; padding:11px 13px;
             background:#EAF4EE; margin-top:6px; page-break-inside:avoid }
  .hyvaksy h2 { margin-top:0 }
  .lause { display:block; margin:6px 0; padding:8px 11px; background:#fff;
           border:1px solid #1F7A4C; border-radius:5px; font-weight:700; font-size:11pt }
  .osapuolet { display:flex; gap:26px; margin-top:16px; page-break-inside:avoid }
  .osapuolet > div { flex:1; border-top:2px solid #16231C; padding-top:6px }
  .osapuolet .k { font-size:8.4pt; text-transform:uppercase; letter-spacing:.06em; color:#5C6B62 }
  .osapuolet .n { font-weight:700; margin-top:2px }
  .osapuolet .r { font-size:9.3pt; color:#32423A }
  .allek { display:flex; gap:26px; margin-top:26px; page-break-inside:avoid }
  .allek > div { flex:1 }
  .viiva { border-bottom:1px solid #16231C; height:34px; margin-bottom:5px }
  .allek .k { font-size:8.4pt; color:#5C6B62 }
  .allek .n { font-weight:700 }
  footer { margin-top:20px; border-top:1px solid #DBE2D8; padding-top:7px;
           font-size:8.4pt; color:#5C6B62; display:flex; justify-content:space-between }
</style></head><body>

<div class="head">
  <div class="brand">TiivisKoti Oy<small>Y-tunnus ${esc(d.toimittaja.ytunnus)} · ${esc(d.toimittaja.sahkoposti)}${d.toimittaja.puhelin ? ' · ' + esc(d.toimittaja.puhelin) : ''}</small></div>
  <div class="meta"><b>Sopimus ${esc(d.numero)}</b><br>${esc(d.paiva)}</div>
</div>

<h1>Sopimus tiivistystyöstä</h1>
<p class="lead">Tällä sopimuksella sovitaan alla kuvatun työn sisällöstä, hinnasta ja maksuehdosta.</p>

<h2>1. Osapuolet</h2>
<div class="cols">
  <div class="box">
    <div class="k">Toimittaja</div>
    <div class="v">${esc(d.toimittaja.nimi)}</div>
    <div class="r">Y-tunnus ${esc(d.toimittaja.ytunnus)}</div>
    ${d.toimittaja.osoite ? `<div class="r">${esc(d.toimittaja.osoite)}</div>` : ''}
  </div>
  <div class="box">
    <div class="k">Tilaaja</div>
    <div class="v">${esc(d.tilaaja.nimi)}</div>
    ${d.tilaaja.ytunnus ? `<div class="r">Y-tunnus ${esc(d.tilaaja.ytunnus)}</div>` : ''}
    <div class="r">Edustaja: ${esc(d.tilaaja.edustaja)}</div>
    ${d.tilaaja.sahkoposti ? `<div class="r">${esc(d.tilaaja.sahkoposti)}</div>` : ''}
  </div>
</div>

<h2>2. Kohde</h2>
<p>${esc(d.kohde.osoite)}${d.kohde.lisatieto ? ` — ${esc(d.kohde.lisatieto)}` : ''}</p>

<h2>3. Työn sisältö ja hinta</h2>
<table>
  <thead><tr><th>Työ</th><th class="n">Määrä</th><th class="n">à</th><th class="n">Yhteensä</th></tr></thead>
  <tbody>
    ${rivit}
    <tr class="sum"><td colspan="3">Yhteensä</td><td class="n">${eur(yhteensa)}</td></tr>
  </tbody>
</table>
<p style="margin-top:7px">Hinta on kiinteä ja sisältää tiivisteet, tarvikkeet, työn ja arvonlisäveron
${esc(d.alv)} %. Hintaan ei lisätä matka- tai aloituskuluja.</p>
${d.sisaltyy?.length ? `<p style="margin-top:5px">Työhön sisältyy: ${d.sisaltyy.map(esc).join(' · ')}.</p>` : ''}

<div class="maksu">
  <h2>4. Maksuehto</h2>
  <p><b>Tilaaja sitoutuu maksamaan sopimuksen mukaisen hinnan, kun työ on tehty.</b>
  Lasku lähetetään vasta sen jälkeen, kun työ on valmis ja osapuolet ovat todenneet sen
  tehdyksi. Ennakkomaksua ei peritä eikä osalaskuja lähetetä.</p>
  <p>Maksuaika on ${esc(String(d.maksuehto.paivia))} päivää laskun päiväyksestä.
  Viivästyskorko on korkolain mukainen.</p>
  ${d.maksuehto.lisatieto ? `<p>${esc(d.maksuehto.lisatieto)}</p>` : ''}
</div>

<h2>5. Aikataulu</h2>
<p>${esc(d.aikataulu)}</p>

<h2>6. Tilaajan myötävaikutus</h2>
<ol>
  ${(d.tilaajanVastuut || []).map(v => `<li>${esc(v)}</li>`).join('')}
</ol>

<h2>7. Muut ehdot</h2>
<ol>
  ${(d.muutEhdot || []).map(v => `<li>${esc(v)}</li>`).join('')}
</ol>

${hyvaksynta === 'sahkoposti' ? `
<div class="hyvaksy">
  <h2>8. Sopimuksen hyväksyminen</h2>
  <p><b>Tämä sopimus hyväksytään sähköisesti. Paperisia kappaleita ei tarvita
  eikä sopimusta tarvitse tulostaa tai allekirjoittaa käsin.</b></p>
  <p>Toimittaja on hyväksynyt sopimuksen lähettäessään sen tilaajalle ${esc(d.paiva)}.
  Tilaaja hyväksyy sopimuksen vastaamalla osoitteesta ${esc(d.tilaaja.sahkoposti)}
  siihen sähköpostiviestiin, jonka liitteenä tämä sopimus on toimitettu, viestillä:</p>
  <span class="lause">Hyväksyn sopimuksen ${esc(d.numero)}.</span>
  <p>Tilaajan lähettämä hyväksyntäviesti sitoo osapuolia samalla tavalla kuin
  allekirjoitettu paperisopimus. Molemmat osapuolet säilyttävät viestin. Jos
  sopimukseen halutaan muutoksia, ne sovitaan kirjallisesti ennen hyväksyntää.</p>
</div>

<div class="osapuolet">
  <div>
    <div class="k">Toimittaja</div>
    <div class="n">${esc(d.allekirjoittaja)}</div>
    <div class="r">${esc(d.toimittaja.nimi)}</div>
    <div class="r">Hyväksytty sähköisesti ${esc(d.paiva)}</div>
  </div>
  <div>
    <div class="k">Tilaaja</div>
    <div class="n">${esc(d.tilaaja.edustaja)}</div>
    <div class="r">${esc(d.tilaaja.nimi)}</div>
    <div class="r">Hyväksyntä sähköpostivastauksella osoitteesta ${esc(d.tilaaja.sahkoposti)}</div>
  </div>
</div>` : `
<div class="allek">
  <div>
    <div class="k">Paikka ja aika</div>
    <div class="viiva"></div>
    <div class="k">Toimittaja</div>
    <div class="viiva"></div>
    <div class="n">${esc(d.allekirjoittaja)}</div>
    <div class="k">${esc(d.toimittaja.nimi)}</div>
  </div>
  <div>
    <div class="k">Paikka ja aika</div>
    <div class="viiva"></div>
    <div class="k">Tilaaja</div>
    <div class="viiva"></div>
    <div class="n">${esc(d.tilaaja.edustaja)}</div>
    <div class="k">${esc(d.tilaaja.nimi)}</div>
  </div>
</div>`}

<footer>
  <span>${esc(d.toimittaja.nimi)} · Y-tunnus ${esc(d.toimittaja.ytunnus)}</span>
  <span>Sopimus ${esc(d.numero)} · ${esc(d.paiva)}</span>
</footer>
</body></html>`

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: outFile, format: 'A4', printBackground: true })
await browser.close()
console.log(`✓ ${outFile}`)
console.log(`  ${d.tilaaja.nimi} — ${eur(yhteensa)} — maksu työn valmistuttua, ${d.maksuehto.paivia} pv`)
