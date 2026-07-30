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

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL puuttuu');

const globalForDb = globalThis as unknown as { __tkSql?: postgres.Sql };

export const sql: postgres.Sql =
  globalForDb.__tkSql ??
  postgres(url, {
    // Poolerin transaktiotila ei tue valmisteltuja kyselyitä.
    prepare: false,
    /* Sivu tekee useita kyselyitä. Aiempi `max: 1` tuotannossa pakotti ne
       jonoon yhdelle yhteydelle, eli Promise.all ei rinnakkaistanut mitään.
       Supabasen pooler on transaktiotilassa, joten useampi yhteys per
       instanssi on turvallista — se kierrättää ne omassa poolissaan. */
    max: 5,
    /* Serverless-instanssi voi jäädä lämpimänä pitkäksi aikaa. Lyhyt
       idle_timeout vapauttaa yhteydet poolerille käyttämättömänä. */
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: 'require',
    transform: { undefined: null },
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__tkSql = sql;

/** Postgresin virhekoodi päällekkäisestä aikavälistä (exclusion constraint). */
export const EXCLUSION_VIOLATION = '23P01';

export function isSlotTaken(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err
    && (err as { code?: string }).code === EXCLUSION_VIOLATION;
}
