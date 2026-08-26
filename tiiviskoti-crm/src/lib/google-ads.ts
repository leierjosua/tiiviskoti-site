import 'server-only';

/* =========================================================
   Google Ads -konversioiden lähetys rajapinnan kautta
   (offline conversion import, **Data Manager API**).

   MIKSI DATA MANAGER EIKÄ ADS API: Google sulki 26.8.2026 mennessä
   `ConversionUploadService.UploadClickConversions` -polun uusilta
   integraatioilta ("Usage ... is limited to existing users"). Basic access
   -hyväksyntä tuli samana päivänä, mutta vanha reitti vastasi silti
   hylkäyksellä. Korvaava rajapinta on datamanager.googleapis.com, ja se on
   yksinkertaisempi: **developer-tokenia ei tarvita lainkaan**, pelkkä
   OAuth-token jolla on `datamanager`-scope ja pääsy mainostilille.
   Todennettu 26.8.2026: `validateOnly: true` → HTTP 200.

   MIKSI PALVELINPUOLELTA: tiiviskoti.fi:llä ei ole gtag.js:ää eikä
   seurantaevästeitä — tietosuojaseloste lupaa niin. Google ei siis näe
   varausta selaimessa lainkaan. Sivusto ottaa mainosklikin tunnisteen
   talteen, se kulkee varauksen mukana kantaan, ja kauppa ilmoitetaan
   Adsille täältä. Googlelle menee klikin tunniste, ajankohta ja arvo —
   ei nimeä, yhteystietoja eikä osoitetta.

   SUHDE CSV-VIENTIIN: /ads-näkymän CSV tekee saman käsin. Se jää
   paikalleen varatieksi, koska rajapinta voi olla poissa käytöstä
   (token vanhentunut, developer token peruttu) juuri silloin kun
   konversiot pitäisi saada perille. Molemmat käyttävät samaa
   konversiotapahtuman nimeä; CSV tunnistaa sen nimellä, rajapinta
   tunnisteella.

   Ympäristömuuttujat (tiiviskoti-crm Vercel):
     GOOGLE_ADS_DEVELOPER_TOKEN       — EI ENÄÄ KÄYTÖSSÄ lähetyksessä (Data Manager ei vaadi sitä).
                                       Jätetty ympäristöön: Ads API:n lukukyselyt vaativat sen yhä.
     GOOGLE_ADS_CUSTOMER_ID           — mainostilin id, väliviivat sallittu
     GOOGLE_ADS_CONVERSION_ACTION_ID  — konversiotapahtuman numero-osa
     GOOGLE_ADS_LOGIN_CUSTOMER_ID     — (valinnainen) hallinnointitili, jos tili on MCC:n alla
     GOOGLE_ADS_OAUTH_REFRESH_TOKEN   — oma token; **tarvitsee `datamanager`-scopen**
                                       (hae: node scripts/google-ads-oauth.mjs <CLIENT_ID> <CLIENT_SECRET>)

   MIKSI OMAT OAUTH-TUNNUKSET OVAT MAHDOLLISIA: Ads vaatii `adwords`-
   oikeuden, jota Gmail/Calendar-tokenissa ei ole. Sen voi lisätä samaan
   tokeniin uudella suostumuksella, mutta silloin epäonnistunut uusinta
   veisi mennessään myös varausvahvistukset. Erillinen token pitää viat
   erillään: Ads-lähetys voi olla poikki ilman että asiakas jää ilman
   sähköpostia. Ilman omaa tokenia palataan yhteiseen.
   ========================================================= */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const INGEST_URL = 'https://datamanager.googleapis.com/v1/events:ingest';

/* Tilitunnukset kirjoitetaan Adsissa muodossa 123-456-7890, mutta
   rajapinta ottaa vastaan vain numerot. Siivotaan tässä, jotta
   ympäristömuuttujaan saa kopioida sen mitä ruudulla näkyy. */
const digits = (v: string | undefined) => (v || '').replace(/\D/g, '');

const CUSTOMER_ID = digits(process.env.GOOGLE_ADS_CUSTOMER_ID);
const LOGIN_CUSTOMER_ID = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
const CONVERSION_ACTION_ID = digits(process.env.GOOGLE_ADS_CONVERSION_ACTION_ID);

/** Klikkitunnisteen tyyppi. Rajapinnassa kullakin on oma kenttänsä, eikä
 *  arvo kelpaa toisen paikalle. Ks. db/017_ads_conversions.sql. */
export type ClickKind = 'gclid' | 'wbraid' | 'gbraid';

export type PendingConversion = {
  jobId: string;
  jobNumber: string;
  clickId: string;
  clickKind: ClickKind;
  createdAt: Date;
  priceCents: number;
};

export type UploadOutcome =
  | { ok: true; jobId: string }
  | { ok: false; jobId: string; error: string };

export type UploadResult = {
  configured: boolean;
  /** Data Managerin erätunniste. Sillä voi kysyä erän tilan jälkikäteen. */
  requestId?: string;
  /** Koko kutsun kaatanut virhe. Yksittäisten rivien viat ovat `outcomes`issa. */
  error?: string;
  outcomes: UploadOutcome[];
};

/** Mitkä asetukset puuttuvat. Palautetaan listana, jotta admin voi kertoa
 *  kaikki kerralla eikä yksi kerrallaan uuden yrityksen jälkeen. */
