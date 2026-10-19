-- =============================================================
-- Kartoitus CRM:ssä + asiakkaan sähköinen hyväksyntä tarjoukselle.
--
-- Kartoittaja täyttää paperisen kartoituslomakkeen (Kartoituslomake A4)
-- sijaan CRM:n Kartoitus-näkymän puhelimella paikan päällä. Siitä syntyy
-- tavallinen tarjous (tk.offers), joka lähtee asiakkaalle sähköpostilla
-- linkin kanssa. Asiakas hyväksyy tarjouksen linkistä kirjoittamalla
-- nimensä ("Hyväksyn tarjouksen") — heti kartoittajan puhelimella tai
-- myöhemmin omalla laitteellaan.
--
-- tk.kartoitukset: lomakkeen sisältö jsonb:nä (talotyyppi, havainnot,
-- materiaalit, kohdekohtaiset huomiot). Kysymykset elävät koodissa
-- (src/lib/kartoitus-schema.ts); jsonb, jotta vanhat kartoitukset näkyvät
-- vaikka lomake muuttuu.
--
-- tk.offers saa hyväksyntäsarakkeet. `accept_token` on linkin ainoa
-- tunniste (ei tarjousnumero: T-0042 on arvattava). Hyväksyntähetki,
-- kirjoitettu nimi, IP ja selain tallennetaan näytöksi siitä kuka
-- hyväksyi ja milloin.
--
-- Ajetaan: Supabasen SQL-editorissa (postgres-roolilla).
-- Idempotentti. Koodi toimii ilman tätä: Kartoitus-näkymä kertoo että
-- migraatio puuttuu, ja tarjoukset lähtevät ilman hyväksyntälinkkiä.
-- =============================================================

create table if not exists tk.kartoitukset (
  id          uuid primary key default gen_random_uuid(),
  -- Kalenterissa ollut kartoituskäynti, jos sellainen oli.
  job_id      uuid references tk.jobs(id) on delete set null,
  -- Kartoituksesta syntynyt tarjous.
  offer_id    uuid references tk.offers(id) on delete set null,
  staff_id    uuid references tk.staff(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_kartoitukset_job on tk.kartoitukset(job_id);
create index if not exists idx_kartoitukset_created on tk.kartoitukset(created_at desc);

alter table tk.offers add column if not exists accept_token  text unique;
alter table tk.offers add column if not exists accepted_at   timestamptz;
alter table tk.offers add column if not exists accepted_name text;
-- IP, selain ja hyväksytyn version summa/rivit — näyttö jos asiasta kiistellään.
alter table tk.offers add column if not exists accepted_meta jsonb;

comment on table tk.kartoitukset is
  'Kartoituskäynnin lomake (CRM /kartoitus). Tarjous tk.offers, hyväksyntä tk.offers.accepted_*.';

grant select, insert, update, delete on tk.kartoitukset to tk_app;
