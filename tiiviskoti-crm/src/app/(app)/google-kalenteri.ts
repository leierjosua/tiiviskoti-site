'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/session';
import { googleConfigured } from '@/lib/google';
import { linkStaffGoogleCalendar } from '@/lib/staff-calendar';

export type OwnCalendarState = { error?: string; ok?: string };

/* Asentaja linkittää itse oman TiivisKoti-kalenterinsa asennusnäkymästä.
   Kohde on aina kirjautunut henkilö itse — lomakkeelta ei lueta id:tä,
   joten toisen puolesta ei voi lähettää jakoa. Toimisto tekee saman
   kenelle tahansa työntekijäsivulta. */
export async function linkOwnGoogleCalendar(): Promise<OwnCalendarState> {
  const me = await requireStaff();
  if (!googleConfigured()) return { error: 'Google-yhteys ei ole käytössä.' };

  try {
    const r = await linkStaffGoogleCalendar(me.id);
    revalidatePath('/');
    return {
      ok: `Linkki lähetetty osoitteeseen ${me.email}. Avaa Googlen viesti ja paina "Lisää tämä kalenteri".`
        + (r.failed > 0 ? ` (${r.failed} keikan siirto epäonnistui — kerro toimistolle.)` : ''),
    };
  } catch (e) {
    console.error('linkOwnGoogleCalendar:', me.id, e instanceof Error ? e.message : e);
    return { error: e instanceof Error ? e.message : 'Linkitys epäonnistui.' };
  }
}