export function adsMissingConfig(): string[] {
  const missing: string[] = [];
  /* Developer token EI ole enää pakollinen: Data Manager tunnistaa
     oikeudet OAuth-tilin pääsystä mainostilille. */
  if (!CUSTOMER_ID) missing.push('GOOGLE_ADS_CUSTOMER_ID');
  if (!CONVERSION_ACTION_ID) missing.push('GOOGLE_ADS_CONVERSION_ACTION_ID');
  if (!refreshToken()) missing.push('GOOGLE_ADS_OAUTH_REFRESH_TOKEN tai GOOGLE_OAUTH_REFRESH_TOKEN');
  return missing;
}

export function adsConfigured(): boolean {
  return adsMissingConfig().length === 0;
}

function refreshToken(): string | undefined {
  return process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
}

/* Access token on voimassa ~tunnin. Omassa muistipaikassaan, ei Gmailin
   kanssa jaettuna: tokenit voivat olla eri tileiltä, ja väärän tilin
   tokenilla Ads vastaisi luvattomalla. */
const globalForAdsToken = globalThis as unknown as {
  __tkAdsToken?: { token: string; expiresAt: number };
};

async function accessToken(): Promise<string> {
  const cached = globalForAdsToken.__tkAdsToken;
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const token = refreshToken();
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!token || !clientId || !clientSecret) {
    throw new Error('Google Ads -tunnukset puuttuvat (refresh token / client id / client secret)');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) {
    if (text.includes('invalid_grant')) {
      throw new Error(
        'Ads-token ei ole enää voimassa (invalid_grant). Hae uusi suostumus adwords-oikeudella: ' +
        'node scripts/google-ads-oauth.mjs <CLIENT_ID> <CLIENT_SECRET>',
      );
    }
    throw new Error(`Ads-token vaihto epäonnistui: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = JSON.parse(text) as { access_token: string; expires_in?: number };
  globalForAdsToken.__tkAdsToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

/* Data Manager haluaa RFC 3339 -aikaleiman. Millisekunnit pois: ne eivät
   tuo mitään ja tekevät lokista vaikealukuisen. */
function eventTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Lähettää konversiot Adsiin yhtenä eränä Data Manager -rajapinnalla.
 *
 * MIKSI `transactionId` ON TYÖN NUMERO: se on rajapinnan virallinen
 * duplikaattiavain. Sama konversio ei kirjaudu kahdesti vaikka lähetys
 * uusittaisiin — eikä myöskään silloin kun sama kauppa on jo viety käsin
 * CSV:llä. Se ratkaisee myös vanhan huolen: /ads-näkymän CSV ja tämä
 * rajapinta voivat elää rinnakkain ilman kaksoiskirjauksia.
 *
 * ERO VANHAAN RAJAPINTAAN — LUE TÄMÄ ENNEN KUIN MUUTAT VIRHEENKÄSITTELYÄ:
 * `uploadClickConversions` palautti rivikohtaiset virheet heti
 * (`partialFailure`). Data Manager ottaa erän vastaan ja käsittelee sen
 * asynkronisesti: onnistunut vastaus sisältää vain `requestId`. HTTP 200
 * tarkoittaa siis "otettu vastaan", ei "kirjattu". Yksittäisen tapahtuman
 * hylkäys (esim. yli 90 vrk vanha klikki) ei siis enää näy tässä.
 * Rakenteelliset viat saa kiinni `validateOnly`-lipulla, ja erän tilan voi
 * kysyä jälkikäteen: GET /v1/requestStatus:retrieve?requestId=…
 *
 * Tämä on tietoinen huononnus jonka Google pakotti: vaihtoehto olisi jättää
 * konversiot lähettämättä kokonaan.
 */
export async function uploadConversions(
  rows: PendingConversion[],
  opts: { validateOnly?: boolean } = {},
): Promise<UploadResult> {
  const missing = adsMissingConfig();
  if (missing.length > 0) {
    return { configured: false, error: `Puuttuu: ${missing.join(', ')}`, outcomes: [] };
  }
  if (rows.length === 0) return { configured: true, outcomes: [] };

  const destination: Record<string, unknown> = {
    operatingAccount: { accountType: 'GOOGLE_ADS', accountId: CUSTOMER_ID },
    productDestinationId: CONVERSION_ACTION_ID,
  };
  /* Vain jos mainostili on hallinnointitilin alla. Väärin asetettuna se
     tuottaa luvattoman, joten se jätetään pois ellei arvoa ole annettu. */
  if (LOGIN_CUSTOMER_ID) {
    destination.loginAccount = { accountType: 'GOOGLE_ADS', accountId: LOGIN_CUSTOMER_ID };
  }

  const body = {
    destinations: [destination],
    events: rows.map((r) => ({
      /* Vain yksi kolmesta tunnisteesta kerrallaan — ks. ClickKind. */
      adIdentifiers: { [r.clickKind]: r.clickId },
      eventTimestamp: eventTime(r.createdAt),
      transactionId: r.jobNumber,
      conversionValue: r.priceCents / 100,
      currency: 'EUR',
      eventSource: 'WEB',
    })),
    validateOnly: opts.validateOnly === true,
  };

  let res: Response;
  let text: string;
  try {
    res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await accessToken()}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    text = await res.text();
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : String(e), outcomes: [] };
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } })?.error?.message || msg;
    } catch { /* ei-JSON vastaus: käytetään statusta */ }
    return { configured: true, error: `Ads hylkäsi pyynnön: ${msg}`, outcomes: [] };
  }

  let requestId: string | undefined;
  try {
    requestId = (JSON.parse(text) as { requestId?: string }).requestId;
  } catch { /* vastaus ilman runkoa on silti hyväksyntä */ }

  return {
    configured: true,
    requestId,
    outcomes: rows.map((r) => ({ ok: true as const, jobId: r.jobId })),
  };
}
