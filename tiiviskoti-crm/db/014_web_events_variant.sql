-- A/B-testin versiotunnus kävijätapahtumiin.
--
-- AJA TÄMÄ SUPABASEN SQL-EDITORISSA postgres-roolina. Sovelluksen tunnuksilla
-- (tk_app) ei ole DDL-oikeuksia tk-skeemaan, joten migraatio ei voi ajaa
-- itsestään. Sama tilanne kuin tk.mail_kind-enumin kanssa.
--
-- Ennen ajoa: track-reitti kirjoittaa ilman versiota (se havaitsee puuttuvan
-- sarakkeen ja putoaa takaisin vanhaan lisäykseen), joten analytiikka toimii
-- keskeytyksettä. Ajon jälkeen versio alkaa tallentua automaattisesti.

alter table tk.web_events add column if not exists variant text;

-- Vain testin versiot, ei vapaata tekstiä: kirjoitusvirhe jakaisi tuloksen
-- kahteen ryhmään huomaamatta.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'web_events_variant_format') then
    alter table tk.web_events
      add constraint web_events_variant_format
      check (variant is null or variant ~ '^[a-z0-9][a-z0-9_-]{0,39}$');
  end if;
end $$;

-- Raportti ryhmittelee versiolla ja päivällä, joten indeksi kattaa molemmat.
create index if not exists idx_web_events_variant
  on tk.web_events (variant, event_type, ts desc)
  where variant is not null;
