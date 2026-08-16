-- =============================================================
-- Sivuston evästeetön, anonyymi kävijäseuranta.
--
-- MIKSI OMA: tiiviskoti.fi ei käytä seurantaevästeitä (tietosuoja luku 7),
-- joten Google Analyticsia tms. ei voi käyttää. Tämä on kevyt oma ratkaisu,
-- jossa kävijää EI tunnisteta pysyvästi: palvelin laskee päivittäin
-- vaihtuvan hashin (IP + selain + päivä + salt), josta ei voi palata IP:hen.
-- Hash tallennetaan, raaka IP EI KOSKAAN. Sessiot ja "keskimääräinen kesto"
-- johdetaan hashista + 30 min tauosta raportissa — ei client-storagea.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/011_web_analytics.sql
-- Idempotentti.
-- =============================================================

create table if not exists tk.web_events (
  id           uuid primary key default gen_random_uuid(),
  ts           timestamptz not null default now(),
  visitor_hash text not null,          -- päivittäin vaihtuva anonyymi hash, EI IP
  event_type   text not null,          -- 'pageview' | 'scroll' | 'cta' | 'funnel'
  path         text,                   -- sivun polku, esim. /toiminta-alueet/espoo.html
  ref_source   text,                   -- 'google' | 'facebook' | 'direct' | 'other' ...
  ref_host     text,                   -- viittaajan verkkotunnus (ilman polkua)
  device       text,                   -- 'mobile' | 'tablet' | 'desktop'
  browser      text,                   -- 'Chrome' | 'Safari' | 'Firefox' | ...
  os           text,                   -- 'iOS' | 'Android' | 'Windows' | 'macOS' | ...
  scroll_pct   smallint,               -- scroll-syvyys 0..100 (event_type='scroll')
  cta          text,                   -- CTA:n tunniste (event_type='cta')
  funnel_step  text,                   -- varausvaiheen nimi (event_type='funnel')
  campaign     text,                   -- ?src= jos tiedossa
  constraint web_events_type_ck check (event_type in ('pageview','scroll','cta','funnel')),
  constraint web_events_scroll_ck check (scroll_pct is null or scroll_pct between 0 and 100)
);

-- Raportit kysyvät aikavälillä ja tyypeittäin, ja sessiot ryhmitellään
-- kävijän hashin mukaan aikajärjestyksessä.
create index if not exists idx_web_events_ts on tk.web_events(ts);
create index if not exists idx_web_events_visitor on tk.web_events(visitor_hash, ts);
create index if not exists idx_web_events_type_ts on tk.web_events(event_type, ts);

-- Default privileges kattaa yleensä uudet taulut, mutta varmistetaan.
grant select, insert on tk.web_events to tk_app;

comment on table tk.web_events is
  'Evästeetön, anonyymi sivustoanalytiikka. visitor_hash vaihtuu päivittäin, IP:tä ei tallenneta.';
