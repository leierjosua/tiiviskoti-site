-- TiivisKoti — ikkunan säätö ja öljyäminen siirtyvät perushintaan 2026-09-18.
--
-- Josua vahvisti, että ikkunan säätö ja öljyäminen kuuluvat ikkunan hintaan.
-- Syyskuun videomainokset lupaavat sen ääneen ("Hintaan kuuluu myös ikkunan
-- säätö ja öljyäminen"), joten lisätyö 'Helojen ja käyntivälyksen säätö'
-- (15 € / ikkuna) on poistettu tiiviskoti/pricing.mjs:stä. Tämä migraatio
-- tekee saman kannan katalogiin.
--
-- EI POISTETA RIVIÄ, vaan se merkitään ei-aktiiviseksi: vanhat työt ja
-- tarjoukset viittaavat siihen, ja poisto veisi niiltä rivin nimen.
--
-- Rahasumma lasketaan aina pricing.mjs:ssä. Nämä rivit ovat sitä varten,
-- että admin, tarjouslaskuri ja tarjous-PDF näyttävät oikeat katalogihinnat.

begin;

-- 1) Lisätyö pois valikoimasta.
update addon_services
   set active = false
 where name = 'Helojen ja käyntivälyksen säätö';

-- 2) Ikkunan kesto 20 → 25 min. Työ ei kadonnut, vain sen erillisveloitus,
--    joten entisen lisätyön 5 minuuttia siirtyy peruskestoon. Muuten
--    kalenterivaraus jäisi lyhyeksi jokaisessa ikkunatyössä.
update service_variants
   set duration_minutes = 25
 where label = 'Ikkuna';

-- 3) VANHAA AJANTASAISTUSTA: katalogihinnat ovat jääneet 6.9.2026:n
--    hinnastouudistuksesta jälkeen. Nämä eivät liity säätömuutokseen, mutta
--    ovat väärin admin-näkymässä ja tarjous-PDF:ssä juuri nyt:
--      ikkuna      95 € → 90 € (ylin porras, pricing.mjs WINDOW_TIERS)
--      ulko-ovi   119 € → 99 € (pricing.mjs TYPES.ulko)
--      parvekeovi 119 € → 99 € (pricing.mjs TYPES.parveke)
update service_variants set price_cents = 9000 where label = 'Ikkuna';
update service_variants set price_cents = 9900 where label = 'Ulko-ovi (sivutiivisteet + kynnyskumi, säätö)';
update service_variants set price_cents = 9900 where label = 'Parvekeovi';

commit;
