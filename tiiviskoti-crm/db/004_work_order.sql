-- =============================================================
-- Työmääräin asentajalle.
--
-- Asiakas saa vahvistuksen, asentaja saa työmääräimen — eri viesti, eri
-- sisältö. `tk.mail_log` erottaa ne `kind`-sarakkeella, jotta lokista näkee
-- kummasta on kysymys eikä molempia lueta "vahvistuksiksi".
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/004_work_order.sql
-- Idempotentti.
-- =============================================================

alter type tk.mail_kind add value if not exists 'work_order';
