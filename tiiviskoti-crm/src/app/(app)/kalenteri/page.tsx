import Link from 'next/link';
import { listCalendars, listJobs } from '@/lib/data';
import {
  addDays, dateKeyOf, formatDateKey, helsinkiDateTime, isoWeekday, timeOf, todayKey, weekdayShort,
} from '@/lib/time';
import { Card, Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';

const DAY_START = 6;   // ruudukon ensimmäinen tunti
const DAY_END = 20;
const HOUR_PX = 52;

/** Maanantai, johon annettu päivä kuuluu. */
function mondayOf(dateKey: string) {
  return addDays(dateKey, -(isoWeekday(dateKey) - 1));
}

// Asentajien erotteluun: kalenteri saa värin järjestysnumeronsa mukaan.
const COLORS = [
  'border-accent/60 bg-accent/15 text-accent',
  'border-info/60 bg-info/15 text-info',
  'border-warn/60 bg-warn/15 text-warn',
  'border-danger/60 bg-danger/15 text-danger',
];

export default async function WeekPage({
  searchParams,
}: { searchParams: Promise<{ viikko?: string }> }) {
  const { viikko } = await searchParams;
  const today = todayKey();
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(viikko ?? '') ? viikko! : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const from = helsinkiDateTime(monday, '00:00');
  const to = helsinkiDateTime(addDays(monday, 7), '00:00');

  const [jobs, calendars] = await Promise.all([
    listJobs(from.toISOString(), to.toISOString()),
    listCalendars(true),
  ]);

  const colorOf = new Map(calendars.map((c, i) => [c.id, COLORS[i % COLORS.length]]));
  const active = jobs.filter((j) => j.status !== 'cancelled');
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Kalenteri</h1>
          <p className="text-sm text-muted tabular">
            {formatDateKey(monday)} – {formatDateKey(addDays(monday, 6))} · {active.length} työtä
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Link href={`/kalenteri?viikko=${addDays(monday, -7)}`}
                className="rounded-md border border-line px-2.5 py-1.5 text-muted hover:text-text">
            ← Edellinen
          </Link>
          <Link href="/kalenteri"
                className="rounded-md border border-line px-2.5 py-1.5 text-muted hover:text-text">
            Tämä viikko
          </Link>
          <Link href={`/kalenteri?viikko=${addDays(monday, 7)}`}
                className="rounded-md border border-line px-2.5 py-1.5 text-muted hover:text-text">
            Seuraava →
          </Link>
        </div>
      </header>

      {calendars.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {calendars.map((cal) => (
            <span key={cal.id} className="flex items-center gap-1.5 text-muted">
              <span className={`h-2.5 w-2.5 rounded-sm border ${colorOf.get(cal.id)}`} />
              {cal.staff_name}
            </span>
          ))}
        </div>
      )}

      <Card className="overflow-x-auto">
        {calendars.length === 0 ? (
          <Empty>Ei aktiivisia kalentereita.</Empty>
        ) : (
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-line">
              <div />
              {days.map((day) => (
                <div
                  key={day}
                  className={`px-2 py-2 text-center text-xs ${day === today ? 'text-accent' : 'text-muted'}`}
                >
                  <div className="font-medium">{weekdayShort(isoWeekday(day))}</div>
                  <div className="tabular text-faint">{formatDateKey(day).slice(0, -5)}</div>
                </div>
              ))}
            </div>

            <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
              <div>
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_PX }}
                       className="pr-2 pt-0.5 text-right text-[11px] text-faint tabular">
                    {String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>

              {days.map((day) => {
                const dayJobs = active.filter((j) => dateKeyOf(j.starts_at) === day);
                return (
                  <div key={day} className="relative border-l border-line-soft">
                    {hours.map((h) => (
                      <div key={h} style={{ height: HOUR_PX }} className="border-b border-line-soft" />
                    ))}

                    {dayJobs.map((job) => {
                      const [sh, sm] = timeOf(job.starts_at).split(':').map(Number);
                      const minutes = (job.ends_at.getTime() - job.starts_at.getTime()) / 60_000;
                      const top = (sh + sm / 60 - DAY_START) * HOUR_PX;
                      const height = Math.max(20, (minutes / 60) * HOUR_PX - 2);
                      if (top < 0) return null;

                      return (
                        <Link
                          key={job.id}
                          href={`/tyot/${job.id}`}
                          style={{ top, height }}
                          className={`absolute inset-x-1 overflow-hidden rounded border px-1.5 py-1
                                      text-[11px] leading-tight hover:brightness-125
                                      ${colorOf.get(job.calendar_id) ?? COLORS[0]}`}
                        >
                          <div className="tabular font-medium">{timeOf(job.starts_at)}</div>
                          <div className="truncate opacity-90">
                            {job.customer_name ?? job.title}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
