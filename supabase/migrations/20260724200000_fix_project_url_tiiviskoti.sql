-- =============================================================================
-- KORJAUS: aiemmat migraatiot (email_outbox, calendar_cron) portattiin
-- referenssiprojektista ja niihin jäi KOVAKOODATTU referenssiprojektin
-- Supabase-URL `https://hpahowjozbyffrbpjzbc.supabase.co`.
--
-- Käytännössä tämä tarkoitti, että email_outboxin INSERT-trigger ja kaikki
-- cron-työt kutsuivat VÄÄRÄN projektin edge-funktioita — eli TiivisKodin
-- vahvistussähköpostit eivät olisi koskaan lähteneet.
--
-- Tämä migraatio ohjaa kaikki kutsut TiivisKodin omaan projektiin
-- (`zfucgwjxgwdlocuvreft`) ja luo cron-työt uudelleen oikeilla URLeilla.
-- Idempotentti: voidaan ajaa uudelleen turvallisesti.
-- =============================================================================

-- ─── 0. bookings.duration_minutes ────────────────────────────────────────────
-- create-booking-calendar-event lukee `booking.duration_minutes` ja pitää sitä
-- auktoritatiivisena kalenteritapahtuman kestona, mutta saraketta ei koskaan
-- luotu core_schemaan. Ilman sitä jokainen tapahtuma sai palvelun oletuskeston
-- (60 min) — eli 6 oven keikka olisi varannut kalenterista tunnin.
alter table public.bookings
  add column if not exists duration_minutes int not null default 60;

comment on column public.bookings.duration_minutes
  is 'Varauksen kokonaiskesto minuutteina (rivien kestojen summa). Kalenteritapahtuman pituus.';

-- Backfill: laske olemassa oleville varauksille rivien summasta
update public.bookings b
set duration_minutes = greatest(coalesce(s.total, 0), 30)
from (
  select booking_id, sum(coalesce(duration_minutes, 0) * greatest(coalesce(quantity, 1), 1)) as total
  from public.booking_line_items
  group by booking_id
) s
where s.booking_id = b.id and s.total > 0;

-- ─── 1. email_outbox instant-trigger ─────────────────────────────────────────
create or replace function public.trigger_email_outbox_process()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://zfucgwjxgwdlocuvreft.supabase.co/functions/v1/process-email-outbox',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets
         where name = 'supabase_service_role_key' limit 1), ''),
      'Content-Type', 'application/json'
    )
  );
  return null;
end;
$$;

-- Itse trigger puuttui kannasta kokonaan: alkuperäinen migraatio ajettiin
-- ilman pg_net-laajennusta, jolloin trigger jäi syntymättä. Luodaan se tässä.
drop trigger if exists trg_email_outbox_instant on public.email_outbox;
create trigger trg_email_outbox_instant
  after insert on public.email_outbox
  for each statement execute function public.trigger_email_outbox_process();

-- ─── 2. Cron-työt uudelleen oikealla URLilla ─────────────────────────────────
do $$
declare
  base_url text := 'https://zfucgwjxgwdlocuvreft.supabase.co/functions/v1/';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron ei käytössä — ohitetaan cron-ajastukset';
    return;
  end if;

  -- Poista vanhat (väärään projektiin osoittavat) ajastukset jos ne ovat olemassa
  perform cron.unschedule(jobname)
  from cron.job
  where jobname in ('process-email-outbox', 'renew-google-watches', 'sync-google-calendars');

  -- process-email-outbox 2 min välein (retry transienteille virheille)
  perform cron.schedule(
    'process-email-outbox', '*/2 * * * *',
    format($job$
      select net.http_post(
        url := %L,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || coalesce(
            (select decrypted_secret from vault.decrypted_secrets
             where name = 'supabase_service_role_key' limit 1), ''),
          'Content-Type', 'application/json'
        )
      );
    $job$, base_url || 'process-email-outbox')
  );

  -- renew google watches päivittäin 03:00 UTC
  perform cron.schedule(
    'renew-google-watches', '0 3 * * *',
    format($job$
      select net.http_post(
        url := %L,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || coalesce(
            (select decrypted_secret from vault.decrypted_secrets
             where name = 'supabase_service_role_key' limit 1), ''),
          'Content-Type', 'application/json'
        )
      );
    $job$, base_url || 'watch-google-calendars')
  );

  -- FreeBusy-varmuussynkka 2 h välein
  perform cron.schedule(
    'sync-google-calendars', '15 */2 * * *',
    format($job$
      select net.http_post(
        url := %L,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || coalesce(
            (select decrypted_secret from vault.decrypted_secrets
             where name = 'supabase_service_role_key' limit 1), ''),
          'Content-Type', 'application/json'
        )
      );
    $job$, base_url || 'sync-google-calendars')
  );
end;
$$;
