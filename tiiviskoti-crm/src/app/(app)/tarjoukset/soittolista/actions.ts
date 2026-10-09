'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { CALL_RESULTS, type CallResult } from './results';

/**
 * Kirjaa soitto tarjouksesta.
 *
 * Viimeisin tulos sarakkeisiin (listaa varten), koko historia sisäiseen
 * muistiinpanoon — se näkyy tarjouksen sivulla mutta ei asiakkaalle eikä
 * PDF:ssä. "Ei kiinnosta" myös sulkee tarjouksen hylätyksi, jottei se jää
 * odottavan rahan summaan eikä muistutusajo kirjoita hänelle enää.
 */
export async function logOfferCall(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  const result = String(formData.get('result') ?? '') as CallResult;
  if (!id || !(result in CALL_RESULTS)) return;

  const when = new Intl.DateTimeFormat('fi-FI', {
    timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
  const line = `Soitettu ${when}: ${CALL_RESULTS[result]}`;

  await sql`
    update tk.offers
       set last_call_at = now(),
           last_call_result = ${result},
           notes = case when coalesce(notes, '') = '' then ${line} else notes || E'\n' || ${line} end,
           status = case when ${result} = 'declined' then 'declined' else status end
     where id = ${id}
  `;
  revalidatePath('/tarjoukset/soittolista');
  revalidatePath('/tarjoukset');
  revalidatePath(`/tarjoukset/${id}`);
}
