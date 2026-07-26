# Gmail + Google Calendar -setup (TiivisKoti)

Vaiheet joilla varausvahvistukset (Gmail) ja Google Calendar -synkka saadaan
toimimaan tuotannossa.

**Supabase-projekti:** `zfucgwjxgwdlocuvreft`
**Lähettäjä / kalenterin omistaja:** `info@tiiviskoti.fi`

> Google Workspace on jo olemassa tiiviskoti.fi-domainille (MX → SMTP.GOOGLE.COM
> ja google-site-verification TXT löytyvät DNS:stä). Sitä ei siis tarvitse
> perustaa uudelleen.

Koodipuoli on valmis. Alla olevat vaiheet ovat niitä, joita Claude **ei voi
tehdä puolestasi** — ne vaativat kirjautumisen Google Cloudiin, Google
Workspace -adminiin ja Supabaseen.

---

## 1. Google Cloud -projekti + service account — KÄSIN

1. https://console.cloud.google.com → **New Project**, nimeksi esim.
   `tiiviskoti-backend`.
2. **APIs & Services → Library** → ota käyttöön:
   - **Gmail API**
   - **Google Calendar API**
3. **APIs & Services → Credentials → Create credentials → Service account**
   - Nimi esim. `tiiviskoti-mail-calendar`. Roolia ei tarvita.
4. Avaa luotu service account → **Keys → Add key → Create new key → JSON**.
   Lataa JSON talteen (sisältää `client_email` ja `private_key`).

   > **Jos tulee virhe "An Organization Policy that blocks service accounts key
   > creation has been enforced on your organization":**
   > Kyseessä on org-policy `constraints/iam.disableServiceAccountKeyCreation`,
   > joka on uusissa Google Cloud -organisaatioissa oletuksena PÄÄLLÄ. Workspace
   > luo organisaation automaattisesti, ja projekti perii säännön.
   >
   > 1. Cloud Console → resurssivalitsin vasemmalta ylhäältä → vaihda projektista
   >    **organisaatioon** (`tiiviskoti.fi`)
   > 2. **IAM & Admin → IAM** → oma tili → **Edit** → lisää rooli
   >    **Organization Policy Administrator** (`roles/orgpolicy.policyAdmin`).
   >    Jos et pysty lisäämään, sinulta puuttuu **Organization Administrator** —
   >    lisää se ensin Workspace-superadminina admin.google.comista.
   > 3. **IAM & Admin → Organization Policies** → hae
   >    `Disable service account key creation`
   > 4. **Manage policy → Customize →** Add rule → **Enforcement: Off** →
   >    **Set policy**. Rajaa sääntö mieluiten vain `tiiviskoti-backend`
   >    -projektiin, älä koko organisaatioon.
   > 5. Odota pari minuuttia ja lataa avain uudelleen.
   >
   > Vaihtoehto ilman org-policyn koskemista: OAuth 2.0 -client + kertaluontoinen
   > hyväksyntä `info@tiiviskoti.fi`:llä → **refresh token** secretiksi. Tämä
   > poistaa myös kohdan 2 (domain-wide delegation) tarpeen, mutta vaatii
   > `_shared/google-auth.ts`:n vaihtamisen JWT-bearer-flow'sta
   > `refresh_token`-flow'hun.
5. Samalta sivulta **Details → Advanced settings** → kopioi talteen
   **Client ID** (pitkä numerosarja) — tarvitaan kohdassa 2.

## 2. Domain-wide delegation (admin.google.com) — KÄSIN

Tämä antaa service accountille oikeuden toimia `info@tiiviskoti.fi`:n nimissä.

1. https://admin.google.com (kirjaudu `info@tiiviskoti.fi`) →
   **Security → Access and data control → API controls → Domain-wide delegation
   → Add new**
2. **Client ID:** kohdassa 1.5 kopioitu numerosarja
3. **OAuth scopes** (liitä täsmälleen näin, pilkulla eroteltuna):
   ```
   https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/calendar
   ```
4. **Authorize**.

> Ilman tätä vaihetta token-vaihto epäonnistuu virheeseen
> `unauthorized_client` — se on ylivoimaisesti yleisin syy siihen ettei
> sähköposti lähde.

