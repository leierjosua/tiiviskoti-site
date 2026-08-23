-- =============================================================
-- Google Ads -konversioiden automaattinen lähetys.
--
-- Tähän asti konversiot vietiin käsin: /ads-näkymästä ladattiin CSV ja se
-- pudotettiin Adsin Lataukset-toimintoon. Se toimii, mutta vaatii ihmisen
-- muistavan tehdä sen — ja niin kauan kuin lataus on tekemättä, Adsin
-- tarjousstrategia optimoi ilman tietoa siitä mikä klikki tuotti kaupan.
-- Nyt sama tieto menee rajapinnan kautta itsestään, ja CSV jää varatieksi.
--
-- MIKSI MERKINTÄ ON TYÖN SARAKKEENA: sama perustelu kuin gclidillä
-- (ks. 009_gclid.sql). Lähetystila on työn ominaisuus, ei itsenäinen
-- tapahtuma, eikä sitä ole mieltä pitää erillään siitä rivistä jonka
-- olemassaolo ratkaisee raportoidaanko konversio lainkaan.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/017_ads_conversions.sql
-- Idempotentti.
-- =============================================================

-- Milloin konversio meni Adsiin läpi. null = ei vielä lähetetty.
-- TÄMÄ SARAKE ON KAKSOISLÄHETYKSEN ESTO: ilman sitä jokainen ajo lähettäisi
-- kaikki konversiot uudelleen. Ads kyllä karsii duplikaatit order_id:n
-- perusteella, mutta siihen ei pidä nojata — se on Googlen toteutuksen
-- yksityiskohta, ei lupaus.
alter table tk.jobs add column if not exists ads_uploaded_at timestamptz;

-- Viimeisin virhe ihmisen luettavaksi. Ilman tätä epäonnistunut lähetys
-- näkyisi vain siinä että `ads_uploaded_at` pysyy tyhjänä, eikä syy
-- selviäisi administa lainkaan.
alter table tk.jobs add column if not exists ads_upload_error text;

-- Minkä tyyppinen klikin tunniste `gclid`-sarakkeessa on.
--
-- MIKSI TÄMÄ TARVITAAN: sivusto tallentaa samaan sarakkeeseen kolmea eri
-- tunnistetta — `gclid` (tavallinen klikki), sekä `wbraid` ja `gbraid`,
-- jotka Google antaa iOS-liikenteelle kun seurantaa on rajoitettu.
-- Rajapinnassa ne ovat KOLME ERI KENTTÄÄ, eikä wbraid kelpaa gclidin
-- paikalle: rivi hylätään. Arvoista ei voi päätellä kumpi on kumpi, joten
-- tyyppi on tallennettava talteenoton hetkellä.
--
-- Vanhat rivit saavat oletukseksi 'gclid'. Se on oikea arvo valtaosalle:
-- wbraid/gbraid koskee vain osaa iOS-liikenteestä, ja väärin merkitty rivi
-- epäonnistuu näkyvästi `ads_upload_error`-sarakkeeseen sen sijaan että
-- kirjautuisi hiljaa väärin.
alter table tk.jobs add column if not exists ads_click_kind text not null default 'gclid';

do $$ begin
  alter table tk.jobs add constraint jobs_ads_click_kind_valid
    check (ads_click_kind in ('gclid', 'wbraid', 'gbraid'));
exception when duplicate_object then null; end $$;

-- Lähetysajo hakee aina "työt joilla on gclid mutta ei lähetysmerkintää".
create index if not exists idx_jobs_ads_pending
  on tk.jobs(created_at)
  where gclid is not null and ads_uploaded_at is null;

comment on column tk.jobs.ads_uploaded_at is
  'Milloin konversio lähetettiin Google Adsiin rajapinnan kautta. null = lähettämättä.';
comment on column tk.jobs.ads_upload_error is
  'Viimeisimmän epäonnistuneen Ads-lähetyksen syy. null = ei virhettä.';
comment on column tk.jobs.ads_click_kind is
  'Kumpi Googlen klikkitunniste gclid-sarakkeessa on: gclid | wbraid | gbraid. Rajapinnassa eri kenttä kullekin.';
