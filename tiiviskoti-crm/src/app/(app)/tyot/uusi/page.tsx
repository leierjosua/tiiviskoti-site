import Link from 'next/link';
import { availability, getOffer, listCalendars, type OfferLine, type OfferRow } from '@/lib/data';
import { EXTRAS, TYPES } from '@/lib/pricing';
import { requireStaff } from '@/lib/session';
import { Card, CardHeader, Empty } from '@/components/ui';
import { NewJobForm } from './ui';

export const dynamic = 'force-dynamic';

const DURATIONS = [60, 90, 120, 180, 240, 300];

const eur = (cents: number) =>
  (cents / 100).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';

/* Kesto tarjouksen riveistä.

   Hinnastossa on jokaiselle kohteelle työaika-arvio (`min`), mutta tarjouksen
   rivit ovat tekstiä — katalogi on tunnistettava nimestä. Vapaat rivit eivät
   osu mihinkään, ja silloin arvio jää vajaaksi: siksi tämä on ehdotus, jonka
   voi vaihtaa kestovalikosta. Ilman arviota kahden oven keikalle ehdotettaisiin
   samaa kahta tuntia kuin kahdentoista ikkunan keikalle. */
function estimateDuration(lines: OfferLine[]): number | null {
  let minutes = 0;
  for (const line of lines) {
    const type = TYPES.find((t) => line.name.startsWith(t.name));
    const extra = EXTRAS.find((e) => line.name.startsWith(e.name));
    const per = type?.min ?? extra?.min ?? 0;
    minutes += per * Math.max(1, line.quantity);
  }
  if (minutes <= 0) return null;
  return DURATIONS.find((d) => d >= minutes) ?? DURATIONS[DURATIONS.length - 1];
}

/** Tarjouksen rivit yhdelle riville muistiinpanoon. */
function lineSummary(lines: OfferLine[]): string {
  return lines.map((l) => (l.quantity > 1 ? `${l.quantity}× ${l.name}` : l.name)).join(', ');
}

function prefillFromOffer(offer: OfferRow) {
  const notes = [
    `Tarjous ${offer.offer_number} — ${eur(offer.total_cents)}`,
    lineSummary(offer.lines),
    offer.contact_name ? `Yhteyshenkilö: ${offer.contact_name}` : '',
    offer.notes ?? '',
  ].filter(Boolean).join('\n');

  return {
    customerName: offer.customer_name,
    email: offer.email ?? '',
    phone: offer.phone ?? '',
    postalCode: offer.postal_code ?? '',
    address: offer.address ?? '',
    city: offer.city ?? '',
    title: `Tiivistetyö — ${offer.offer_number}`,
    notes,
  };
}

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{
    kalenteri?: string; kalenteri2?: string; kesto?: string;
    /* Esitäyttö liidistä. Sähköpostitse sovittu käynti jäi ennen kokonaan
       kirjaamatta, koska tiedot piti näpytellä uudestaan — nyt liidiriviltä
       pääsee tänne yhdellä klikkauksella ja kentät ovat valmiina. */
    liidi?: string; nimi?: string; email?: string; puhelin?: string;
    postinumero?: string; osoite?: string; muistiinpano?: string;
    /* Esitäyttö tarjouksesta ("Laita aika"). Tiedot haetaan kannasta eikä
       osoiteriviltä: rivit ja summa siirtyvät työlle, eikä niitä voi
       väärentää linkkiä muokkaamalla. */
    tarjous?: string;
  }>;
}) {
  await requireStaff();
  const {
    kalenteri, kalenteri2, kesto, liidi, nimi, email, puhelin, postinumero, osoite,
    muistiinpano, tarjous,
  } = await searchParams;

  const [calendars, offer] = await Promise.all([
    listCalendars(true),
    tarjous ? getOffer(tarjous) : Promise.resolve(null),
  ]);

  const offerPrefill = offer ? prefillFromOffer(offer) : null;
  const suggested = offer ? estimateDuration(offer.lines) : null;
  const duration = DURATIONS.includes(Number(kesto)) ? Number(kesto) : (suggested ?? 120);

  const calendarId = calendars.some((c) => c.id === kalenteri) ? kalenteri : calendars[0]?.id;
  /* Toinen asentaja kelpaa vain jos hän on eri henkilö kuin ensimmäinen —
     muuten sama kalenteri varattaisiin kahdesti eikä työ syntyisi lainkaan. */
  const calendarId2 = kalenteri2 && kalenteri2 !== calendarId
    && calendars.some((c) => c.id === kalenteri2) ? kalenteri2 : '';

  const until = new Date(Date.now() + 45 * 86_400_000);
  const [first, second] = await Promise.all([
    calendarId ? availability({ durationMinutes: duration, until, calendarId }) : [],
    calendarId2 ? availability({ durationMinutes: duration, until, calendarId: calendarId2 }) : null,
  ]);

  // Palvelinkomponentti ei voi siirtää Date-olioita asiakkaalle sellaisenaan.
  let slots = (first[0]?.slots ?? []).map((s) => s.start.toISOString());
  if (second) {
    /* Työparin ajat = molemmilta vapaat alkuajat. Vertailu tehdään tarkoilla
       alkuhetkillä: kalentereilla on sama 30 min ruudukko, joten yhteiset ajat
       osuvat kohdakkain. Jos jommankumman ruudukkoa joskus muutetaan, tästä
       tulee turhan tiukka — se näkyy heti tyhjänä listana eikä vääränä
       varauksena, mikä on oikea suunta erehtyä. */
    const mine = new Set((second[0]?.slots ?? []).map((s) => s.start.toISOString()));
    slots = slots.filter((iso) => mine.has(iso));
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={offer ? `/tarjoukset/${offer.id}` : '/tyot'} className="text-xs text-muted hover:text-text">
          ← {offer ? `Tarjous ${offer.offer_number}` : 'Työt'}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Uusi työ</h1>
      </header>

      {tarjous && !offer && (
        <Card><Empty>Tarjousta ei löytynyt. Palaa tarjouslistaan ja yritä uudelleen.</Empty></Card>
      )}

      {calendars.length === 0 ? (
        <Card>
          <Empty>
            Ei aktiivisia kalentereita. Luo ensin työntekijä ja kalenteri kohdasta “Työajat”.
          </Empty>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={
              offer ? `Laita aika — tarjous ${offer.offer_number}`
                : liidi ? 'Varaa aika — liidistä'
                : 'Varaa aika'
            }
          />
          <NewJobForm
            calendars={calendars.map((c) => ({ id: c.id, label: `${c.staff_name} — ${c.name}` }))}
            calendarId={calendarId!}
            calendarId2={calendarId2}
            duration={duration}
            durations={DURATIONS}
            slots={slots}
            leadId={liidi}
            offer={offer ? {
              id: offer.id,
              number: offer.offer_number,
              total: eur(offer.total_cents),
              customer: offer.customer_name,
            } : undefined}
            prefill={offerPrefill ?? {
              customerName: nimi ?? '',
              email: email ?? '',
              phone: puhelin ?? '',
              postalCode: postinumero ?? '',
              address: osoite ?? '',
              city: '',
              title: '',
              notes: muistiinpano ?? '',
            }}
          />
        </Card>
      )}
    </div>
  );
}
