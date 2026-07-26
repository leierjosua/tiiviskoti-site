# Loppusiivous.fi — toteutussuunnitelma (KouruX/AaltoAir-tasoinen järjestelmä)

> Tavoite: nostaa Loppusiivous nykyisestä staattisesta sivusta samaan toiminnalliseen
> tasoon kuin **KouruX** (kevyempi referenssi) ja **AaltoAir**. Eli: julkinen
> varaussivu → Supabase-backend → admin-paneeli → sähköposti (Gmail API) →
> Google Calendar -synkronointi.
>
> Valinnat (sovittu): **täysi parlliteetti KouruX/AaltoAirin kanssa** ("full copy paste
> setup"). **Next.js-sivu**, **Gmail API + Google service account** (domain-wide
> delegation — `loppusiivous.fi` on Workspacessa, vahvistettu), **Google Calendar -sync
> heti**, **useita tekijöitä** (employees + installer-kalenterit + asentajan
> valinta-algoritmi), **hinnoittelu admin-muokattavissa** (services + variants + addonit).
>
> Tämä on suunnitelma — ei vielä koodia. Toteutusjärjestys luvussa 10.

---

## 0. Nykytila vs. tavoite

**Loppusiivous nyt:**
- `site/` — staattinen `index.html` + `booking.js` (selainpuolen hintalaskuri:
  m²-portaat `BANDS`, lisäpalvelut `ADDONS`, kotitalousvähennys, postinumero→kaupunki,
  aikaslotit). Brändätty ja valmis.
- `site/api/contact.js` + `site/api/bookings.js` — Vercel-serverless-stubit, jotka
  lähettävät vain sähköpostin **Resendillä**. Ei tallennusta.
- `supabase/` ja `admin/` — pelkkä README-placeholder.
- `scripts/render.mjs` — brändiassettien Playwright-renderöinti (säilyy ennallaan).

**Tavoitearkkitehtuuri (3 osaa + integraatiot):**

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  site/ (Next.js)│     │  admin/ (Vite SPA)│     │ Google Workspace   │
│  loppusiivous.fi│     │ admin.loppusiivous│     │ info@loppusiivous  │
│  - julkinen     │     │ - varaukset       │     │ - Calendar         │
│  - varauslomake │     │ - tarjouspyynnöt  │     │ - Gmail (lähetys)  │
│  - API-reitit   │     │ - palvelut/hinnat │     └─────────▲──────────┘
└────────┬────────┘     └─────────┬─────────┘               │
         │  service_role           │  anon key + Auth         │ service account
         │                         │                          │ (domain-wide
         ▼                         ▼                          │  delegation)
