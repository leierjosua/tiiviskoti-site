import { sendPendingConversions } from '@/lib/ads-sync';

/* =========================================================
   Konversioiden yövienti Google Adsiin (Vercel Cron, ks. vercel.json).

   MIKSI AJASTETTUNA EIKÄ VARAUKSEN YHTEYDESSÄ: peruttua kauppaa ei
   raportoida, ja peruutus tulee yleensä pian varauksen jälkeen. Kun
   lähetys tapahtuu erillään varauspyynnöstä, peruutukset ehtivät karsiutua
   — eikä varauksen valmistuminen jää koskaan odottamaan Adsin rajapintaa.
   Asiakkaan varaus ei saa hidastua eikä epäonnistua siksi että Googlella
   on huono hetki.

   MIKSI 500 VIRHEESTÄ: sama syy kuin kuntotarkistuksessa. Epäonnistunut
   ajo jättää jäljen Vercelin cron-näkymään; ilman virhekoodia hiljainen
   epäonnistuminen näyttäisi onnistuneelta ajolta.
   ========================================================= */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  /* Sama suojaus kuin kuntotarkistuksessa: reitti tekee ulkoisia kutsuja
     ja kirjoittaa kantaan, joten se ei ole auki ilman salaisuutta. */
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await sendPendingConversions();
  const ok = !result.error && result.failed === 0;
  return Response.json(result, { status: ok ? 200 : 500 });
}
