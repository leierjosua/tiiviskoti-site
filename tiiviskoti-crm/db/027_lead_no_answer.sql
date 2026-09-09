-- =============================================================
-- Liidi joka ei vastannut puhelimeen.
--
-- Tähän asti liidi oli joko `new` tai `contacted`. Soitto johon ei
-- vastattu ei ole kumpikaan: liidiä on yritetty, mutta mitään ei ole
-- vielä opittu. Jos se merkittiin `contacted`iksi, se katosi listalta
-- ikään kuin asia olisi hoidettu — ja jos se jätettiin `new`iksi, ei
-- näkynyt että soittoja on jo tehty.
--
-- MIKSI MYÖS PÄIVÄMÄÄRÄ: pelkkä tila kertoo että pitää soittaa uudelleen,
-- muttei milloin. Ilman takarajaa "soita uudelleen" tarkoittaa käytännössä
-- "joskus", ja liidi vanhenee hiljaa. `call_back_at` tekee unohtamisesta
-- näkyvää: Liidit-sivu nostaa erääntyneet ylimmäksi.
--
-- Kenttä on tarkoituksella VAPAA kaikille tiloille eikä sidottu
-- `no_answer`iin. Myös tavoitettu liidi voi pyytää soittoa ensi viikolla.
--
-- Ajetaan: Supabasen SQL-editorissa (postgres-roolilla).
-- `tk_app` EI voi ajaa tätä — enumin ja taulun omistaja on postgres.
-- Idempotentti.
-- =============================================================

-- HUOM: `alter type ... add value` ei toimi transaktiolohkon sisällä
-- vanhemmilla Postgres-versioilla. Aja tämä lause yksinään, jos editori
-- valittaa "cannot run inside a transaction block".
alter type tk.lead_status add value if not exists 'no_answer';

-- Milloin liidille soitetaan seuraavan kerran. null = ei sovittua aikaa.
alter table tk.leads add column if not exists call_back_at timestamptz;

-- Erääntyneiden haku on Liidit-sivun oletusjärjestys, joten se ajetaan
-- joka latauksella. Osittainen indeksi: valtaosalla riveistä aikaa ei ole.
create index if not exists idx_leads_call_back
  on tk.leads(call_back_at)
  where call_back_at is not null;

comment on column tk.leads.call_back_at is
  'Milloin liidille soitetaan uudelleen. null = ei sovittua aikaa. Erääntyneet nousevat Liidit-sivulla ylimmäksi.';

-- Varmistus: oletusoikeudet kattavat uudet sarakkeet, mutta ei haittaa
-- vaikka tämä ajettaisiin uudestaan.
grant select, insert, update, delete on tk.leads to tk_app;