## 2b. VAIHTOEHTO: OAuth refresh token (jos service account -avain on estetty)

Jos org-policy estää avaimen luonnin etkä saa sitä pois päältä, käytä tätä.
`_shared/google-auth.ts` tukee **molempia** tapoja: jos
`GOOGLE_OAUTH_REFRESH_TOKEN` on asetettu, sitä käytetään; muuten palataan
service account -tapaan. Kohtia 1.4 ja 2 ei tällöin tarvita lainkaan.

1. **APIs & Services → OAuth consent screen** → User type **Internal**
   (Workspace-organisaatiossa Internal riittää eikä vaadi Googlen tarkistusta)
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:8123/oauth2callback`
3. Aja projektin juuressa:
   ```bash
   node scripts/google-oauth-setup.mjs <CLIENT_ID> <CLIENT_SECRET>
   ```
   Skripti avaa selaimen → kirjaudu `info@tiiviskoti.fi` → hyväksy oikeudet →
   se tulostaa valmiin `supabase secrets set` -komennon.

**Rajoitus:** refresh token ei voi esiintyä toisena käyttäjänä (toisin kuin
domain-wide delegation). Kaikki toiminta tapahtuu `info@tiiviskoti.fi`:n
oikeuksilla. Käytännössä tämä tarkoittaa, että **asentajien kalenterit on
pakko jakaa** `info@tiiviskoti.fi`:lle kirjoitusoikeudella (kohta 7) — muuten
`sync-google-calendars`, `watch-google-calendars` ja
`create-block-calendar-event` eivät pääse niihin käsiksi. Gmail-lähetys ja
varauskalenteri toimivat normaalisti.

**Uusiminen:** token lakkaa toimimasta jos tilin salasana vaihdetaan, oikeudet
perutaan, tai sitä ei käytetä 6 kk. Oire on `invalid_grant` funktion lokeissa —
korjaus on ajaa sama skripti uudelleen.

## 3. Secretit edge-funktioille

```bash
supabase login
supabase link --project-ref zfucgwjxgwdlocuvreft
```

**Tapa A — service account (kohdat 1–2):**
```bash
supabase secrets set \
  GOOGLE_SERVICE_ACCOUNT_EMAIL="<JSONin client_email>" \
  GOOGLE_PRIVATE_KEY="<JSONin private_key, \n-merkit sellaisenaan>" \
  GOOGLE_CALENDAR_WEBHOOK_URL="https://zfucgwjxgwdlocuvreft.supabase.co/functions/v1/google-calendar-webhook"
```

`GOOGLE_PRIVATE_KEY` sisältää rivinvaihdot muodossa `\n`. `google-auth.ts`
muuntaa ne (`replace(/\\n/g, "\n")`), joten liitä arvo **täsmälleen** siinä
muodossa kuin se on JSON-tiedostossa.

**Tapa B — OAuth refresh token (kohta 2b):** käytä skriptin tulostamaa komentoa,
ja lisää lisäksi webhook-URL:
```bash
supabase secrets set \
  GOOGLE_CALENDAR_WEBHOOK_URL="https://zfucgwjxgwdlocuvreft.supabase.co/functions/v1/google-calendar-webhook"
```

## 4. Vault-secret service_role-avaimelle

Kannan INSERT-trigger ja cron-työt kutsuvat edge-funktioita tällä avaimella.
Aja Supabase SQL Editorissa:

```sql
select vault.create_secret('<SERVICE_ROLE_KEY>', 'supabase_service_role_key');
-- jos secret on jo olemassa:
-- select vault.update_secret(
--   (select id from vault.secrets where name='supabase_service_role_key'),
--   '<SERVICE_ROLE_KEY>');
```

Service role -avain: Supabase Dashboard → Project Settings → API → `service_role`.

## 5. Extensionit

Supabase Dashboard → Database → Extensions → **pg_cron** ja **pg_net** päälle.
(Migraatiot yrittävät `create extension if not exists` itse; tämä on varmistus.)

## 6. Migraatiot + funktiot

> **Tee vaiheet 1–5 ENNEN tätä.** `db push` käynnistää cronin, joka alkaa
> purkaa `email_outbox`-jonoa. Jos Google-tunnukset puuttuvat vielä siinä
> vaiheessa, rivit kuluttavat yrityksiään turhaan (8 yritystä ≈ 8,5 h ikkuna,
> ks. `max_attempts` create-booking.mjs:ssä) ja päätyvät lopulta
> `dead_letter`-tilaan.

```bash
supabase db push
supabase functions deploy process-email-outbox create-booking-calendar-event \
  delete-booking-calendar-event send-booking-email send-contact-email \
  sync-google-calendars watch-google-calendars google-calendar-webhook
