import { areaForPostal, availability, kartoitusCalendarId } from '@/lib/data';
import { KARTOITUS_MINUTES, MAX_BOOKING_BLOCK_MINUTES } from '@/lib/availability';
import { json, preflight } from '../cors';

/* GET /api/public/availability?postal=04400&days=60&minutes=120

   Palauttaa vapaat ajat VAIN sen alueen kalentereista, johon postinumero
   kuuluu. Ilman postinumeroa ei palauteta aikoja: kaikkien alueiden aikojen
   näyttäminen olisi taas se sama valheellinen kalenteri, jossa asiakas voi
   valita ajan joka ei ole hänelle tarjolla.

   Vastauksessa on myös alueen matkalisä, jotta sivu voi näyttää saman
   hinnan kuin veloitetaan. Se on kuitenkin vain näyttöä varten — varauksen
   yhteydessä lisä lasketaan uudelleen palvelimella. */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const OPTIONS = preflight;

export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const params = new URL(request.url).searchParams;

  const postal = (params.get('postal') ?? '').trim();
  const days = Math.min(Math.max(Number(params.get('days') ?? 60) || 60, 1), 180);
  /* Haetaan aina enintään paikanpitäjän mittaiselle lohkolle: iso keikka ei
     mahtuisi koko kestollaan vapaaseen aikaan, jolloin asiakas ei saisi mitään
     aikaa ja kauppa menetettäisiin. Kalenteriin varataan enintään tämä lohko ja
     todellinen kesto kirjataan muistiinpanoihin — booking-reitti käyttää samaa
     rajaa, joten tarjottu aika ja varattu lohko ovat aina yhtä pitkät. */
  const minutes = Math.min(Math.max(Number(params.get('minutes') ?? 120) || 120, 15), MAX_BOOKING_BLOCK_MINUTES);

  if (!/^\d{5}$/.test(postal)) {
    return json({ error: 'postal_required' }, { status: 400, origin });
  }

  const area = await areaForPostal(postal);
  if (!area) {
    // Ei palvelualuetta: sivu näyttää yhteydenottolomakkeen eikä aikoja.
    return json({ served: false, postal, slots: [] }, { origin });
  }

  /* Taloyhtiön veloitukseton kartoituskäynti hakee ajat omasta kalenteristaan
     (`?kartoitus=1`). Alue tarkistetaan silti yllä: postinumero kertoo
     palvellaanko taloyhtiötä lainkaan, vaikka aikoja ei rajatakaan alueella —
     kartoituskalenteri ei ole `tk.calendar_areas`-taulussa, mikä on juuri se
     seikka joka pitää sen erossa kuluttajan varauskalenterista. */
  const wantsKartoitus = params.get('kartoitus') === '1';
  let calendarId: string | undefined;
  let areaId: string | undefined = area.id;
  let durationMinutes = minutes;

  if (wantsKartoitus) {
    const kartoitusId = kartoitusCalendarId();
    if (!kartoitusId) {
      /* Kalenteria ei ole määritetty. Palautetaan virhe eikä tyhjää listaa:
         tyhjä lista näyttäisi sivulla "kalenteri on täynnä", mikä on valhe —
         kalenteria ei ole olemassa. Sivu ohjaa tällöin soittamaan. */
      console.error('availability: KARTOITUS_CALENDAR_ID puuttuu');
      return json({ error: 'kartoitus_unavailable' }, { status: 503, origin });
    }
    calendarId = kartoitusId;
    areaId = undefined;
    // Kesto tulee palvelimelta, jottei tarjottu aika ja varattava lohko voi erota.
    durationMinutes = KARTOITUS_MINUTES;
  }

  const groups = await availability({
    durationMinutes,
    until: new Date(Date.now() + days * 86_400_000),
    areaId,
    calendarId,
  });

  // Sivu ei tarvitse tietää kuka työn tekee — se valitsee ajan, ja kalenteri
  // ratkeaa siitä. Päällekkäiset alkuajat eri asentajilta yhdistetään.
  const byStart = new Map<string, { startsAt: string; endsAt: string; calendarId: string }>();
  for (const group of groups) {
    for (const slot of group.slots) {
      const key = slot.start.toISOString();
      if (!byStart.has(key)) {
        byStart.set(key, {
          startsAt: key,
          endsAt: slot.end.toISOString(),
          calendarId: group.calendarId,
        });
      }
    }
  }

  const slots = [...byStart.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return json({
    served: true,
    postal,
    area: { name: area.name, travelFeeCents: area.travelFeeCents },
    durationMinutes,
    slots,
  }, { origin });
}
