-- Tarjouksesta suoraan kalenteriin ("Laita aika") + kahden asentajan keikka.
--
-- offer_id
--   Mistä tarjouksesta työ syntyi. Ilman tätä tarjouslistalta ei näe mikä on
--   jo aikataulutettu, ja sama tarjous tulisi buukatuksi kahdesti.
--
-- crew_group_id
--   Kun keikalla on kaksi asentajaa, syntyy KAKSI työriviä — yksi kummankin
--   kalenteriin. Näin on pakko: `jobs_no_overlap` on kalenterikohtainen, joten
--   yksi rivi varaa vain yhden kalenterin ja toinen asentaja näyttäisi
--   vapaalta. Rivit kuuluvat yhteen tämän tunnuksen kautta, jotta siirto,
--   peruminen ja poisto osuvat molempiin — muuten pari jäisi eri aikoihin.
--
--   Raha on VAIN päätyöllä (paririvin price_cents = 0), jottei sama keikka
--   näkyisi liikevaihdossa kahteen kertaan.
alter table tk.jobs add column if not exists offer_id      uuid references tk.offers(id) on delete set null;
alter table tk.jobs add column if not exists crew_group_id uuid;

create index if not exists idx_jobs_offer on tk.jobs(offer_id) where offer_id is not null;
create index if not exists idx_jobs_crew  on tk.jobs(crew_group_id) where crew_group_id is not null;

comment on column tk.jobs.offer_id is
  'Tarjous josta työ aikataulutettiin (tk.offers). null = työ ei tullut tarjouksesta.';
comment on column tk.jobs.crew_group_id is
  'Saman keikan työparirivit jakavat tämän tunnuksen. null = yhden asentajan keikka.';
