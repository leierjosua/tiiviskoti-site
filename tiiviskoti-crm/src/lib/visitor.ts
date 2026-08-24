import { createHash } from 'node:crypto';

/* =========================================================
   Anonyymi kävijähash — YKSI toteutus, kaksi käyttäjää.

   Sekä analytiikan vastaanotto (`api/public/track`) että varauksen
   kampanja-attribuutio (`api/public/booking`) laskevat saman hashin.
   Jos ne laskisivat sen eri tavoin, varausta ei löytyisi kävijän omasta
   tapahtumaketjusta eikä attribuutio toimisi — hiljaa, ilman virhettä.
   Siksi tämä on omassa moduulissaan eikä kopioituna kahteen reittiin.

   Hash EI tunnista kävijää pysyvästi: se lasketaan IP:stä, selaimesta,
   PÄIVÄSTÄ ja saltista, ja vaihtuu joka yö Suomen ajan mukaan. Raakaa
   IP:tä ei talleteta mihinkään. Ks. tietosuoja.html luku 7.
   ========================================================= */
export function visitorHash(ip: string, ua: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date());
  const salt = process.env.BOOKING_SECRET ?? 'tk-analytics';
  return createHash('sha256').update(`${ip}|${ua}|${day}|${salt}`).digest('hex').slice(0, 32);
}

/* Asiakkaan oikea IP ja selain. Varaus tulee sivuston Vercel-funktiolta
   palvelimelta palvelimelle, joten pyynnön omat otsakkeet kertoisivat
   funktion — ei kävijän. Funktio välittää kävijän tiedot näissä. */
export function clientIdentity(request: Request): { ip: string; ua: string } {
  const fwdIp = request.headers.get('x-tk-client-ip');
  const fwdUa = request.headers.get('x-tk-client-ua');
  const ip = (fwdIp ?? request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'x';
  const ua = fwdUa ?? request.headers.get('user-agent') ?? '';
  return { ip, ua };
}
