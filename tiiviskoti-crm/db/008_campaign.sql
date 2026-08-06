-- =============================================================
-- Kampanjatunniste työlle: mistä mainoksesta asiakas tuli.
--
-- MIKSI OMA SARAKE EIKÄ `source`: `source` kertoo mitä kautta työ syntyi
-- järjestelmässä ('admin' = myyjä kirjasi, 'web' = asiakas varasi itse).
-- Se on tekninen tieto eikä saa sekoittua markkinointiin. Kampanja taas
-- kertoo mikä mainos toi asiakkaan, ja sama kampanja voi tuottaa töitä
-- kumpaakin reittiä — postilaatikkomainoksen nähnyt voi myös soittaa.
--
-- MIKSI EI ALENNUSKOODI: koodi mittaa vain ne jotka kirjoittivat sen
-- varauslomakkeeseen. QR-koodin skannannut voi varata koodia käyttämättä,
-- ja juuri se kauppa jäisi mainokselle kirjaamatta.
--
-- Arvo tulee sivuston osoitteen `?src=`-parametrista ja kulkee
-- sessionStoragen kautta varaukseen asti. Esimerkkejä:
--   qr-a6      postilaatikkomainoksen QR-koodi
--   fb-veto    Facebook-mainos "veto"
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/008_campaign.sql
-- Idempotentti.
-- =============================================================

alter table tk.jobs add column if not exists campaign text;

-- Muoto rajataan, koska arvo tulee julkisesta osoitteesta: pieniä
-- kirjaimia, numeroita ja väliviivoja, enintään 60 merkkiä. Näin
-- raportit eivät täyty roskasta eivätkä saman kampanjan kirjoitusasut
-- hajaannu ('QR-A6' ja 'qr-a6' olisivat eri rivit).
do $$ begin
  alter table tk.jobs add constraint jobs_campaign_format
    check (campaign is null or campaign ~ '^[a-z0-9][a-z0-9._-]{0,59}$');
exception when duplicate_object then null; end $$;

-- Raportti kysyy aina "mitkä työt kampanjasta X ja milloin", joten
-- osittainen indeksi riittää: kampanjattomia rivejä ei haeta tällä.
create index if not exists idx_jobs_campaign
  on tk.jobs(campaign, created_at desc)
  where campaign is not null;

comment on column tk.jobs.campaign is
  'Markkinointikampanjan tunniste sivuston ?src=-parametrista, esim. qr-a6. null = ei tiedossa.';
