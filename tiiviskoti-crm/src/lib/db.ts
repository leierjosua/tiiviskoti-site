import 'server-only';
import postgres from 'postgres';

/* =========================================================
   Tietokantayhteys.

   Suora Postgres-yhteys Supabasen poolerin kautta omalla `tk_app`
   -roolilla, joka näkee vain `tk`-skeeman. Ei PostgRESTiä: skeemaa ei
   ole julkaistu Data API:ssa, ja suora yhteys antaa oikeat transaktiot
   (asiakas + työ + rivit syntyvät joko kaikki tai ei yhtään).

   Yhteys elää globaalissa muuttujassa, jotta serverless-kutsu ei avaa
   uutta yhteyttä joka kerta ja jotta dev-moodin hot reload ei kerrytä
   niitä.
   ========================================================= */

/* ISTUNTOTILA (portti 5432), EI transaktiotila (6543) — 10.11.2026.
   postgres.js lähettää prepare:false-tilassa jokaisen parametrillisen kyselyn
   kahdessa osassa: Parse+Describe+Flush, odottaa parametrityypit ja vasta sitten
   Bind+Execute+Sync. Supavisorin transaktiotila hukkasi välillä ensimmäisen osan
   vastauksen: tuotannon pg_stat_activity näytti työraportin yhden rivin haun
   tilassa `active / ClientRead` 13 s — kanta odotti CRM:ää ja CRM kantaa.
   Siitä seurasi koko CRM:n jumi (5 yhteyttä tukossa → kaikki kyselyt jonossa).
   Istuntotilassa sama pooleri antaa jokaiselle yhteydelle oman kantayhteyden,
   joten protokolla kulkee kokonaisena. Yhteyksiä on vähän (max 4 / instanssi,
   suljetaan 15–20 s joutilaisuuden jälkeen), joten istuntopoolin koko riittää.
   DATABASE_URL Vercelissä on yhä 6543-muotoinen; portti vaihdetaan tässä. */
const url = process.env.DATABASE_URL?.replace(':6543/', ':5432/');
if (!url) throw new Error('DATABASE_URL puuttuu');

const globalForDb = globalThis as unknown as { __tkSql?: postgres.Sql };

function makePool(): postgres.Sql {
  return postgres(url!, {
    // Poolerin transaktiotila ei tue valmisteltuja kyselyitä.
    prepare: false,
    /* Sivu tekee useita kyselyitä. Aiempi `max: 1` tuotannossa pakotti ne
       jonoon yhdelle yhteydelle, eli Promise.all ei rinnakkaistanut mitään.
       Supabasen pooler on transaktiotilassa, joten useampi yhteys per
       instanssi on turvallista — se kierrättää ne omassa poolissaan. */
    max: 4,
    idle_timeout: 20,
    max_lifetime: 60 * 5,
    keep_alive: 30,
    connect_timeout: 15,
    ssl: 'require',
    transform: { undefined: null },
  });
}

/* ---------- KUOLLEET YHTEYDET (9.–10.11.2026) ----------
   Oire: kaikki kirjautuneet sivut jäivät latausnäkymään. timed()-loki
   paljasti että JOKAINEN kantakysely jumittui yhtä aikaa (staff, raportti,
   linkit, etusivun terveys) — ei yksi hidas kysely, vaan instanssin koko
   yhteysjoukko oli kuollut. Kanta vastasi samaan aikaan muualta heti.

   Syy: Vercel jäädyttää funktioinstanssin pyyntöjen väliksi. Jäädytettynä
   ajastimet eivät pyöri, joten idle_timeout/keep_alive eivät ehdi sulkea
   yhteyksiä, ja pooleri katkaisee ne hiljaa. Herätessä postgres.js luulee
   yhteyksiä eläviksi, kirjoittaa kyselyn kuolleeseen sokettiin eikä
   vastausta tule koskaan. Viisi jumittunutta kyselyä = koko CRM jumissa.

   Korjaus kahdessa osassa:
   1. Jos yhteyksiä ei ole käytetty yli IDLE_RESET_MS, joukko vaihdetaan
      uuteen ENNEN kyselyä (uusi yhteys poolerille ~50–100 ms samassa
      alueessa). Jäädytyksen jälkeen ei siis koskaan kokeilla vanhaa sokettia.
   2. resetDb(): timed() kutsuu tätä kun kysely jumittuu, joten seuraava
      sivunlataus saa uudet yhteydet eikä instanssi jää pysyvästi rikki.

   `sql` on Proxy nykyiseen joukkoon, joten kaikki `sql\`...\``, `sql.begin`,
   `sql.json` jne. toimivat muuttumattomina koko koodissa. */
const IDLE_RESET_MS = 15_000;
let pool: postgres.Sql = globalForDb.__tkSql ?? makePool();
let lastUsed = Date.now();

export function resetDb(reason: string) {
  const old = pool;
  pool = makePool();
  lastUsed = Date.now();
  if (process.env.NODE_ENV !== 'production') globalForDb.__tkSql = pool;
  console.warn(`[db] yhteysjoukko uusittu: ${reason}`);
  // Keskeneräisille kyselyille 5 s aikaa; kuolleet soketit suljetaan.
  old.end({ timeout: 5 }).catch(() => {});
}

function current(): postgres.Sql {
  const now = Date.now();
  if (now - lastUsed > IDLE_RESET_MS) {
    const old = pool;
    pool = makePool();
    if (process.env.NODE_ENV !== 'production') globalForDb.__tkSql = pool;
    old.end({ timeout: 5 }).catch(() => {});
  }
  lastUsed = now;
  return pool;
}

export const sql: postgres.Sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply(_t, _this, args) {
    return (current() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_t, prop) {
    const p = current();
    const v = (p as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(p) : v;
  },
});

if (process.env.NODE_ENV !== 'production') globalForDb.__tkSql = pool;

/** Postgresin virhekoodi päällekkäisestä aikavälistä (exclusion constraint). */
export const EXCLUSION_VIOLATION = '23P01';

export function isSlotTaken(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err
    && (err as { code?: string }).code === EXCLUSION_VIOLATION;
}
