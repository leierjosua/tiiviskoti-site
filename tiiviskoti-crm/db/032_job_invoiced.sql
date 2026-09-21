-- TiivisKoti CRM — "lasku lähetetty" -tila töille (21.9.2026).
--
-- MIKSI SARAKE EIKÄ UUSI job_status-ARVO:
--   Laskutus ei ole vaihtoehto valmiille työlle vaan sen jatko. Jos
--   'invoiced' lisättäisiin `job_status`-enumiin, työ ei voisi enää olla
--   yhtä aikaa 'done' ja laskutettu, ja JOKAINEN olemassa oleva
--   `status = 'done'` -kysely alkaisi hiljaa ohittaa laskutetut työt —
--   mm. asennuskalenterin "tehty mutta maksamatta" -lista.
--   Erillinen aikaleima ei riko mitään olemassa olevaa kyselyä.
--
--   Sama kaava on jo käytössä: `confirmation_sent_at`, `completed_at`,
--   `ads_uploaded_at`. Aikaleima kertoo myös MILLOIN lasku lähti, minkä
--   boolean hukkaisi.
--
-- Elinkaari on nyt: done → invoiced_at → paid.
-- `paid` on ennallaan, eikä laskun lähetys ole sen edellytys: käteisellä
-- tai MobilePaylla maksettu työ voi mennä suoraan maksetuksi.
--
-- AJETTAVA KÄSIN postgres-roolilla Supabasen SQL-editorissa:
-- `tk_app`-roolilla ei ole DDL-oikeuksia tk-skeemaan.

begin;

alter table tk.jobs add column if not exists invoiced_at timestamptz;

comment on column tk.jobs.invoiced_at is
  'Milloin lasku lähetettiin asiakkaalle. NULL = laskua ei ole lähetetty. Ei estä paid-lippua.';

-- Osittainen indeksi avoimille laskuille: "lähetetty mutta maksamatta".
-- Se on ainoa kysely jota tällä taululla oikeasti ajetaan toistuvasti,
-- ja partial-indeksi pysyy pienenä kun maksetut putoavat pois.
create index if not exists jobs_invoiced_unpaid_idx
    on tk.jobs (invoiced_at)
 where invoiced_at is not null and not paid;

commit;
