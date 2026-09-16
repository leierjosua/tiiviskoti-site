'use server';

import { revalidatePath } from 'next/cache';
import { ownsJob, requireStaff } from '@/lib/session';
import { createPhotoUpload, photoJobId, recordJobPhoto, removeJobPhoto, setJobPhotoCaption } from '@/lib/photos';

/* =========================================================
   Työn kuvien palvelinactionit.

   Oikeus on sama kuin työn sivulla: asentaja saa käsitellä vain omiensa
   kuvia. Tarkistus on tehtävä TÄSSÄ eikä pelkästään sivulla — action on
   oma päätepisteensä, jonka voi kutsua ohi käyttöliittymän.

   Kuvaaminen kuuluu nimenomaan asentajalle: hän on se joka seisoo
   paikan päällä kartoituskäynnillä. Siksi tämä ei ole `requireManager`.
   ========================================================= */

export type PhotoState = { error?: string; ok?: string };

/**
 * Latauslupa yhdelle kuvalle.
 *
 * Kuva EI kulje tämän läpi — selain lataa sen suoraan Storageen. Täältä
 * tulee vain polku ja kertakäyttöinen allekirjoitus. Syy on kova raja:
 * server actionin runko on Next.js:ssä oletuksena 1 MB, ja puhelimen
 * kamerakuva on moninkertainen. Aiemmin iso kuva epäonnistui HILJAA, ilman
 * mitään virheilmoitusta käyttäjälle.
 */
export async function prepareJobPhoto(
  jobId: string, contentType: string,
): Promise<{ error: string } | { path: string; token: string }> {
  const staff = await requireStaff();
  if (!(await ownsJob(staff, jobId))) return { error: 'Työtä ei löytynyt.' };
  return createPhotoUpload(jobId, contentType);
}

/** Kirjaa selaimen lataaman kuvan riviksi. Polun kuuluminen työhön
 *  tarkistetaan `recordJobPhoto`:ssa. */
export async function confirmJobPhoto(
  jobId: string, path: string,
): Promise<PhotoState> {
  const staff = await requireStaff();
  if (!(await ownsJob(staff, jobId))) return { error: 'Työtä ei löytynyt.' };
  const virhe = await recordJobPhoto(jobId, path, staff.id);
  revalidatePath(`/tyot/${jobId}`);
  return virhe ? { error: virhe } : { ok: 'Kuva tallennettu.' };
}

export async function deleteJobPhoto(formData: FormData) {
  const staff = await requireStaff();
  const id = String(formData.get('id') ?? '');
  const jobId = await photoJobId(id);
  if (!jobId || !(await ownsJob(staff, jobId))) return;

  await removeJobPhoto(id);
  revalidatePath(`/tyot/${jobId}`);
}

export async function updateJobPhotoCaption(formData: FormData) {
  const staff = await requireStaff();
  const id = String(formData.get('id') ?? '');
  const jobId = await photoJobId(id);
  if (!jobId || !(await ownsJob(staff, jobId))) return;

  await setJobPhotoCaption(id, String(formData.get('caption') ?? '').slice(0, 200));
  revalidatePath(`/tyot/${jobId}`);
}
