#!/usr/bin/env node
/* =========================================================
   Uusi asentaja: tunnus, kalenteri ja vapaat päivät yhdellä ajolla.

   Adminissa sama vaatii neljä eri näkymää (Työntekijät -> salasana ->
   Kalenterit -> Työajat), ja viimeinen on käsityötä yksi päivä kerrallaan.
   Kahdenkymmenen päivän naputtelu käsin on se kohta jossa yksi päivä jää
   kirjaamatta — eikä puuttuva päivä näy mitenkään, se vain ei tule
   varattavaksi.

   EPÄSÄÄNNÖLLINEN SAATAVUUS = PELKKIÄ `open`-POIKKEUKSIA, EI VIIKKOTUNTEJA.
   Jos asentaja tekee vain sovittuja päiviä, `tk.calendar_hours` jätetään
   tyhjäksi ja jokainen työpäivä kirjataan omana `open`-poikkeuksenaan.
   Viikkotunnit avaisivat KAIKKI arkipäivät, jolloin tekijälle voisi tulla
   varaus päivälle jota hän ei ole ilmoittanut. Sama kaava kuin Akselilla,
   Eeliksellä ja Joelilla.

   ⚠ KELLONAJAT ON PAKKO ANTAA. `open`-poikkeus ilman `start_time`/
   `end_time`-arvoja OHITETAAN saatavuuslaskennassa: päivä näyttää
   adminissa kirjatulta muttei tuota yhtään vapaata aikaa.

   KALENTERI LUODAAN VAIKKA PÄIVIÄ EI OLISI. Tekijä valitaan työn
   "Tekijät"-kortissa kalenterin perusteella, joten ilman kalenteria
   asentajaa ei voi laittaa keikalle lainkaan. Päivätön kalenteri ei
   tarjoa julkisia aikoja — mikä on oikein: hän ei ole varattavissa ennen
   kuin päivät on ilmoitettu.

   Käyttö:
     ASENTAJA_NIMI="Etu Suku" ASENTAJA_EMAIL=etu@esimerkki.fi \
       node scripts/lisaa-asentaja.mjs                      # näyttää
     ... node scripts/lisaa-asentaja.mjs --apply            # tekee

   Päivät valinnaisena, pilkulla eroteltuna. Oletus 08:00–16:00, oman
   kellonajan saa kaksoispisteellä:
     ASENTAJA_PAIVAT="2026-09-28,2026-09-30:08:00-14:00"
   ========================================================= */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(HERE, '..', '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

/* ---------- Syöte ---------- */

const NIMI = (process.env.ASENTAJA_NIMI || '').trim();
const EMAIL = (process.env.ASENTAJA_EMAIL || '').trim().toLowerCase();
/* Supabasen minimipituus on 6 merkkiä, joten '0000' ei kelpaa — siihen on
   jo kertaalleen kaaduttu. */
const SALASANA = process.env.ASENTAJA_SALASANA || '000000';
const OLETUS_ALKU = '08:00';
const OLETUS_LOPPU = '16:00';

/* Kalenterin asetukset kopioitu muilta asentajilta sellaisenaan, jotta
   uusi tekijä käyttäytyy varauspolussa täsmälleen samoin. */
const KALENTERI = {
  name: 'Asennukset, Uusimaa',
  slot_minutes: 150,
  lead_time_hours: 12,
  horizon_days: 36,
};

const APPLY = process.argv.includes('--apply');
const VP = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];

/** "2026-09-30:08:00-14:00" | "2026-09-28" -> {date, alku, loppu} */
function parsePaiva(s) {
  const t = s.trim();
  if (!t) return null;
  const i = t.indexOf(':');
  if (i === -1) return { date: t, alku: OLETUS_ALKU, loppu: OLETUS_LOPPU };
  const date = t.slice(0, i);
  const [alku, loppu] = t.slice(i + 1).split('-');
  return { date, alku: (alku || '').trim(), loppu: (loppu || '').trim() };
}

const PAIVAT = (process.env.ASENTAJA_PAIVAT || '')
  .split(',').map(parsePaiva).filter(Boolean);

const sql = postgres(env.DATABASE_URL, {
  prepare: false, ssl: 'require', max: 2, idle_timeout: 5, transform: { undefined: null },
});

/* ---------- Tarkistukset ennen kirjoitusta ---------- */

const virheet = [];
if (!NIMI) virheet.push('ASENTAJA_NIMI puuttuu');
/* Sähköposti on sekä tk.staff.email (NOT NULL) että kirjautumistunnus.
   Keksitty osoite tuottaisi tunnuksen jolla ei voi kirjautua, joten
   tähän ei ole oletusarvoa eikä placeholderia. */
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(EMAIL)) virheet.push('ASENTAJA_EMAIL puuttuu tai ei ole kelvollinen');

