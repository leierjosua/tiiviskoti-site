# TiivisKoti CRM

Varausten ja asentajakalentereiden hallinta. Kirjoitettu tyhjästä tähän
projektiin — ei jaa koodia eikä tietokantatauluja `admin/`- tai
`tiiviskoti-admin/`-sovellusten kanssa.

## Mitä tämä tekee

- Asentajilla on kalenterit, joissa on **viikkoaikataulu** (ma–pe 8–16) ja
  **poikkeuspäivät** (loma, sairaus, ylimääräinen työaika).
- Vapaat ajat lasketaan näistä oikeasti — ei kovakoodattuja aikoja.
- **Päällekkäisvaraus on mahdoton**: `tk.jobs`-taulussa on exclusion
  constraint, joka hylkää kaksi samaan aikaan osuvaa työtä samalla
  kalenterilla. Kaksi yhtaikaista varauspyyntöä ei voi molemmat onnistua.
- Julkinen rajapinta, jonka kautta tiiviskoti.fi voi hakea todelliset
  vapaat ajat ja tehdä varauksen.

## Arkkitehtuuri

| | |
|---|---|
| Sovellus | Next.js App Router, TypeScript, Tailwind v4 |
| Tietokanta | Supabase Postgres, oma `tk`-skeema, suora yhteys (postgres.js) |
| Kirjautuminen | Supabase Auth (sähköposti + salasana) |
| Käyttöoikeus | `tk.staff`-taulu — authin tunnus yksin ei riitä |

Selain **ei** puhu tietokannalle. Kaikki kyselyt tehdään palvelimella
`tk_app`-roolilla, joka näkee vain `tk`-skeeman; `public` on siltä
nimenomaan revokattu, joten uusi järjestelmä ei pääse vanhan adminin
tauluihin.

Aika tallennetaan aina UTC:nä (`timestamptz`). Suomen aikaa käytetään vain
kahdessa paikassa: kun viikkoaikataulun kellonaika muutetaan hetkeksi, ja
kun hetki näytetään. Molemmat ovat `src/lib/time.ts`:ssä.

## Kehitys

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vapaiden aikojen laskennan yksikkötestit
npm run build
```

`.env.local` (ei versionhallinnassa):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
DATABASE_URL=postgres://tk_app.<ref>:<salasana>@aws-1-eu-west-2.pooler.supabase.com:6543/postgres
```

## Tietokanta

```bash
npx supabase db query --linked --file tiiviskoti-crm/db/001_init.sql
npx supabase db query --linked --file tiiviskoti-crm/db/002_app_role.sql
```

Molemmat tiedostot ovat idempotentteja. **`supabase db push` on kielletty**
— repossa ei ole migraatiohistoriaa, ja push yrittäisi ajaa vanhan brändin
migraatiot uudelleen.

Huom: `db query` ajaa vain yhden lauseen kerrallaan. Useampi lause samassa
merkkijonossa menee hiljaa läpi tekemättä mitään — käytä `--file`.

## Julkinen rajapinta

```
GET  /api/public/availability?days=60&minutes=120
POST /api/public/booking
```

CORS sallii vain `tiiviskoti.fi`-originit ja paikallisen `localhost:8799`
-esikatselupalvelimen. Varauksen hinta tulee pyynnön mukana; kun sivu
kytketään tähän, hinta lasketaan edelleen `tiiviskoti/pricing.mjs`:ssä.

Päällekkäinen aika → `409 { "error": "slot_taken" }`.

## Vielä tekemättä

Google-kalenterisynkronointi, vahvistussähköpostit, hinnoittelu ja
tarjoukset, laskutus, raportit. Julkinen sivu ei vielä käytä tätä
rajapintaa — se kirjoittaa yhä vanhaan `public.bookings`-tauluun.
