import { sendMetaEvent, buildUserData, metaConfigured } from '../meta-capi.mjs';

/* =========================================================
   Ostoaikeen ilmoitus Metalle (InitiateCheckout).

   MIKSI TÄMÄ ON OLEMASSA: Metalle lähti aiemmin vain lopputapahtumia —
   Purchase varauksesta, Schedule kartoituksesta, Lead lomakkeesta. Niitä
   kertyy muutama kahdessa viikossa, eikä Metan optimointi opi sellaisella
   määrällä mitään: se päätyy näyttämään mainosta käytännössä satunnaisille
   ihmisille. Tämä tapahtuma syntyy siinä kohtaa kun kävijä on valinnut ovet
   ja ikkunat ja nähnyt oikean hinnan — vahva ostoaie, jota tapahtuu
   moninkertaisesti varauksiin nähden. Nyt algoritmilla on jotain mistä
   oppia, ja se oppii nimenomaan hinnan nähneistä eikä selailijoista.

   MIKSI PALVELIMELTA: sivustolla ei ole selainpikseliä lainkaan. Mainosten
   estäjät, iOS:n ITP ja evästekiellot eivät siksi voi kadottaa tätä — CAPI
   lähtee palvelimelta riippumatta siitä mitä selaimessa on estetty.

   MIKSI EI Purchase: mitään ei ole vielä myyty. Purchase-tapahtuman
   käyttäminen tässä opettaisi Metalle että kauppa syntyy aina kun hinta
   katsotaan, ja tuotto näyttäisi raportissa moninkertaiselta.
   ========================================================= */

const MAX_VALUE_EUR = 20000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!metaConfigured()) return res.status(200).json({ ok: true, skipped: 'meta' });

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};

    /* Arvo tulee selaimesta, joten se tarkistetaan: kelvoton luku menisi
       Metalle sellaisenaan ja vääristäisi optimoinnin tuottotavoitetta. */
    const cents = Number(body.totalCents);
    if (!Number.isFinite(cents) || cents <= 0 || cents / 100 > MAX_VALUE_EUR) {
      return res.status(400).json({ error: 'validation' });
    }
    const count = Number.isFinite(Number(body.count)) ? Math.max(0, Math.trunc(Number(body.count))) : 0;
    const postal = typeof body.postal === 'string' && /^\d{5}$/.test(body.postal) ? body.postal : undefined;

    /* eventId tulee selaimesta ja pysyy samana koko istunnon saman
       hinta-arvion ajalle. Jos kävijä palaa taaksepäin ja tulee uudestaan,
       Meta deduplikoi saman tapahtuman pois eikä yksi kävijä näytä
       kymmeneltä ostoaikeelta. */
    const eventId = typeof body.eventId === 'string' && body.eventId.length <= 100
      ? body.eventId
      : `ic-${Date.now()}`;

    await sendMetaEvent({
      eventName: 'InitiateCheckout',
      eventId,
      eventSourceUrl: req.headers?.referer || 'https://tiiviskoti.fi/',
      userData: buildUserData({
        postal,
        fbc: typeof body.fbc === 'string' ? body.fbc : undefined,
        fbp: typeof body.fbp === 'string' ? body.fbp : undefined,
        externalId: typeof body.vid === 'string' && body.vid.length <= 64 ? body.vid : undefined,
        req,
      }),
      customData: {
        currency: 'EUR',
        value: cents / 100,
        content_category: 'calculator',
        num_items: count,
      },
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    /* Seuranta ei saa näkyä kävijälle mitenkään: varaus jatkuu vaikka
       Meta olisi nurin. */
    console.error('track-intent:', e);
    return res.status(200).json({ ok: false });
  }
}
