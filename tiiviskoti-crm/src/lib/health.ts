import 'server-only';
import { sql } from './db';
import { SENDER_EMAIL, credentialFingerprint, probeGoogleAccess, sendMail } from './google';
import { formatInstant } from './time';

/* =========================================================
   Google-yhteyden kuntotarkistus.

   ONGELMA JOTA TÄMÄ RATKAISEE: varaus onnistuu vaikka Google-yhteys on
   poikki. Työ tallentuu, asiakas näkee kiitossivun — mutta vahvistusposti,
   työmääräin ja kalenteritapahtuma jäävät kaikki tulematta, ja ainoa jälki
   siitä on Vercelin loki. Ilman tätä tarkistusta rikko paljastuu vasta kun
   joku asiakas on jo jäänyt ilman vahvistusta.

   KESKEINEN RAJOITE: kun token on kuollut, VAROITUSTAKAAN ei voi lähettää
   sähköpostilla — posti kulkee saman tokenin läpi. Siksi tässä on kaksi eri
   kanavaa, ja ne kattavat eri hetket:

     1. ENNAKKOVAROITUS sähköpostilla, kun token on lähestymässä ikärajaa
        mutta yhä toimii. Tämä on ainoa hetki jolloin posti menee perille,
        ja se riittää: Testing-tilassa tokenin elinikä on tasan 7 vrk, joten
        rikko on ennustettava eikä yllättävä.
     2. VAROITUS ADMINISSA kun token on jo kuollut. Ei vaadi Googlea
        toimiakseen — luetaan kannasta.

   Cron-reitti palauttaa lisäksi virhekoodin kun tarkistus epäonnistuu,
   jolloin ajo näkyy epäonnistuneena myös Vercelin cron-näkymässä.
   ========================================================= */

/** Kuinka vanhana token katsotaan vaaralliseksi. Googlen consent screen
 *  "Testing"-tilassa refresh token vanhenee 7 vrk:ssa, joten 5 jättää kaksi
 *  vuorokautta aikaa reagoida.
 *
 *  Aseta `GOOGLE_TOKEN_WARN_DAYS=0` kun consent screen on julkaistu
 *  Production-tilaan — silloin token ei enää vanhene iän takia eikä
 *  varoitusta tarvita. */
const WARN_AFTER_DAYS = Number(process.env.GOOGLE_TOKEN_WARN_DAYS ?? '5');

const DAY_MS = 86_400_000;

export type HealthResult = {
  ok: boolean;
  detail?: string;
  /** Nykyisen tunnuksen ikä vuorokausina, tai null jos ei tiedossa. */
  tokenAgeDays: number | null;
  warningSent: boolean;
};

/**
 * Ajaa tarkistuksen, kirjaa tuloksen ja lähettää ennakkovaroituksen jos
 * token alkaa olla vanha. Ei heitä: kutsuja päättää mitä tuloksella tehdään.
 */
export async function runGoogleHealthCheck(): Promise<HealthResult> {
  const probe = await probeGoogleAccess();
  const credential = credentialFingerprint();

  const [row] = await sql<{ id: string }[]>`
    insert into tk.health_checks (kind, ok, detail, credential)
    values ('google', ${probe.ok}, ${probe.error ?? null}, ${credential})
    returning id
  `;

  if (!probe.ok) {
    console.error('health: Google-yhteys poikki —', probe.error);
    return { ok: false, detail: probe.error, tokenAgeDays: null, warningSent: false };
  }

  /* Tokenin ikä = vanhin onnistunut tarkistus samalla tiivisteellä. Rivi
     lisättiin jo yllä, joten aivan ensimmäisellä ajolla tämä on tämä sama
     rivi ja ikä on nolla.

     HUOM: tämä on ikä ENSIHAVAINNOSTA, ei tokenin luontihetkestä — kanta ei
     tiedä milloin token luotiin. Päivittäinen ajo pitää eron alle
     vuorokaudessa, joten 7 vrk:n eliniästä varoitus lähtee todellisen iän
     ollessa 5–6 vrk. Se on tarkoituksellinen turvamarginaali eikä virhe. */
  const [first] = await sql<{ since: Date; warned: boolean }[]>`
    select min(checked_at) as since, bool_or(warned) as warned
      from tk.health_checks
     where kind = 'google' and ok and credential is not distinct from ${credential}
  `;
  const tokenAgeDays = first?.since
    ? Math.floor((Date.now() - first.since.getTime()) / DAY_MS)
    : null;

  const shouldWarn =
    WARN_AFTER_DAYS > 0 &&
    tokenAgeDays !== null &&
    tokenAgeDays >= WARN_AFTER_DAYS &&
    !first?.warned;

  if (!shouldWarn) {
    return { ok: true, tokenAgeDays, warningSent: false };
  }

  /* Varoitus lähetetään kerran tunnusta kohden, ei joka päivä: päivittäin
     toistuva varoitus samasta asiasta lakkaa nopeasti olemasta varoitus.
     `warned` merkitään vasta onnistuneen lähetyksen jälkeen, jottei
     epäonnistunut lähetys kuluta ainoaa kertaa. */
  try {
    await sendWarningMail(tokenAgeDays!);
    await sql`update tk.health_checks set warned = true where id = ${row.id}`;
    return { ok: true, tokenAgeDays, warningSent: true };
  } catch (e) {
    console.error('health: varoituspostin lähetys epäonnistui', e);
    return { ok: true, tokenAgeDays, warningSent: false };
  }
}

