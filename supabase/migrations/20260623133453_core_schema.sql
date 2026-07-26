-- Loppusiivous.fi — varaus-ydin (core booking schema)
-- Malli: referenssiprojekti, rajattu varaus/kalenteri/tekijä/hinnoittelu-ytimeen.
-- Ei tuotemyyntiä, CRM:ää, tikettejä, sopimuksia jne.

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────
do $$ begin
  create type booking_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type line_item_type as enum ('service', 'addon_service', 'custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type override_type as enum ('available', 'blocked');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────
-- updated_at helper
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Asiakkaat
-- ─────────────────────────────────────────────────────────────
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text not null default '',
  email         text unique,
  phone         text,
  address       text,
  postal_code   text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Palvelut + variantit + lisäpalvelut
-- ─────────────────────────────────────────────────────────────
create table public.services (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  description                 text,
  base_price_cents            int not null default 0,
  material_cost_cents         int not null default 0,
  duration_minutes            int not null default 60,
  transition_minutes          int,
  min_scheduling_notice_hours int not null default 24,
  max_advance_days            int not null default 90,
  required_employees          int not null default 1,
  volume_pricing              jsonb,
  active                      boolean not null default true,
  sort_order                  int not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create trigger trg_services_updated before update on public.services
  for each row execute function public.set_updated_at();

-- Hintavariantit (Loppusiivous: m²-portaat)
create table public.service_variants (
  id                  uuid primary key default gen_random_uuid(),
  service_id          uuid not null references public.services(id) on delete cascade,
  label               text not null,
  price_cents         int not null default 0,
  duration_minutes    int not null default 60,
  material_cost_cents int not null default 0,
  metadata            jsonb not null default '{}',
  sort_order          int not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_service_variants_service on public.service_variants(service_id);
create trigger trg_service_variants_updated before update on public.service_variants
  for each row execute function public.set_updated_at();

-- Lisäpalvelut (uuni, sauna, jääkaappi, silitys ...)
create table public.addon_services (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  price_cents         int not null default 0,
  material_cost_cents int not null default 0,
  duration_minutes    int not null default 0,
  active              boolean not null default true,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger trg_addon_services_updated before update on public.addon_services
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Palvelualueet
-- ─────────────────────────────────────────────────────────────
create table public.service_areas (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  postal_codes text[] not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_service_areas_updated before update on public.service_areas
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Tekijät (siivoojat) + roolit + osaaminen
-- ─────────────────────────────────────────────────────────────
create table public.employees (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid unique references auth.users(id) on delete set null,
  first_name         text not null,
  last_name          text not null default '',
  email              text unique not null,
  phone              text,
  postal_code        text,
  roles              text[] not null default '{}',  -- 'admin', 'installer'
  google_calendar_id text,                          -- tekijän oma Google-kalenteri
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_employees_updated before update on public.employees
  for each row execute function public.set_updated_at();

create table public.employee_services (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  unique (employee_id, service_id)
);

create table public.employee_service_priorities (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  priority    text not null default 'medium' check (priority in ('high','medium','low')),
  unique (employee_id, service_id)
);

create table public.employee_addon_exclusions (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  addon_service_id uuid not null references public.addon_services(id) on delete cascade,
  unique (employee_id, addon_service_id)
);

-- ─────────────────────────────────────────────────────────────
-- Kalenterit (tekijä × palvelu × alue) + aukioloajat + poikkeukset
-- ─────────────────────────────────────────────────────────────
create table public.installer_calendars (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  service_id      uuid not null references public.services(id) on delete cascade,
  service_area_id uuid not null references public.service_areas(id) on delete cascade,
  name            text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_installer_calendars_emp on public.installer_calendars(employee_id);
create index idx_installer_calendars_service on public.installer_calendars(service_id);
create trigger trg_installer_calendars_updated before update on public.installer_calendars
  for each row execute function public.set_updated_at();

create table public.calendar_weekly_slots (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.installer_calendars(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 7),  -- 1=ma .. 7=su
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time),
  unique (calendar_id, day_of_week, start_time)
);
create index idx_weekly_slots_cal on public.calendar_weekly_slots(calendar_id);

create table public.calendar_overrides (
  id            uuid primary key default gen_random_uuid(),
  calendar_id   uuid not null references public.installer_calendars(id) on delete cascade,
  date          date not null,
  start_time    time,                       -- null = koko päivä
  end_time      time,
  override_type override_type not null,
  reason        text,                        -- esim. 'google_calendar_sync'
  created_at    timestamptz not null default now()
);
create index idx_overrides_cal_date on public.calendar_overrides(calendar_id, date);

-- ─────────────────────────────────────────────────────────────
-- Alennuskoodit
-- ─────────────────────────────────────────────────────────────
create table public.discount_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  discount_type  text not null default 'eur' check (discount_type in ('eur','percent')),
  discount_value int not null default 0,
  max_uses       int,
  times_used     int not null default 0,
  expires_at     timestamptz,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_discount_codes_updated before update on public.discount_codes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Varaukset + tiimi + rivit
-- ─────────────────────────────────────────────────────────────
create table public.bookings (
  id                       uuid primary key default gen_random_uuid(),
  customer_id              uuid not null references public.customers(id) on delete cascade,
  employee_id              uuid references public.employees(id) on delete set null,
  service_id               uuid references public.services(id) on delete set null,
  calendar_id              uuid references public.installer_calendars(id) on delete set null,
  variant_id               uuid references public.service_variants(id) on delete set null,
  booking_date             date not null,
  time_slot                text not null,       -- "HH:MM"
  postal_code              text,
  address                  text,
  price_cents              int not null default 0,
  discount_code_id         uuid references public.discount_codes(id) on delete set null,
  discount_amount_cents    int not null default 0,
  status                   booking_status not null default 'pending',
  confirmed_at             timestamptz,
  completed_at             timestamptz,
  cancelled_at             timestamptz,
  finalized_at             timestamptz,
  payment_status           text not null default 'unpaid' check (payment_status in ('paid','unpaid')),
  customer_satisfaction    text check (customer_satisfaction in ('happy','neutral','unhappy')),
  google_calendar_event_id text,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index idx_bookings_date on public.bookings(booking_date);
create index idx_bookings_status on public.bookings(status);
create index idx_bookings_customer on public.bookings(customer_id);
create trigger trg_bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.booking_employees (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings(id) on delete cascade,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  role             text not null default 'installer',
  commission_cents int not null default 0,
  unique (booking_id, employee_id)
);
create index idx_booking_employees_booking on public.booking_employees(booking_id);

create table public.booking_line_items (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings(id) on delete cascade,
  line_type           line_item_type not null default 'custom',
  service_id          uuid references public.services(id) on delete set null,
  variant_id          uuid references public.service_variants(id) on delete set null,
  addon_service_id    uuid references public.addon_services(id) on delete set null,
  name                text not null,
  price_cents         int not null default 0,
  quantity            int not null default 1,
  duration_minutes    int not null default 0,
  material_cost_cents int not null default 0,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);
create index idx_line_items_booking on public.booking_line_items(booking_id);

-- ─────────────────────────────────────────────────────────────
-- Väliaikaiset slot-varaukset (5 min hold checkoutissa)
-- ─────────────────────────────────────────────────────────────
create table public.temp_reservations (
  id            uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  service_id    uuid not null references public.services(id) on delete cascade,
  variant_id    uuid references public.service_variants(id) on delete set null,
  calendar_id   uuid not null references public.installer_calendars(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  booking_date  date not null,
  time_slot     text not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);
create index idx_temp_res_expires on public.temp_reservations(expires_at);

-- ─────────────────────────────────────────────────────────────
-- Lomakkeet (tarjouspyynnöt / yhteydenotot)
-- ─────────────────────────────────────────────────────────────
create table public.form_submissions (
  id          uuid primary key default gen_random_uuid(),
  form_slug   text not null default 'yhteydenotto',
  name        text not null,
  email       text not null,
  phone       text,
  postal_code text,
  message     text,
  page_url    text,
  payload     jsonb not null default '{}',
  status      text not null default 'new' check (status in ('new','read','handled')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_form_submissions_status on public.form_submissions(status);
create trigger trg_form_submissions_updated before update on public.form_submissions
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Google Calendar watch -kanavat
-- ─────────────────────────────────────────────────────────────
create table public.google_calendar_watches (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.employees(id) on delete cascade,
  google_calendar_id text not null,
  channel_id         text not null unique,
  resource_id        text not null,
  expiration         timestamptz not null,
  created_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Yritysasetukset (yksi rivi) + asentajavalinnan painot
-- ─────────────────────────────────────────────────────────────
create table public.company_settings (
  id                         uuid primary key default gen_random_uuid(),
  default_transition_minutes int not null default 30,
  weight_distance            numeric not null default 0.5,
  weight_workload            numeric not null default 0.3,
  weight_route               numeric not null default 0.2,
  signature_html             text,
  updated_at                 timestamptz not null default now()
);
create trigger trg_company_settings_updated before update on public.company_settings
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- is_admin() — RLS-apufunktio (rikkoo employees-rekursion)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.employees
    where user_id = (select auth.uid())
      and 'admin' = any(roles)
      and active
  );
$$;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Data API grants (RLS gates rows; service_role bypasses RLS)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
