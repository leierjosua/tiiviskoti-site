-- =============================================================
-- Palvelualueet.
--
-- Alue kertoo KUKA voi tehdä työn ja MITÄ aikoja asiakkaalle näytetään.
-- Asiakas syöttää postinumeron, siitä ratkeaa alue, ja alueen kalentereista
-- lasketaan vapaat ajat. Jos postinumero ei kuulu mihinkään alueeseen,
-- aikoja ei näytetä lainkaan vaan otetaan yhteydenottopyyntö (tk.leads).
--
-- Postinumerot tallennetaan ETULIITTEINÄ, kuten vanhassa mallissa
-- (`public.service_areas.postal_codes` = {'00','01',…,'09'} Uusimaalle).
-- Etuliite voi olla 1–5 merkkiä ja PISIN OSUMA VOITTAA, joten yksittäisen
-- kunnan voi irrottaa laajemmasta alueesta ilman että koko listaa muutetaan.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/005_areas.sql
-- Idempotentti.
-- =============================================================

create table if not exists tk.areas (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  -- Postinumeron etuliitteet, esim. {'00','01','02'}. Vain numeroita.
  postal_prefixes  text[] not null default '{}',
  -- Matkalisä koko käynnistä. Lisätään työn hinnan päälle — EI lasketa
  -- minimiveloitukseen (149 €), koska minimi kattaa jo tavanomaisen matkan.
  travel_fee_cents int not null default 0 check (travel_fee_cents >= 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_areas_touch on tk.areas;
create trigger trg_areas_touch before update on tk.areas
  for each row execute function tk.touch_updated_at();

-- Kalenteri voi palvella useaa aluetta ja alueella voi olla useita
-- kalentereita (esim. kaksi asentajaa Uusimaalla), joten liitostaulu.
create table if not exists tk.calendar_areas (
  calendar_id uuid not null references tk.calendars(id) on delete cascade,
  area_id     uuid not null references tk.areas(id)     on delete cascade,
  primary key (calendar_id, area_id)
);
create index if not exists idx_calendar_areas_area on tk.calendar_areas(area_id);

-- Yhteydenottopyyntö alueen ulkopuolelta. Näin laajentumisalueiden kysyntä
-- kertyy näkyviin sen sijaan että asiakas vain katoaisi.
do $$ begin
  create type tk.lead_status as enum ('new', 'contacted', 'converted', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists tk.leads (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text,
  phone       text,
  postal_code text,
  city        text,
  message     text,
  status      tk.lead_status not null default 'new',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_leads_created on tk.leads(created_at desc);
create index if not exists idx_leads_status on tk.leads(status);

drop trigger if exists trg_leads_touch on tk.leads;
create trigger trg_leads_touch before update on tk.leads
  for each row execute function tk.touch_updated_at();

/* Postinumeron alue: pisin osuva etuliite voittaa. Palauttaa myös
   matkalisän, jotta hinta ja saatavuus tulevat samasta kyselystä. */
create or replace function tk.area_for_postal(p_postal text)
returns table (id uuid, name text, travel_fee_cents int)
language sql stable as $$
  select a.id, a.name, a.travel_fee_cents
    from tk.areas a
   where a.active
     and exists (
       select 1 from unnest(a.postal_prefixes) pfx
        where p_postal like pfx || '%'
     )
   order by (
     select max(length(pfx)) from unnest(a.postal_prefixes) pfx
      where p_postal like pfx || '%'
   ) desc
   limit 1;
$$;

alter table tk.areas          enable row level security;
alter table tk.calendar_areas enable row level security;
alter table tk.leads          enable row level security;

grant select, insert, update, delete on all tables in schema tk to tk_app;
grant usage, select on all sequences in schema tk to tk_app;
revoke all on tk.areas, tk.calendar_areas, tk.leads from anon, authenticated;
