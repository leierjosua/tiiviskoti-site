import { sendMetaEvent, buildUserData, metaConfigured } from '../meta-capi.mjs';

/* =========================================================
   Toteutuneen kaupan ilmoitus Metalle, kun kauppa syntyi CRM:ssä.

   MIKSI TÄMÄ ON OLEMASSA: Purchase lähti aiemmin vain verkkovarauksesta.
   Liidimainoksen polku on toinen — asiakas jättää lomakkeen, saa tarjouksen
   ja kauppa kirjataan adminissa. Metalle ei kerrottu siitä mitään, joten se
   optimoi liidimainoksia lomakkeiden MÄÄRÄN mukaan eikä sen mukaan mikä
   niistä tuotti rahaa. Juuri se ero ratkaisee liidimainonnan kannattavuuden.

   MIKSI VAIN LIIDITUNNISTEELLISET: tapahtuma lähetetään vain kun kauppa
   jäljittyy Metan liidilomakkeeseen (`lead_id`). Ilman rajausta Metalle
   raportoitaisiin myös orgaaniset ja Googlesta tulleet kaupat, ja se lukisi
   ne omikseen — sama harha josta tili jo kärsii (Meta väitti 6 varausta kun
   CRM attribuoi sille yhden).

   MIKSI SIVUSTON PUOLELLA EIKÄ CRM:SSÄ: CAPI-tunnus, hashaus ja omien
   testien suodatus ovat `meta-capi.mjs`:ssä. Toinen toteutus tarkoittaisi
   toista paikkaa jossa hashaus voi mennä väärin.

   Kutsuja on tiiviskoti-crm, ja pyyntö tunnistetaan samalla jaetulla
   salaisuudella (`x-tk-secret`) jota varauksen luonti käyttää toiseen
   suuntaan. Ilman sitä kuka tahansa voisi syöttää Metalle valekauppoja.
   ========================================================= */

const MAX_VALUE_EUR = 20000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const secret = process.env.BOOKING_SECRET;
  if (!secret || req.headers['x-tk-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!metaConfigured()) return res.status(200).json({ ok: true, skipped: 'meta' });

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};

    /* Liiditunniste on ehto, ei lisätieto: ilman sitä kauppaa ei voi
       yhdistää mainokseen eikä sitä pidä raportoida lainkaan. */
    const leadId = /^\d{5,25}$/.test(String(body.leadId ?? '')) ? String(body.leadId) : null;
    if (!leadId) return res.status(200).json({ ok: true, skipped: 'no-lead-id' });

    const cents = Number(body.valueCents);
    if (!Number.isFinite(cents) || cents <= 0 || cents / 100 > MAX_VALUE_EUR) {
      return res.status(400).json({ error: 'validation' });
    }

    const postal = typeof body.postal === 'string' && /^\d{5}$/.test(body.postal) ? body.postal : undefined;

    const userData = buildUserData({
      leadId,
      email: body.email,
      phone: body.phone,
      name: body.name,
      postal,
      city: body.city,
    });

    /* action_source 'system_generated': kauppa ei syntynyt selaimessa vaan
       kirjattiin järjestelmään jälkikäteen. Väärä lähde vääristäisi Metan
       raportin sijoittelukohtaisia lukuja. */
    const sent = await sendMetaEvent({
      eventName: 'Purchase',
      eventId: body.eventId ? String(body.eventId) : undefined,
      actionSource: 'system_generated',
      userData,
      customData: { value: Math.round(cents) / 100, currency: 'EUR' },
    });

    return res.status(200).json({ ok: true, sent });
  } catch (e) {
    console.error('crm-purchase:', String(e).slice(0, 200));
    return res.status(200).json({ ok: false });
  }
}
