-- =============================================================
-- Talousanalytiikka — myynti, kulut ja tulos samalla sivulla.
--
-- Kannassa on tähän asti ollut vain myynti (tk.jobs.price_cents).
-- Kate ja tulos vaativat kulut, ja kulut syntyvät kahdella eri
-- mekanismilla, koska ne ovat luonteeltaan eri asioita:
--
--   1. SÄÄNNÖT (tk.cost_settings) — kulut jotka seuraavat myyntiä.
--      Tekijäkulu, myyntikomissio ja markkinointiprovisio ovat osuus
--      laskutuksesta: niitä ei kannata näpytellä keikka kerrallaan, kun
--      ne ovat johdettavissa. Kiinteät kulut ovat kuukausisumma, joka
--      jaetaan jaksolle päivien suhteessa.
--
--   2. KIRJAUKSET (tk.expenses) — yksittäiset menot päivämäärällä.
--      Tiivistemateriaali, työkalu, Google Ads -lasku, kirjanpito.
--      Nämä eivät seuraa myyntiä, joten prosentti valehtelisi.
--
-- Kummankin summa on saman kategorian luku sivulla: sääntö antaa pohjan,
-- kirjaus lisää päälle sen mitä sääntö ei tiedä.
--
-- MIKSI KATEGORIA ON TEXT + CHECK EIKÄ ENUM: uuden arvon lisääminen
-- enumiin vaatii postgres-roolin (ALTER TYPE), jota sovelluksella ei ole
-- — sama ongelma joka on jo osunut tk.mail_kindiin. CHECK-rajoitteen saa
-- päivitettyä samassa migraatiotiedostossa ilman erikoisoikeuksia.
--
-- Ajetaan: Supabasen SQL-editorissa (postgres-roolilla).
-- `tk_app` EI voi luoda tauluja skeemaan tk (42501).
-- Idempotentti.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- Kulusäännöt. Yksi rivi, `id` on aina true — vakiotemppu, joka takaa
-- ettei asetuksia voi vahingossa olla kahta erilaista.
--
-- Prosentit ovat peruspisteinä (4000 = 40,00 %), jotta puolikas
-- prosenttiyksikkö on tallennettavissa ilman liukulukua. Sama syy miksi
-- rahat ovat sentteinä.
--
-- Prosenttien pohjana on LIIKEVAIHTO (alv 0 %), ei kokonaismyynti:
-- arvonlisävero on läpikulkuerä, eikä siitä makseta tekijälle palkkaa
-- eikä myyjälle komissiota.
-- ─────────────────────────────────────────────────────────────
create table if not exists tk.cost_settings (
  id                    boolean primary key default true check (id),

  -- Arvonlisävero. Työn hinta kannassa on kuluttajahinta eli sisältää
  -- alvin; liikevaihto lasketaan siitä takaperin.
  vat_bp                int not null default 2550 check (vat_bp between 0 and 10000),

  -- Myynnistä johdettavat kulut, osuus liikevaihdosta.
  tekija_bp             int not null default 0 check (tekija_bp between 0 and 10000),
  laite_bp              int not null default 0 check (laite_bp between 0 and 10000),
  komissio_bp           int not null default 0 check (komissio_bp between 0 and 10000),
  provisio_bp           int not null default 0 check (provisio_bp between 0 and 10000),

  -- Kiinteät kulut kuukaudessa (vuokra, vakuutukset, ohjelmistot,
  -- kirjanpito). Jaksolle jaetaan päivien suhteessa, joten viikkonäkymä
  -- ei näytä koko kuukauden vuokraa.
  kiinteat_cents_month  int not null default 0 check (kiinteat_cents_month >= 0),

  -- Haetaanko Meta-mainoskulut automaattisesti Marketing API:sta.
  -- Kun tämä on päällä, ÄLÄ kirjaa Meta-laskuja myös käsin — ne
  -- laskettaisiin kahteen kertaan.
  meta_auto             boolean not null default true,

  updated_at            timestamptz not null default now()
);

insert into tk.cost_settings (id) values (true) on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Kulukirjaukset. Yksittäinen meno päivämäärällä ja kategorialla.
-- ─────────────────────────────────────────────────────────────
create table if not exists tk.expenses (
  id           uuid primary key default gen_random_uuid(),

  -- Kulun päivä. `date` eikä timestamptz: kulu kuuluu päivälle, ei
  -- hetkelle, eikä sen jaksoon osuminen saa riippua kellonajasta
  -- aikavyöhykemuunnoksen jälkeen.
  spent_on     date not null,

  category     text not null check (category in
                 ('tekija', 'markkinointi', 'laite', 'komissio', 'kiinteat', 'provisio')),

  -- Negatiivinen on sallittu tarkoituksella: hyvitys tai korjaus on kulu
  -- miinusmerkillä eikä rivin poisto, jotta historia säilyy.
  amount_cents int not null,

  note         text,
  created_at   timestamptz not null default now(),
  created_by   uuid references tk.staff(id) on delete set null
);

-- Sivu hakee aina "jakson kulut kategorioittain".
create index if not exists idx_expenses_date on tk.expenses(spent_on, category);

comment on table tk.cost_settings is
  'Myynnistä johdettavat kuluprosentit ja kiinteät kuukausikulut. Yksi rivi.';
comment on table tk.expenses is
  'Yksittäiset kulukirjaukset. Lasketaan sääntöjen päälle samaan kategoriaan.';

alter table tk.cost_settings enable row level security;
alter table tk.expenses      enable row level security;

grant select, insert, update, delete on tk.cost_settings to tk_app;
grant select, insert, update, delete on tk.expenses      to tk_app;
