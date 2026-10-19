-- =============================================================
-- Kohdetiedot — asiakkaan oma esitieto ennen keikkaa.
--
-- Heti varauksen jälkeen asiakas saa kyselyn: kuvat yhdestä ikkunasta
-- ja ovesta (sisältä, tiivisteestä, ulkoa), montako puitetta, mitkä
-- puitteet tiivistetään, onko karmissa ura. Linkki on myös
-- varausvahvistuksessa, jos asiakas vastaa myöhemmin.
--
-- MIKSI: asentaja tietää etukäteen mitä profiilia ja kuinka paljon
-- tiivistettä otetaan mukaan, ja TYÖN LAAJUUS (mitkä puitteet) on
-- kirjattu asiakkaan omin sanoin ennen käyntiä — ei muistin varassa
-- jälkikäteen.
--
-- Yksi kysely per työ. Linkki = satunnainen `token`, ei työn numeroa:
-- numero on arvattava (TK-1046 → TK-1047), token ei.
--
-- Vastaukset jsonb:nä, koska kysymykset muuttuvat ja vanhojen
-- vastausten pitää yhä näkyä. Kuvat menevät tavalliseen
-- tk.job_photos-tauluun (kuvateksti "Asiakas: …"), jolloin ne näkyvät
-- työn sivulla ilman erillistä näkymää.
--
-- Ajetaan: Supabasen SQL-editorissa (postgres-roolilla).
-- `tk_app` EI voi luoda tauluja skeemaan tk (42501).
-- Idempotentti. Koodi toimii ilman tätä: kysely vain puuttuu.
-- =============================================================

create table if not exists tk.job_surveys (
  job_id        uuid primary key references tk.jobs(id) on delete cascade,
  token         text not null unique,
  answers       jsonb not null default '{}'::jsonb,
  -- Asiakas painoi "Lähetä". Ennen sitä vastaukset ovat välitallennuksia.
  submitted_at  timestamptz,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on table tk.job_surveys is
  'Asiakkaan kohdetiedot ennen keikkaa (kysely varauksen jälkeen). Kuvat tk.job_photos-taulussa.';

grant select, insert, update, delete on tk.job_surveys to tk_app;
