-- Metan liidimainosten liidit tuodaan ajastetusti tk.leads-tauluun.
-- external_id on Metan oma leadgen-id: se estää saman liidin tuonnin
-- kahdesti, kun ajo osuu päällekkäin tai edellinen ajo keskeytyi.
alter table tk.leads add column if not exists external_id text;

-- Osittainen uniikki-indeksi: vain tuoduilla liideillä on external_id,
-- ja lomakkeelta tulevat rivit (null) eivät saa törmätä toisiinsa.
create unique index if not exists leads_external_id_uniq
  on tk.leads (external_id) where external_id is not null;
