import { runGoogleHealthCheck } from '@/lib/health';
import { sql } from '@/lib/db';

/* =========================================================
   Päivittäinen kuntotarkistus (Vercel Cron, ks. vercel.json).

   Tarkistaa että Google-yhteys on oikeasti käytettävissä, ennen kuin
   seuraava asiakas ehtii varata. Ilman tätä rikkoutunut token paljastuu
   vasta kun joku on jo jäänyt ilman vahvistusta.

   MIKSI 500 VIRHEESTÄ: onnistunut ajo on tässä vasta puolet tiedosta.
   Kun tarkistus epäonnistuu, sähköpostikanava on määritelmän mukaan poikki
   eikä varoitusta voi lähettää — virhekoodi jättää jäljen Vercelin
   cron-näkymään, joka ei ole Googlesta riippuvainen. Toinen kanava samaan
   asiaan on adminin etusivun varoitus.
   ========================================================= */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  /* Vercel Cron lähettää `Authorization: Bearer $CRON_SECRET`. Ilman
     salaisuutta reitti ei ole auki lainkaan: se tekee ulkoisia kutsuja
     Googleen, joten kuka tahansa voisi ajaa sitä loputtomasti. */
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await runGoogleHealthCheck();

  /* Voimassaolonsa ohittaneet tarjoukset "Vanhentunut"-tilaan samassa
     päivittäisessä ajossa. Ilman tätä "Lähetetty" sisälsi viikkoja vanhoja
     tarjouksia (8.10.2026: 10 / 32), eikä avointen tarjousten määrä tai
     hyväksymisaste kertonut mitään. Vanhentunut ei ole lopullinen: jos
     asiakas tarttuu siihen myöhemmin, työn luonti merkitsee sen
     hyväksytyksi. Ei vaikuta paluukoodiin — tämä ei ole kuntotarkistus. */
  let offersExpired: number | string = 0;
  try {
    const r = await sql`
      update tk.offers set status = 'expired'
       where status = 'sent' and valid_until < current_date
    `;
    offersExpired = r.count;
  } catch (e) {
    offersExpired = `virhe: ${String(e).slice(0, 120)}`;
  }

  return Response.json({ ...result, offersExpired }, { status: result.ok ? 200 : 500 });
}
