import { importMetaLeads } from '@/lib/meta-leads';

/* =========================================================
   Metan liidimainosten liidien tuonti (Vercel Cron, ks. vercel.json).

   MIKSI AJASTETTUNA: liidi vanhenee nopeasti — soitto samana päivänä
   ratkaisee kaupan. Ajo on kevyt ja itsekorjaava, joten se kannattaa
   tehdä tiheästi eikä kerran vuorokaudessa.

   MIKSI 500 VIRHEESTÄ: sama syy kuin muissa cron-reiteissä. Hiljainen
   epäonnistuminen näyttäisi Vercelin cron-näkymässä onnistuneelta, ja
   liidit jäisivät huomaamatta Metaan.
   ========================================================= */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await importMetaLeads();
  return Response.json(result, { status: result.error ? 500 : 200 });
}
