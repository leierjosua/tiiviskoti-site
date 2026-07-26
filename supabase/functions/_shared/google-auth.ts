import { importPKCS8, SignJWT } from "https://deno.land/x/jose@v5.2.0/index.ts";

/**
 * Hakee Google API -access tokenin. Tukee KAHTA tapaa:
 *
 *  1. OAuth refresh token (ensisijainen jos `GOOGLE_OAUTH_REFRESH_TOKEN` on
 *     asetettu). Ei vaadi service account -avainta eikä domain-wide
 *     delegationia — toimii siis silloinkin kun org-policy
 *     `constraints/iam.disableServiceAccountKeyCreation` estää avaimen luonnin.
 *     Kaikki kutsut tehdään sen tilin oikeuksilla, joka antoi suostumuksen
 *     (info@tiiviskoti.fi).
 *
 *  2. Service account + domain-wide delegation (`GOOGLE_PRIVATE_KEY`).
 *     Alkuperäinen tapa. Pystyy esiintymään kenä tahansa domainin käyttäjänä.
 *
 * HUOM (tapa 1): `impersonateEmail` on vain vihje — refresh token ei voi
 * esiintyä toisena käyttäjänä. Toisten kalentereiden (esim. asentajien) täytyy
 * olla JAETTU info@tiiviskoti.fi:lle kirjoitusoikeudella, jolloin niitä voi
 * käsitellä kalenteri-ID:llä normaalisti. Gmail-lähetys tapahtuu aina
 * info@tiiviskoti.fi:stä.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Access token on voimassa ~1 h. Välimuisti säästää turhat token-kutsut, kun
// sama instanssi lähettää monta viestiä peräkkäin (esim. outbox-batch).
interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();
const EXPIRY_MARGIN_MS = 60_000; // uusi minuutti ennen umpeutumista

function cached(key: string): string | null {
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return hit.token;
  return null;
}

function store(key: string, token: string, expiresInSec: number) {
  tokenCache.set(key, { token, expiresAt: Date.now() + expiresInSec * 1000 });
}

export async function getGoogleAccessToken(
  scope: string,
  impersonateEmail: string,
): Promise<string> {
  const refreshToken = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN");
  if (refreshToken) {
    return await getTokenViaRefreshToken(refreshToken);
  }
  return await getTokenViaServiceAccount(scope, impersonateEmail);
}

// ─── 1. OAuth refresh token ──────────────────────────────────────────────────

async function getTokenViaRefreshToken(refreshToken: string): Promise<string> {
  const hit = cached("refresh");
  if (hit) return hit;

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientSecret) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not set");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    // invalid_grant = refresh token peruttu / vanhentunut (salasanan vaihto,
    // käyttäjä perui oikeudet, tai 6 kk käyttämättä). Vaatii uuden
    // suostumuksen: node scripts/google-oauth-setup.mjs
    throw new Error(`Google refresh token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  store("refresh", data.access_token, data.expires_in ?? 3600);
  return data.access_token;
}

// ─── 2. Service account + domain-wide delegation ─────────────────────────────

async function getTokenViaServiceAccount(
  scope: string,
  impersonateEmail: string,
): Promise<string> {
  const key = `sa:${impersonateEmail}:${scope}`;
  const hit = cached(key);
  if (hit) return hit;

  const rawKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
  if (!rawKey) {
    throw new Error(
      "Google-tunnuksia ei ole asetettu: aseta joko GOOGLE_OAUTH_REFRESH_TOKEN " +
        "(+ CLIENT_ID/SECRET) tai GOOGLE_PRIVATE_KEY (+ SERVICE_ACCOUNT_EMAIL). " +
        "Ks. supabase/SETUP-GOOGLE.md",
    );
  }

  const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!serviceAccountEmail) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL not set");

  const privateKey = await importPKCS8(rawKey.replace(/\\n/g, "\n"), "RS256");

  const jwt = await new SignJWT({ scope, sub: impersonateEmail })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccountEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  store(key, data.access_token, data.expires_in ?? 3600);
  return data.access_token;
}
