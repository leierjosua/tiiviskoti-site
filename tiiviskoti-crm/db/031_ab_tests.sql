-- =============================================================
-- A/B-testien rekisteri.
--
-- Testin tulos on ollut tähän asti vain kannassa: `tk.web_events.variant`
-- kertoo kumman version kävijä näki, mutta ei sitä MITÄ testattiin, milloin
-- testi alkoi eikä mikä askel oli mittari. Ilman niitä tuloksen laskeminen
-- vaatii käsin kirjoitetun kyselyn joka kerta, eikä päättyneestä testistä
-- jää mitään muistiin — sama asia testataan vuoden päästä uudelleen.
--
-- Tämä taulu on se puuttuva puoli: yksi rivi per testi, ja luvut lasketaan
-- rivin määritelmän mukaan web_eventsistä. Kanta ei siis tallenna tuloksia,
-- vaan säännön jolla tulos lasketaan — päättyneen testin luvut pysyvät
-- ennallaan, koska ikkuna on kiinnitetty (started_on … ended_on).
--
-- MITTARI: `metric_step` = mihin suppilon askeleeseen päästiin,
-- `base_step` = mistä joukosta (null = sivunäytöt). Osuus näiden välillä on
-- se luku jota versiot vertaavat.
--
-- HUOM ARVONNASTA: versio arvotaan sivulatauskohtaisesti eikä kävijää
-- tallenneta (_analytics.js). Mittayksikkö on siis sivulataus, ei ihminen.
--
-- Ajetaan: Supabasen SQL-editorissa (postgres-roolilla).
-- `tk_app` EI voi luoda tauluja skeemaan tk (42501).
-- Idempotentti.
-- =============================================================

create table if not exists tk.ab_tests (
  id            uuid primary key default gen_random_uuid(),

  name          text not null,
  -- Mitä oletettiin ja miksi. Ilman tätä päättyneen testin rivi kertoo
  -- vain että jotain testattiin.
  hypothesis    text,

  -- LIKE-kuvio tk.web_events.path -sarakkeeseen. '%' = koko sivusto.
  path_pattern  text not null default '%',

  -- Suppilon askel jota mitataan, ja joukko josta osuus lasketaan.
  -- base_step null = sivunäytöt (event_type = 'pageview').
  base_step     text,
  metric_step   text not null,

  -- Mitä versiot olivat. Nämä ovat ihmisen luettavaksi; kannassa arvot ovat
  -- aina 'a' ja 'b'.
  label_a       text not null default 'A',
  label_b       text not null default 'B',

  started_on    date not null,
  -- Null = käynnissä. Päättyneen testin ikkuna on kiinni, joten sen luvut
  -- eivät enää muutu.
  ended_on      date,
  winner        text check (winner in ('a', 'b', 'none')),
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  check (ended_on is null or ended_on >= started_on),
  -- Voittaja on olemassa vain päättyneellä testillä.
  check (winner is null or ended_on is not null)
);

create index if not exists idx_ab_tests_running on tk.ab_tests(ended_on, started_on desc);

drop trigger if exists trg_ab_tests_touch on tk.ab_tests;
create trigger trg_ab_tests_touch before update on tk.ab_tests
  for each row execute function tk.touch_updated_at();

comment on table tk.ab_tests is
  'A/B-testien rekisteri. Rivi kertoo mitä testattiin ja millä mittarilla; luvut lasketaan tk.web_eventsistä.';

-- Ensimmäinen testi taannehtivasti: taloyhtiökuva, ajettu 24.8.–9.9.2026.
-- Oma kuva voitti kuvapankin kuvan (12/235 vs 4/247 etenemistä
-- kartoituskalenteriin, Fisher p = 0,041), ja B poistettiin sivustolta.
insert into tk.ab_tests
  (name, hypothesis, path_pattern, base_step, metric_step, label_a, label_b,
   started_on, ended_on, winner, notes)
select
  'Taloyhtiökuva: oma kuva vs. kuvapankki',
  'Oman kuvauksen kuva (asentajat talon pihassa) saa taloyhtiöpäättäjän etenemään useammin kuin geneerinen kuvapankin kerrostalokuva.',
  '%taloyhtio%', null, 'y-cal',
  'Oma kuva — asentajat pihassa', 'Kuvapankki — kerrostalon julkisivu',
  date '2026-08-24', current_date, 'a',
  'Oma kuva voitti 3,2-kertaisesti. B poistettu sivustolta testin päättyessä.'
where not exists (select 1 from tk.ab_tests where name = 'Taloyhtiökuva: oma kuva vs. kuvapankki');

alter table tk.ab_tests enable row level security;
grant select, insert, update, delete on tk.ab_tests to tk_app;
