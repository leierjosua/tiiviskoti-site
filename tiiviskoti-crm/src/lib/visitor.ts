import { createHash } from 'node:crypto';
import { sql } from '@/lib/db';

/* =========================================================
   Anonyymi kävijähash ja kampanjan varakeino.

   Sekä analytiikan vastaanotto (`api/public/track`) että varausten ja
   liidien kampanja-attribuutio laskevat saman hashin. Jos ne laskisivat
   sen eri tavoin, tapahtumaa ei löytyisi kävijän omasta ketjusta eikä
   attribuutio toimisi — hiljaa, ilman virhettä. Siksi yksi toteutus.

   Hash EI tunnista kävijää pysyvästi: se lasketaan IP:stä, selaimesta,
   PÄIVÄSTÄ ja saltista, ja vaihtuu joka yö Suomen ajan mukaan. Raakaa
   IP:tä ei talleteta mihinkään. Ks. tietosuoja.html luku 7.
   ========================================================= */
export function visitorHash(ip: string, ua: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date());
  const salt = process.env.BOOKING_SECRET ?? 'tk-analytics';
  return createHash('sha256').update(`${ip}|${ua}|${day}|${salt}`).digest('hex').slice(0, 32);
}

/* Asiakkaan oikea IP ja selain.

   Varaukset ja liidit tulevat sivuston Vercel-funktiolta palvelimelta
   palvelimelle, joten pyynnön omat otsakkeet kertoisivat funktion — ei
   kävijää. Funktio välittää kävijän tiedot `x-tk-client-*`-otsakkeissa.

   Otsakkeisiin luotetaan VAIN jaetun salaisuuden kanssa: osa reiteistä on
   julkisia, ja ilman tarkistusta kuka tahansa voisi syöttää haluamansa
   kampanjan toisen kävijän piikkiin. Väärä luku on pahempi kuin puuttuva,
   koska sen perusteella ohjataan mainosbudjettia. */
export function clientIdentity(request: Request): { ip: string; ua: string } {
  const secret = process.env.BOOKING_SECRET;
  const trusted = Boolean(secret) && request.headers.get('x-tk-secret') === secret;
  const fwdIp = trusted ? request.headers.get('x-tk-client-ip') : null;
  const fwdUa = trusted ? request.headers.get('x-tk-client-ua') : null;
  const ip = (fwdIp ?? request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'x';
  const ua = fwdUa ?? request.headers.get('user-agent') ?? '';
  return { ip, ua };
}

/* ---------------------------------------------------------------
   Kampanja kävijän omasta tapahtumaketjusta, kun selain ei kertonut sitä.

   MIKSI TÄMÄ ON OLEMASSA: sivusto poimii kampanjan osoiterivistä ja säilöö
   sen `localStorage`iin (`_shared.js`), josta se lähtee mukana. Se pettää
   hiljaa selaimissa joissa tallennustila ei säily — käytännössä Instagramin
   ja Facebookin sovellusselaimissa. Tulos: juuri MAINOKSESTA tulleet
   yhteydenotot menettävät kampanjansa, eli ne joita varten mittari on.
   Todettu 24.8.2026 (työ 1044): analytiikka näki `tk26-video-olohuonekoukku`,
   varaus tallentui ilman kampanjaa.

   Analytiikka ei nojaa tallennustilaan lainkaan — se lukee kampanjan
   osoiterivistä joka sivulatauksella. Sama kävijähash syntyy uudelleen
   tässä, joten tapahtuma voidaan yhdistää kävijän käyntiin ilman evästeitä.

   ENSIMMÄINEN VOITTAA, sama sääntö kuin selaimessa: kaupan ansaitsee se
   mainos joka toi kävijän sivustolle.

   RAJAT, jotka on hyvä tietää lukuja katsoessa:
   - Hash vaihtuu keskiyöllä, joten tämä kattaa vain saman päivän. Useamman
     päivän harkinta jää `localStorage`in varaan, kuten ennenkin.
   - Jos kävijä on estänyt `_analytics.js`:n, tapahtumia ei ole eikä
     varakeinoa. Silloin kampanja jää tyhjäksi kuten ennenkin.
   Kumpikaan ei ole regressio: ilman tätä tulos olisi tyhjä joka kerta.
--------------------------------------------------------------- */
export async function campaignFromVisitorTrail(request: Request): Promise<string | null> {
  try {
    const { ip, ua } = clientIdentity(request);
    if (ip === 'x' && !ua) return null;
    const [row] = await sql<{ campaign: string | null }[]>`
      select campaign from tk.web_events
       where visitor_hash = ${visitorHash(ip, ua)} and campaign is not null
       order by ts asc limit 1
    `;
    return row?.campaign ?? null;
  } catch (e) {
    /* Mittari ei saa koskaan kaataa varausta tai liidiä — sama periaate kuin
       gclidillä ja Meta CAPIlla. Kirjataan ja jatketaan ilman kampanjaa. */
    console.error('kampanjan haku kävijäketjusta epäonnistui', e);
    return null;
  }
}

/* Metan klikkitunniste kävijän tapahtumaketjusta.

   Sama ongelma ja sama ratkaisu kuin kampanjalla yllä, mutta eri vastaanottaja:
   tätä ei tallenneta työlle vaan se palautetaan sivuston funktiolle, joka
   liittää sen Metan CAPI-tapahtumaan. Ilman `fbc`:tä Meta ei osaa liittää
   ostosta oikeaan mainokseen, jolloin Purchase-optimointi ajaa sokkona.

   TUOREIN VOITTAA, toisin kuin kampanjalla: kampanjassa kunnia kuuluu
   ensimmäiselle kosketukselle, mutta `fbc` on tekninen klikkitunniste ja Meta
   odottaa sen vastaavan sitä klikkiä josta kauppa syntyi. Sama sääntö kuin
   selaimessa (`_shared.js`: "TUOREIN klikki voittaa").

   Palauttaa null jos saraketta ei vielä ole (db/019 ajamatta) — silloin
   toimitaan kuten ennenkin eikä mikään huuda. */
export async function fbcFromVisitorTrail(request: Request): Promise<string | null> {
  try {
    const { ip, ua } = clientIdentity(request);
    if (ip === 'x' && !ua) return null;
    const [row] = await sql<{ fbc: string | null }[]>`
      select fbc from tk.web_events
       where visitor_hash = ${visitorHash(ip, ua)} and fbc is not null
       order by ts desc limit 1
    `;
    return row?.fbc ?? null;
  } catch (e) {
    console.error('fbc:n haku kävijäketjusta epäonnistui', e);
    return null;
  }
}
