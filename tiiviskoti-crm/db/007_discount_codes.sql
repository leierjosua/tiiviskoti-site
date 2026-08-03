-- =============================================================
-- Alennuskoodit ja niiden käyttökerrat.
--
-- Koodi on postilaatikkomainoksen ja kampanjan mitattava osa: mainoksessa
-- lukee "−20 € koodilla NAAPURI", ja tästä taulusta nähdään montako
-- ihmistä sen todella käytti, milloin ja kuka.
--
-- MIKSI KANNASSA EIKÄ pricing.mjs:SSÄ: koodit syntyvät ja vanhenevat
-- kampanjan tahdissa, eikä uusi kampanja saa vaatia koodimuutosta ja
-- julkaisua. Sama valinta tehtiin jo matkalisälle (`tk.areas`) — hinnan
-- kohteet tulevat pricing.mjs:stä, kampanjakohtaiset lisät ja vähennykset
-- kannasta. Alennus lasketaan siksi TÄÄLLÄ, ei sivuston puolella: jos se
-- laskettaisiin selaimessa, kuka tahansa voisi keksiä oman alennuksensa.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/007_discount_codes.sql
-- Idempotentti.
-- =============================================================

do $$ begin
  create type tk.discount_kind as enum ('fixed', 'percent');
exception when duplicate_object then null; end $$;

create table if not exists tk.discount_codes (
  id          uuid primary key default gen_random_uuid(),
  -- Koodi talletetaan aina isoin kirjaimin, jotta "naapuri", "Naapuri" ja
  -- "NAAPURI " ovat sama koodi. Normalisointi tehdään sovelluksessa ennen
  -- kirjoitusta; check pitää huolen ettei ohi pääse.
  code        text not null unique check (code ~ '^[A-Z0-9]{3,24}$'),
  -- Näkyy vain adminissa: mistä kampanjasta on kyse.
  description text,
  kind        tk.discount_kind not null default 'fixed',
  -- 'fixed' → euromäärä sentteinä. 'percent' → prosentti loppusummasta.
  amount_cents int not null default 0 check (amount_cents >= 0),
  percent      int not null default 0 check (percent between 0 and 100),
  -- Alaraja, jonka alle koodi ei kelpaa. 0 = ei rajaa. Tällä estetään
  -- se että −20 € syö minimiveloituksen (149 €) käynnin kannattamattomaksi.
  min_total_cents int not null default 0 check (min_total_cents >= 0),
  -- null = rajaton. Käyttökerrat lasketaan tk.discount_redemptions-taulusta,
  -- ei laskurikentästä: laskuri ja todelliset rivit ehtivät eriytyä.
  max_uses     int check (max_uses is null or max_uses > 0),
  max_uses_per_customer int not null default 1 check (max_uses_per_customer > 0),
  starts_at    timestamptz,
  expires_at   timestamptz,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Koodi joka ei vähennä mitään on virhe, ei tyhjä kampanja.
  check ((kind = 'fixed' and amount_cents > 0) or (kind = 'percent' and percent > 0)),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

drop trigger if exists trg_discount_codes_touch on tk.discount_codes;
create trigger trg_discount_codes_touch before update on tk.discount_codes
  for each row execute function tk.touch_updated_at();

-- Käyttökerta. Oma rivinsä eikä pelkkä laskuri, koska adminissa on
-- näytettävä KUKA käytti ja MILLOIN — se on kampanjan ainoa mittari.
-- `amount_cents` on toteutunut vähennys, ei koodin nimellisarvo: koodi voi
-- muuttua jälkikäteen, mutta jo tehdyn työn alennus ei saa muuttua sen mukana.
create table if not exists tk.discount_redemptions (
  id           uuid primary key default gen_random_uuid(),
  code_id      uuid not null references tk.discount_codes(id) on delete cascade,
  -- Yksi alennus per työ: unique job_id. Kaksi koodia samaan varaukseen
  -- vaatisi säännön siitä miten ne yhdistyvät, eikä sellaista ole.
  job_id       uuid not null unique references tk.jobs(id) on delete cascade,
  customer_id  uuid references tk.customers(id) on delete set null,
  amount_cents int not null check (amount_cents >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists idx_discount_redemptions_code on tk.discount_redemptions(code_id, created_at desc);
create index if not exists idx_discount_redemptions_customer on tk.discount_redemptions(customer_id);

alter table tk.discount_codes       enable row level security;
alter table tk.discount_redemptions enable row level security;

grant select, insert, update, delete on all tables in schema tk to tk_app;
grant usage, select on all sequences in schema tk to tk_app;
revoke all on tk.discount_codes, tk.discount_redemptions from anon, authenticated;
