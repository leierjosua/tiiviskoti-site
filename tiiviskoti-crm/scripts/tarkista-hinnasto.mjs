/* =========================================================
   Vahtii ettei CRM:n hinnasto eroa sivuston hinnastosta.

   MIKSI: tiiviskoti/pricing.mjs on hinnoittelun ainoa totuuden lähde, mutta
   CRM on erillinen Next-sovellus omalla Vercel-projektillaan eikä importoi
   sen ulkopuolelta. src/lib/pricing.ts on siksi käsin ylläpidetty kopio — ja
   se ajautui kertaalleen erilleen: ulko- ja parvekeoven hinta muutettiin
   99 €:oon sivustolle, mutta CRM tarjosi yhä 119 €. Tarjouksissa luki väärä
   ovihinta useita päiviä eikä sitä huomannut kukaan.

   Tämä ajetaan ennen jokaista rakennusta. Jos hinnat eroavat, rakennus
   kaatuu tähän eikä hajonnut hinnasto pääse tuotantoon.

   Verrataan vain rahaa ja porrastusta — kuvaustekstit ja työaika-arviot
   saavat erota, ne eivät päädy asiakkaan laskuun.
   ========================================================= */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const LAHDE = resolve(here, '../../tiiviskoti/pricing.mjs');
const KOPIO = resolve(here, '../src/lib/pricing.ts');

/* Sivusto voi puuttua: CRM:n voi kloonata yksinään, ja silloin vertailua ei
   ole mihin tehdä. Se ei ole virhe — vahti vain ohitetaan. */
let lahde;
try {
  lahde = await import(LAHDE);
} catch {
  console.log('· hinnastovahti ohitettu (tiiviskoti/pricing.mjs ei saatavilla)');
  process.exit(0);
}

/* Kopio luetaan tekstinä eikä importoimalla: se on TypeScriptiä, jota tämä
   skripti ei osaa ajaa ilman käännöstä. Poimitaan luvut lähdekoodista. */
const teksti = readFileSync(KOPIO, 'utf8');
const rivit = teksti.split('\n');

const poimiLuku = (rivi, avain) => {
  const m = rivi.match(new RegExp(`\\b${avain}:\\s*(\\d+)`));
  return m ? Number(m[1]) : undefined;
};

const virheet = [];

for (const t of lahde.TYPES) {
  const rivi = rivit.find((r) => r.includes(`id: '${t.id}'`) && r.includes('name:'));
  if (!rivi) { virheet.push(`${t.id}: puuttuu kokonaan CRM:n hinnastosta`); continue; }
  const price = poimiLuku(rivi, 'price');
  const combo = poimiLuku(rivi, 'combo');
  if (price !== t.price) virheet.push(`${t.id}.price: sivusto ${t.price} € · CRM ${price ?? '—'} €`);
  if ((combo ?? null) !== (t.combo ?? null)) virheet.push(`${t.id}.combo: sivusto ${t.combo ?? '—'} € · CRM ${combo ?? '—'} €`);
}

const portaat = [...teksti.matchAll(/\{\s*upTo:\s*([\w.]+),\s*price:\s*(\d+)\s*\}/g)]
  .map((m) => ({ upTo: m[1] === 'Infinity' ? Infinity : Number(m[1]), price: Number(m[2]) }));
if (portaat.length !== lahde.WINDOW_TIERS.length) {
  virheet.push(`ikkunaportaita: sivusto ${lahde.WINDOW_TIERS.length} kpl · CRM ${portaat.length} kpl`);
} else {
  lahde.WINDOW_TIERS.forEach((t, i) => {
    if (portaat[i].upTo !== t.upTo || portaat[i].price !== t.price) {
      virheet.push(`ikkunaporras ${i + 1}: sivusto ≤${t.upTo} → ${t.price} € · CRM ≤${portaat[i].upTo} → ${portaat[i].price} €`);
    }
  });
}

for (const e of lahde.EXTRAS) {
  const rivi = rivit.find((r) => r.includes(`id: '${e.id}'`) && r.includes('per:'));
  if (!rivi) { virheet.push(`lisätyö ${e.id}: puuttuu CRM:n hinnastosta`); continue; }
  const price = poimiLuku(rivi, 'price');
  if (price !== e.price) virheet.push(`lisätyö ${e.id}: sivusto ${e.price} € · CRM ${price ?? '—'} €`);
}

const min = Number((teksti.match(/MIN_PRICE\s*=\s*(\d+)/) || [])[1]);
if (min !== lahde.MIN_PRICE) virheet.push(`MIN_PRICE: sivusto ${lahde.MIN_PRICE} € · CRM ${min} €`);

if (virheet.length) {
  console.error('\n✗ HINNASTO ERI KUIN SIVUSTOLLA — rakennus keskeytetty\n');
  for (const v of virheet) console.error('   ' + v);
  console.error('\n  Korjaa src/lib/pricing.ts vastaamaan tiiviskoti/pricing.mjs:ää.\n');
  process.exit(1);
}

console.log('✓ hinnasto täsmää sivuston kanssa');
