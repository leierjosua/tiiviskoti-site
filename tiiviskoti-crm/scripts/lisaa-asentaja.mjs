#!/usr/bin/env node
/* =========================================================
   Uusi asentaja: tunnus, kalenteri ja vapaat päivät yhdellä ajolla.

   Adminissa sama vaatii neljä eri näkymää (Työntekijät -> salasana ->
   Kalenterit -> Työajat), ja viimeinen on käsityötä yksi päivä kerrallaan.
   Kahdenkymmenen päivän naputtelu käsin on se kohta jossa yksi päivä jää
   kirjaamatta — ja puuttuva päivä ei näy mitenkään, se vain ei tule
   varattavaksi.

   EPÄSÄÄNNÖLLINEN SAATAVUUS = PELKKIÄ `open`-POIKKEUKSIA, EI VIIKKOTUNTEJA.
   Jos asentaja tekee vain sovittuja päiviä, `tk.calendar_hours` jätetään
   tyhjäksi ja jokainen työpäivä kirjataan omana `open`-poikkeuksenaan.
   Sama kaava kuin Akselilla ja Eeliksellä.

   ⚠ KELLONAJAT ON PAKKO ANTAA. `open`-poikkeus ilman `start_time`/
   `end_time`-arvoja OHITETAAN saatavuuslaskennassa: päivä näyttää
   kirjatulta adminissa muttei tuota yhtään vapaata aikaa.

   Aja repon juuresta tai tästä kansiosta:
     node scripts/lisaa-asentaja.mjs            # näyttää, ei kirjoita
     node scripts/lisaa-asentaja.mjs --apply    # tekee
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

/* ---------- Mitä luodaan ---------- */

const ASENTAJA = {
  /* Kirjoitusasu: SCHWARZ, ei Schwartz eikä Swarchz. Kaikki kolme olivat
     liikkeellä — pyynnössä luki "Swarchz", arvasin "Schwartz", mutta
     hänen oma sähköpostinsa on `joel.s.schwarz@` eli ilman t:tä. Oma
     osoite on paras saatavilla oleva todiste omasta nimestä. Nimi menee
     asiakkaalle työmääräimessä ja kalenterikutsussa. */
  fullName: 'Joel Schwarz',
  email: process.env.JOEL_EMAIL || '',        // annetaan ajossa
  phone: null,
  /* Sama kuin muilla asentajilla. Supabasen minimipituus on 6 merkkiä,
     joten '0000' ei kelpaa — tämä on jo kertaalleen kaadettu siihen. */
  password: '000000',
};

/* Kalenterin asetukset kopioitu muilta asentajilta sellaisenaan, jotta
   uusi tekijä käyttäytyy varauspolussa täsmälleen samoin. */
const KALENTERI = {
  name: 'Asennukset, Uusimaa',
  slot_minutes: 150,
  lead_time_hours: 12,
  horizon_days: 36,
};

/* Ilmoitetut työpäivät. Oletus 08–16, poikkeukset erikseen. */
const LYHYET = new Set(['2026-09-30', '2026-10-02', '2026-10-14', '2026-10-30']);
/* 25.9. oli listalla alkuperäisessä ilmoituksessa, mutta se ehti mennä
   (tunnus jäi tekemättä sähköpostiosoitteen puuttuessa). Mennyt
   `open`-poikkeus ei tuota vapaita aikoja eikä ole työkirjaus, joten se
   olisi pelkkää harhaanjohtavaa riviä kalenterissa. */
const PAIVAT = [
  '2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02',
  '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09',
  '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15',
  '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
  '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
];
const NOTE = 'Ilmoitettu 24.9.2026';

