'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/session';
import { sendPendingConversions } from '@/lib/ads-sync';

/**
 * Lähetä lähettämättömät konversiot Adsiin heti, odottamatta yöajoa.
 *
 * MIKSI TÄMÄ ON OLEMASSA VAIKKA CRON AJAA SAMAN: kun mainontaa säädetään,
 * halutaan nähdä luvun menneen perille nyt eikä huomenna — ja jos lähetys
 * on epäonnistunut, korjauksen toimivuus pitää voida todeta heti.
 *
 * Toiminto ei palauta tulosta ruudulle, koska tulos on jo kannassa:
 * onnistuneet saavat lähetysajan ja epäonnistuneet syyn, ja sivu näyttää
 * molemmat. Yksi totuus kahden sijaan.
 */
export async function lahetaKonversiot(): Promise<void> {
  await requireManager();
  await sendPendingConversions();
  revalidatePath('/ads');
}
