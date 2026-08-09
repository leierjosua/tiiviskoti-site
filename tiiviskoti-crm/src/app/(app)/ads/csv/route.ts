import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { toAdsCsv, type ConversionRow } from './format';

/* Adsin konversiotuontiin kelpaava CSV. Sama oikeustarkistus kuin sivulla:
   requireManager ohjaa kirjautumiseen tai etusivulle, joten tiedostoa ei saa
   ulos ilman istuntoa. */

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireManager();

  /* Vain peruuttamattomat. Peruttu varaus ei ole kauppa eikä sitä raportoida
     Googlelle — sama sääntö kuin sivun summissa. */
  const rows = await sql<ConversionRow[]>`
    select gclid, created_at, price_cents
      from tk.jobs
     where gclid is not null and status <> 'cancelled'
     order by created_at
  `;

  const paiva = new Date().toISOString().slice(0, 10);

  return new Response(toAdsCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ads-konversiot-${paiva}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
