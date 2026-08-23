import 'server-only';

/* =========================================================
   Google Ads -konversioiden lähetys rajapinnan kautta
   (offline conversion import, uploadClickConversions).

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
     GOOGLE_ADS_DEVELOPER_TOKEN       — Ads API Centeristä (pakollinen)
     GOOGLE_ADS_CUSTOMER_ID           — mainostilin id, väliviivat sallittu
     GOOGLE_ADS_CONVERSION_ACTION_ID  — konversiotapahtuman numero-osa
     GOOGLE_ADS_LOGIN_CUSTOMER_ID     — (valinnainen) hallinnointitili, jos tili on MCC:n alla
     GOOGLE_ADS_OAUTH_REFRESH_TOKEN   — (valinnainen) oma token; ilman tätä käytetään Gmailin/Calendarin tokenia
     GOOGLE_ADS_API_VERSION           — (valinnainen) oletus v25

   MIKSI OMAT OAUTH-TUNNUKSET OVAT MAHDOLLISIA: Ads vaatii `adwords`-
   oikeuden, jota Gmail/Calendar-tokenissa ei ole. Sen voi lisätä samaan
   tokeniin uudella suostumuksella, mutta silloin epäonnistunut uusinta
   veisi mennessään myös varausvahvistukset. Erillinen token pitää viat
   erillään: Ads-lähetys voi olla poikki ilman että asiakas jää ilman
   sähköpostia. Ilman omaa tokenia palataan yhteiseen.
   ========================================================= */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/* Rajapinnan versio vanhenee noin vuodessa. Ympäristömuuttujana, jotta
   sunsetin osuessa kohdalle riittää muuttaa arvo Verceliin — ei uutta
   julkaisua vain siksi että Google poisti version käytöstä.

   v25 todennettu toimivaksi 2026-08-23 (listAccessibleCustomers → 200).
   Vanhemmat v18–v21 vastaavat 404:llä eivätkä ole enää olemassa. */
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';

/* Tilitunnukset kirjoitetaan Adsissa muodossa 123-456-7890, mutta
   rajapinta ottaa vastaan vain numerot. Siivotaan tässä, jotta
   ympäristömuuttujaan saa kopioida sen mitä ruudulla näkyy. */
const digits = (v: string | undefined) => (v || '').replace(/\D/g, '');

const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
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
  /** Koko kutsun kaatanut virhe. Yksittäisten rivien viat ovat `outcomes`issa. */
  error?: string;
  outcomes: UploadOutcome[];
};

/** Mitkä asetukset puuttuvat. Palautetaan listana, jotta admin voi kertoa
 *  kaikki kerralla eikä yksi kerrallaan uuden yrityksen jälkeen. */
