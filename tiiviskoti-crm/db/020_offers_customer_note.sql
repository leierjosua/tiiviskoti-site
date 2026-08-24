-- =============================================================
-- Tarjouksen "vapaa sana" — ASIAKKAALLE NÄKYVÄ saateteksti.
--
-- MIKSI OMA SARAKE EIKÄ `notes`: `notes` on nimenomaan sisäinen. Lomake
-- lupaa siitä "ei näy asiakkaalle", eikä sitä renderöidä PDF:ään eikä
-- sähköpostiin — vain adminin tarjousnäkymään. Jos se valjastettaisiin
-- asiakkaalle näkyväksi, JO TALLENNETTUJEN tarjousten sisäiset merkinnät
-- ("sovittu alennus", katteet, arviot asiakkaasta) paljastuisivat
-- takautuvasti seuraavassa lähetyksessä. Kaksi kenttää on halvempi kuin
-- yksi vuoto.
--
-- Näkyy sekä kuluttajan että taloyhtiön tarjouksessa: sama `OfferBuilder`,
-- sama PDF, sama sähköpostipohja.
--
-- Pituusrajoite 2000 merkkiä: kenttä on saatetekstiä varten, ei liitteeksi.
-- PDF varaa sille rajallisen tilan, ja rajaton teksti valuisi sivun yli.
--
-- Koodi toimii myös ILMAN tätä saraketta: reitti huomaa puuttuvan sarakkeen
-- (42703) ja kirjoittaa tarjouksen ilman vapaata sanaa. Tarjous on aina
-- tärkeämpi kuin sen saateteksti — mutta se tarkoittaa myös, ettei mikään
-- huuda jos tämä jää ajamatta. Aja se.
--
-- Ajetaan Supabasen SQL-editorissa postgres-roolilla (tk_app ei omista
-- taulua eikä voi ajaa ALTERia). Idempotentti.
-- =============================================================

alter table tk.offers add column if not exists customer_note text;

do $$ begin
  alter table tk.offers add constraint offers_customer_note_len
    check (customer_note is null or char_length(customer_note) <= 2000);
exception when duplicate_object then null; end $$;

comment on column tk.offers.customer_note is
  'Vapaa sana: asiakkaalle näkyvä saateteksti tarjouksen PDF:ssä ja sähköpostissa. Eri asia kuin sisäinen notes.';
