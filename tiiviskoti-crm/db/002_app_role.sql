-- =============================================================
-- Sovellusrooli `tk_app`.
--
-- Sovellus ottaa yhteyden Supabasen poolerin kautta omalla roolilla,
-- ei master-tunnuksella eikä service_role-avaimella. Rooli näkee vain
-- `tk`-skeeman: `public` on nimenomaan revokattu, jotta uusi järjestelmä
-- ei pääse käsiksi vanhan adminin tauluihin edes vahingossa.
--
-- BYPASSRLS: `tk`-taulujen RLS on päällä ilman yhtään policyä, eli ne
-- ovat lukossa kaikilta tavallisilta rooleilta. Se on suojaus siltä
-- varalta, että skeema joskus julkaistaisiin Data API:ssa. Sovellus on
-- luotettu palvelinpuolen identiteetti ja tekee käyttöoikeustarkistukset
-- itse (lib/session.ts), joten se ohittaa RLS:n samoin kuin Supabasen
-- oma service_role. Ilman tätä sovellus näkee tyhjän kannan.
--
-- Salasana ei ole täällä. Se on `.env.local`-tiedostossa ja Vercelin
-- ympäristömuuttujissa (DATABASE_URL).
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/002_app_role.sql
-- =============================================================

do $$ begin
  create role tk_app with login password 'vaihda-tama';
exception when duplicate_object then null; end $$;

alter role tk_app bypassrls;

grant usage on schema tk to tk_app;
grant select, insert, update, delete on all tables in schema tk to tk_app;
grant usage, select on all sequences in schema tk to tk_app;
alter default privileges in schema tk grant select, insert, update, delete on tables to tk_app;
alter default privileges in schema tk grant usage, select on sequences to tk_app;

revoke all on schema public from tk_app;
