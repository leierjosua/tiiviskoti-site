-- Tarjoukset uusille asiakkaille (prospekteille). Irrallaan töistä: tarjous ei
-- varaa kalenteriaikaa. Rivit tallennetaan snapshotina (jsonb), jotta lähetetty
-- tarjous säilyy sellaisena kuin se lähti, vaikka hinnasto muuttuisi.

do $$ begin
  create type tk.offer_status as enum ('sent', 'accepted', 'declined', 'expired');
exception when duplicate_object then null; end $$;

create sequence if not exists tk.offer_number_seq;

create table if not exists tk.offers (
  id               uuid primary key default gen_random_uuid(),
  offer_number     text not null unique
                     default 'T-' || to_char(nextval('tk.offer_number_seq'), 'FM0000'),
  customer_name    text not null,
  email            text not null,
  phone            text,
  address          text,
  postal_code      text,
  city             text,
  lines            jsonb not null,             -- [{name, quantity, unit_price_cents}]
  total_cents      int  not null,
  travel_fee_cents int  not null default 0,
  notes            text,
  status           tk.offer_status not null default 'sent',
  valid_until      date,
  provider_id      text,                        -- Gmailin viestitunnus
  error            text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_offers_created on tk.offers(created_at desc);
create index if not exists idx_offers_status on tk.offers(status);

drop trigger if exists trg_offers_touch on tk.offers;
create trigger trg_offers_touch before update on tk.offers
  for each row execute function tk.touch_updated_at();

alter table tk.offers enable row level security;
revoke all on tk.offers from anon, authenticated;
grant select, insert, update, delete on tk.offers to tk_app;
grant usage, select on sequence tk.offer_number_seq to tk_app;
