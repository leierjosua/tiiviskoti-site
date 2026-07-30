-- =============================================================
-- TiivisKoti CRM — perusskeema (vaihe 1: kalenterit ja varaukset)
--
-- Oma skeema `tk` samassa Supabase-projektissa. Ei kosketa `public.*`
-- -tauluihin: vanha admin ja tiiviskoti.fi jatkavat niiden varassa,
-- kunnes uusi järjestelmä on todettu toimivaksi.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/001_init.sql
-- HUOM: repossa ei ole migraatiohistoriaa, joten `db push` on kielletty.
-- Tiedosto on idempotentti — sen saa ajaa uudelleen.
-- =============================================================

create schema if not exists tk;

-- Päällekkäisten aikavälien esto vaatii gist-indeksin, jossa on sekä
-- uuid-yhtäsuuruus että aikavälin leikkaus. btree_gist tuo uuid-tuen.
create extension if not exists btree_gist;

-- ─────────────────────────────────────────────────────────────
-- Tyypit
-- ─────────────────────────────────────────────────────────────
do $$ begin
  create type tk.staff_role as enum ('owner', 'admin', 'installer');
exception when duplicate_object then null; end $$;

-- 'hold' = checkoutin aikainen varaus, joka vanhenee `hold_expires_at`-hetkellä.
-- Se varaa ajan siinä missä oikea varauskin, joten se on sama taulu eikä erillinen.
do $$ begin
  create type tk.job_status as enum ('hold', 'tentative', 'confirmed', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

-- 'closed' = poissa käytöstä (loma, sairaus), 'open' = ylimääräinen työaika
-- viikkoaikataulun ulkopuolella.
do $$ begin
  create type tk.exception_kind as enum ('closed', 'open');
exception when duplicate_object then null; end $$;

create or replace function tk.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Henkilöstö. `user_id` linkittää Supabase Authin käyttäjään; se on
-- null niin kauan kuin kutsuttu henkilö ei ole kirjautunut ensimmäistä
-- kertaa, joten sähköposti on se mikä kutsun ja tilin yhdistää.
-- ─────────────────────────────────────────────────────────────
create table if not exists tk.staff (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete set null,
  email      text not null unique,
  full_name  text not null,
  phone      text,
  role       tk.staff_role not null default 'installer',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_staff_touch on tk.staff;
create trigger trg_staff_touch before update on tk.staff
  for each row execute function tk.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Kalenterit. Yksi asentaja voi tarvita useampaa (esim. eri alue tai
-- eri työlaji), joten kalenteri on oma rivinsä eikä henkilön kenttä.
--
-- `slot_minutes`      = millä välein tarjottavat alkuajat asetellaan
-- `lead_time_hours`   = kuinka pian tästä hetkestä saa varata
-- `horizon_days`      = kuinka pitkälle tulevaisuuteen kalenteri on auki
-- ─────────────────────────────────────────────────────────────
create table if not exists tk.calendars (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references tk.staff(id) on delete cascade,
  name            text not null,
  slot_minutes    int  not null default 30 check (slot_minutes between 5 and 480),
  lead_time_hours int  not null default 24 check (lead_time_hours >= 0),
  horizon_days    int  not null default 60 check (horizon_days between 1 and 365),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_calendars_staff on tk.calendars(staff_id);

drop trigger if exists trg_calendars_touch on tk.calendars;
create trigger trg_calendars_touch before update on tk.calendars
  for each row execute function tk.touch_updated_at();

-- Toistuva viikkoaikataulu. `weekday` 1=ma … 7=su (ISO), jotta se vastaa
-- Postgresin isodow-kenttää eikä vaadi käännöstä kyselyissä.
create table if not exists tk.calendar_hours (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references tk.calendars(id) on delete cascade,
  weekday     int  not null check (weekday between 1 and 7),
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time),
  unique (calendar_id, weekday, start_time)
);
create index if not exists idx_calendar_hours_cal on tk.calendar_hours(calendar_id);

-- Poikkeuspäivä. Kun start_time ja end_time ovat null, poikkeus koskee
-- koko päivää.
create table if not exists tk.calendar_exceptions (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references tk.calendars(id) on delete cascade,
  date        date not null,
  kind        tk.exception_kind not null default 'closed',
  start_time  time,
  end_time    time,
  note        text,
  created_at  timestamptz not null default now(),
  check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);
create index if not exists idx_calendar_exceptions_cal_date
  on tk.calendar_exceptions(calendar_id, date);

-- ─────────────────────────────────────────────────────────────
-- Asiakkaat
-- ─────────────────────────────────────────────────────────────
create table if not exists tk.customers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text,
  phone       text,
  address     text,
  postal_code text,
  city        text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_customers_email on tk.customers(lower(email));

drop trigger if exists trg_customers_touch on tk.customers;
create trigger trg_customers_touch before update on tk.customers
  for each row execute function tk.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Työt (varaukset)
--
-- Aika on `timestamptz`-väli eikä päivä + tekstimuotoinen kellonaika:
-- kesto on osa varausta, joten päällekkäisyys on ylipäänsä laskettavissa.
-- ─────────────────────────────────────────────────────────────
create sequence if not exists tk.job_number_seq start with 1001;

create table if not exists tk.jobs (
  id              uuid primary key default gen_random_uuid(),
  job_number      text not null unique
                    default 'TK-' || to_char(nextval('tk.job_number_seq'), 'FM0000'),
  customer_id     uuid references tk.customers(id) on delete set null,
  calendar_id     uuid not null references tk.calendars(id) on delete restrict,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          tk.job_status not null default 'tentative',
  title           text not null default 'Tiivistetyö',
  address         text,
  postal_code     text,
  city            text,
  price_cents     int  not null default 0,
  notes           text,
  source          text not null default 'admin',   -- 'admin' | 'web'
  hold_expires_at timestamptz,                     -- vain status='hold'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((status = 'hold') = (hold_expires_at is not null))
);
create index if not exists idx_jobs_starts_at on tk.jobs(starts_at);
create index if not exists idx_jobs_calendar on tk.jobs(calendar_id, starts_at);
create index if not exists idx_jobs_status on tk.jobs(status);
create index if not exists idx_jobs_customer on tk.jobs(customer_id);

drop trigger if exists trg_jobs_touch on tk.jobs;
create trigger trg_jobs_touch before update on tk.jobs
  for each row execute function tk.touch_updated_at();

-- Sama kalenteri ei voi olla kahdessa paikassa yhtä aikaa. Tämä on
-- tarkoituksella kannan rajoite eikä sovelluslogiikkaa: kaksi yhtaikaista
-- varauspyyntöä samaan aikaan ei voi kilpailla ohi. Peruttu varaus ei
-- varaa aikaa, joten se on rajattu pois.
do $$ begin
  alter table tk.jobs add constraint jobs_no_overlap
    exclude using gist (
      calendar_id with =,
      tstzrange(starts_at, ends_at) with &&
    ) where (status <> 'cancelled');
exception when duplicate_object then null; end $$;

-- Työn rivit (mitä tehdään ja mihin hintaan). Hinta jää vaiheessa 1
-- kevyeksi: rivit ovat kuvailevia, summa on `jobs.price_cents`.
create table if not exists tk.job_lines (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references tk.jobs(id) on delete cascade,
  name             text not null,
  quantity         int  not null default 1 check (quantity > 0),
  unit_price_cents int  not null default 0,
  minutes          int  not null default 0,
  sort_order       int  not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists idx_job_lines_job on tk.job_lines(job_id);

-- ─────────────────────────────────────────────────────────────
-- Pääsynhallinta
--
-- `tk` ei ole PostgREST:n julkaisemien skeemojen listalla, joten sinne ei
-- pääse Data API:n kautta lainkaan. RLS on silti päällä eikä yhtään
-- policyä ole: jos skeema joskus julkaistaisiin vahingossa, anon ja
-- authenticated eivät silti näkisi mitään. Sovellus ottaa yhteyden
-- suoraan Postgresiin palvelinpuolelta.
-- ─────────────────────────────────────────────────────────────
alter table tk.staff                enable row level security;
alter table tk.calendars            enable row level security;
alter table tk.calendar_hours       enable row level security;
alter table tk.calendar_exceptions  enable row level security;
alter table tk.customers            enable row level security;
alter table tk.jobs                 enable row level security;
alter table tk.job_lines            enable row level security;

revoke all on schema tk from anon, authenticated;
revoke all on all tables in schema tk from anon, authenticated;
