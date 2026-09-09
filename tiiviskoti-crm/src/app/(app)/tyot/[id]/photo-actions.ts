'use server';

import { revalidatePath } from 'next/cache';
import { ownsJob, requireStaff } from '@/lib/session';
import { photoJobId, removeJobPhoto, saveJobPhoto, setJobPhotoCaption } from '@/lib/photos';

/* =========================================================
   Työn kuvien palvelinactionit.

   Oikeus on sama kuin työn sivulla: asentaja saa käsitellä vain omiensa
   kuvia. Tarkistus on tehtävä TÄSSÄ eikä pelkästään sivulla — action on
   oma päätepisteensä, jonka voi kutsua ohi käyttöliittymän.

   Kuvaaminen kuuluu nimenomaan asentajalle: hän on se joka seisoo
   paikan päällä kartoituskäynnillä. Siksi tämä ei ole `requireManager`.
   ========================================================= */

export type PhotoState = { error?: string; ok?: string };

export async function uploadJobPhotos(
  _prev: PhotoState, formData: FormData,
): Promise<PhotoState> {
  const staff = await requireStaff();
  const jobId = String(formData.get('jobId') ?? '');
  if (!(await ownsJob(staff, jobId))) return { error: 'Työtä ei löytynyt.' };

  const files = formData.getAll('kuvat').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: 'Valitse ainakin yksi kuva.' };

  /* Yksi epäonnistunut kuva ei saa kaataa muita: kymmenen kuvan erästä
     yksi HEIC-jättiläinen jättäisi loputkin lataamatta. Viat kerätään
     ja kerrotaan yhdessä. */
  const viat: string[] = [];
  let onnistui = 0;
  for (const file of files) {
    const virhe = await saveJobPhoto(jobId, file, staff.id);
    if (virhe) viat.push(virhe); else onnistui++;
  }

  revalidatePath(`/tyot/${jobId}`);
  if (viat.length > 0) {
    return { error: viat.join(' '), ok: onnistui > 0 ? `${onnistui} kuvaa tallennettu.` : undefined };
  }
  return { ok: `${onnistui} kuva${onnistui === 1 ? '' : 'a'} tallennettu.` };
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
