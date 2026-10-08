-- =============================================================
-- Liidin vaihe Metalle: mikä vaihe on jo lähetetty.
--
-- MIKSI: lähetys valitsi rivit `updated_at`in perusteella, mutta
-- trg_leads_touch nostaa sitä KAIKISTA muokkauksista (soittokierros,
-- muistiinpano). Viikkoja sitten vaihtunut tila lähti siis uudestaan,
-- kun liidiä muokattiin myöhemmin, ja Metan deduplikointi kattaa vain
-- ~48 h. Mitattu 8.10.2026: 61 LeadConverted -tapahtumaa 28 liidistä.
--
-- Nyt lähetetään vain kun status <> meta_stage_sent, ja onnistunut
-- lähetys kirjaa tilan tähän.
--
-- ALKUTILA: aiemmat lähetykset menivät ilman custom_data.event_source='crm'
-- -merkintää, joten Meta ei lukenut niitä liidin vaiheiksi. Viimeisen
-- 6 vrk:n muutokset jätetään tyhjiksi, jotta ne lähtevät kerran uudestaan
-- oikein merkittyinä (Meta hylkää yli 7 vrk vanhat event_timet).
-- Vanhemmat merkitään lähetetyiksi.
--
-- Puhtaasti lisäävä sarake. Idempotentti.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/034_lead_meta_stage_sent.sql
-- (postgres-rooli — tk_app ei omista tk.leads-taulua). AJA ENNEN DEPLOYTA.
-- =============================================================

begin;

alter table tk.leads add column if not exists meta_stage_sent text;

-- Trigger pois alkutilan ajaksi: muuten jokaisen vanhan liidin updated_at
-- hyppäisi tähän hetkeen ja liidilista näyttäisi niitä juuri muokattuina.
alter table tk.leads disable trigger trg_leads_touch;

update tk.leads
   set meta_stage_sent = status
 where meta_stage_sent is null
   and external_id is not null
   and status in ('contacted', 'converted', 'rejected')
   and updated_at < now() - interval '6 days';

alter table tk.leads enable trigger trg_leads_touch;

commit;
