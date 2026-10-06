-- =============================================================
-- Työraportti — paperilomakkeen "Työraportti A4" sähköinen vastine.
--
-- Asentaja täyttää raportin viimeistelyvelhossa (/tyot/[id]/viimeistely)
-- ennen maksuvaihetta. Keikkaa ei voi viimeistellä ilman sitä: jokainen
-- 11 työvaiheesta on kuitattava "Tehty" tai "Ei tarpeen".
--
-- YKSI RAPORTTI PER TYÖ (job_id unique). "Viimeistele uudelleen"
-- päivittää saman rivin eikä luo toista — muuten toimisto ei tietäisi
-- kumpi raporteista on voimassa.
--
-- TYÖVAIHEET JSONB:NÄ ({avain: 'done'|'na'}) eikä 22 sarakkeena:
-- lista on lomakkeen sisältöä ja voi muuttua. Avaimet ovat pysyviä
-- (src/lib/work-report.ts, WORK_STEPS), teksti ei. Pakollisuuden
-- tarkistaa sovellus, koska "kaikki 11 avainta" on sovelluksen tieto.
--
-- Kentät ovat lomakkeen arvoja SELLAISINAAN eivätkä viittauksia:
-- raportti on asiakirja siitä mitä paikan päällä kirjattiin. Jos
-- asiakkaan puhelinnumero myöhemmin vaihtuu, raportin ei pidä muuttua.
--
-- Puhtaasti lisäävä: uusi taulu, indeksi (unique), trigger uudelle
-- taululle, RLS uudelle taululle ja grantit. Ei koske olemassa olevaan.
-- Idempotentti.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/033_job_reports.sql
-- (tai Supabasen SQL-editorissa postgres-roolilla — tk_app ei voi luoda tauluja).
-- =============================================================

create table if not exists tk.job_reports (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null unique references tk.jobs(id) on delete cascade,

  work_date          date not null,
  installers         text not null,
  customer_name      text,
  customer_phone     text,
  address            text,
  unit               text,                 -- rappu / huoneisto
  started_at         time not null,
  finished_at        time not null,
  travel_hours       numeric(5,2) check (travel_hours is null or travel_hours >= 0),

  windows            int not null default 0 check (windows >= 0),
  balcony_doors      int not null default 0 check (balcony_doors >= 0),
  other_doors        int not null default 0 check (other_doors >= 0),

  steps              jsonb not null check (jsonb_typeof(steps) = 'object'),

  sealant_m          numeric(8,1) check (sealant_m is null or sealant_m >= 0),
  silicone_pcs       int check (silicone_pcs is null or silicone_pcs >= 0),
  acrylic_pcs        int check (acrylic_pcs is null or acrylic_pcs >= 0),

  notes              text,
  customer_ack_name  text not null,

  created_by         uuid references tk.staff(id) on delete set null,
  updated_by         uuid references tk.staff(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace trigger trg_job_reports_touch before update on tk.job_reports
  for each row execute function tk.touch_updated_at();

alter table tk.job_reports enable row level security;

comment on table tk.job_reports is
  'Asentajan työraportti (paperilomakkeen Työraportti A4 vastine). Yksi per työ. steps = {avain: done|na}, avaimet src/lib/work-report.ts.';

grant select, insert, update, delete on tk.job_reports to tk_app;
