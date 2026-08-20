-- =============================================================================
-- B2B-ulkoreach (isännöintiyritykset → TiivisKoti tiivistyspalvelu)
--
-- Kylmä B2B-sähköpostiputki: prospektit (isännöintiyritykset), kampanjat,
-- sekvenssiaskeleet, liittymät (approve-a-batch -portti) sekä lähetettyjen
-- viestien ja tapahtumien (avaus/klikkaus/vastaus/bounce) seuranta.
--
-- Lähetys tapahtuu ERILLISEN Resend-kanavan kautta (mail.tiiviskoti.fi),
-- irrallaan Gmail-transaktiosähköposteista (varaukset), jotta kylmäposti ei
-- vaaranna varaussähköpostien toimitettavuutta.
--
-- Riippuvuudet:
--   * public.is_admin()        — core_schema.sql
--   * public.set_updated_at()  — core_schema.sql
--   * public.email_outbox      — 20260625120000_email_outbox.sql ('sales'-tyyppi)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1) Prospektit — isännöintiyritykset (ja muut B2B-kohteet)
-- ----------------------------------------------------------------------------
create table if not exists public.outreach_prospect (
  id                uuid primary key default gen_random_uuid(),
  company_name      text not null,
  city              text,                    -- Uudenmaan kaupunki (kampanjasegmentti)
  address           text,
  phone             text,
  website           text,
  email             text,                    -- ensisijainen kontaktisähköposti
  contact_name      text,                    -- isännöitsijän nimi (jos tiedossa)
  contact_title     text,                    -- esim. "Isännöitsijä", "Toimitusjohtaja"
  business_id       text,                    -- Y-tunnus (jos tiedossa)
  google_rating     numeric(2,1),
  source            text default 'scrape',   -- scrape | manual | import
  segment           text default 'isannointi',
  -- Putken tila (näkyy adminissa pipelineina)
  status            text not null default 'new'
                    check (status in (
                      'new','queued','contacted','opened','replied',
                      'booked','won','lost','unsubscribed','bounced'
                    )),
  do_not_contact    boolean not null default false,  -- opt-out / suppress
  last_contacted_at timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Sama sähköposti vain kerran (case-insensitive), kun sähköposti on annettu
create unique index if not exists uq_outreach_prospect_email
  on public.outreach_prospect (lower(email)) where email is not null;
create index if not exists idx_outreach_prospect_city   on public.outreach_prospect (city);
create index if not exists idx_outreach_prospect_status on public.outreach_prospect (status);

create trigger trg_outreach_prospect_updated before update on public.outreach_prospect
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Kampanja
-- ----------------------------------------------------------------------------
create table if not exists public.outreach_campaign (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  from_name     text not null default 'TiivisKoti',
  from_email    text not null default 'info@mail.tiiviskoti.fi',
  reply_to      text default 'info@tiiviskoti.fi',
  status        text not null default 'draft'
                check (status in ('draft','active','paused','archived')),
  -- Lähetysrajat (domain-maineen suoja)
  daily_cap     integer not null default 30,      -- max lähetyksiä / vrk
  send_window_start smallint not null default 8,  -- klo (Europe/Helsinki)
  send_window_end   smallint not null default 17,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_outreach_campaign_updated before update on public.outreach_campaign
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) Sekvenssiaskeleet — kampanjan sähköpostit (askel 1 = eka viesti, 2.. = follow-up)
-- ----------------------------------------------------------------------------
create table if not exists public.outreach_sequence_step (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.outreach_campaign(id) on delete cascade,
  step_number   smallint not null,               -- 1,2,3...
  delay_days    smallint not null default 0,     -- viive edellisestä askeleesta
  subject       text not null,
  body_html     text not null,                   -- template, tukee {{muuttujia}}
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (campaign_id, step_number)
);

create trigger trg_outreach_sequence_step_updated before update on public.outreach_sequence_step
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) Liittymä — prospekti kampanjassa. APPROVE-A-BATCH -portti:
--    mikään ei lähde ennen kuin approved_at on asetettu administa.
-- ----------------------------------------------------------------------------
create table if not exists public.outreach_enrollment (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references public.outreach_prospect(id) on delete cascade,
  campaign_id   uuid not null references public.outreach_campaign(id) on delete cascade,
  status        text not null default 'pending_approval'
                check (status in (
                  'pending_approval','active','completed',
                  'stopped','replied','bounced','unsubscribed'
                )),
  current_step  smallint not null default 0,     -- viimeksi lähetetty askel
  next_send_at  timestamptz,                      -- milloin seuraava askel lähtee
  -- Hyväksyntä (ihmisen klikkaus adminissa)
  approved_at   timestamptz,
  approved_by   uuid,                             -- auth.uid()
  enrolled_at   timestamptz not null default now(),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  unique (prospect_id, campaign_id)
);