async function sendWarningMail(ageDays: number): Promise<void> {
  const subject = `TiivisKoti: Google-tunnus on ${ageDays} vrk vanha — uusi se`;
  const body = [
    `Google-yhteys toimii tällä hetkellä, mutta käytössä oleva refresh token on ${ageDays} vuorokautta vanha.`,
    '',
    'Jos OAuth-consent screen on yhä Testing-tilassa, token vanhenee 7 vuorokauden iässä. Silloin varaukset',
    'tallentuvat normaalisti, mutta asiakas ei saa vahvistusta, asentaja ei saa työmääräintä eikä keikka näy',
    'kalenterissa — eikä tämä viesti enää lähde, koska posti kulkee saman tokenin läpi.',
    '',
    'Pysyvä korjaus: julkaise consent screen Production-tilaan (tai Internal, jos Workspace).',
    'Sen jälkeen aseta GOOGLE_TOKEN_WARN_DAYS=0, niin tämä muistutus lakkaa.',
    '',
    'Väliaikainen korjaus — uusi token:',
    '  cd C:\\Users\\josua\\projects\\loppusiivous-main-new',
    '  node scripts/google-oauth-setup.mjs <CLIENT_ID> <CLIENT_SECRET>',
    'ja vie tulos tiiviskoti-crm-projektin GOOGLE_OAUTH_REFRESH_TOKEN-muuttujaan. Vaatii uuden deployn.',
    '',
    `Tarkistettu ${formatInstant(new Date())}.`,
  ].join('\n');

  await sendMail({
    to: SENDER_EMAIL,
    subject,
    text: body,
    html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${
      body.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)
    }</pre>`,
  });
}

/* ---------- adminin varoitus ---------- */

export type HealthBanner = {
  /** Viimeisimmän tarkistuksen tulos. null = tarkistusta ei ole vielä ajettu. */
  lastOk: boolean | null;
  lastCheckedAt: Date | null;
  detail: string | null;
  /** Verkosta tulleita varauksia joilta vahvistus jäi lähtemättä (7 vrk). */
  failedDeliveries: number;
};

/**
 * Adminin etusivun varoitusta varten. Kaksi eri oiretta samassa kyselyssä:
 * kuntotarkistuksen tulos (ennakoiva) ja oikeat epäonnistuneet toimitukset
 * (jälkikäteinen). Jälkimmäinen on totuus — se on asiakas joka ei saanut
 * vahvistusta — ja se näytetään vaikka tarkistus näyttäisi vihreää.
 */
export async function readHealthBanner(): Promise<HealthBanner> {
  const [[last], [failed]] = await Promise.all([
    sql<{ ok: boolean; detail: string | null; checked_at: Date }[]>`
      select ok, detail, checked_at from tk.health_checks
       where kind = 'google' order by checked_at desc limit 1
    `,
    /* Vain verkosta tulleet: vain ne kulkevat vahvistuspolun läpi, joten
       vain niiltä puuttuva vahvistus on vika. Adminissa käsin luodulla
       työllä ei ole vahvistusta eikä pidäkään olla. */
    /* Työparin toinen rivi ei saa omaa vahvistusta — asiakas saa sen
       päärivistä — mutta se perii päärivin source='web'. Ilman tätä
       poikkeusta jokainen verkkovaraukseen lisätty asentaja näkyi
       "varaus ilman vahvistusta" -hälytyksenä (työ 1129, 13.10.2026).
       Sama sääntö kuin scripts/daily-check.mjs:ssä (d583fa5): hälytetään
       vain jos koko parilta puuttuu vahvistus. */
    sql<{ n: number }[]>`
      select count(*)::int as n from tk.jobs j
       where j.source = 'web' and j.status <> 'cancelled'
         and j.created_at > now() - interval '7 days'
         and (j.confirmation_error is not null or j.confirmation_sent_at is null)
         and not exists (
           select 1 from tk.jobs m
            where j.crew_group_id is not null and m.crew_group_id = j.crew_group_id
              and m.id <> j.id and m.confirmation_sent_at is not null)
    `,
  ]);

  return {
    lastOk: last?.ok ?? null,
    lastCheckedAt: last?.checked_at ?? null,
    detail: last?.detail ?? null,
    failedDeliveries: failed?.n ?? 0,
  };
}
