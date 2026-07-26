#!/usr/bin/env node
/**
 * TiivisKoti — Google OAuth refresh tokenin hakuapuri.
 *
 * Hakee kertaluontoisesti refresh tokenin, jolla edge-funktiot lähettävät
 * Gmailia ja kirjoittavat Google Calendariin info@tiiviskoti.fi:n oikeuksilla.
 * Tämä on vaihtoehto service account -avaimelle silloin kun org-policy
 * `constraints/iam.disableServiceAccountKeyCreation` estää avaimen luonnin.
 *
 * KÄYTTÖ
 *   node scripts/google-oauth-setup.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * Skripti avaa selaimen, ottaa vastaan callbackin osoitteessa
 * http://localhost:8123/oauth2callback, vaihtaa koodin tokeneihin ja tulostaa
 * valmiin `supabase secrets set` -komennon.
 *
 * ENNAKKOVAATIMUS (Google Cloud Console, kertaalleen):
 *   1. APIs & Services → OAuth consent screen → User type: Internal
 *      (Workspace-organisaatiossa Internal riittää — ei Google-tarkistusta)
 *   2. APIs & Services → Credentials → Create credentials → OAuth client ID
 *      → Application type: **Web application**
 *      → Authorized redirect URIs: http://localhost:8123/oauth2callback
 *   3. Kopioi Client ID ja Client secret tämän skriptin argumenteiksi.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const PORT = 8123;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
];

const [, , CLIENT_ID, CLIENT_SECRET] = process.argv;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Käyttö: node scripts/google-oauth-setup.mjs <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const state = randomBytes(16).toString('hex');

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    // offline + consent = pakota refresh tokenin palautus myös silloin kun
    // sovellus on jo kertaalleen hyväksytty
    access_type: 'offline',
    prompt: 'consent',
    state,
    login_hint: 'info@tiiviskoti.fi',
  }).toString();

function openBrowser(url) {
  // Windows: `cmd /c start` tulkitsee &-merkin komennon erottimeksi, jolloin
  // OAuth-URL katkeaa ensimmäiseen &:iin ja Google vastaa
  // "Required parameter is missing: response_type". PowerShellin Start-Process
  // ei kärsi tästä, joten käytetään sitä ja välitetään URL yksinkertaisissa
  // lainausmerkeissä.
  const cmd =
    process.platform === 'win32'
      ? ['powershell', ['-NoProfile', '-Command', `Start-Process '${url.replace(/'/g, "''")}'`]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* selain avataan käsin alla olevasta linkistä */
  }
}

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end('not found');
    return;
  }

  const err = url.searchParams.get('error');
  if (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end(`Valtuutus epäonnistui: ${err}`);
    console.error(`\n✗ Valtuutus epäonnistui: ${err}`);
    server.close();
    process.exit(1);
  }

  if (url.searchParams.get('state') !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('state-tarkistus epäonnistui');
    console.error('\n✗ state ei täsmää — keskeytetään (mahdollinen CSRF).');
    server.close();
    process.exit(1);
  }

  const code = url.searchParams.get('code');
  try {
    const tokens = await exchangeCode(code);

    if (!tokens.refresh_token) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end('Google ei palauttanut refresh tokenia. Poista sovelluksen oikeudet ja yritä uudelleen.');
      console.error(
        '\n✗ Refresh tokenia ei tullut.\n' +
        '  Käy poistamassa sovelluksen oikeudet osoitteessa\n' +
        '  https://myaccount.google.com/permissions ja aja skripti uudelleen.',
      );
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      '<html><body style="font-family:system-ui;padding:40px">' +
      '<h2>Valmis</h2><p>Refresh token haettu. Voit sulkea tämän välilehden ja palata terminaaliin.</p>' +
      '</body></html>',
    );

    console.log('\n✓ Refresh token haettu.\n');
    console.log('Aseta secretit Supabaseen tällä komennolla:\n');
    console.log('supabase secrets set \\');
    console.log(`  GOOGLE_OAUTH_CLIENT_ID="${CLIENT_ID}" \\`);
    console.log(`  GOOGLE_OAUTH_CLIENT_SECRET="${CLIENT_SECRET}" \\`);
    console.log(`  GOOGLE_OAUTH_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log('\nMyönnetyt scopet:', tokens.scope);
    console.log(
      '\nHUOM: refresh token on salaisuus — älä committaa sitä äläkä jaa. ' +
      'Se lakkaa toimimasta jos tilin salasana vaihdetaan tai oikeudet perutaan.',
    );

    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(e));
    console.error('\n✗', e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('TiivisKoti — Google OAuth setup');
  console.log(`\nKuunnellaan ${REDIRECT_URI}`);
  console.log('\nAvataan selain. Kirjaudu info@tiiviskoti.fi -tilillä ja hyväksy oikeudet.');
  console.log('\nJos selain ei aukea, avaa tämä osoite käsin:\n');
  console.log(authUrl + '\n');
  openBrowser(authUrl);
});
