-- Luonnoksen jatkaminen myöhemmin.
--
-- tk.offers.lines sisältää VALMIIKSI LASKETUT rivit (nimi, määrä, yksikköhinta).
-- Niistä ei voi palauttaa laskurin tilaa: mitkä kohteet oli valittu, mitkä
-- lisätyöt, mikä postinumero. Ilman tätä saraketta "jatka myöhemmin"
-- tarkoittaisi tarjouksen näpyttelyä alusta.
--
-- draft_state on tarkoituksella vapaamuotoinen jsonb: se on käyttöliittymän
-- oma muistiinpano itselleen, ei rajapinta. Jos laskurin kentät muuttuvat,
-- vanha luonnos avautuu niillä kentillä jotka yhä tunnistetaan.
alter table tk.offers add column if not exists draft_state jsonb;

comment on column tk.offers.draft_state is
  'Tarjouslaskurin tila luonnoksen jatkamista varten. Vain draft-tilaisilla.';
