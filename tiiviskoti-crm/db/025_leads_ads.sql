-- =============================================================
-- Liidien vienti Google Adsiin.
--
-- MIKSI: taloyhtiöliidi on isoin yksittäinen kauppa mitä tästä tulee,
-- mutta Ads ei ole nähnyt niistä yhtäkään. Konversiotapahtuma laski vain
-- verkkovarauksia (tk.jobs), eikä lomakkeen täyttö ole varaus. Google on
-- siis optimoinut kampanjaa sokkona sen suhteen mikä oikeasti tuottaa.
--
-- Sama kolmikko kuin tk.jobsissa (ks. 017_ads_conversions.sql), jotta
-- vientilogiikka on rivi riviltä sama eikä kahta eri tilakonetta synny.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/025_leads_ads.sql
-- Idempotentti.
-- =============================================================

-- Klikin tunnisteen tyyppi. gclid, wbraid ja gbraid ovat rajapinnassa
-- KOLME ERI KENTTÄÄ eikä arvosta voi päätellä kumpi on kumpi — wbraid
-- gclidinä lähetettynä hylätään. Oletus 'gclid' vastaa vanhoja rivejä,
-- jotka on talletettu ennen kuin tyyppiä kannettiin mukana.
alter table tk.leads add column if not exists gclid_kind text not null default 'gclid';

do $$ begin
  alter table tk.leads add constraint leads_gclid_kind_valid
    check (gclid_kind in ('gclid', 'wbraid', 'gbraid'));
exception when duplicate_object then null; end $$;

-- Milloin konversio on kuitattu Adsiin. null = lähettämättä.
alter table tk.leads add column if not exists ads_uploaded_at timestamptz;

-- Viimeisin epäonnistumisen syy ihmiselle näytettäväksi. Erillään
-- aikaleimasta, koska rivi voi olla sekä yrittämättä että virheellinen:
-- vika kirjataan tähän ja aikaleima jää tyhjäksi.
alter table tk.leads add column if not exists ads_upload_error text;

-- Vientijono luetaan aina samalla ehdolla (gclid on, ei vielä lähetetty).
-- Osittainen indeksi pitää sen halpana myös kun liidejä on kymmeniä
-- tuhansia — valtaosalla ei ole gclidiä lainkaan.
create index if not exists leads_ads_pending_idx
  on tk.leads (created_at)
  where gclid is not null and ads_uploaded_at is null;
