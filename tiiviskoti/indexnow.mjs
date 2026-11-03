#!/usr/bin/env node
/* IndexNow: kertoo Bingille (ja sen kautta Copilotille ja ChatGPT:n haulle)
   heti, mitkä sivut ovat muuttuneet — muuten Bing löytää muutokset vasta
   omalla indeksointikierroksellaan, joka voi kestää viikkoja.

   Ajo deployn jälkeen:  node tiiviskoti/indexnow.mjs            (koko sitemap)
                         node tiiviskoti/indexnow.mjs /hinta.html (vain nämä)

   Avain on julkinen tarkoituksella: Bing tarkistaa omistajuuden hakemalla
   https://tiiviskoti.fi/<avain>.txt — tiedoston on oltava livenä ennen pingiä. */
const KEY = '086eda6bea9d52484a43e0a42a3d5281';
const HOST = 'tiiviskoti.fi';

let urls = process.argv.slice(2).map((p) => `https://${HOST}${p.startsWith('/') ? p : '/' + p}`);
if (urls.length === 0) {
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
// 200 = vastaanotettu, 202 = vastaanotettu mutta avainta ei ole vielä todennettu.
console.log(`IndexNow ${res.status} — ${urls.length} osoitetta`);
if (res.status >= 400) { console.log(await res.text()); process.exit(1); }
