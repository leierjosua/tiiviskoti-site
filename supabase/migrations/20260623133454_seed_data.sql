-- Loppusiivous.fi — seed-data
-- Lähde: site/booking.js (RATE 70 €/h, m²-portaat BANDS, lisäpalvelut ADDONS,
-- toimialue Uusimaa prefiksit 00–09, aikaslotit 08–16).
-- HUOM: tekijä + kalenteri ovat MUOKATTAVIA placeholdereita — admin korvaa oikeilla.

-- Yritysasetukset (yksi rivi)
insert into public.company_settings (default_transition_minutes)
values (30)
on conflict do nothing;

-- Lisäpalvelut
insert into public.addon_services (name, price_cents, duration_minutes, sort_order) values
  ('Jääkaappi & pakastin', 7000, 30, 1),
  ('Uuni',                 7000, 30, 2),
  ('Sauna',                7000, 30, 3),
  ('Silitys',              3500, 30, 4),
  ('Roskakaappi',          1800, 15, 5)
on conflict do nothing;

do $$
declare
  v_service uuid;
  v_area    uuid;
  v_emp     uuid;
  v_cal     uuid;
  d         int;
begin
  -- Palvelu: Loppusiivous (70 €/h, kiinteä hinta m²:n mukaan)
  insert into public.services
    (name, description, base_price_cents, duration_minutes, transition_minutes,
     min_scheduling_notice_hours, max_advance_days, required_employees, active, sort_order)
  values
    ('Loppusiivous',
     'Muuttosiivous / loppusiivous. Kiinteä hinta asunnon koon (m²) mukaan, ei arviota.',
     0, 240, 30, 24, 90, 1, true, 1)
  returning id into v_service;

  -- Hintavariantit = booking.js BANDS (yläraja ei sisälly; 70 €/h)
  insert into public.service_variants (service_id, label, price_cents, duration_minutes, metadata, sort_order) values
    (v_service, 'Alle 40 m²',  21000, 180, '{"max_m2":40,"hours":3}',    1),
    (v_service, '40–49 m²',    24500, 210, '{"max_m2":50,"hours":3.5}',  2),
    (v_service, '50–59 m²',    28000, 240, '{"max_m2":60,"hours":4}',    3),
    (v_service, '60–69 m²',    35000, 300, '{"max_m2":70,"hours":5}',    4),
    (v_service, '70–84 m²',    38500, 330, '{"max_m2":85,"hours":5.5}',  5),
    (v_service, '85–99 m²',    42000, 360, '{"max_m2":100,"hours":6}',   6),
    (v_service, '100–114 m²',  45500, 390, '{"max_m2":115,"hours":6.5}', 7),
    (v_service, '115–129 m²',  52500, 450, '{"max_m2":130,"hours":7.5}', 8),
    (v_service, '130–144 m²',  56000, 480, '{"max_m2":145,"hours":8}',   9),
    (v_service, '145–159 m²',  63000, 540, '{"max_m2":160,"hours":9}',   10),
    (v_service, '160–174 m²',  66500, 570, '{"max_m2":175,"hours":9.5}', 11),
    (v_service, '175–190 m²',  70000, 600, '{"max_m2":191,"hours":10}',  12);

  -- Palvelualue: Uusimaa / PK-seutu. postal_codes = prefiksit (koodi matchaa jos alkaa prefiksillä).
  insert into public.service_areas (name, description, postal_codes, active)
  values ('Uusimaa / PK-seutu',
          'Postinumeron 2 ensimmäistä numeroa 00–09 (Helsinki, Espoo, Vantaa, Kerava, Porvoo, Hyvinkää, Lohja jne.)',
          array['00','01','02','03','04','05','06','07','08','09'], true)
  returning id into v_area;

  -- Placeholder-tekijä (admin korvaa / lisää oikeat)
  insert into public.employees (first_name, last_name, email, roles, active, postal_code)
  values ('Loppusiivous', 'Tekijä', 'tekija@loppusiivous.fi', array['installer'], true, '00100')
  returning id into v_emp;

  insert into public.employee_services (employee_id, service_id) values (v_emp, v_service);

  -- Tekijän kalenteri (palvelu × alue)
  insert into public.installer_calendars (employee_id, service_id, service_area_id, name, active)
  values (v_emp, v_service, v_area, 'Loppusiivous — Uusimaa', true)
  returning id into v_cal;

  -- Aukioloajat: ma–la 08:00–18:00
  for d in 1..6 loop
    insert into public.calendar_weekly_slots (calendar_id, day_of_week, start_time, end_time)
    values (v_cal, d, '08:00', '18:00');
  end loop;
end $$;