/* Kertaluontoinen lisä: Joel mukaan Ohratien taloyhtiökeikalle.
   Tekijä = oma jobs-rivi samaan `crew_group_id`-ryhmään. Rivi on 0 € ja
   ilman klikkitunnistetta: laskutus, rivit ja Ads-raportointi kuuluvat
   pääriville, eikä sama kauppa saa näkyä liikevaihdossa kahdesti.

   ⚠ KEIKKA OLI 25.9. ELI JO MENNYT. Rivi lisätään vain lipulla
   `--keikka`, ja vain jos Joel oikeasti oli siellä — jälkikäteen
   kirjattu tekijä muuttaa sitä keitä keikalla kerrotaan olleen. */
const KEIKKA = process.argv.includes('--keikka') ? {
  paarivi: '27ce5018-3a17-420a-b997-75e139f27233',   // 1058 Daniel, 4 000 €
  crew: '59c12062-41ff-4631-a9d8-cd0ff8b07028',
} : null;

const APPLY = process.argv.includes('--apply');
const VP = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
const paatos = (p) => (LYHYET.has(p) ? '14:00' : '16:00');

const sql = postgres(env.DATABASE_URL, {
  prepare: false, ssl: 'require', max: 2, idle_timeout: 5, transform: { undefined: null },
});

/* ---------- Tarkistukset ennen kirjoitusta ---------- */

if (!ASENTAJA.email) {
  console.error('\nJOEL_EMAIL puuttuu. Aja esim.:\n  JOEL_EMAIL=joel@esimerkki.fi node scripts/lisaa-asentaja.mjs --apply\n');
  await sql.end();
  process.exit(1);
}

const virheet = [];
const nahdyt = new Set();
for (const p of PAIVAT) {
  if (nahdyt.has(p)) virheet.push(`${p} on listassa kahdesti`);
  nahdyt.add(p);
  const d = new Date(`${p}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) virheet.push(`${p} ei ole kelvollinen päivä`);
  else if (d.getUTCDay() === 0 || d.getUTCDay() === 6) virheet.push(`${p} on viikonloppu (${VP[d.getUTCDay()]})`);
}
if (virheet.length) { console.error('\nVIRHE:\n  ' + virheet.join('\n  ') + '\n'); await sql.end(); process.exit(1); }

const [onJo] = await sql`select id, full_name from tk.staff where lower(email) = ${ASENTAJA.email.toLowerCase()}`;

/* ---------- Näytä ---------- */

let tunnit = 0;
console.log(`\nUusi asentaja — ${APPLY ? 'TEHDÄÄN' : 'KUIVAHARJOITTELU (ei kirjoiteta)'}\n`);
console.log(`  nimi      : ${ASENTAJA.fullName}`);
console.log(`  sähköposti: ${ASENTAJA.email}`);
console.log(`  salasana  : ${ASENTAJA.password}`);
console.log(`  rooli     : installer`);
console.log(`  kalenteri : ${KALENTERI.name} (${KALENTERI.slot_minutes} min, lead ${KALENTERI.lead_time_hours} h, horisontti ${KALENTERI.horizon_days} työpäivää)`);
console.log(`  alue      : Uusimaa`);
console.log(`  viikkotunnit: ei — pelkkiä open-poikkeuksia\n`);
if (onJo) console.log(`  HUOM: ${ASENTAJA.email} on jo olemassa (${onJo.full_name}) — ei luoda uudelleen\n`);
console.log('  Vapaat päivät:');
for (const p of PAIVAT) {
  const d = new Date(`${p}T12:00:00Z`);
  const h = LYHYET.has(p) ? 6 : 8;
  tunnit += h;
  console.log(`    ${p}  ${VP[d.getUTCDay()]}  08:00–${paatos(p)}  (${h} h)`);
}
console.log(`\n  ${PAIVAT.length} päivää, ${tunnit} h, ${PAIVAT[0]} – ${PAIVAT[PAIVAT.length - 1]}\n`);

if (!APPLY) {
  console.log('Tee oikeasti:  JOEL_EMAIL=… node scripts/lisaa-asentaja.mjs --apply\n');
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
        insert into tk.staff (email, full_name, phone, role)
        values (${ASENTAJA.email.toLowerCase()}, ${ASENTAJA.fullName}, ${ASENTAJA.phone}, 'installer')
        returning id
      `;

  const [c] = await tx`
    insert into tk.calendars (staff_id, name, slot_minutes, lead_time_hours, horizon_days)
    values (${s.id}, ${KALENTERI.name}, ${KALENTERI.slot_minutes}, ${KALENTERI.lead_time_hours}, ${KALENTERI.horizon_days})
    returning id
  `;
  await tx`insert into tk.calendar_areas (calendar_id, area_id) values (${c.id}, ${alue.id})`;

  for (const p of PAIVAT) {
    await tx`
      insert into tk.calendar_exceptions (calendar_id, date, kind, start_time, end_time, note)
      values (${c.id}, ${p}::date, 'open', '08:00', ${paatos(p)}, ${NOTE})
    `;
  }
  return { staffId: s.id, calendarId: c.id };
});

