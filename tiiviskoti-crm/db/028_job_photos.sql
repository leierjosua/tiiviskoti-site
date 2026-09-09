-- =============================================================
-- Työn kuvat — muistiinpano siitä missä oltiin.
--
-- Kartoituskäynnillä nähdään asiat jotka eivät mahdu tarjouksen riveille:
-- mikä ikkuna vuotaa, miltä karmi näyttää, mistä ovesta mennään sisään,
-- missä kerroksessa asunto on. Kun tarjous kirjoitetaan päiviä myöhemmin
-- tai keikka tehdään viikkojen päästä, se tieto on muistin varassa.
--
-- KUVAT OVAT SISÄISIÄ. Ne eivät mene asiakkaalle eivätkä tarjous-PDF:ään.
-- Se on tarkoituksellista: kun kuvaa ei tarvitse ottaa esityskelpoisena,
-- sen uskaltaa ottaa myös sotkusta, ongelmakohdasta ja rappukäytävän
-- ovikoodista. Esityskuva ja muistikuva ovat eri asia.
--
-- MIKSI TYÖHÖN EIKÄ TARJOUKSEEN: kartoituskäynti on työ kalenterissa jo
-- ennen kuin tarjousta on olemassa. Jos kuvat riippuisivat tarjouksesta,
-- niitä ei voisi ottaa juuri sillä hetkellä kun ollaan paikan päällä.
--
-- ITSE TIEDOSTOT ovat Supabase Storagessa yksityisessä ämpärissä
-- `tyokuvat`; tässä on vain polku. Kanta ei ole tiedostovarasto, ja
-- yksityinen ämpäri tarkoittaa ettei kuvaa näe ilman kirjautumista.
--
-- Ajetaan: Supabasen SQL-editorissa (postgres-roolilla).
-- `tk_app` EI voi luoda tauluja skeemaan tk (42501).
-- Idempotentti.
-- =============================================================

create table if not exists tk.job_photos (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references tk.jobs(id) on delete cascade,

  -- Polku ämpärissä, esim. 'job/<uuid>/<uuid>.jpg'. Ei julkinen URL:
  -- ämpäri on yksityinen ja osoite haetaan allekirjoitettuna näyttöhetkellä.
  path        text not null,

  -- Vapaa kuvateksti: "keittiön ikkuna, alakarmi" tai "ovikoodi 1234".
  caption     text,

  -- Kuvien järjestys on merkitsevä: ensimmäinen kertoo mistä mennään
  -- sisään. Ilman tätä järjestys olisi lisäysjärjestys eikä sitä voisi
  -- muuttaa jälkikäteen.
  sort_order  int not null default 0,

  created_at  timestamptz not null default now(),
  created_by  uuid references tk.staff(id) on delete set null
);

-- Sama tiedosto ei saa olla kahdesti: kaksoisklikkaus latauksessa loisi
-- muuten kaksi riviä samaan polkuun.
create unique index if not exists idx_job_photos_path on tk.job_photos(path);

-- Työn sivu hakee aina "tämän työn kuvat järjestyksessä".
create index if not exists idx_job_photos_job on tk.job_photos(job_id, sort_order, created_at);

comment on table tk.job_photos is
  'Työn sisäiset muistikuvat (kartoituskäynti, asennus). Eivät näy asiakkaalle. Tiedostot Supabase Storagen yksityisessä ämpärissä tyokuvat.';
comment on column tk.job_photos.path is
  'Polku ämpärissä tyokuvat. Ei julkinen URL — osoite allekirjoitetaan näyttöhetkellä.';

grant select, insert, update, delete on tk.job_photos to tk_app;
