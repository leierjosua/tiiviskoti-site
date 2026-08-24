-- =============================================================
-- Meta-klikin tunniste kävijän tapahtumaketjuun.
--
-- MIKSI: Metan CAPI-tapahtuma lähtee ilman `fbc`-tunnistetta juuri niissä
-- selaimissa joista mainosliikenne tulee. `fbc` luetaan `localStorage`sta
-- (`_shared.js` → `tk_fbc`), eikä se säily Instagramin ja Facebookin
-- sovellusselaimissa. Ilman klikkitunnistetta Meta ei osaa liittää ostosta
-- oikeaan mainokseen: 24.8.2026 Ads Managerissa 0 attribuoitua ostosta,
-- vaikka Events Manager oli saanut Purchase-tapahtumat.
--
-- Sama ratkaisu kuin kampanjalla (`campaignFromVisitorTrail`): analytiikka ei
-- nojaa tallennustilaan lainkaan, joten arvo talletetaan laskeutumisen
-- yhteydessä ja haetaan varausta lähetettäessä `visitor_hash`illa.
--
-- TIETOSUOJA: `fbc` on Metan OMA klikkitunniste, jonka Meta on itse luonut ja
-- jonka se jo tietää. Sitä ei käytetä profilointiin eikä kävijän
-- tunnistamiseen sivustolla, vaan yksinomaan toteutuneen kaupan liittämiseen
-- oikeaan mainokseen — sama peruste ja sama käyttö kuin `gclid`illa.
-- Arvo vanhenee Metan oman 7 vrk:n ikkunan mukana; vanhempi on hyödytön.
-- ⚠ Selosteen (`tietosuoja.html` §7) on kerrottava tästä ENNEN käyttöönottoa:
--    nykyinen teksti puhuu vain Google Adsista eikä mainitse Metaa lainkaan.
--
-- Muoto pakotetaan kannassa asti, kuten campaignilla ja gclidilla: arvo on
-- peräisin julkisesta osoiterivistä. Metan muoto on `fb.1.<ms>.<fbclid>`.
--
-- Track-reitti toimii myös ILMAN tätä saraketta (huomaa 42703 ja kirjoittaa
-- ilman fbc:tä), joten mikään ei huuda jos tämä jää ajamatta. Aja se.
--
-- Ajetaan Supabasen SQL-editorissa postgres-roolilla (tk_app ei omista
-- taulua eikä voi ajaa ALTERia). Idempotentti.
-- =============================================================

alter table tk.web_events add column if not exists fbc text;

do $$ begin
  alter table tk.web_events add constraint web_events_fbc_format
    check (fbc is null or fbc ~ '^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,255}$');
exception when duplicate_object then null; end $$;

-- Haku on aina "tämän kävijän tuorein fbc", joten fbc:ttömiä rivejä ei
-- tarvitse indeksoida. Sama kaava kuin idx_leads_campaign.
create index if not exists idx_web_events_fbc
  on tk.web_events(visitor_hash, ts desc)
  where fbc is not null;

comment on column tk.web_events.fbc is
  'Metan klikkitunniste (fb.1.<ms>.<fbclid>) laskeutumisen osoiterivistä. Vain toteutuneen kaupan liittämiseen mainokseen Metan CAPIssa. null = ei tullut mainoslinkistä.';
