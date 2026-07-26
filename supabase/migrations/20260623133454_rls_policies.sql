-- Loppusiivous.fi — RLS-politiikat
--
-- Malli:
--   * service_role (palvelinpuolen API-reitit + edge-funktiot) ohittaa RLS:n → ei policyä tarvita.
--   * authenticated + admin (admin-paneeli) saa täyden pääsyn is_admin()-tarkistuksella.
--   * authenticated + tekijä saa lukea oman employee-rivinsä ja omat varaukset.
--   * anon: ei pääsyä (julkinen sivu lukee/kirjoittaa service_rolella API-reiteistä).

-- Ota RLS käyttöön kaikilla tauluilla
alter table public.customers                   enable row level security;
alter table public.services                    enable row level security;
alter table public.service_variants            enable row level security;
alter table public.addon_services              enable row level security;
alter table public.service_areas               enable row level security;
alter table public.employees                   enable row level security;
alter table public.employee_services           enable row level security;
alter table public.employee_service_priorities enable row level security;
alter table public.employee_addon_exclusions   enable row level security;
alter table public.installer_calendars         enable row level security;
alter table public.calendar_weekly_slots       enable row level security;
alter table public.calendar_overrides          enable row level security;
alter table public.discount_codes              enable row level security;
alter table public.bookings                    enable row level security;
alter table public.booking_employees           enable row level security;
alter table public.booking_line_items          enable row level security;
alter table public.temp_reservations           enable row level security;
alter table public.form_submissions            enable row level security;
alter table public.google_calendar_watches     enable row level security;
alter table public.company_settings            enable row level security;

-- Admin-täyspääsy kaikkiin tauluihin
do $$
declare t text;
begin
  foreach t in array array[
    'customers','services','service_variants','addon_services','service_areas',
    'employees','employee_services','employee_service_priorities','employee_addon_exclusions',
    'installer_calendars','calendar_weekly_slots','calendar_overrides','discount_codes',
    'bookings','booking_employees','booking_line_items','temp_reservations',
    'form_submissions','google_calendar_watches','company_settings'
  ]
  loop
    execute format(
      'create policy "admin_all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t
    );
  end loop;
end $$;

-- Tekijä saa lukea oman employee-rivinsä (installer-portaali)
create policy "employee_read_self" on public.employees
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Tekijä saa lukea varaukset joihin hänet on liitetty
create policy "installer_read_own_bookings" on public.bookings
  for select to authenticated
  using (
    exists (
      select 1
      from public.booking_employees be
      join public.employees e on e.id = be.employee_id
      where be.booking_id = bookings.id
        and e.user_id = (select auth.uid())
    )
  );
