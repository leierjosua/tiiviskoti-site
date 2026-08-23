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

## Suorituskyky — miksi `regions: ["lhr1"]`

`vercel.json` lukitsee funktiot **Lontooseen**, koska Supabase-projekti on
`eu-west-2` (Lontoo). Ilman tätä Vercel ajoi ne `iad1`:ssä (Washington), ja
jokainen kanta­kysely ylitti Atlantin: yhden sivun 3–5 kyselyä tarkoitti
1,1 sekunnin vasteaikaa. Alueen vaihdon jälkeen sama kutsu on ~0,3 s.

**Jos Supabase-projekti siirretään toiseen alueeseen, tämä on muutettava
samalla.** `vercel.json` ei tue kommentteja, siksi perustelu on tässä.

Muut suorituskykyä koskevat valinnat:

- `lib/db.ts` `max: 5` — aiempi `max: 1` tuotannossa pakotti kaikki kyselyt
  jonoon yhdelle yhteydelle, joten `Promise.all` ei rinnakkaistanut mitään.
- `lib/session.ts` lukee `tk.staff`-rivin SELECTillä ja kirjoittaa vain kun
  `user_id` on vielä sitomatta. Aiemmin joka sivulataus teki UPDATEn.
- Riippumattomat kyselyt ajetaan `Promise.all`illa (saatavuus, työn sivu,
  kalenterin sivu).
- `app/(app)/loading.tsx` antaa navigoinnille välittömän palautteen. Ilman
  sitä linkin painaminen ei näytä mitään ennen kuin palvelin vastaa, ja
  käyttäjä painaa uudelleen.
- `components/submit.tsx` — Server Action -napit näyttävät lataustilan
  `useFormStatus`illa ja estyvät sen ajaksi, joten samaa toimintoa ei
  vahingossa tehdä kahdesti.

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

## Google Ads -konversiot

Sivustolla ei ole gtag.js:ää, joten Google ei näe varauksia selaimessa.
Mainosklikin tunniste kulkee varauksen mukana kantaan (`tk.jobs.gclid`), ja
kauppa ilmoitetaan Adsille palvelimelta.

* Yöajo `/api/cron/ads-conversions` (klo 6 UTC) vie lähettämättömät.
* `/ads` näyttää tilan ja tarjoaa napin "Lähetä Adsiin" heti.
* CSV-lataus `/ads/csv` on varatie, jos rajapinta on poissa käytöstä.

Konversio lähtee tunnin kuluttua varauksesta: pian peruttu varaus ei ole
kauppa. Yli 90 vrk vanha klikki merkitään vanhentuneeksi — Ads ei ota niitä.

Vaatii migraation `db/017_ads_conversions.sql` (postgres-rooli, Supabasen
SQL-editori) ja nämä ympäristömuuttujat:

```
GOOGLE_ADS_DEVELOPER_TOKEN       # Ads → Työkalut → API Center
GOOGLE_ADS_CUSTOMER_ID           # mainostilin id, väliviivat sallittu
GOOGLE_ADS_CONVERSION_ACTION_ID  # konversiotapahtuman numero-osa
GOOGLE_ADS_LOGIN_CUSTOMER_ID     # vain jos tili on MCC:n alla
GOOGLE_ADS_OAUTH_REFRESH_TOKEN   # node scripts/google-ads-oauth.mjs <ID> <SECRET>
GOOGLE_ADS_OAUTH_CLIENT_ID
GOOGLE_ADS_OAUTH_CLIENT_SECRET
GOOGLE_ADS_API_VERSION           # valinnainen, oletus v25
```

Konversiotapahtuman **numero-osan** saa Adsista: Tavoitteet → Konversiot →
valitse tapahtuma → osoiterivin `ctId=`-parametri. Nimen (`Varaus verkosta`)
on täsmättävä `src/app/(app)/ads/csv/format.ts`:ään vain CSV-latausta varten;
rajapinta tunnistaa tapahtuman numerolla.

Ilman asetuksia mikään ei kaadu: `/ads` kertoo mitä puuttuu ja CSV toimii.

## Vielä tekemättä

Google-kalenterisynkronointi, vahvistussähköpostit, hinnoittelu ja
tarjoukset, laskutus, raportit. Julkinen sivu ei vielä käytä tätä
rajapintaa — se kirjoittaa yhä vanhaan `public.bookings`-tauluun.
