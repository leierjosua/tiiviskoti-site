// TiivisKoti — alennuskoodin tarkistus varauslomakkeelle.
//
// Ohut välittäjä CRM:n `/api/public/discount`-rajapintaan. Selain ei kutsu
// CRM:ää suoraan kahdesta syystä: jaettu salaisuus (`BOOKING_SECRET`) ei saa
// päätyä sivulle, eikä koodivarastoa saa voida haravoida CRM:stä ohi tämän.
//
// Tämä VAIN näyttää alennuksen. Koodi kuluu vasta varauksessa, samassa
// transaktiossa työn kanssa — eli tässä palautettu summa on lupaus vain
// siihen asti kunnes joku muu ehtii käyttää koodin loppuun. Varauspolku
// tarkistaa saman uudelleen, joten näytetty ja veloitettu alennus tulevat
// aina samasta funktiosta (`resolveDiscount`).
//
// Vastaus ei koskaan kerro montako käyttöä koodilla on jäljellä: se on
// kampanjan tietoa eikä kuulu julkiselle sivulle.

const CRM_BASE_URL = process.env.CRM_BASE_URL;
const BOOKING_SECRET = process.env.BOOKING_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!CRM_BASE_URL || !BOOKING_SECRET) {
    console.error('check-discount: CRM_BASE_URL / BOOKING_SECRET puuttuu');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const code = String(body.code || '').slice(0, 40);
    if (!code.trim()) return res.status(400).json({ error: 'validation' });

    // Summa on vain näyttöä varten (koodilla voi olla alaraja). Rajataan silti
    // järkeväksi, ettei CRM:ään lähde mielivaltaisia lukuja.
    const subtotalCents = Math.max(0, Math.min(1_000_000, Math.round(Number(body.subtotalCents) || 0)));
    const email = typeof body.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)
      ? body.email.trim()
      : undefined;

    const r = await fetch(`${CRM_BASE_URL}/api/public/discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tk-secret': BOOKING_SECRET },
      body: JSON.stringify({ code, subtotalCents, email }),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error('check-discount: CRM vastasi', r.status, data && data.error);
      return res.status(503).json({ error: 'unavailable' });
    }

    return res.status(200).json(data);
  } catch (e) {
    console.error('check-discount error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
}
