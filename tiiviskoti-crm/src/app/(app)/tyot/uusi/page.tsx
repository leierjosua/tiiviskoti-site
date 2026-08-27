import Link from 'next/link';
import { availability, listCalendars } from '@/lib/data';
import { requireStaff } from '@/lib/session';
import { Card, CardHeader, Empty } from '@/components/ui';
import { NewJobForm } from './ui';

export const dynamic = 'force-dynamic';

const DURATIONS = [60, 90, 120, 180, 240, 300];

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{
    kalenteri?: string; kesto?: string;
    /* Esitäyttö liidistä. Sähköpostitse sovittu käynti jäi ennen kokonaan
       kirjaamatta, koska tiedot piti näpytellä uudestaan — nyt liidiriviltä
       pääsee tänne yhdellä klikkauksella ja kentät ovat valmiina. */
    liidi?: string; nimi?: string; email?: string; puhelin?: string;
    postinumero?: string; osoite?: string; muistiinpano?: string;
  }>;
}) {
  await requireStaff();
  const {
    kalenteri, kesto, liidi, nimi, email, puhelin, postinumero, osoite, muistiinpano,
  } = await searchParams;

  const calendars = await listCalendars(true);
  const duration = DURATIONS.includes(Number(kesto)) ? Number(kesto) : 120;
  const calendarId = calendars.some((c) => c.id === kalenteri) ? kalenteri : calendars[0]?.id;

  const groups = calendarId
    ? await availability({
        durationMinutes: duration,
        until: new Date(Date.now() + 45 * 86_400_000),
        calendarId,
      })
    : [];

  // Palvelinkomponentti ei voi siirtää Date-olioita asiakkaalle sellaisenaan.
  const slots = (groups[0]?.slots ?? []).map((s) => s.start.toISOString());

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/tyot" className="text-xs text-muted hover:text-text">← Työt</Link>
        <h1 className="text-xl font-semibold tracking-tight">Uusi työ</h1>
      </header>

      {calendars.length === 0 ? (
        <Card>
          <Empty>
            Ei aktiivisia kalentereita. Luo ensin työntekijä ja kalenteri kohdasta “Työajat”.
          </Empty>
        </Card>
      ) : (
        <Card>
          <CardHeader title={liidi ? 'Varaa aika — liidistä' : 'Varaa aika'} />
          <NewJobForm
            calendars={calendars.map((c) => ({ id: c.id, label: `${c.staff_name} — ${c.name}` }))}
            calendarId={calendarId!}
            duration={duration}
            durations={DURATIONS}
            slots={slots}
            leadId={liidi}
            prefill={{
              customerName: nimi ?? '',
              email: email ?? '',
              phone: puhelin ?? '',
              postalCode: postinumero ?? '',
              address: osoite ?? '',
              notes: muistiinpano ?? '',
            }}
          />
        </Card>
      )}
    </div>
  );
}
