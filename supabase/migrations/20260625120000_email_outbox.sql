-- =============================================================================
-- Email outbox — luotettava lähtevien sähköpostien jono (portattu referenssiprojektista).
-- Koonti referenssimigraatioista: email_outbox, reference-sarakkeet, retry-limit,
-- instant-trigger (FOR EACH STATEMENT) ja 2 min cron.
--
-- Riippuvuudet:
--   * public.is_admin()        — määritelty core_schema.sql:ssä
--   * pg_net (net.http_post)   — luodaan alla
--   * pg_cron (cron.schedule)  — luodaan alla jos saatavilla
--   * vault-secret 'supabase_service_role_key' — luodaan deploy-vaiheessa
--     (ks. supabase/SETUP-GOOGLE.md). Ilman secretia trigger/cron eivät
--     pysty kutsumaan process-email-outbox-funktiota.
-- =============================================================================

create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- Taulu
-- ----------------------------------------------------------------------------
create table if not exists public.email_outbox (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('booking','contact','contract','sales')),
  payload          jsonb not null,
  raw_email        text,                  -- valmiiksi rakennettu base64 RFC 2822 -viesti
  sender_email     text not null,
  thread_id        text,                  -- Gmail thread ID (sales-vastaukset)
  status           text not null default 'pending'
                   check (status in ('pending','processing','sent','failed','dead_letter')),
  attempts         integer not null default 0,
  max_attempts     integer not null default 3,
  last_error       text,
  scheduled_at     timestamptz not null default now(),
  processed_at     timestamptz,
  gmail_message_id text,
  gmail_thread_id  text,
  reference_type   text,                  -- lähde-entiteetti: booking, contract, form_submission
  reference_id     uuid,
  created_at       timestamptz not null default now()
);

create index if not exists idx_email_outbox_pending
  on public.email_outbox (scheduled_at) where status = 'pending';
create index if not exists idx_email_outbox_status
  on public.email_outbox (status);
create index if not exists idx_email_outbox_reference
  on public.email_outbox (reference_type, reference_id) where reference_id is not null;

alter table public.email_outbox enable row level security;

drop policy if exists "email_outbox_admin" on public.email_outbox;
create policy "email_outbox_admin" on public.email_outbox
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Retry-limit: pakota dead_letter kun yritykset loppuvat
-- ----------------------------------------------------------------------------
create or replace function public.email_outbox_enforce_max_attempts()
returns trigger language plpgsql as $$
begin
  if new.attempts >= new.max_attempts and new.status not in ('sent','dead_letter') then
    new.status := 'dead_letter';
    new.processed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_outbox_max_attempts on public.email_outbox;
create trigger trg_email_outbox_max_attempts
  before update on public.email_outbox
  for each row execute function public.email_outbox_enforce_max_attempts();

-- Siivoa yli 30 vrk vanhat dead letterit
create or replace function public.email_outbox_cleanup_dead_letters()
returns integer language plpgsql security definer as $$
declare deleted_count integer;
begin
  delete from public.email_outbox
  where status = 'dead_letter' and processed_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- Instant-trigger: kutsu process-email-outbox heti INSERTin jälkeen (pg_net)
-- FOR EACH STATEMENT → vain yksi kutsu per transaktio (ei duplikaatteja).
-- ----------------------------------------------------------------------------
create or replace function public.trigger_email_outbox_process()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://hpahowjozbyffrbpjzbc.supabase.co/functions/v1/process-email-outbox',
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

drop trigger if exists trg_email_outbox_instant on public.email_outbox;
create trigger trg_email_outbox_instant
  after insert on public.email_outbox
  for each statement execute function public.trigger_email_outbox_process();

-- ----------------------------------------------------------------------------
-- Cron: aja process-email-outbox 2 min välein (retry transienteille virheille)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'process-email-outbox',
      '*/2 * * * *',
      $job$
      select net.http_post(
        url := 'https://hpahowjozbyffrbpjzbc.supabase.co/functions/v1/process-email-outbox',
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
  end if;
end;
$$;
