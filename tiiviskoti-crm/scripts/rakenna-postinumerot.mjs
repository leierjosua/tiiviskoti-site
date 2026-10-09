/* Rakentaa src/data/postinumerot.json Tilastokeskuksen Paavo-aineistosta.

   Rivi: [postinumero, alueen nimi, kunta, lat, lon, asukkaat]. Koordinaatti
   on Paavon edustava piste (euref_x/y, ETRS-TM35FIN), ei polygonin
   painopiste — se osuu aina alueen sisälle myös mutkaisilla alueilla.

   Paavo päivittyy kerran vuodessa. Aja uudelleen kun postinumeroita
   muuttuu: node scripts/rakenna-postinumerot.mjs [vuosi] */
import fs from 'node:fs';

const YEAR = process.argv[2] ?? String(new Date().getFullYear());
const WFS = 'https://geo.stat.fi/geoserver';
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
// ETRS-TM35FIN (EPSG:3067) → WGS84. Käänteinen poikittainen Mercator, GRS80.
function tm35ToWgs(E, N) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lon0 = 27 * Math.PI / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const x = E - 500000, M = N / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2);
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5;
  const D = x / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D ** 2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(p1);
  return [lat * 180 / Math.PI, lon * 180 / Math.PI];
}
const kuntaJson = await getJson(`${WFS}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k&outputFormat=json&propertyName=kunta,nimi`);
const paavoJson = await getJson(`${WFS}/postialue/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=postialue:pno_tilasto_${YEAR}&outputFormat=json&propertyName=postinumeroalue,nimi,euref_x,euref_y,kunta,he_vakiy`);
const kunnat = Object.fromEntries(kuntaJson.features.map(f => [f.properties.kunta, f.properties.nimi]));
const rows = paavoJson.features.map(f => {
  const p = f.properties;
  const [lat, lon] = tm35ToWgs(p.euref_x, p.euref_y);
  return [p.postinumeroalue, p.nimi, kunnat[p.kunta] ?? '', +lat.toFixed(5), +lon.toFixed(5), Math.max(0, p.he_vakiy ?? 0)];
}).sort((a, b) => a[0].localeCompare(b[0]));
if (rows.length < 2500) throw new Error(`Vain ${rows.length} postinumeroa — aineisto vajaa, ei kirjoiteta`);
// Tunnettu piste: 00100 on Etu-Töölössä. Väärä projektio näkyisi heti tässä.
const h = rows.find((r) => r[0] === '00100');
if (!h || Math.abs(h[3] - 60.17) > 0.02 || Math.abs(h[4] - 24.93) > 0.02) throw new Error(`00100 väärässä paikassa: ${h}`);
fs.writeFileSync(new URL('../src/data/postinumerot.json', import.meta.url), JSON.stringify(rows));
console.log(`${rows.length} postinumeroa (Paavo ${YEAR}) → src/data/postinumerot.json`);
