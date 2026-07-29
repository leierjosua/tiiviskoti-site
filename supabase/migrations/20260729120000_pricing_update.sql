-- TiivisKoti — hinnaston päivitys 2026-07-29.
--
-- Varauksen rahasumma lasketaan tiiviskoti/pricing.mjs:ssä, ei täältä. Nämä
-- rivit pidetään silti ajan tasalla, koska admin, tarjouslaskuri ja tarjous-PDF
-- näyttävät katalogihinnat kannasta. Jos nämä eriävät pricing.mjs:stä, asiakas
-- laskutetaan silti oikein — mutta admin näyttäisi väärää hintaa.
--
-- Huom: ikkunan määräporrastusta (95/85/75/65 €) ei voi esittää yhtenä
-- rivihintana. Kantaan tallennetaan ylin porras eli yhden ikkunan hinta.
-- Ovien "saman käynnin" alennushinta (119→99, 89→59) on samoin vain
-- pricing.mjs:ssä.

begin;

update service_variants set price_cents =  9500 where label = 'Ikkuna';
update service_variants set price_cents = 11900 where label = 'Ulko-ovi (sivutiivisteet + kynnyskumi, säätö)';
update service_variants set price_cents = 11900 where label = 'Parvekeovi';
update service_variants set price_cents =  8900 where label = 'Väli- / huoneovi';

-- Nimi yhtenäistetään sivun kanssa, jotta create-booking.mjs osuu tarkalla
-- nimivertailulla eikä joudu turvautumaan sumeaan sanavastaavuuteen.
update service_variants
   set price_cents = 14900, label = 'Terassin liuku-/pariovi'
 where label in ('Terassi- / liukuovi', 'Terassin liuku-/pariovi');

-- 'Pelkkä kynnyskumi' 45 € säilyy ennallaan.

-- Uudet lisätyöt. Idempotentti: nimi on tosiasiallinen avain, mutta taulussa
-- ei ole sille uniikkirajoitetta, joten olemassaolo tarkistetaan käsin.
insert into addon_services (name, price_cents, duration_minutes, active)
select v.name, v.price_cents, v.duration_minutes, true
  from (values
    ('Karmin ja seinän välin akryylisaumaus', 1900, 10),
    ('Helojen ja käyntivälyksen säätö',       1500,  5),
    ('Kahvan vaihto',                         2900, 15)
  ) as v(name, price_cents, duration_minutes)
 where not exists (select 1 from addon_services a where a.name = v.name);

-- Jos rivit olivat jo olemassa, varmistetaan hinta ja kesto.
update addon_services set price_cents = 1900, duration_minutes = 10 where name = 'Karmin ja seinän välin akryylisaumaus';
update addon_services set price_cents = 1500, duration_minutes =  5 where name = 'Helojen ja käyntivälyksen säätö';
update addon_services set price_cents = 2900, duration_minutes = 15 where name = 'Kahvan vaihto';
update addon_services set price_cents = 1500, duration_minutes = 15 where name = 'Vanhan liiman poisto';

commit;
