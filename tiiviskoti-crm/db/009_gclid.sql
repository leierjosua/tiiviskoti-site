-- =============================================================
-- Google Ads -klikin tunniste työlle.
--
-- MIKSI TYÖN SARAKKEENA EIKÄ OMANA TAULUNAAN: konversio ei ole itsenäinen
-- tapahtuma vaan ominaisuus siitä työstä joka syntyi. Kaikki mitä Adsin
-- konversiotuonti tarvitsee on jo `tk.jobs`-rivillä — klikin tunniste,
-- ajankohta (`created_at`) ja kaupan arvo (`price_cents`). Oma taulu
-- kahdentaisi nämä ja voisi ajautua eri tahtiin työn kanssa, esimerkiksi
-- kun varaus peruutetaan.
--
-- MIKSI EI `public.form_submissions`: siihen konversiot kirjoitettiin
-- ensin, mutta CRM:n kantarooli näkee vain `tk`-skeeman, joten adminissa
-- ei voinut näyttää niitä lainkaan. Lisäksi se vaati Supabasen
-- service-avaimen sivuston funktioon, joka oli muuten päässyt siitä eroon.
--
-- PERUUTETTU VARAUS EI OLE KONVERSIO. Kun työ poistetaan
-- (`/api/public/booking` DELETE), myös gclid katoaa sen mukana — juuri
-- niin kuin pitää, koska peruttua kauppaa ei pidä raportoida Googlelle.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/009_gclid.sql
-- Idempotentti.
-- =============================================================

alter table tk.jobs add column if not exists gclid text;

-- Muoto rajataan samasta syystä kuin kampanjalla: arvo tulee julkisesta
-- osoiterivistä. Google käyttää gclidissä, wbraidissa ja gbraidissa
-- URL-turvallista base64:ää, joten kirjaimet, numerot, alaviiva ja
-- väliviiva riittävät.
do $$ begin
  alter table tk.jobs add constraint jobs_gclid_format
    check (gclid is null or gclid ~ '^[A-Za-z0-9_-]{10,200}$');
exception when duplicate_object then null; end $$;

-- Konversioraportti hakee aina "työt joilla on gclid, uusin ensin".
create index if not exists idx_jobs_gclid
  on tk.jobs(created_at desc)
  where gclid is not null;

comment on column tk.jobs.gclid is
  'Google Ads -klikin tunniste (gclid/wbraid/gbraid) sivuston osoiterivistä. Viedään Adsiin offline-konversiona. null = ei mainosklikistä.';
