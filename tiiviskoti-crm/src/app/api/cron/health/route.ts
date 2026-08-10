import { runGoogleHealthCheck } from '@/lib/health';

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
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