export function adsMissingConfig(): string[] {
  const missing: string[] = [];
  if (!DEVELOPER_TOKEN) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
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

/* Rajapinnan aikaleima on `yyyy-MM-dd HH:mm:ss+00:00` — siirtymä
   KAKSOISPISTEELLÄ, toisin kuin CSV-latauksessa, joka vaatii `+0000`.
   Ero on aito ja dokumentoitu; siksi muotoilu on täällä eikä jaettu
   csv/format.ts:n kanssa. */
function adsApiTime(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace('T', ' ')}+00:00`;
}

type GoogleAdsError = {
  message?: string;
  location?: { fieldPathElements?: { fieldName?: string; index?: number }[] };
};

/** Poimii osittaisvirheestä rivikohtaiset viat: minkä konversion indeksi
 *  epäonnistui ja miksi. Ilman indeksiä virhe kohdistuisi koko erään,
 *  jolloin yksi kelvoton klikki estäisi kaikkien muiden merkitsemisen
 *  lähetetyiksi.
 *
 *  MIKSI KOHDISTAMATTOMAT PALAUTETAAN ERIKSEEN: jos virheen paikkatietoa ei
 *  osata lukea, virhe katoaisi — ja kutsuja merkitsisi rivin lähetetyksi
 *  vaikka konversio ei mennyt perille. Hiljainen väärä onnistuminen on
 *  tässä pahin mahdollinen lopputulos, koska sitä ei huomaa mistään.
 *  Kohdistamaton virhe kaataa siksi koko erän, jolloin rivit jäävät
 *  jonoon ja tulevat yritetyksi uudelleen. */
function parsePartialFailure(partial: unknown): { byIndex: Map<number, string>; unmapped: string[] } {
  const byIndex = new Map<number, string>();
  const unmapped: string[] = [];
  const details = (partial as { details?: { errors?: GoogleAdsError[] }[] } | undefined)?.details;
  if (!Array.isArray(details)) return { byIndex, unmapped };

  for (const detail of details) {
    for (const err of detail.errors ?? []) {
      /* Kentän nimi vaihtelee rajapinnan version mukaan (`conversions`,
         `operations`), joten indeksi haetaan ensimmäisestä paikasta jossa
         se on — nimestä riippumatta. */
      const idx = err.location?.fieldPathElements?.find((e) => typeof e.index === 'number')?.index;
      const msg = err.message || 'Tuntematon virhe';
      if (typeof idx === 'number') byIndex.set(idx, msg);
      else unmapped.push(msg);
    }
  }
  return { byIndex, unmapped };
}

/**
 * Lähettää konversiot Adsiin yhtenä eränä.
 *
 * MIKSI `partialFailure`: erässä on aina rivejä joita Google ei hyväksy —
 * yli 90 vuorokautta vanha klikki, tuntematon tunniste, jo kirjattu
 * konversio. Ilman osittaisvirhettä yksi tällainen hylkäisi koko erän,
 * eivätkä kelvolliset konversiot menisi koskaan perille. Nyt kelvolliset
 * kirjautuvat ja vialliset palaavat riveittäin syineen.
 *
 * MIKSI `orderId` ON TYÖN NUMERO: se antaa Adsille pysyvän tunnisteen
 * kaupalle, jolloin sama konversio ei kirjaudu kahdesti jos lähetys
 * uusitaan — ja jos kauppa myöhemmin peruuntuu, se on sillä tunnisteella
 * peruttavissa Adsin puolelta.
 */
export async function uploadConversions(rows: PendingConversion[]): Promise<UploadResult> {
  const missing = adsMissingConfig();
  if (missing.length > 0) {
    return { configured: false, error: `Puuttuu: ${missing.join(', ')}`, outcomes: [] };
  }
  if (rows.length === 0) return { configured: true, outcomes: [] };

  const conversionAction = `customers/${CUSTOMER_ID}/conversionActions/${CONVERSION_ACTION_ID}`;

  const conversions = rows.map((r) => ({
    /* Vain yksi näistä kolmesta saa olla mukana kerrallaan. */
    [r.clickKind]: r.clickId,
    conversionAction,
    conversionDateTime: adsApiTime(r.createdAt),
    conversionValue: r.priceCents / 100,
    currencyCode: 'EUR',
    orderId: r.jobNumber,
  }));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'developer-token': DEVELOPER_TOKEN as string,
    Authorization: `Bearer ${await accessToken()}`,
  };
  /* Vaaditaan vain jos mainostili on hallinnointitilin (MCC) alla. Väärin
     asetettuna se aiheuttaa luvattoman, joten se jätetään kokonaan pois
     ellei arvoa ole annettu. */
  if (LOGIN_CUSTOMER_ID) headers['login-customer-id'] = LOGIN_CUSTOMER_ID;

  let res: Response;
  let body: {
    results?: unknown[];
    partialFailureError?: unknown;
    error?: { message?: string };
  };
  try {
    res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${CUSTOMER_ID}:uploadClickConversions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ conversions, partialFailure: true, validateOnly: false }),
        cache: 'no-store',
      },
    );
    body = await res.json();
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : String(e), outcomes: [] };
  }

  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    return { configured: true, error: `Ads hylkäsi pyynnön: ${msg}`, outcomes: [] };
  }

  const { byIndex: failures, unmapped } = parsePartialFailure(body.partialFailureError);
  if (unmapped.length > 0) {
    return {
      configured: true,
      error: `Ads palautti virheen jota ei voitu kohdistaa riviin: ${unmapped.join('; ').slice(0, 300)}`,
      outcomes: [],
    };
  }

  /* Onnistuneen rivin kohdalla `results` sisältää konversion tiedot ja
     epäonnistuneen kohdalla tyhjän olion. Luotetaan silti ensisijaisesti
     virhelistaan: se kertoo syyn, jonka voi näyttää ihmiselle. */
  return {
    configured: true,
    outcomes: rows.map((r, i) => {
      const err = failures.get(i);
      return err ? { ok: false as const, jobId: r.jobId, error: err } : { ok: true as const, jobId: r.jobId };
    }),
  };
}
