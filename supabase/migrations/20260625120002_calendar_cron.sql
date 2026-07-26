-- =============================================================================
-- Kalenteri- ja siivous-cronit (portattu referenssiprojektista).
--   * cleanup_expired_temp_reservations  — poistaa vanhentuneet slot-varaukset
--   * renew-google-watches               — uusii Calendar push -kanavat (~7 vrk)
--   * sync-google-calendars              — FreeBusy-varmuussynkka 2 h välein
--   * purge_past_calendar_overrides      — poistaa menneet kalenteripoikkeukset
--
-- Cronit kutsuvat edge-funktioita pg_net:llä, auth vault-secretistä
-- 'supabase_service_role_key' (luodaan deploy-vaiheessa).
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ─── temp_reservations -siivous ──────────────────────────────────────────────
create or replace function public.cleanup_expired_temp_reservations()
returns void language plpgsql security definer as $$
begin
  delete from public.temp_reservations where expires_at < now();
end;
$$;

-- ─── past calendar overrides -purge ──────────────────────────────────────────
create or replace function public.purge_past_calendar_overrides()
returns integer language plpgsql security definer set search_path = public as $$
declare v_deleted integer;
begin
  delete from public.calendar_overrides where date < current_date;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ─── Cron-ajastukset (vain jos pg_cron saatavilla) ───────────────────────────
do $$
declare
  base_url text := 'https://hpahowjozbyffrbpjzbc.supabase.co/functions/v1/';
  auth_job text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron ei käytössä — ohitetaan cron-ajastukset';
    return;
  end if;

  -- temp-reservation cleanup joka 5 min
  perform cron.schedule(
    'cleanup-expired-temp-reservations', '*/5 * * * *',
    $job$ select public.cleanup_expired_temp_reservations(); $job$
  );

  -- past overrides purge nightly 01:20 UTC
  perform cron.schedule(
    'purge-past-calendar-overrides', '20 1 * * *',
    $job$ select public.purge_past_calendar_overrides(); $job$
  );

  -- renew google watches daily 03:00 UTC
  perform cron.schedule(
    'renew-google-watches', '0 3 * * *',
    $job$
    select net.http_post(
      url := 'https://hpahowjozbyffrbpjzbc.supabase.co/functions/v1/watch-google-calendars',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets
           where name = 'supabase_service_role_key' limit 1), ''),
        'Content-Type', 'application/json'
      )
    );
    $job$
  );

  -- periodic FreeBusy sync every 2h at :15
  perform cron.schedule(
    'sync-google-calendars', '15 */2 * * *',
    $job$
    select net.http_post(
      url := 'https://hpahowjozbyffrbpjzbc.supabase.co/functions/v1/sync-google-calendars',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets
           where name = 'supabase_service_role_key' limit 1), ''),
        'Content-Type', 'application/json'
      )
    );
    $job$
  );
end;
$$;

-- Tyhjennä olemassa oleva backlog kerran
select public.purge_past_calendar_overrides();
