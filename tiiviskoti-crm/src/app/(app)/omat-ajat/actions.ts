'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { oletusAjat } from '@/lib/saatavuus';

/* =========================================================
   Asentaja ilmoittaa omat työpäivänsä.

   OIKEUS ON RAJATTU OMIIN KALENTEREIHIN. Asentaja saa muuttaa vain
   niitä kalentereita joiden takana on hän itse; toimisto saa muuttaa
   kaikkia. Tarkistus tehdään kyselyssä eikä käyttöliittymässä, koska
   lomakkeen piilokenttä on vain ehdotus.

   MIKSI POISTA-JA-LISÄÄ EIKÄ UPSERT: `tk.calendar_exceptions`illa ei ole
   uniikkirajoitetta (kalenteri, päivä) — sama päivä voi laillisesti
   sisältää useita lisäaikoja. Tämä sivu käsittelee päivää kuitenkin
   yhtenä valintana, joten päivän vanhat rivit poistetaan ensin. Muuten
   "poissa" jäisi vanhan "töissä"-rivin alle ja päivä näyttäisi
   molemmilta yhtä aikaa.
   ========================================================= */

/* Toiminnot ovat tavallisia lomaketoimintoja ilman paluuarvoa: sivu
   piirtää päivän tilan uudelleen heti, ja se on parempi kuittaus kuin
   teksti lomakkeen alla. Epäkelpo syöte ei tee mitään. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Heittää jos kalenteri ei ole kirjautuneen oma (toimisto saa kaikki). */
async function saaMuokata(calendarId: string): Promise<boolean> {
  const staff = await requireStaff();
  if (staff.role !== 'installer') return true;
  const [rivi] = await sql<{ id: string }[]>`
    select id from tk.calendars where id = ${calendarId} and staff_id = ${staff.id}
  `;
  return !!rivi;
}

async function tyhjennaPaiva(calendarId: string, date: string) {
  await sql`
    delete from tk.calendar_exceptions
     where calendar_id = ${calendarId} and date = ${date}::date
  `;
}

export async function merkitseTyossa(formData: FormData): Promise<void> {
  const calendarId = String(formData.get('calendarId') ?? '');
  const date = String(formData.get('date') ?? '');
  if (!DATE.test(date)) return;
  if (!(await saaMuokata(calendarId))) return;

  /* Kellonajat ovat PAKOLLISET. Kellonajaton lisäaikarivi näyttää
     kalenterissa oikealta mutta varauslogiikka ohittaa sen, jolloin
     päivä ei tuota yhtään varattavaa aikaa. Jos lomake ei anna aikoja,
     otetaan henkilön omat vakioajat. */
  const annettuAlku = String(formData.get('alku') ?? '');
  const annettuLoppu = String(formData.get('loppu') ?? '');
  let alku = annettuAlku;
  let loppu = annettuLoppu;
  if (!TIME.test(alku) || !TIME.test(loppu)) {
    const oletus = await oletusAjat(calendarId);
    alku = oletus.alku;
    loppu = oletus.loppu;
  }
  if (loppu <= alku) return;

  await tyhjennaPaiva(calendarId, date);
  await sql`
    insert into tk.calendar_exceptions (calendar_id, date, kind, start_time, end_time)
    values (${calendarId}, ${date}::date, 'open', ${alku}, ${loppu})
  `;
  revalidatePath('/omat-ajat');
  revalidatePath('/saatavuus');
  return;
}

export async function merkitsePoissa(formData: FormData): Promise<void> {
  const calendarId = String(formData.get('calendarId') ?? '');
  const date = String(formData.get('date') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!DATE.test(date)) return;
  if (!(await saaMuokata(calendarId))) return;

  /* Poissaolo kirjataan koko päivälle: osittainen poissaolo tehdään
     merkitsemällä päivä työpäiväksi lyhyemmillä kellonajoilla. Kaksi
     tapaa sanoa sama asia tekisi sivusta arvattavan. */
  await tyhjennaPaiva(calendarId, date);
  await sql`
    insert into tk.calendar_exceptions (calendar_id, date, kind, note)
    values (${calendarId}, ${date}::date, 'closed', ${note})
  `;
  revalidatePath('/omat-ajat');
  revalidatePath('/saatavuus');
  return;
}

export async function poistaMerkinta(formData: FormData) {
  const calendarId = String(formData.get('calendarId') ?? '');
  const date = String(formData.get('date') ?? '');
  if (!DATE.test(date)) return;
  if (!(await saaMuokata(calendarId))) return;
  await tyhjennaPaiva(calendarId, date);
  revalidatePath('/omat-ajat');
  revalidatePath('/saatavuus');
}

/** Koko viikko kerralla työpäiviksi — arki ma–pe, ei viikonloppua. */
export async function merkitseViikko(formData: FormData): Promise<void> {
  const calendarId = String(formData.get('calendarId') ?? '');
  const paivat = String(formData.get('paivat') ?? '').split(',').filter((d) => DATE.test(d));
  if (!paivat.length) return;
  if (!(await saaMuokata(calendarId))) return;

  const { alku, loppu } = await oletusAjat(calendarId);
  for (const date of paivat) {
    await tyhjennaPaiva(calendarId, date);
    await sql`
      insert into tk.calendar_exceptions (calendar_id, date, kind, start_time, end_time)
      values (${calendarId}, ${date}::date, 'open', ${alku}, ${loppu})
    `;
  }
  revalidatePath('/omat-ajat');
  revalidatePath('/saatavuus');
  return;
}
