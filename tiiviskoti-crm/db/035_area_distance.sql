-- =============================================================
-- Palvelualue etäisyytenä postinumerosta.
--
-- Alueen voi nyt määrittää myös "keskipostinumero + säde km", esim.
-- asentajan kotipostinumero ja 23 km. Kartalta voi sulkea yksittäisiä
-- postinumeroita pois (järvi, saari, huono tieyhteys).
--
-- Haku EI muutu: tallennettaessa säde puretaan 5-merkkisiksi
-- postinumeroiksi `postal_prefixes`-sarakkeeseen, joten varaus ja
-- saatavuus osuvat siihen kuten ennenkin. Nämä sarakkeet ovat vain
-- muokkausta varten — mistä lista syntyi.
--
-- Tyhjä center_postal = vanha etuliitealue.
--
-- Puhtaasti lisäävä. Idempotentti.
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/035_area_distance.sql
-- (postgres-rooli — tk_app ei voi muuttaa taulua). AJA ENNEN DEPLOYTA.
-- =============================================================

alter table tk.areas add column if not exists center_postal    text;
alter table tk.areas add column if not exists radius_km        numeric(5,1);
alter table tk.areas add column if not exists excluded_postals text[] not null default '{}';

do $$ begin
  alter table tk.areas add constraint areas_distance_complete
    check ((center_postal is null) = (radius_km is null)
           and (center_postal is null or center_postal ~ '^\d{5}$')
           and (radius_km is null or (radius_km > 0 and radius_km <= 300)));
exception when duplicate_object then null; end $$;
