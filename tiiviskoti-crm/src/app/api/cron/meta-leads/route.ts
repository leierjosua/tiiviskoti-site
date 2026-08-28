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

/* Kaksi hyväksyttyä tunnusta.

   CRON_SECRET on Vercelin oma: se lisää otsikon automaattisesti vercel.jsonin
   ajoihin. LEADS_PING_TOKEN on erillinen tunnus ulkoiselle herättäjälle
   (GitHub Actions), joka ajaa tämän varttitunnein — Vercelin Hobby-tili
   sallii vain päivittäisen ajon, ja vuorokauden vanha liidi on kylmä.

   MIKSI OMA TUNNUS EIKÄ CRON_SECRET: jaettu tunnus jouduttaisiin viemään
   GitHubiin, ja sen vuotaminen avaisi kaikki ajastetut reitit. Tämä tunnus
   avaa vain liidien haun, jonka pahin väärinkäyttö on turha Meta-kysely. */
export async function GET(request: Request) {
  const annettu = request.headers.get('authorization');
  const sallitut = [process.env.CRON_SECRET, process.env.LEADS_PING_TOKEN]
    .filter((t): t is string => !!t)
    .map((t) => `Bearer ${t}`);
  if (!sallitut.length || !annettu || !sallitut.includes(annettu)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await importMetaLeads();
  return Response.json(result, { status: result.error ? 500 : 200 });
}
