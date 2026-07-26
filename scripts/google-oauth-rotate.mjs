#!/usr/bin/env node
/**
 * TiivisKoti — Google OAuth -salaisuuksien kierrätys, VUOTAMATON versio.
 *
 * Ero `google-oauth-setup.mjs`:ään: se ottaa client secretin komentoriviltä ja
 * TULOSTAA refresh tokenin ruudulle. Kun skriptiä ajetaan agentin kautta, sekä
 * komento että tuloste tallentuvat keskusteluhistoriaan — eli juuri se vuoto
 * jota kierrätyksellä korjataan. Tämä versio lukee syötteen tiedostosta ja
 * kirjoittaa tuloksen tiedostoon; ruudulle menee vain tila, ei salaisuuksia.
 *
 * KÄYTTÖ
 *   node scripts/google-oauth-rotate.mjs <in.json> <out.json>
 *
 * in.json:
 *   { "client_id": "…apps.googleusercontent.com", "client_secret": "GOCSPX-…" }
 *
 * out.json (skripti kirjoittaa):
 *   { "client_id": "…", "client_secret": "…", "refresh_token": "…", "scope": "…" }
 *
 * ENNAKKOVAATIMUS: OAuth-clientin sallittuihin redirect-URIeihin pitää kuulua
 *   http://localhost:8123/oauth2callback
 * (Se on jo olemassa nykyisellä clientillä. Jos luot kokonaan uuden clientin,
 *  lisää se sinne käsin.)
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const PORT = 8123;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
];

const [, , IN_PATH, OUT_PATH] = process.argv;
if (!IN_PATH || !OUT_PATH) {
  console.error('Käyttö: node scripts/google-oauth-rotate.mjs <in.json> <out.json>');
  process.exit(1);
}

let CLIENT_ID, CLIENT_SECRET;
try {
  const cfg = JSON.parse(readFileSync(IN_PATH, 'utf8'));
  CLIENT_ID = String(cfg.client_id || '').trim();
  CLIENT_SECRET = String(cfg.client_secret || '').trim();
} catch (e) {
  console.error(`✗ Syötetiedostoa ei voitu lukea: ${IN_PATH}\n  ${e.message}`);
  process.exit(1);
}
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('✗ in.json tarvitsee kentät client_id ja client_secret.');
  process.exit(1);
}
// Vain pituudet ja etuliite — ei arvoja.
console.log(`client_id  : ${CLIENT_ID.length} merkkiä, päättyy …${CLIENT_ID.slice(-24)}`);
console.log(`client_secret: ${CLIENT_SECRET.length} merkkiä, alkaa ${CLIENT_SECRET.slice(0, 7)}…`);

const state = randomBytes(16).toString('hex');
const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // pakottaa refresh tokenin vaikka sovellus on jo hyväksytty
    state,
    login_hint: 'info@tiiviskoti.fi',
  }).toString();

function openBrowser(url) {
  // Windowsilla `cmd /c start` katkaisee URLin ensimmäiseen &-merkkiin.
  const cmd =
    process.platform === 'win32'
      ? ['powershell', ['-NoProfile', '-Command', `Start-Process '${url.replace(/'/g, "''")}'`]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref(); } catch { /* avaa käsin */ }
}

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    // Älä tulosta bodya sellaisenaan — se voi kaiuttaa salaisuuksia takaisin.
    throw new Error(`Token exchange failed: HTTP ${res.status}, error=${data.error || '?'}`);
  }
  return data;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth2callback') { res.writeHead(404).end('not found'); return; }

  const err = url.searchParams.get('error');
  if (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Valtuutus epäonnistui: ${err}`);
    console.error(`\n✗ Valtuutus epäonnistui: ${err}`);
    server.close(); process.exit(1);
  }
  if (url.searchParams.get('state') !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('state-tarkistus epäonnistui');
    console.error('\n✗ state ei täsmää — keskeytetään (mahdollinen CSRF).');
    server.close(); process.exit(1);
  }

  try {
    const tokens = await exchangeCode(url.searchParams.get('code'));
    if (!tokens.refresh_token) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end('Google ei palauttanut refresh tokenia.');
      console.error(
        '\n✗ Refresh tokenia ei tullut. Poista sovelluksen oikeudet osoitteessa\n' +
        '  https://myaccount.google.com/permissions ja aja uudelleen.',
      );
      server.close(); process.exit(1);
    }

    writeFileSync(OUT_PATH, JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
    }, null, 2), 'utf8');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      '<html><body style="font-family:system-ui;padding:40px">' +
      '<h2>Valmis</h2><p>Refresh token haettu ja tallennettu tiedostoon. Voit sulkea tämän välilehden.</p>' +
      '</body></html>',
    );

    // Vain tila — ei salaisuuksia.
    console.log(`\n✓ Refresh token haettu (${tokens.refresh_token.length} merkkiä) ja kirjoitettu: ${OUT_PATH}`);
    console.log(`  Myönnetyt scopet: ${tokens.scope}`);
    console.log('  MUISTA poistaa tuo tiedosto kun secretit on asetettu.');
    server.close(); process.exit(0);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Virhe, katso terminaali.');
    console.error('\n✗', e.message);
    server.close(); process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nKuunnellaan ${REDIRECT_URI}`);
  console.log('Avataan selain — hyväksy oikeudet tilillä info@tiiviskoti.fi.');
  console.log('Jos selain ei avaudu, avaa tämä osoite käsin:\n');
  console.log(authUrl + '\n');
  openBrowser(authUrl);
});