const nahdyt = new Set();
for (const p of PAIVAT) {
  if (nahdyt.has(p.date)) virheet.push(`${p.date} on listassa kahdesti`);
  nahdyt.add(p.date);
  const d = new Date(`${p.date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) { virheet.push(`${p.date} ei ole kelvollinen päivä`); continue; }
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) virheet.push(`${p.date} on viikonloppu (${VP[d.getUTCDay()]})`);
  if (d < new Date(new Date().toISOString().slice(0, 10))) virheet.push(`${p.date} on menneisyydessä`);
  if (!/^\d{2}:\d{2}$/.test(p.alku) || !/^\d{2}:\d{2}$/.test(p.loppu)) virheet.push(`${p.date}: kellonaika puuttuu tai on virheellinen`);
  else if (p.loppu <= p.alku) virheet.push(`${p.date}: loppuaika ei ole alkuajan jälkeen`);
}

if (virheet.length) {
  console.error('\nVIRHE:\n  ' + virheet.join('\n  ') + '\n');
  await sql.end();
  process.exit(1);
}

const [onJo] = await sql`select id, full_name from tk.staff where lower(email) = ${EMAIL}`;

/* ---------- Näytä ---------- */

console.log(`\nUusi asentaja — ${APPLY ? 'TEHDÄÄN' : 'KUIVAHARJOITTELU (ei kirjoiteta)'}\n`);
console.log(`  nimi        : ${NIMI}`);
console.log(`  sähköposti  : ${EMAIL}`);
console.log(`  salasana    : ${SALASANA}`);
console.log(`  rooli       : installer`);
console.log(`  kalenteri   : ${KALENTERI.name} (${KALENTERI.slot_minutes} min, lead ${KALENTERI.lead_time_hours} h, horisontti ${KALENTERI.horizon_days} työpäivää)`);
console.log(`  alue        : Uusimaa`);
console.log(`  viikkotunnit: ei — pelkkiä open-poikkeuksia`);
if (onJo) console.log(`\n  HUOM: ${EMAIL} on jo olemassa (${onJo.full_name}) — staff-riviä ei luoda uudelleen`);

if (PAIVAT.length === 0) {
  console.log(`\n  Vapaita päiviä ei annettu. Kalenteri syntyy tyhjänä: asentaja voidaan
  valita työn Tekijät-korttiin, mutta hän EI näy verkon varauskalenterissa
  ennen kuin päivät ilmoitetaan.\n`);
} else {
  let tunnit = 0;
  console.log('\n  Vapaat päivät:');
  for (const p of PAIVAT) {
    const d = new Date(`${p.date}T12:00:00Z`);
    const h = (Number(p.loppu.slice(0, 2)) * 60 + Number(p.loppu.slice(3)) - Number(p.alku.slice(0, 2)) * 60 - Number(p.alku.slice(3))) / 60;
    tunnit += h;
    console.log(`    ${p.date}  ${VP[d.getUTCDay()]}  ${p.alku}–${p.loppu}  (${h} h)`);
  }
  console.log(`\n  ${PAIVAT.length} päivää, ${tunnit} h, ${PAIVAT[0].date} – ${PAIVAT[PAIVAT.length - 1].date}\n`);
}

if (!APPLY) {
  console.log('Tee oikeasti: lisää --apply\n');
  await sql.end();
  process.exit(0);
}

/* ---------- Kirjoita ---------- */

const [alue] = await sql`select id from tk.areas where name = 'Uusimaa'`;
if (!alue) { console.error('Aluetta "Uusimaa" ei löydy tk.areas-taulusta'); await sql.end(); process.exit(1); }

const { staffId, calendarId } = await sql.begin(async (tx) => {
  const [s] = onJo
    ? [onJo]
    : await tx`
        insert into tk.staff (email, full_name, role)
        values (${EMAIL}, ${NIMI}, 'installer')
        returning id
      `;

  const [c] = await tx`
    insert into tk.calendars (staff_id, name, slot_minutes, lead_time_hours, horizon_days)
    values (${s.id}, ${KALENTERI.name}, ${KALENTERI.slot_minutes}, ${KALENTERI.lead_time_hours}, ${KALENTERI.horizon_days})
    returning id
  `;
  await tx`insert into tk.calendar_areas (calendar_id, area_id) values (${c.id}, ${alue.id})`;

  const note = `Ilmoitettu ${new Date().toLocaleDateString('fi-FI', { timeZone: 'Europe/Helsinki' })}`;
  for (const p of PAIVAT) {
    await tx`
      insert into tk.calendar_exceptions (calendar_id, date, kind, start_time, end_time, note)
      values (${c.id}, ${p.date}::date, 'open', ${p.alku}, ${p.loppu}, ${note})
    `;
  }
  return { staffId: s.id, calendarId: c.id };
});

console.log(`  tk.staff      ${staffId}`);
console.log(`  tk.calendars  ${calendarId}`);

/* Kirjautumistunnus. `email_confirm: true`, koska osoite on jo tiedossa
   eikä asentajalle lähetetä vahvistuspostia — sama kuin adminin oma polku.
   `user_id` jätetään tarkoituksella tyhjäksi: se sitoutuu itsestään kun
   asentaja kirjautuu ensimmäisen kerran. */
const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: EMAIL, password: SALASANA, email_confirm: true }),
});
const j = await r.json();
if (j.id) console.log(`  auth-käyttäjä ${j.id}  (salasana ${SALASANA})`);
else console.log(`  auth-käyttäjän luonti: ${JSON.stringify(j).slice(0, 200)}`);

const [tark] = await sql`
  select (select count(*)::int from tk.calendar_exceptions where calendar_id = ${calendarId}) as poikkeuksia,
         (select count(*)::int from tk.calendar_hours where calendar_id = ${calendarId}) as viikkotunteja,
         (select count(*)::int from tk.calendar_areas where calendar_id = ${calendarId}) as alueita
`;
console.log(`\n  tarkistus: ${tark.poikkeuksia} poikkeusta, ${tark.viikkotunteja} viikkotuntiriviä, ${tark.alueita} alue\n`);

await sql.end();
