// TiivisKoti — Google-arvosana ja arvostelujen määrä sivuston tähtipillereihin.
//
// Sivuilla on arvo kovakoodattuna (näkyy heti, toimii ilman JavaScriptiä ja
// hakukoneille). `_shared.js` hakee tästä tuoreen luvun ja päivittää sen —
// jos tämä on rikki, sivu näyttää kovakoodatun luvun eikä mitään hajoa.
//
// MIKSI CDN-VÄLIMUISTI VUOROKAUDEKSI: Places API veloittaa hausta, ja jokainen
// sivulataus kutsuisi sitä. `s-maxage=86400` tarkoittaa että Vercel hakee
// Googlelta kerran vuorokaudessa (per alue) ja palvelee muut välimuistista,
// jolloin kuukaudessa kertyy kymmeniä hakuja — Googlen ilmaisen kiintiön
// sisällä. Uusi arvostelu näkyy sivulla siis viimeistään vuorokauden päästä.
//
// Ympäristömuuttuja (Vercel, tiiviskoti-projekti):
//   GOOGLE_PLACES_API_KEY — API-avain, jolle on sallittu "Places API (New)".

const PLACE_ID = 'ChIJaT51gJWKmEkRCqEXyc6lGuo';
const KEY = process.env.GOOGLE_PLACES_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  /* Puuttuva avain ei ole hätätila: sivut näyttävät kovakoodatun luvun.
     Lyhyt välimuisti, jotta avaimen lisäämisen jälkeen ei odoteta vuorokautta. */
  if (!KEY) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(503).json({ error: 'not_configured' });
  }

  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}`, {
      headers: {
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'rating,userRatingCount',
      },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || typeof data.rating !== 'number' || typeof data.userRatingCount !== 'number') {
      console.error('google-rating: HTTP', r.status, JSON.stringify(data).slice(0, 300));
      res.setHeader('Cache-Control', 'public, s-maxage=600');
      return res.status(502).json({ error: 'upstream' });
    }

    /* stale-while-revalidate: vanhentunut arvo palvellaan heti ja uusi
       haetaan taustalla — kävijä ei koskaan odota Googlea. */
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({ rating: data.rating, count: data.userRatingCount });
  } catch (e) {
    console.error('google-rating:', String(e).slice(0, 200));
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    return res.status(502).json({ error: 'upstream' });
  }
}