```

> **Tärkeää:** `supabase db push` ajaa migraation
> `20260724200000_fix_project_url_tiiviskoti.sql`, joka korjaa aiempiin
> migraatioihin jääneen **väärän projektin URLin**
> (`hpahowjozbyffrbpjzbc` → `zfucgwjxgwdlocuvreft`). Ilman tätä email_outboxin
> trigger ja kaikki cronit kutsuisivat väärän projektin funktioita eikä yksikään
> vahvistussähköposti lähtisi. Sama migraatio lisää `bookings.duration_minutes`
> -sarakkeen, jota kalenteritapahtuman pituus tarvitsee.

## 7. Kalenterin jakaminen

- Kalenteritapahtumat luodaan `info@tiiviskoti.fi`:n omaan kalenteriin
  (`create-booking-calendar-event`, vakio `CALENDAR_OWNER`).
- Jos asentajilla on omat kalenterit: aseta `employees.google_calendar_id` ja
  jaa kalenteri `info@tiiviskoti.fi`:lle kirjoitusoikeudella.

## 8. Testivaraus (end-to-end)

1. Tee varaus osoitteessa https://tiiviskoti.fi/varaa.html
2. Tarkista `email_outbox`: rivi `sent`-tilassa ja `gmail_message_id` täytetty.
3. Vahvistusviesti perille asiakkaan sähköpostiin.
4. Google Calendar -tapahtuma näkyy `info@tiiviskoti.fi`:n kalenterissa,
   pituus = ovien kestojen summa.
5. Jos rivi jää `pending`/`failed`: katso `last_error` ja
   `supabase functions logs process-email-outbox`.

---

## Arkkitehtuuri

Sähköpostit toimivat outbox-mallilla — mikään ei katoa vaikka Google olisi alhaalla:

```
tiiviskoti/api/create-booking.mjs
  └─ INSERT email_outbox (type=booking, email_type=confirmation)
       └─ INSERT-trigger (pg_net) + cron 2 min välein
            └─ process-email-outbox
                 └─ email-builders  → rakentaa HTML-viestin
                 └─ sendViaGmail    → lähettää info@tiiviskoti.fi:stä
  └─ POST create-booking-calendar-event
       └─ Google Calendar API → tapahtuma + tallentaa google_calendar_event_id
```

Epäonnistuneet lähetykset uusitaan eksponentiaalisella backoffilla
(`2^attempts` minuuttia), ja `max_attempts` (oletus 3) jälkeen rivi siirtyy
`dead_letter`-tilaan. Varaus **ei koskaan** kaadu sähköpostin tai kalenterin
virheeseen — molemmat kutsut on kääritty try/catchiin.

## Vielä auki

- **`google_calendar_channels` -taulua ei ole kannassa.** Se tarvitaan vain
  kaksisuuntaiseen push-synkkaan (`watch-google-calendars` /
  `google-calendar-webhook`). Varausten luonti kalenteriin ja 2 h välein ajettava
  FreeBusy-synkka toimivat ilman sitä.
- **`_shared/html-to-pdf.ts:7`** osoittaa yhä vanhaan palveluun
  (`loppusiivous-site-new.vercel.app/api/generate-pdf`). Koskee vain kuitti- ja
  sopimus-PDF:iä, ei varausvahvistusta. TiivisKoti-projektissa ei ole vastaavaa
  `/api/generate-pdf`-endpointtia.
- Sähköpostipohjat (`email_templates`) voi halutessaan lisätä kantaan slugilla
  `booking_confirmation`; ilman niitä käytetään koodin oletuspohjaa.
