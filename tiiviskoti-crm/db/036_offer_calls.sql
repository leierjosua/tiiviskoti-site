-- =============================================================
-- Tarjouksen soittokierros: milloin soitettiin ja mitä tapahtui.
--
-- /tarjoukset/soittolista näyttää vanhenevat tarjoukset puhelinnumeroineen.
-- Ilman kirjausta sama asiakas soitettaisiin kahdesti samana päivänä, ja
-- "ei vastannut" näyttäisi samalta kuin "ei vielä yritetty". Viimeisin
-- tulos riittää listaan; historia kirjataan lisäksi tarjouksen sisäiseen
-- muistiinpanoon (notes), joka ei näy asiakkaalle eikä PDF:ssä.
--
-- Puhtaasti lisäävä. Idempotentti.
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/036_offer_calls.sql
-- (postgres-rooli). AJA ENNEN DEPLOYTA.
-- =============================================================

alter table tk.offers add column if not exists last_call_at     timestamptz;
alter table tk.offers add column if not exists last_call_result text;

do $$ begin
  alter table tk.offers add constraint offers_last_call_result_check
    check (last_call_result is null or last_call_result in ('no_answer', 'thinking', 'declined'));
exception when duplicate_object then null; end $$;