create index if not exists idx_outreach_enrollment_due
  on public.outreach_enrollment (next_send_at)
  where status = 'active' and approved_at is not null;
create index if not exists idx_outreach_enrollment_status
  on public.outreach_enrollment (status);

create trigger trg_outreach_enrollment_updated before update on public.outreach_enrollment
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5) Lähetetyt viestit — yksi rivi per lähetetty sähköposti (linkki email_outboxiin)
-- ----------------------------------------------------------------------------
create table if not exists public.outreach_message (
  id                uuid primary key default gen_random_uuid(),
  enrollment_id     uuid not null references public.outreach_enrollment(id) on delete cascade,
  prospect_id       uuid not null references public.outreach_prospect(id) on delete cascade,
  step_number       smallint not null,
  email_outbox_id   uuid references public.email_outbox(id) on delete set null,
  resend_message_id text,                         -- Resendin viesti-ID (webhook-mätsäys)
  to_email          text not null,
  subject           text not null,
  status            text not null default 'queued'
                    check (status in (
                      'queued','sent','delivered','opened','clicked',
                      'replied','bounced','complained','failed'
                    )),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,                  -- eka avaus
  clicked_at        timestamptz,
  replied_at        timestamptz,
  reply_snippet     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_outreach_message_prospect on public.outreach_message (prospect_id);
create index if not exists idx_outreach_message_status   on public.outreach_message (status);
create unique index if not exists uq_outreach_message_resend
  on public.outreach_message (resend_message_id) where resend_message_id is not null;

create trigger trg_outreach_message_updated before update on public.outreach_message
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6) Tapahtumaloki — raa'at Resend-webhook-tapahtumat (audit + idempotenssi)
-- ----------------------------------------------------------------------------
create table if not exists public.outreach_event (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid references public.outreach_message(id) on delete cascade,
  prospect_id   uuid references public.outreach_prospect(id) on delete set null,
  event_type    text not null,                   -- delivered|opened|clicked|bounced|complained|replied|unsubscribed
  payload       jsonb,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_outreach_event_message on public.outreach_event (message_id);
create index if not exists idx_outreach_event_type    on public.outreach_event (event_type);

-- ----------------------------------------------------------------------------
-- RLS — vain admin (sama malli kuin email_outbox). service_role ohittaa RLS:n.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'outreach_prospect','outreach_campaign','outreach_sequence_step',
    'outreach_enrollment','outreach_message','outreach_event'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_admin" on public.%I', t, t);
    execute format(
      'create policy "%s_admin" on public.%I for all to authenticated '
      'using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Apufunktio: merkitse prospekti opt-outiksi (unsubscribe-linkki kutsuu tätä).
-- security definer, jotta julkinen unsubscribe-endpoint voi kutsua service_rolella.
-- ----------------------------------------------------------------------------
create or replace function public.outreach_unsubscribe(p_prospect_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.outreach_prospect
     set do_not_contact = true, status = 'unsubscribed', updated_at = now()
   where id = p_prospect_id;
  update public.outreach_enrollment
     set status = 'unsubscribed', updated_at = now()
   where prospect_id = p_prospect_id and status in ('pending_approval','active');
$$;
revoke execute on function public.outreach_unsubscribe(uuid) from public, anon;
grant execute on function public.outreach_unsubscribe(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Grantit — koko public-skeeman kertagrantti core_schema.sql:ssä ei kata näitä
-- uusia tauluja, joten myönnetään erikseen (RLS gate hoitaa rivit).
-- ----------------------------------------------------------------------------
grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Näkymä adminia varten: prospekti + uusin liittymä + uusimman viestin tila.
-- security_invoker → RLS (is_admin) pätee kutsujan oikeuksilla.
-- ----------------------------------------------------------------------------
create or replace view public.outreach_prospect_overview
with (security_invoker = on) as
select
  p.id, p.company_name, p.city, p.phone, p.website, p.email,
  p.contact_name, p.contact_title, p.google_rating, p.status, p.do_not_contact,
  p.segment, p.last_contacted_at, p.notes, p.created_at,
  e.id            as enrollment_id,
  e.campaign_id   as enrollment_campaign_id,
  e.status        as enrollment_status,
  e.approved_at   as enrollment_approved_at,
  e.current_step  as enrollment_step,
  m.last_status, m.last_sent_at, m.opened, m.clicked, m.replied
from public.outreach_prospect p
left join lateral (
  select * from public.outreach_enrollment
  where prospect_id = p.id order by enrolled_at desc limit 1
) e on true
left join lateral (
  select status as last_status, sent_at as last_sent_at,
         (opened_at is not null)  as opened,
         (clicked_at is not null) as clicked,
         (replied_at is not null) as replied
  from public.outreach_message
  where prospect_id = p.id order by created_at desc limit 1
) m on true;

grant select on public.outreach_prospect_overview to authenticated, service_role;
