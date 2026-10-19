'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/session';
import { confirmManually } from '@/lib/kartoitus';

/** Toimisto merkitsee tarjouksen vahvistetuksi käsin, kun asiakas vastasi
 *  uutena viestinä, eri osoitteesta tai soitti. Tallentuu kuka merkitsi. */
export async function confirmOfferManually(formData: FormData) {
  const staff = await requireStaff();
  const offerId = String(formData.get('offerId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) return;
  await confirmManually(offerId, staff.fullName);
  revalidatePath('/kartoitus');
  revalidatePath('/tarjoukset');
  const back = String(formData.get('back') ?? '');
  if (back.startsWith('/')) revalidatePath(back);
}
