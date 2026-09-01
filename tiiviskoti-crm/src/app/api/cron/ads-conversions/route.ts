import { sendPendingConversions, sendPendingLeadConversions } from '@/lib/ads-sync';

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

  /* Työt ja liidit peräkkäin samassa ajossa, mutta erillisinä tuloksina.

     MIKSI SAMA REITTI: molemmat vievät samaa dataa samaan tiliin samalla
     tunnuksella, ja kahden cronin ylläpito eriyttäisi ne toisistaan ilman
     hyötyä. MIKSI ERILLISET TULOKSET: liidien konfiguraatio voi puuttua
     (oma konversiotapahtuma) ilman että töiden vienti on rikki — ja
     päinvastoin. Yksi yhteinen luku peittäisi kumman tahansa vian. */
  const jobs = await sendPendingConversions();
  const leads = await sendPendingLeadConversions();

  /* Puuttuva liidiasetus EI ole virhe vaan asennustila: se ei saa värjätä
     cron-näkymää punaiseksi joka yö ennen kuin muuttuja on asetettu. */
  const jobsOk = !jobs.error && jobs.failed === 0;
  const leadsOk = leads.configured ? (!leads.error && leads.failed === 0) : true;
  return Response.json({ jobs, leads }, { status: jobsOk && leadsOk ? 200 : 500 });
}
