-- =============================================================
-- Varausnumero ilman "TK-"-etuliitettä.
--
-- Numero on numero: "1015" eikä "TK-1015". Etuliite oli pelkkää koristetta
-- ja teki numerosta hankalamman sanoa puhelimessa ja etsiä hakukentästä.
--
-- Sarake pysyy `text`-tyyppisenä eikä muutu kokonaisluvuksi: numero on
-- tunniste jota näytetään, ei laskettava arvo, ja tekstinä siihen voi
-- myöhemmin lisätä esim. vuosiluvun ilman tyyppimuutosta.
--
-- Olemassa olevat rivit siivotaan samalla, jottei kannassa ole kahta eri
-- muotoa rinnakkain. HUOM: jos vanhasta varauksesta on jo lähetetty
-- vahvistusposti, siinä lukee vielä vanha "TK-…"-muoto.
--
-- Ajetaan: npx supabase db query --linked --file tiiviskoti-crm/db/006_job_number_no_prefix.sql
-- Idempotentti.
-- =============================================================

alter table tk.jobs
  alter column job_number
  set default to_char(nextval('tk.job_number_seq'), 'FM0000');

update tk.jobs
   set job_number = substring(job_number from 4)
 where job_number like 'TK-%';
