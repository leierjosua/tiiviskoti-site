import Link from 'next/link';
import { listCalendars, listStaff } from '@/lib/data';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty } from '@/components/ui';
import { CreateCalendarForm } from './ui';

export const dynamic = 'force-dynamic';

export default async function CalendarsPage() {
  await requireManager();
  const [calendars, staff] = await Promise.all([listCalendars(), listStaff()]);
  const activeStaff = staff.filter((s) => s.active);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight text-text">Työajat</h1>
        <p className="text-sm text-muted">
          Kalenteri määrää, milloin asentajalle voi varata ajan. Ilman työaikoja vapaita aikoja ei synny.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Kalenterit" />
          {calendars.length === 0 ? (
            <Empty>Ei kalentereita. Luo ensimmäinen oikealta.</Empty>
          ) : (
            <ul className="divide-y divide-line-soft">
              {calendars.map((cal) => (
                <li key={cal.id}>
                  <Link
                    href={`/kalenterit/${cal.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-ink-700"
                  >
                    <span className="w-44 shrink-0 truncate font-medium">{cal.name}</span>
                    <span className="w-40 shrink-0 truncate text-muted">{cal.staff_name}</span>
                    <span className="flex-1 text-xs text-faint tabular">
                      {cal.slot_minutes} min välein · aikaisintaan {cal.lead_time_hours} h päästä ·{' '}
                      {cal.horizon_days} vrk eteenpäin
                    </span>
                    {!cal.active && <span className="text-xs text-faint">pois käytöstä</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Uusi kalenteri" />
          <div className="p-4">
            {activeStaff.length === 0 ? (
              <p className="text-sm text-faint">
                Lisää ensin työntekijä.
              </p>
            ) : (
              <CreateCalendarForm staff={activeStaff.map((s) => ({ id: s.id, name: s.full_name }))} />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
