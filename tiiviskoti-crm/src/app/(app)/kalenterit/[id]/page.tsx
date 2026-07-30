import Link from 'next/link';
import { notFound } from 'next/navigation';
import { availability, getCalendar } from '@/lib/data';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty } from '@/components/ui';
import { formatDateKey, formatInstant, weekdayName } from '@/lib/time';
import { sql } from '@/lib/db';
import { AddExceptionForm, AddHoursForm, CalendarAreasForm, CalendarSettingsForm, DeleteRow } from '../ui';

export const dynamic = 'force-dynamic';

export default async function CalendarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;

  const data = await getCalendar(id);
  if (!data) notFound();
  const { calendar, hours, exceptions } = data;

  // Näytetään heti mitä asetukset oikeasti tuottavat — se on ainoa tapa
  // huomata, että esim. varoaika söi kaikki lähipäivien ajat.
  const [preview] = await availability({
    durationMinutes: 120,
    until: new Date(Date.now() + 14 * 86_400_000),
    calendarId: id,
  });
  const previewSlots = preview?.slots.slice(0, 12) ?? [];

  // Rinnakkain: kaksi riippumatonta kyselyä.
  const [areas, selectedAreas] = await Promise.all([
    sql<{ id: string; name: string; travel_fee_cents: number }[]>`
      select id, name, travel_fee_cents from tk.areas where active order by name
    `,
    sql<{ area_id: string }[]>`
      select area_id from tk.calendar_areas where calendar_id = ${id}
    `,
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/kalenterit" className="text-xs text-muted hover:text-text">← Työajat</Link>
        <h1 className="text-xl font-semibold tracking-tight">{calendar.name}</h1>
        <p className="text-sm text-muted">{calendar.staff_name}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-fit">
          <CardHeader title="Asetukset" />
          <CalendarSettingsForm calendar={calendar} />
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Palvelualueet"
            action={<span className="text-xs text-faint">mihin postinumeroihin</span>}
          />
          <CalendarAreasForm
            calendarId={calendar.id}
            areas={areas.map((a) => ({ id: a.id, name: a.name, travelFeeCents: a.travel_fee_cents }))}
            selected={selectedAreas.map((s) => s.area_id)}
          />
        </Card>

        <Card className="h-fit">
          <CardHeader title="Viikkoaikataulu" />
          {hours.length === 0 ? (
            <Empty>Ei työaikoja — kalenteri ei tarjoa yhtään aikaa.</Empty>
          ) : (
            <ul className="divide-y divide-line-soft">
              {hours.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-28 text-muted">{weekdayName(row.weekday)}</span>
                  <span className="tabular">{row.start_time}–{row.end_time}</span>
                  <span className="ml-auto">
                    <DeleteRow id={row.id} calendarId={calendar.id} kind="hours" />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line">
            <AddHoursForm calendarId={calendar.id} />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Poikkeukset" />
          {exceptions.length === 0 ? (
            <Empty>Ei poikkeuksia.</Empty>
          ) : (
            <ul className="divide-y divide-line-soft">
              {exceptions.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-24 tabular">{formatDateKey(row.date)}</span>
                  <span className={row.kind === 'closed' ? 'text-danger' : 'text-accent'}>
                    {row.kind === 'closed' ? 'Poissa' : 'Lisäaika'}
                  </span>
                  <span className="text-muted tabular">
                    {row.start_time ? `${row.start_time}–${row.end_time}` : 'koko päivä'}
                  </span>
                  {row.note && <span className="truncate text-xs text-faint">{row.note}</span>}
                  <span className="ml-auto">
                    <DeleteRow id={row.id} calendarId={calendar.id} kind="exception" />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line">
            <AddExceptionForm calendarId={calendar.id} />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Seuraavat vapaat ajat"
            action={<span className="text-xs text-faint">2 h työlle, 14 vrk</span>}
          />
          {previewSlots.length === 0 ? (
            <Empty>Ei vapaita aikoja näillä asetuksilla.</Empty>
          ) : (
            <ul className="divide-y divide-line-soft">
              {previewSlots.map((slot) => (
                <li key={slot.start.toISOString()} className="px-4 py-1.5 text-sm tabular">
                  {formatInstant(slot.start)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
