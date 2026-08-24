-- 018: tarjoukset erikseen kuluttajille ja taloyhtiöille + vapaat rivit
--
-- kind erottaa kaksi tarjoustyyppiä. Ne eroavat siinä mitä lomakkeella
-- kysytään ja miten lista ryhmitellään — hinnoittelu on sama katalogi.
-- Oletus 'asiakas', jotta vanhat rivit säilyvät ennallaan.
--
-- contact_name on taloyhtiötä varten: customer_name on taloyhtiön nimi
-- ("As Oy Vihdin Asemanpuisto") ja contact_name se ihminen jolle tarjous
-- lähetetään (isännöitsijä tai hallituksen puheenjohtaja). Kuluttajalla se
-- jää tyhjäksi.
--
-- Vapaat rivit EIVÄT tarvitse omaa saraketta: ne tallentuvat samaan
-- lines-jsonbiin kuin katalogirivit, koska PDF ja sähköposti lukevat
-- rivit sieltä sellaisenaan.

alter table tk.offers add column if not exists kind         text not null default 'asiakas';
alter table tk.offers add column if not exists contact_name text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tk.offers'::regclass and conname = 'offers_kind_chk'
  ) then
    alter table tk.offers add constraint offers_kind_chk check (kind in ('asiakas','taloyhtio'));
  end if;
end $$;

create index if not exists offers_kind_created_idx on tk.offers (kind, created_at desc);
