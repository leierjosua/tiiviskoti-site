-- =============================================================
-- Vahvistusposti ja Google-kalenteri.
--
-- Varauksen jälkeen tapahtuvat asiat kirjataan työn riville, jotta
-- panelista näkee menikö posti perille ja onko kalenteritapahtuma olemassa.
-- Kumpikaan ei saa kaataa varausta, joten virhe on tieto eikä poikkeus.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/003_delivery.sql
-- Idempotentti.
-- =============================================================

-- Mihin Google-kalenteriin tämän kalenterin työt kirjoitetaan. Null =
-- käytetään ympäristömuuttujan oletusta (info@tiiviskoti.fi).
alter table tk.calendars add column if not exists google_calendar_id text;

-- Google Calendar -tapahtuma ja vahvistuspostin tila.
alter table tk.jobs add column if not exists google_event_id text;
alter table tk.jobs add column if not exists confirmation_sent_at timestamptz;
alter table tk.jobs add column if not exists confirmation_error text;

-- Sähköpostiloki: mitä lähetettiin, kenelle ja onnistuiko. Erillinen taulu
-- eikä pelkkä aikaleima, koska myöhemmin lähetetään muutakin kuin
-- vahvistuksia (muistutus, siirtoilmoitus) ja epäonnistuminen pitää nähdä.
do $$ begin
  create type tk.mail_kind as enum ('confirmation', 'reschedule', 'cancellation', 'reminder');
exception when duplicate_object then null; end $$;

create table if not exists tk.mail_log (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references tk.jobs(id) on delete cascade,
  kind         tk.mail_kind not null default 'confirmation',
  to_email     text not null,
  subject      text not null,
  provider_id  text,                -- Gmailin viestitunnus
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_mail_log_job on tk.mail_log(job_id);
create index if not exists idx_mail_log_created on tk.mail_log(created_at desc);

alter table tk.mail_log enable row level security;
revoke all on tk.mail_log from anon, authenticated;

-- Uusi taulu tarvitsee oikeudet erikseen: default privileges koskee vain
-- tämän jälkeen luotuja, ja rooli on luotu ennen tätä.
grant select, insert, update, delete on all tables in schema tk to tk_app;
grant usage, select on all sequences in schema tk to tk_app;