┌──────────────────────────────────────────────────┐         │
│              Supabase (yksi projekti)              │         │
│  Postgres + Auth + Storage + Edge Functions (Deno) ├─────────┘
│  - taulut (booking, services, calendar, ...)       │
│  - edge-funktiot (calendar event, send-email, ...) │
└────────────────────────────────────────────────────┘
```

**Hosting:** site ja admin omina Vercel-projekteinaan; backend Supabasessa.

---

## 1. Esivalmistelut — tilit ja palvelut (hankittava ennen koodausta)

| # | Palvelu | Mitä tehdään | Tulos / mihin tarvitaan |
|---|---------|--------------|--------------------------|
| 1 | **Supabase** | Luo projekti (region: eu-north / Frankfurt) | `SUPABASE_URL`, `anon key`, `service_role key` |
| 2 | **Google Cloud** | Luo GCP-projekti, ota käyttöön **Calendar API** + **Gmail API** | API:t päällä |
| 3 | **Google Service Account** | Luo service account + JSON-avain | `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` |
| 4 | **Google Workspace** | Domain-wide delegation service accountille; skoupit Calendar + Gmail.send. Edellyttää että `loppusiivous.fi` on Workspace-domain ja `info@loppusiivous.fi` postilaatikko on olemassa | Impersonointi `info@loppusiivous.fi` |
| 5 | **Vercel** | 2 projektia: `loppusiivous-site` (root=`site`) ja `loppusiivous-admin` (root=`admin`) | Deploy + env |
| 6 | **DNS** | `loppusiivous.fi` → site, `admin.loppusiivous.fi` → admin | Domainit |
| 7 | **Sentry** *(valinnainen)* | Projekti adminille | `VITE_SENTRY_DSN` |

> **Huom domain-wide delegation:** Tämä on ainoa kohta joka *vaatii Google Workspacen*
> (maksullinen). Jos `info@loppusiivous.fi` ei ole Workspacessa, vaihtoehdot ovat:
> (a) ota Workspace käyttöön domainille, tai (b) käytä OAuth2-refresh-token -mallia
> tavallisella Gmaililla, tai (c) jätä Gmail väliin ja käytä Resendiä (nykyinen stub).
> Ks. luku 7.

---

## 2. Kohde-repo-rakenne

KouruX/AaltoAir pitävät site/admin/supabase samassa repossa erillisinä sovelluksina.
Säilytetään sama malli:

```
Loppusiivous/
├── site/                      # Next.js 16 (App Router) — KORVAA nykyisen staattisen sivun
│   ├── src/app/
│   │   ├── page.tsx           # etusivu (nykyinen index.html sisältö React-komponentteina)
│   │   ├── layout.tsx
│   │   ├── varaa/page.tsx     # varausvirta (nykyisen booking.js logiikka)
│   │   ├── meista/ kayttoehdot/ tietosuoja/ ota-yhteytta/
│   │   ├── components/        # Hero, Pricing, BookingWizard, Footer, Analytics ...
│   │   └── api/
│   │       ├── services/route.ts        # GET aktiiviset palvelut/hinnat
│   │       ├── availability/route.ts    # GET vapaat ajat
│   │       ├── check-postal/route.ts    # GET palvelualue-tarkistus
│   │       ├── temp-reservation/route.ts# POST/DELETE 5 min slot-varaus
│   │       ├── bookings/route.ts        # POST luo varaus
│   │       └── form-submit/route.ts     # POST tarjouspyyntö/yhteydenotto
│   ├── src/lib/supabase/{client.ts,server.ts}
│   ├── src/lib/{postal.ts,pricing.ts,rate-limit.ts}
│   ├── src/data/postalCities.json
│   ├── public/                # assetit (nykyisestä site/assets)
│   ├── next.config.ts  postcss.config.mjs  tailwind  package.json
│   └── .env.local.example
│
├── admin/                     # React + Vite + TS (SPA) — KORVAA placeholderin
│   ├── src/
│   │   ├── main.tsx App.tsx index.css
│   │   ├── pages/             # Login, Dashboard, Bookings, Leads, Services, Calendar, Settings
│   │   ├── components/{layout,ui}
│   │   ├── hooks/             # useAuth, useBookings, useLeads, useServices ...
│   │   ├── lib/{supabase.ts,types.ts,queryKeys.ts,utils.ts}
│   │   └── context/{ToastContext,ConfirmContext}
│   ├── vite.config.ts  index.html  package.json
│   └── .env.local.example
│
├── supabase/                  # Postgres + Edge Functions — KORVAA placeholderin
│   ├── config.toml
│   ├── migrations/            # 0001_core_schema.sql, 0002_rls.sql, 0003_seed.sql ...
│   └── functions/
│       ├── _shared/{google-auth.ts,cors.ts,email-helpers.ts,email-builders.ts,logger.ts,fetch-retry.ts,auth.ts,constants.ts}
│       ├── create-booking-calendar-event/
│       ├── delete-booking-calendar-event/
│       ├── sync-google-calendars/
│       ├── watch-google-calendars/
│       ├── google-calendar-webhook/
│       ├── send-booking-email/
│       ├── send-contact-email/
│       └── finalize-booking/
│
├── brand-assets/  assets/  scripts/   # säilyvät (Playwright-renderöinti)
└── TOTEUTUSSUUNNITELMA.md
```

> **Mitä nykyisestä säilyy:** brändi (`BRANDI.md`, `assets/`, `scripts/render.mjs`),
> hinnoittelulogiikka (`booking.js` → `src/lib/pricing.ts`), tekstit ja juridiset sivut.
> `site/api/*.js` (Resend-stubit) korvataan Next.js-reiteillä + Supabasella.

---

## 3. Supabase backend

### 3.1 Taulut — täysi varaus/kalenteri/tekijä-ydin (kuten KouruX/AaltoAir)

Kopioidaan KouruX:n **varaus-, kalenteri-, tekijä- ja hinnoittelutaulut** sellaisinaan
(vain seed-data Loppusiivouksen palveluille). Migraatio `0001_core_schema.sql`:

| Taulu | Tarkoitus | Avainkentät |
|-------|-----------|-------------|
| `customers` | asiakkaat | first_name, last_name, email (unique), phone, address, postal_code |
| `services` | palvelut + perushinta | name, base_price_cents, duration_minutes, transition_minutes, min_scheduling_notice_hours, volume_pricing, commission_*, active |
| `service_variants` | hintavariantit (esim. m²-portaat) | service_id, label, price_cents, duration_minutes, metadata, sort_order, active |
| `addon_services` | lisäpalvelut (Uuni, Sauna, …) | name, price_cents, duration_minutes, commission_*, active, sort_order |
| `service_areas` | palvelualueet | name, postal_codes TEXT[], active |
| `employees` | tekijät (siivoojat) + roolit | user_id→auth.users, first/last_name, email, phone, postal_code, roles TEXT[], google_calendar_id, active |
| `employee_services` | mitä palveluja tekijä tekee | employee_id, service_id |
| `employee_service_priorities` | tekijän prioriteetti per palvelu (high/medium/low) | employee_id, service_id, priority |
| `employee_addon_exclusions` | lisäpalvelut joita tekijä ei tee | employee_id, addon_service_id |
| `installer_calendars` | tekijän kalenteri = palvelu + alue | employee_id, service_id, service_area_id, name, active |
| `calendar_weekly_slots` | toistuvat aukioloajat per kalenteri | calendar_id, day_of_week (1–7), start_time, end_time |
| `calendar_overrides` | poikkeukset (vapaat/estot, myös Google-sync) | calendar_id, date, start_time, end_time, override_type, reason |
| `bookings` | varaukset | customer_id, employee_id, service_id, calendar_id, variant_id, booking_date, time_slot, postal_code, address, price_cents, status, google_calendar_event_id |
| `booking_employees` | varauksen tiimi (monitekijä) + komissiot | booking_id, employee_id, role, commission_cents |
| `booking_line_items` | varauksen rivit (palvelu+lisät, snapshot) | booking_id, line_type, name, price_cents, quantity, duration_minutes |
| `temp_reservations` | 5 min slot-varaus checkoutin ajaksi | session_token (unique), service_id, variant_id, booking_date, time_slot, calendar_id, employee_id, expires_at |
| `form_submissions` | tarjouspyynnöt/yhteydenotot | form_slug, name, email, phone, postal_code, message, status |
| `company_settings` | yhden rivin globaali config + asentajavalinnan painot | default_transition_minutes, signature_html, weight_distance/workload/route |
| `discount_codes` | alennuskoodit | code, discount_type, discount_value, max_uses, employee_id |
| `google_calendar_watches` | Calendar push -kanavat | employee_id, google_calendar_id, channel_id, resource_id, expiration |

**Monitekijämalli (kuten KouruX):**
- Jokaisella tekijällä `google_calendar_id` (oma Google-kalenteri) ja `installer_calendars`
  (palvelu × alue). `findAvailableTeam`-algoritmi (site `lib/find-installer.ts` +
  `installer-scoring.ts`) valitsee tekijän etäisyyden, kuormituksen ja reitin mukaan;
  painot `company_settings`-taulussa.
- **Hinnoittelu adminissa:** Loppusiivouksen m²-portaat (`booking.js`:n `BANDS`) seedataan
  `service_variants`-riveiksi (label = "≤60 m²" jne., price_cents, duration_minutes).
  Admin muokkaa palveluja/variantteja/lisäpalveluja → sivu lukee ne `/api/services`-reitistä.
  Kotitalousvähennyksen näyttö pysyy sivun esityslogiikkana.
- **Ei kopioida** KouruX/AaltoAirin liiketoimintakohtaisia moduuleja (tuotemyynti/inventory,
  myynti-CRM, markkinointi-ads, asiakaspalvelu-tiketit, sopimukset, lämpöpumput) — ks. luku 11.

### 3.2 RLS (migraatio `0002_rls.sql`)
- `bookings`, `customers`, `form_submissions`, `temp_reservations`: **ei julkista
  pääsyä**. Public-sivu kirjoittaa vain `service_role`-avaimella Next.js-API-reiteistä
  (palvelinpuoli). Admin lukee/kirjoittaa kirjautuneena (anon key + auth).
- `services`, `addon_services`, `service_areas`, `calendar_weekly_slots`: public **read**
  sallittu (hintojen/aikataulujen näyttöön), kirjoitus vain authilla.
- Admin-pääsy: politiikka `auth.uid() IN (SELECT user_id FROM admins)` tms.

### 3.3 Edge-funktiot (Deno/TypeScript)
Jaetut helperit `_shared/` kopioidaan KouruX:sta lähes sellaisenaan (vain
yritysnimi/sähköposti/brändivärit muuttuvat):
- `google-auth.ts` — JWT (RS256) → Google access token, domain-wide delegation.
- `cors.ts` — sallitut originit (loppusiivous.fi, admin.*, localhost).
- `email-helpers.ts` — RFC 2822 MIME -rakennus + `sendViaGmail()`.
- `email-builders.ts` — sähköpostien HTML-pohjat (Loppusiivous-brändi).
- `logger.ts`, `fetch-retry.ts`, `auth.ts`, `constants.ts`.

Funktiot:
| Funktio | Mitä tekee |
|---------|-----------|
| `create-booking-calendar-event` | luo Google Calendar -tapahtuman varauksesta, tallentaa event_id |
| `delete-booking-calendar-event` | poistaa tapahtuman peruutuksessa |
| `sync-google-calendars` | hakee FreeBusy → `calendar_overrides` (blocked) |
| `watch-google-calendars` | rekisteröi push-kanavat (uusinta ~7 vrk välein) |
| `google-calendar-webhook` | vastaanottaa Google-pushin → päivittää overridet |
| `create-block-calendar-event` | admin estää aikaa tekijän kalenterista (loma yms.) |
| `delete-block-calendar-event` | poistaa eston |
| `reassign-booking-installer` | vaihtaa varauksen tekijän + päivittää kalenterit |
| `reschedule-booking` / `reschedule-booking-installer` | siirtää varauksen aikaa |
| `send-contact-email` | tarjouspyyntö-ilmoitus info@loppusiivous.fi:hin (Gmail) |
| `send-booking-email` | asiakkaan vahvistus / peruutus / kuitti (Gmail) |
| `finalize-booking` | merkitsee tehdyksi, rivit, kuitti |
| `create-admin-user` / `create-admin-booking` | adminin luomat käyttäjät/varaukset |

### 3.4 config.toml + secrets + cron
- `supabase/config.toml`: funktioiden asetukset, `verify_jwt = false` webhookille ja
  public-funktioille (oma auth `_shared/auth.ts`:ssä).
- Secrets (`supabase secrets set ...`): ks. luku 8.
- **pg_cron** -ajastukset: `watch-google-calendars` päivittäin (kanavien uusinta),
  `sync-google-calendars` varmuussyncinä, `temp_reservations`-siivous.

---

## 4. Google Service Account -asennus (tarkat vaiheet)

1. **GCP-projekti:** console.cloud.google.com → uusi projekti `loppusiivous`.
2. **APIt päälle:** Google Calendar API + Gmail API (Enable).
3. **Service account:** IAM & Admin → Service Accounts → Create. Ota talteen
   sähköposti (`...@...iam.gserviceaccount.com`) ja luo **JSON-avain** (private key).
4. **Domain-wide delegation:** service accountin asetuksissa "Enable G Suite
   domain-wide delegation". Ota talteen **Client ID**.
5. **Workspace Admin:** admin.google.com → Security → API controls → Domain-wide
   delegation → Add. Client ID + skoupit:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/gmail.send`
6. **Impersonointi:** funktiot impersonoivat `info@loppusiivous.fi` (postilaatikon on
   oltava olemassa Workspacessa).
7. **Env:** `GOOGLE_SERVICE_ACCOUNT_EMAIL` ja `GOOGLE_PRIVATE_KEY` (PEM, `\n` escapattu)
   Supabase-secreteiksi. `google-auth.ts` hoitaa JWT→token-vaihdon.
8. **Calendar webhook -domainin verifiointi:** Google vaatii että push-osoitteen
   (`GOOGLE_CALENDAR_WEBHOOK_URL` = Supabase-funktio-URL) domain on verifioitu Google
   Search Consolessa / domain verification -listalla.

---

## 5. Public site (Next.js) — nykyisen sivun migraatio

1. **Scaffold:** `npx create-next-app@latest site` (TS, App Router, Tailwind v4).
2. **Sisällön siirto:** `index.html` → `app/page.tsx` + komponentit
   (Hero/Palvelut/Hinnoittelu/UKK/Footer). Inline-CSS → Tailwind + `globals.css`.
   Brändivärit `BRANDI.md`:stä. Fontit (Gabarito/Inter) `next/font`.
3. **Varausvirta:** `booking.js` → `app/varaa/page.tsx` (client component) +
   `src/lib/pricing.ts` (BANDS/ADDONS/kotitalousvähennys/postinumerot).
4. **Supabase-clientit:** `lib/supabase/client.ts` (anon, selain),
   `lib/supabase/server.ts` (service_role, vain API-reiteissä).
5. **API-reitit** (kaikki `createServiceClient()`-pohjaisia):
   - `GET /api/services` — aktiiviset palvelut + lisäpalvelut.
   - `GET /api/check-postal?postal=` — palvelualue (Uusimaa-setti).
   - `GET /api/availability` — vapaat slotit per `installer_calendars`
     (`calendar_weekly_slots` − `calendar_overrides` − `bookings` − `temp_reservations`),
     yhdistetty asiakkaalle. Jaettu slot-logiikka `lib/slot-chain.ts`.
   - `POST /api/temp-reservation` / `DELETE` — 5 min varaus + `findAvailableTeam`.
   - `POST /api/bookings` — `findAvailableTeam` (`lib/find-installer.ts` +
     `installer-scoring.ts`: etäisyys/kuormitus/reitti) valitsee tekijän/tiimin → luo
     `customers`+`bookings`+`booking_employees`+`booking_line_items`, sitten
     *fire-and-forget* `create-booking-calendar-event` + `send-booking-email`.
   - `POST /api/form-submit` — `form_submissions` + `send-contact-email`.
6. **Rate limiting** (IP-pohjainen, `lib/rate-limit.ts`) ja syötteen validointi.
7. **Analytiikka** *(valinnainen, myöhemmin)*: GTM/GA4/Meta — KouruX:n `Analytics.tsx`.
8. **Env (`site/.env.local.example`):**
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   # myöhemmin: NEXT_PUBLIC_GTM_ID, NEXT_PUBLIC_GA_ID, GA4_API_SECRET, META_*
   ```

---

## 6. Admin-paneeli (React + Vite + TS)

1. **Scaffold:** `npm create vite@latest admin -- --template react-ts`. Asenna:
   react-router-dom, @tanstack/react-query, @supabase/supabase-js, tailwindcss
   (@tailwindcss/vite), @radix-ui/*, lucide-react, date-fns. (Capacitor/Sentry myöhemmin.)
2. **Supabase-client:** `lib/supabase.ts` (anon key, `VITE_`-muuttujat).
3. **Auth + roolit:** Supabase Auth (sähköposti/salasana). `useAuth`-hook +
   `<ProtectedRoute>` + Login-sivu. Roolit `employees.roles` (`admin`/`installer`);
   adminille täysi paneeli, tekijöille kevyt `tyontekija`-portaali (valinnainen).
4. **Näkymät (kuten KouruX/AaltoAir admin):**
   - `Dashboard` — tämän viikon varaukset, uudet tarjouspyynnöt, KPI:t.
   - `Bookings` — lista + detail, tila (pending/confirmed/completed/cancelled), tekijän
     vaihto (`reassign-booking-installer`), siirto (`reschedule-booking`), peruutus
     (`delete-booking-calendar-event`), valmistuminen (`finalize-booking`).
   - `Leads` (`form_submissions`) — tarjouspyynnöt, status new/read/handled.
   - `Calendar` — kaikkien tekijöiden viikkonäkymä, estojen lisäys
     (`create-block-calendar-event`).
   - `Employees` / `Teams` — tekijät, roolit, `google_calendar_id`, palvelut
     (`employee_services`), prioriteetit, `installer_calendars` + aukioloajat.
   - `Services` — palvelut + **variantit/hinnat** + lisäpalvelut, palvelualueet,
     asentajavalinnan painot (`company_settings`).
   - `Settings` — yritystiedot, sähköpostiallekirjoitus, alennuskoodit.
5. **Data:** TanStack Query + `queryKeys.ts`. Mutaatiot invalidoivat cachen.
6. **Env (`admin/.env.local.example`):**
   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_ANON_KEY=
   # myöhemmin: VITE_SENTRY_DSN
   ```

---

## 7. Sähköposti (Gmail API + service account)

Malli kuten KouruX `_shared/email-helpers.ts`:
- `getGoogleAccessToken("gmail.send", "info@loppusiivous.fi")` → token.
- `buildRawEmail({to, subject, html})` → base64 RFC 2822.
- `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`.
- Lähettäjä = `info@loppusiivous.fi` (impersonointi).
- Käyttö: `send-contact-email` (tarjouspyyntö → admin), `send-booking-email`
  (vahvistus/peruutus/kuitti → asiakas).

> **Fallback ilman Workspacea:** jos domain-wide delegation ei ole mahdollinen, säilytä
> nykyiset Resend-stubit (`RESEND_API_KEY`) sähköpostiin ja käytä service accountia vain
> Calendariin. Päätös tehtävä luvun 1 kohdan 4 perusteella.

---

## 8. Ympäristömuuttujat — koonti

**Supabase Edge Functions (secrets):**
```
SUPABASE_URL=                       # auto
SUPABASE_SERVICE_ROLE_KEY=          # auto
SUPABASE_ANON_KEY=                  # auto
GOOGLE_SERVICE_ACCOUNT_EMAIL=       # ...@...iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=                 # PEM, \n escapattu
GOOGLE_CALENDAR_WEBHOOK_URL=        # https://<ref>.supabase.co/functions/v1/google-calendar-webhook
```
**site (Vercel):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
**admin (Vercel):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## 9. Google Calendar -synkronoinnin logiikka

- **Ulos (varaus → kalenteri):** uusi varaus → `create-booking-calendar-event` luo
  tapahtuman `info@loppusiivous.fi`-kalenteriin, tallentaa `google_calendar_event_id`.
  Peruutus → `delete-booking-calendar-event`.
- **Sisään (kalenteri → vapaat ajat):** `watch-google-calendars` rekisteröi push-kanavan;
  kun kalenteri muuttuu, Google kutsuu `google-calendar-webhook` → haetaan FreeBusy →
  kirjataan varatut ajat `calendar_overrides`-tauluun (`reason='google_calendar_sync'`),
  jolloin sivu ei tarjoa niitä aikoja. Varmuussync `sync-google-calendars` (cron).

---

## 10. Toteutusjärjestys (vaiheet / milestones)

Lähtökohta: kopioidaan KouruX/AaltoAir-rakenne ja karsitaan liiketoimintakohtaiset
moduulit pois (luku 11). Tämä on kopiointi + uudelleenbrändäys + seed, ei tyhjästä rakennus.

> **Tilanne 23.6.2026:** ✅ **M1 valmis ja varmennettu.** Supabase-projekti
> `hpahowjozbyffrbpjzbc` linkitetty; 20 taulua, RLS päällä kaikilla, seed (palvelu +
> 12 m²-varianttia + 5 lisäpalvelua + Uusimaa-alue + placeholder-tekijä + kalenteri +
> aukioloajat), advisorit puhtaat (jäljellä vain odotetut/infra-WARNit). Avaimet repo
> `.env`:ssä (gitignore). Toimiva access token = **AaltoAirin** token (KouruX:n token
> kuollut).
>
> ✅ **M2/M3 suurelta osin valmis:** `site/` kopioitu KouruX:sta, kytketty Supabaseen.
> - **Backend (booking-engine) VALMIS & varmennettu end-to-end:** `services`,
>   `check-postal` (prefiksimatch), `availability`, `temp-reservation`, `bookings`,
>   `find-installer` kirjoitettu Loppusiivous-skeemaan. Testattu live-DB:tä vasten:
>   varaus syntyy oikein (asiakas + tekijä + rivit + tiimi), testidata siivottu.
> - **Brändipohja valmis:** globals.css (navy/sininen paletti), layout.tsx (Gabarito+Inter,
>   metadata, JSON-LD), Header (logo/nav/yhteystiedot), kaikki `kourux.fi`→`loppusiivous.fi`
>   ja `KouruX`→`Loppusiivous` (0 jäljellä). Faviconit/logo vaihdettu.
> - Poistettu kuollut koodi (queue-order-emails). `npm run build` ✓ (24 reittiä).
> - Vanha staattinen sivu: `legacy-site/`.
>
> ✅ **Sivu valmis (M2/M3):** kaikki markkinointitekstit kirjoitettu uusiksi
> (ränni→muuttosiivous): Hero, Problem, Process, Pricing, Services, WhyUs, Testimonials,
> FAQ, CTA, Footer, Header, meista, not-found, artikkelit + uusi blogi (muuttosiivous-opas).
> Poistettu: `taloyhtioille/` (ei relevantti), gutter-blogi, `ChatWidget` (turha duplikaatti).
> **Pricing-widget uudelleenkirjoitettu varianttipohjaiseksi**: m²-syöttö → variantti →
> kiinteä hinta; koko varausvirta (m²→postinumero→kalenteri→yhteystiedot) testattu
> end-to-end live-DB:tä vasten (variantti 35000c → booking 35000c ✓).
> **Kaikki KouruX-tunnukset poistettu:** GTM/Google Ads/Meta Pixel → env-pohjaisia (tyhjiä);
> ei KouruX/AaltoAir-projektiviittauksia koodissa; AaltoAirin access token poistettu repo
> `.env`:stä (vain Loppusiivouksen omat avaimet jäljellä). `npm run build` ✓ (23 reittiä).
>
> ✅ **Admin valmis (M6):** `admin/` (Vite + React + TS + Tailwind v4 + TanStack Query +
> react-router + Supabase Auth) — Loppusiivous-brändi (navy/sininen). Näkymät: Login,
> Kojelauta, Varaukset (tila-päivitys), Tarjouspyynnöt (status), Kalenteri (agenda),
> Palvelut & hinnat (varianttien/lisäpalvelujen hinta + aktiivisuus muokattavissa),
> Asetukset (company_settings). `npm run build` ✓. **Auth + RLS varmennettu live-DB:tä
> vasten:** luotu admin-käyttäjä `admin@loppusiivous.fi` + linkitetty employees-rivi
> (roles=['admin']); kirjautuminen + RLS-suojatut kyselyt toimivat (is_admin()).
>
> 🔧 **Vielä tekemättä:** edge-funktiot (kalenteri/Gmail, odottavat Google service
> accountia). 0 committia gitiin toistaiseksi.

| Vaihe | Sisältö | Tuotos | Karkea työmäärä |
|-------|---------|--------|------------------|
| **M1. Supabase-ydin** | kopioi varaus/kalenteri/tekijä/hinnoittelu-migraatiot KouruX:sta, `0002_rls.sql`, `0003_seed.sql` (Loppusiivouksen palvelut + m²-variantit + lisäpalvelut + alueet) | toimiva tietokanta | 1–2 pv |
| **M2. Sivun migraatio Next.js:ään** | scaffold, etusivu + juridiset sivut, brändi (`index.html`/`booking.js` → komponentit) | sivu pystyssä Vercelissä | 2–3 pv |
| **M3. Sivun backend-reitit** | `/api/services`, `/api/form-submit`, `/api/check-postal`, `/api/availability`, `/api/temp-reservation`, `/api/bookings` + `lib/find-installer.ts`/`slot-chain.ts` (kopio) | varaus/tarjouspyyntö tallentuu, oikeat vapaat ajat | 2–3 pv |
| **M4. Google service account + Gmail** | GCP+Workspace-asetukset, `_shared`-helperit, `send-contact-email` + `send-booking-email` | sähköpostit Gmaililla | 1–2 pv |
| **M5. Calendar-sync** | `create/delete-booking-calendar-event`, `create/delete-block`, `watch`/`webhook`/`sync`, cron | varaukset tekijöiden kalentereihin + estot takaisin | 2–3 pv |
| **M6. Admin (täysi)** | Vite-scaffold (kopio), Auth+roolit, Dashboard, Bookings (reassign/reschedule/finalize), Leads, Calendar, Employees/Teams, Services (hinnat), Settings | admin hallitsee koko toiminnan | 4–6 pv |
| **M7. Tekijäportaali + viimeistely** | `tyontekija`-portaali (valinnainen), kuitit, (analytiikka GTM/GA4/Meta, Sentry, Capacitor-iOS) | tuotantovalmis | 2–4 pv |

**Riippuvuudet:** M1 ensin. M2–M3 rinnakkain. M4 vaatii luvun 1 kohdat 2–4 (GCP+Workspace).
M5 vaatii M4:n service accountin + webhook-domainin verifioinnin. M6 vaatii M1:n.

---

## 11. Päätökset

**Vahvistettu:**
- ✅ `loppusiivous.fi` Workspacessa → Gmail API + service account (domain-wide delegation).
- ✅ Useita tekijöitä → täysi `employees`/`installer_calendars`/`booking_employees`-malli +
  `findAvailableTeam`-algoritmi (kuten KouruX/AaltoAir).
- ✅ Hinnoittelu admin-muokattavissa → `services` + `service_variants` + `addon_services`.
- ✅ **Laajuus: vain varaus-ydin.** Kopioidaan KouruX/AaltoAirista varaukset, kalenteri,
  tekijät, palvelut/hinnat, tarjouspyynnöt, sähköposti ja Calendar-sync (~20 taulua,
  ~12 edge-funktiota). **EI kopioida:** tuotemyynti+varasto, lämpöpumput, myynti-CRM,
  markkinointi-ads, asiakaspalvelu-tiketit+SMS, sopimukset, projektit. Lisätään moduuleja
  myöhemmin tarpeen mukaan.

**Muut avoimet:**
- [ ] Domainit: `admin.loppusiivous.fi` adminille — ok?
- [ ] Y-tunnus, puhelin, sähköposti, toimialue (ks. `BRANDI.md` → "Avoimet").
```
