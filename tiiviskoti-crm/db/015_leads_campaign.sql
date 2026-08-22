-- =============================================================
-- Kampanjatunniste liidille: mistä mainoksesta yhteydenotto tuli.
--
-- MIKSI: tk.jobs sai kampanjan jo 008:ssa, mutta liidit eivät. Liidi on
-- taloyhtiökaupan ENSIMMÄINEN askel — tarjouspyyntö tulee kuukausia ennen
-- kuin siitä syntyy työ, ja moni ei etene työksi lainkaan. Ilman tätä
-- taloyhtiömainosten tuotto näkyy raportissa vasta kaupan jälkeen, jolloin
-- mainosbudjettia ohjataan pahimmillaan puolen vuoden viiveellä.
--
-- Sama muotorajaus ja sama perustelu kuin 008_campaign.sql / 009_gclid.sql:
-- arvo tulee julkisesta osoitteesta, joten muoto pakotetaan kannassa asti.
--
-- Sivusto ja CRM osaavat toimia myös ILMAN näitä sarakkeita: reitit
-- huomaavat puuttuvan sarakkeen (42703) ja kirjoittavat liidin ilman
-- kampanjaa. Liidi on aina tärkeämpi kuin sen mittari — mutta se tarkoittaa
-- myös, ettei mikään huuda jos tämä migraatio jää ajamatta. Aja se.
--
-- Ajetaan Supabasen SQL-editorissa postgres-roolilla (tk_app ei omista
-- taulua eikä voi ajaa ALTERia). Idempotentti.
-- =============================================================

alter table tk.leads add column if not exists campaign text;
alter table tk.leads add column if not exists gclid text;

do $$ begin
  alter table tk.leads add constraint leads_campaign_format
    check (campaign is null or campaign ~ '^[a-z0-9][a-z0-9._-]{0,59}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tk.leads add constraint leads_gclid_format
    check (gclid is null or gclid ~ '^[A-Za-z0-9_-]{10,200}$');
exception when duplicate_object then null; end $$;

-- Kuten jobs: raportti kysyy "mitkä liidit kampanjasta X ja milloin",
-- joten kampanjattomia rivejä ei tarvitse indeksoida.
create index if not exists idx_leads_campaign
  on tk.leads(campaign, created_at desc)
  where campaign is not null;

comment on column tk.leads.campaign is
  'Markkinointikampanjan tunniste sivuston osoiterivistä (?src=, utm_*, tai fbclid/gclid → meta-ads/google-ads). null = ei tiedossa.';
comment on column tk.leads.gclid is
  'Google Ads -klikin tunniste (gclid/wbraid/gbraid). Offline-konversion vientiä varten.';
