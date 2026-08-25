-- =============================================================
-- Tarjouksen "Työhön sisältyy" -lista — ASIAKKAALLE NÄKYVÄ luettelo
-- siitä mitä jokaiseen tiivistykseen kuuluu.
--
-- MIKSI OMA SARAKE EIKÄ VAPAA SANA: vapaa sana (customer_note) on tälle
-- asiakkaalle kirjoitettu viesti, tämä on vakiolista jota muokataan vain
-- poikkeuksissa. Yhteen kenttään ahdettuna vakiolista pitäisi kirjoittaa
-- käsin joka tarjoukseen — ja se on juuri se työ jonka tämän on määrä
-- poistaa.
--
-- MIKSI text[] EIKÄ text: rivit renderöityvät luettelona sekä PDF:ssä
-- että sähköpostissa. Yhtenä tekstinä molempien pitäisi arvata missä rivi
-- katkeaa, ja rivin sisään kirjoitettu rivinvaihto rikkoisi arvauksen.
--
-- MIKSI TALLENNETAAN LAINKAAN (eikä lueta koodin oletuksista lähetyksessä):
-- lähetetty tarjous on lupaus. Jos lista luettaisiin koodista, sanamuodon
-- hionta muuttaisi takautuvasti sitä mitä VANHASSA tarjouksessa luvattiin —
-- ja PDF:n voi ladata uudelleen vuosi lähetyksen jälkeen. Sama syy kuin
-- siihen että hintarivit ovat rivillä eivätkä hinnastossa.
--
-- Rajat vastaavat koodin rajoja (src/lib/inclusions.ts): enintään 20 riviä.
-- Rivikohtaista pituutta ei voi tarkistaa CHECKissä (se vaatisi alikyselyn,
-- jota CHECK ei salli), joten kanta rajaa listan yhteispituuden — koodi
-- leikkaa yksittäisen rivin 140 merkkiin.
--
-- Koodi toimii myös ILMAN tätä saraketta: reitti huomaa puuttuvan sarakkeen
-- (42703) ja kirjoittaa tarjouksen ilman listaa. Tarjous on aina tärkeämpi
-- kuin sen liite — mutta se tarkoittaa myös, ettei mikään huuda jos tämä jää
-- ajamatta. Aja se.
--
-- Ajetaan Supabasen SQL-editorissa postgres-roolilla (tk_app ei omista
-- taulua eikä voi ajaa ALTERia). Idempotentti.
-- =============================================================

alter table tk.offers add column if not exists inclusions text[];

do $$ begin
  alter table tk.offers add constraint offers_inclusions_shape
    check (
      inclusions is null
      or (coalesce(array_length(inclusions, 1), 0) <= 20
          and char_length(array_to_string(inclusions, '')) <= 2800)
    );
exception when duplicate_object then null; end $$;

comment on column tk.offers.inclusions is
  'Työhön sisältyy -rivit sellaisina kuin ne lähtivät asiakkaalle. null = db/022 ajamaton tai tarjous tehty ennen sitä; tyhjä lista = osio jätetty tietoisesti pois.';
