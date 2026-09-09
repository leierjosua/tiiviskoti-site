-- =============================================================
-- Soittoklikki Google Adsin konversioksi.
--
-- MIKSI: Googlen ainoa ensisijainen konversio on ollut "Varaus verkosta".
-- Ikkuna-asiakas ei kuitenkaan varaa verkosta — hän soittaa. Ikkunatyöt
-- ovat 83 % toteutuneesta liikevaihdosta (129 kpl / 8 865 € vs. ovet
-- 20 kpl / 1 762 €), mutta Google ei ole nähnyt niistä yhtäkään signaalia.
-- Se on optimoinut kolmen kuukausittaisen verkkovarauksen mukaan, eli
-- ovikauppaa, ja tulkinnut ikkunaliikenteen epäonnistuneeksi.
--
-- Soittoklikkejä kertyi 27 kappaletta 30 vuorokaudessa. Kolmella
-- konversiolla algoritmilla ei ole mitään opittavaa; kolmellakymmenellä on.
--
-- MIKSI web_events EIKÄ oma taulu: klikki on jo tässä taulussa rivinä
-- (`cta = 'Soita'`). Oma taulu tarkoittaisi saman tapahtuman kirjaamista
-- kahdesti ja kahta paikkaa jotka voivat erota toisistaan. Lähetystila
-- tulee samoilla sarakkeilla kuin tk.jobs ja tk.leads, jotta ads-sync.ts
-- käsittelee kaikkia kolmea samalla kaavalla.
--
-- Ajetaan: Supabasen SQL-editorissa (postgres-roolilla).
-- `tk_app` EI voi lisätä sarakkeita (42501). Idempotentti.
-- =============================================================

-- Klikin tunniste ja sen tyyppi. Sivusto lähettää nämä jokaisen
-- tapahtuman mukana silloin kun kävijä on tullut Google-mainoksesta.
-- Tyyppi on tallennettava talteenoton hetkellä: rajapinnassa gclid,
-- wbraid ja gbraid ovat kolme eri kenttää eikä arvosta voi päätellä kumpi
-- on kumpi (ks. 017_ads_conversions.sql).
alter table tk.web_events add column if not exists gclid text;
alter table tk.web_events add column if not exists gclid_kind text;

-- Lähetystila. Sama kaava kuin tk.jobs ja tk.leads.
alter table tk.web_events add column if not exists ads_uploaded_at timestamptz;
alter table tk.web_events add column if not exists ads_upload_error text;

do $$ begin
  alter table tk.web_events add constraint web_events_gclid_format
    check (gclid is null or gclid ~ '^[A-Za-z0-9_-]{10,200}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tk.web_events add constraint web_events_gclid_kind_valid
    check (gclid_kind is null or gclid_kind in ('gclid', 'wbraid', 'gbraid'));
exception when duplicate_object then null; end $$;

-- Lähetysajo hakee vain soittoklikit joilla on tunniste eikä lähetysmerkintää.
-- Osittainen indeksi: web_events on analytiikan päävirta ja valtaosalla
-- riveistä ei ole tunnistetta lainkaan, joten koko taulun indeksi olisi
-- pelkkää kirjoituskuormaa.
create index if not exists idx_web_events_ads_pending
  on tk.web_events(ts)
  where cta = 'Soita' and gclid is not null and ads_uploaded_at is null;

comment on column tk.web_events.gclid is
  'Google-mainosklikin tunniste laskeutumisen osoiterivistä. Vain soittoklikeistä raportoidaan konversio.';
comment on column tk.web_events.ads_uploaded_at is
  'Milloin soittoklikki lähetettiin Google Adsiin. null = lähettämättä.';

grant select, insert, update, delete on tk.web_events to tk_app;
