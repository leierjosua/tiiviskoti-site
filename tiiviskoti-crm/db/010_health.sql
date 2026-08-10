-- =============================================================
-- Google-yhteyden kuntotarkistusten historia.
--
-- MIKSI TÄMÄ ON OLEMASSA: kun Google-refresh token kuoli 9.8.2026, varaus
-- tallentui kantaan normaalisti ja asiakas näki onnistumisen — mutta
-- vahvistusposti, työmääräin ja kalenteritapahtuma jäivät kaikki
-- lähettämättä. Vika näkyi VAIN Vercelin lokissa. Käytännössä ensimmäinen
-- maksettu Ads-liidi olisi ollut se joka paljastaa rikon, ja se asiakas
-- olisi jäänyt kokonaan ilman vahvistusta.
--
-- MIKSI HISTORIA EIKÄ YKSI TILARIVI: tokenin IKÄ on tässä tärkein luku.
-- Googlen OAuth-consent screen "Testing"-tilassa refresh token vanhenee
-- seitsemässä vuorokaudessa, joten rikko on ennustettava — mutta vain jos
-- tiedetään milloin nykyinen token otettiin käyttöön. Se luetaan tästä
-- taulusta: vanhin onnistunut tarkistus samalla tunnisteella.
--
-- TUNNISTEESTA: `credential` on sha256-tiiviste refresh tokenista, ei itse
-- token. Kannasta ei saa lukea tunnuksia, mutta on nähtävä milloin ne
-- vaihtuivat.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/010_health.sql
-- Idempotentti.
-- =============================================================

create table if not exists tk.health_checks (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'google',
  ok          boolean not null,
  detail      text,
  -- Tarkistushetken tunnuksen tiiviste. null jos tunnuksia ei ole asetettu.
  credential  text,
  -- Lähtikö tästä tarkistuksesta varoitusposti. Estää saman varoituksen
  -- toistumisen joka päivä: varoitus lähetetään kerran tunnusta kohden.
  warned      boolean not null default false,
  checked_at  timestamptz not null default now()
);

-- Kysely on aina joko "viimeisin tarkistus" tai "vanhin onnistunut tällä
-- tunnisteella". Molemmat osuvat tähän indeksiin.
create index if not exists idx_health_checks_kind_time
  on tk.health_checks(kind, checked_at desc);

alter table tk.health_checks enable row level security;
revoke all on tk.health_checks from anon, authenticated;

-- Uusi taulu tarvitsee oikeudet erikseen: default privileges koskee vain
-- tämän jälkeen luotuja, ja rooli on luotu ennen tätä.
grant select, insert, update, delete on all tables in schema tk to tk_app;
grant usage, select on all sequences in schema tk to tk_app;

comment on table tk.health_checks is
  'Google-yhteyden päivittäisen kuntotarkistuksen tulokset. Kirjoittaja /api/cron/health, lukija adminin etusivun varoitus.';
