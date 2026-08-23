#!/usr/bin/env node
/**
 * TiivisKoti — Google Ads -rajapinnan refresh tokenin hakuapuri.
 *
 * Hakee tokenin, jolla CRM lähettää offline-konversiot Google Adsiin
 * (lib/google-ads.ts). Erillinen Gmailin/Calendarin tokenista kahdesta
 * syystä: Ads vaatii `adwords`-oikeuden, jota siinä ei ole, ja Ads-tili on
 * usein eri Google-tilillä kuin info@tiiviskoti.fi. Erillinen token pitää
 * viat erillään — Ads-lähetys voi olla poikki ilman että varausvahvistukset
 * lakkaavat lähtemästä.
 *
 * KÄYTTÖ
 *   node scripts/google-ads-oauth.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * Kirjaudu sillä Google-tilillä jolla on pääsy Ads-tilille. Skripti avaa
 * selaimen, ottaa vastaan callbackin osoitteessa
 * http://localhost:8123/oauth2callback ja tulostaa valmiit
 * `vercel env add` -komennot.
 *
 * ENNAKKOVAATIMUS (kertaalleen):
 *   1. Google Cloud Console → APIs & Services → Library → ota käyttöön
 *      **Google Ads API** siinä projektissa jonka OAuth-clientia käytät.
 *   2. Credentials → OAuth client ID → Web application →
 *      Authorized redirect URIs: http://localhost:8123/oauth2callback
 *   3. Google Ads → Työkalut → API Center → hae **developer token**.
 *      Testitokenilla pääsee vain testitileille; oikeaan tiliin tarvitaan
 *      vähintään Basic access, joka pitää hakea erikseen.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const PORT = 8123;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
/* Vain Ads. Pyydetään mahdollisimman kapeasti: tämä token ei saa pystyä
   lukemaan sähköposteja eikä kirjoittamaan kalenteriin. */
const SCOPES = ['https://www.googleapis.com/auth/adwords'];

const [, , CLIENT_ID, CLIENT_SECRET] = process.argv;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Käyttö: node scripts/google-ads-oauth.mjs <CLIENT_ID> <CLIENT_SECRET>');
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
    console.log('Vie arvot tiiviskoti-crm-projektin ympäristömuuttujiin:\n');
    console.log(`  GOOGLE_ADS_OAUTH_CLIENT_ID      = ${CLIENT_ID}`);
    console.log(`  GOOGLE_ADS_OAUTH_CLIENT_SECRET  = ${CLIENT_SECRET}`);
    console.log(`  GOOGLE_ADS_OAUTH_REFRESH_TOKEN  = ${tokens.refresh_token}`);
    console.log('\nLisäksi tarvitaan (Adsin puolelta):');
    console.log('  GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_CONVERSION_ACTION_ID');
    console.log('\nKomentoriviltä esimerkiksi:');
    console.log('  cd tiiviskoti-crm && npx vercel env add GOOGLE_ADS_OAUTH_REFRESH_TOKEN production');
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
  console.log('TiivisKoti — Google Ads OAuth setup');
  console.log(`\nKuunnellaan ${REDIRECT_URI}`);
  console.log('\nAvataan selain. Kirjaudu sillä tilillä jolla on pääsy Google Ads -tiliin.');
  console.log('\nJos selain ei aukea, avaa tämä osoite käsin:\n');
  console.log(authUrl + '\n');
  openBrowser(authUrl);
});
