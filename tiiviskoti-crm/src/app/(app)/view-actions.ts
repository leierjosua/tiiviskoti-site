'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/session';
import { VIEW_COOKIE, type ViewMode } from '@/lib/view';

/* Polut jotka asennusnäkymässä on olemassa. Jos näkymää vaihdetaan
   toimiston omalta sivulta (liidit, mainokset…), sinne ei voi jäädä —
   valikossa ei olisi enää linkkiä takaisin. */
const ASENNUS_PATHS = ['/', '/kalenteri', '/tyot', '/asiakkaat'];

/** Paluuosoite selaimelta on syötettä: sallitaan vain oman sivuston polku. */
function safePath(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/**
 * Vaihda näkymää toimiston ja asennuksen välillä.
 *
 * Asentaja ei voi vaihtaa: hänelle asennusnäkymä ei ole valinta vaan ainoa
 * näkymä johon hänellä on oikeus. Tarkistus on täällä eikä pelkässä
 * käyttöliittymässä, koska nappi voi puuttua mutta pyyntö silti tulla.
 *
 * Lopuksi uudelleenohjaus samalle sivulle. `revalidatePath` yksinään ei
 * riitä: se mitätöi välimuistin, mutta selaimen puu päivittyy vasta kun
 * reititin hakee sen — ja siihen asti ruudulla näkyy vanha näkymä, jolloin
 * napin painaminen näyttää siltä ettei se tehnyt mitään. Uudelleenohjaus
 * pakottaa navigoinnin, joten vaihto näkyy heti.
 */
export async function setViewMode(mode: ViewMode, returnTo: string) {
  const staff = await requireStaff();
  if (staff.role === 'installer') return;

  (await cookies()).set(VIEW_COOKIE, mode, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  // Näkymä vaihtaa sekä navin että sivun sisällön, joten koko puu on
  // uusittava — pelkkä nykyisen sivun revalidointi jättäisi navin ennalleen.
  revalidatePath('/', 'layout');

  const path = safePath(returnTo);
  const stays = mode === 'toimisto'
    || ASENNUS_PATHS.some((p) => (p === '/' ? path === '/' : path.startsWith(p)));

  redirect(stays ? path : '/');
}