console.log(`  tk.staff      ${staffId}`);
console.log(`  tk.calendars  ${calendarId}`);

/* Kirjautumistunnus. `email_confirm: true`, koska osoite on jo tiedossa
   eikä asentajalle lähetetä vahvistuspostia — sama kuin adminin oma
   polku tekee. */
const sb = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SECRET_KEY;
const r = await fetch(`${sb}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ASENTAJA.email.toLowerCase(), password: ASENTAJA.password, email_confirm: true }),
});
const j = await r.json();
if (j.id) console.log(`  auth-käyttäjä ${j.id}  (salasana ${ASENTAJA.password})`);
else console.log(`  auth-käyttäjän luonti: ${JSON.stringify(j).slice(0, 200)}`);

/* user_id jätetään tarkoituksella tyhjäksi: se sitoutuu itsestään kun
   asentaja kirjautuu ensimmäisen kerran. */

/* ---------- Keikalle mukaan ---------- */

if (KEIKKA) {
  const [p] = await sql`
    select job_number, customer_id, starts_at, ends_at, title, address, postal_code, city,
           source, campaign, offer_id
      from tk.jobs where id = ${KEIKKA.paarivi}::uuid
  `;
  if (!p) console.log('\n  HUOM: pääriviä ei löytynyt — keikalle lisäys jäi tekemättä');
  else {
    const [rivi] = await sql`
      insert into tk.jobs (customer_id, calendar_id, starts_at, ends_at, status, title,
                           address, postal_code, city, notes, source, campaign, gclid,
                           price_cents, offer_id, crew_group_id)
      values (${p.customer_id}, ${calendarId}::uuid, ${p.starts_at}, ${p.ends_at}, 'confirmed',
              ${p.title.includes('(työpari)') ? p.title : `${p.title} (työpari)`},
              ${p.address}, ${p.postal_code}, ${p.city},
              ${`Työpari keikalla ${p.job_number} — laskutus ja rivit siellä.`},
              ${p.source}, ${p.campaign}, null, 0, ${p.offer_id}, ${KEIKKA.crew}::uuid)
      returning job_number, starts_at, ends_at
    `;
    const klo = (d) => new Date(d).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Helsinki' });
    console.log(`\n  keikalle mukaan: työ ${rivi.job_number} — ${new Date(rivi.starts_at).toLocaleDateString('fi-FI', { timeZone: 'Europe/Helsinki' })} klo ${klo(rivi.starts_at)}–${klo(rivi.ends_at)} (0 €, ryhmä ${KEIKKA.crew.slice(0, 8)}…)`);
  }
}

const [tark] = await sql`
  select (select count(*)::int from tk.calendar_exceptions where calendar_id = ${calendarId}) as poikkeuksia,
         (select count(*)::int from tk.calendar_hours where calendar_id = ${calendarId}) as viikkotunteja,
         (select count(*)::int from tk.calendar_areas where calendar_id = ${calendarId}) as alueita
`;
console.log(`\n  tarkistus: ${tark.poikkeuksia} poikkeusta, ${tark.viikkotunteja} viikkotuntiriviä, ${tark.alueita} alue\n`);

await sql.end();
