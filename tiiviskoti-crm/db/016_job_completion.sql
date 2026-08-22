-- =============================================================
-- Keikan viimeistely: maksutila, asiakastyytyväisyys, viimeistelyhetki.
--
-- MIKSI: asentaja päättää keikan puhelimessa ja tekee samalla kolme
-- päätöstä joita ei tähän asti tallennettu mihinkään: maksoiko asiakas
-- paikan päällä, mitä mieltä hän oli, ja milloin työ oikeasti päättyi.
--
-- Aiemmin "maksettu" pääteltiin siitä oliko kuitti lähtenyt
-- (tk.mail_log, kind='receipt'). Se on väärä mittari kahteen suuntaan:
-- käteisellä maksettu keikka ilman sähköpostiosoitetta näytti
-- maksamattomalta, ja laskutettavasta keikasta lähetetty kuitti näytti
-- maksetulta. Nyt maksu on oma tietonsa ja kuitti on kuitti.
--
-- `completed_at` on eri asia kuin `status = 'done'`: status voidaan
-- vaihtaa käsin, mutta viimeistely on hetki jolloin keikka käytiin läpi
-- lomakkeen kanssa. Laskutus kysyy jälkimmäistä.
--
-- Ajetaan Supabasen SQL-editorissa postgres-roolilla (tk_app ei omista
-- taulua eikä voi ajaa ALTERia). Idempotentti.
-- =============================================================

alter table tk.jobs add column if not exists paid          boolean not null default false;
alter table tk.jobs add column if not exists satisfaction  smallint;
alter table tk.jobs add column if not exists completed_at  timestamptz;

-- 1 = huono, 2 = ok, 3 = erinomainen. Kolme vaihtoehtoa eikä viisi, koska
-- asentaja napauttaa tätä asiakkaan vieressä eikä pohdi väliarvoja.
do $$ begin
  alter table tk.jobs add constraint jobs_satisfaction_range
    check (satisfaction is null or satisfaction between 1 and 3);
exception when duplicate_object then null; end $$;

-- Laskuttamatta-listaus kysyy juuri tätä: valmis mutta maksamaton.
create index if not exists idx_jobs_unpaid
  on tk.jobs(completed_at) where not paid;

-- Sovellusrooli lukee ja kirjoittaa uudet sarakkeet olemassa olevan
-- taulukohtaisen grantin kautta, joten erillistä grantia ei tarvita.
