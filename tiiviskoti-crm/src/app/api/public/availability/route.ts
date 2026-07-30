import { areaForPostal, availability } from '@/lib/data';
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
  const minutes = Math.min(Math.max(Number(params.get('minutes') ?? 120) || 120, 15), 600);

  if (!/^\d{5}$/.test(postal)) {
    return json({ error: 'postal_required' }, { status: 400, origin });
  }

  const area = await areaForPostal(postal);
  if (!area) {
    // Ei palvelualuetta: sivu näyttää yhteydenottolomakkeen eikä aikoja.
    return json({ served: false, postal, slots: [] }, { origin });
  }

  const groups = await availability({
    durationMinutes: minutes,
    until: new Date(Date.now() + days * 86_400_000),
    areaId: area.id,
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
    durationMinutes: minutes,
    slots,
  }, { origin });
}
