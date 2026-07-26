-- =============================================================================
-- Sähköpostien ja varausnumeron edellyttämät sarakkeet (portattu referenssiprojektista).
--   * bookings.booking_number  — automaattinen juokseva numero (sähköposteissa
--     ja adminissa). site/api/bookings lukee tämän insertin jälkeen.
--   * company_settings.company_signature_html — sähköpostien allekirjoitus.
--   * customers.do_not_contact — estä automaattiviestit asiakkaalle.
-- =============================================================================

-- Varausnumero (alkaa 1100)
create sequence if not exists booking_number_seq start with 1100;

alter table public.bookings
  add column if not exists booking_number integer unique default nextval('booking_number_seq');

-- Backfill olemassa oleville varauksille (luontijärjestyksessä)
with numbered as (
  select id, row_number() over (order by created_at) + 1099 as num
  from public.bookings
  where booking_number is null
)
update public.bookings set booking_number = numbered.num
from numbered where bookings.id = numbered.id;

-- Yrityksen sähköpostiallekirjoitus
alter table public.company_settings
  add column if not exists company_signature_html text;
comment on column public.company_settings.company_signature_html
  is 'Sähköpostien allekirjoitus-HTML (info@loppusiivous.fi). Null = automaattinen oletus.';

-- Asiakkaan "älä ota yhteyttä" -lippu
alter table public.customers
  add column if not exists do_not_contact boolean not null default false;
comment on column public.customers.do_not_contact
  is 'Kun true, kaikki automaattiset lähtevät viestit asiakkaalle estetään';
