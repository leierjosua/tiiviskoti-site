import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { addDays, dateKeyOf, formatDateKey, helsinkiDateTime, isoWeekday, timeOf, weekdayName } from '@/lib/time';
import { Card, Empty, StatusBadge } from '@/components/ui';
import { MarkDone } from './tyot/[id]/ui';

export const dynamic = 'force-dynamic';

type DayJob = {
  id: string; job_number: string; starts_at: Date; ends_at: Date; status: string;
  title: string; address: string | null; postal_code: string | null; city: string | null;
  price_cents: number; notes: string | null;
  staff_name: string; customer_name: string | null; customer_phone: string | null;
};

export default async function TodayPage() {
  const staff = await requireStaff();
  const today = dateKeyOf(new Date());
  const from = helsinkiDateTime(today, '00:00');
  const to = helsinkiDateTime(addDays(today, 8), '00:00');

  /* Asentaja näkee vain omat työnsä — päivänäkymä on hänelle työlista, ei
     koko yrityksen tilannekuva. Toimisto ja omistaja näkevät kaikki. */
  const onlyMine = staff.role === 'installer';

  const jobs = await sql<DayJob[]>`
    select j.id, j.job_number, j.starts_at, j.ends_at, j.status::text as status, j.title,
           j.address, j.postal_code, j.city, j.price_cents, j.notes,
           s.full_name as staff_name, cu.full_name as customer_name, cu.phone as customer_phone
      from tk.jobs j
      join tk.calendars c on c.id = j.calendar_id
      join tk.staff s on s.id = c.staff_id
      left join tk.customers cu on cu.id = j.customer_id
     where j.starts_at >= ${from.toISOString()} and j.starts_at < ${to.toISOString()}
       and j.status <> 'cancelled'
       ${onlyMine ? sql`and s.id = ${staff.id}` : sql``}
     order by j.starts_at
  `;

  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  const byDay = new Map(days.map((d) => [d, jobs.filter((j) => dateKeyOf(j.starts_at) === d)]));

  const mapUrl = (j: DayJob) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [j.address, j.postal_code, j.city].filter(Boolean).join(', '),
    )}`;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {onlyMine ? 'Omat työt' : 'Tänään ja seuraava viikko'}
        </h1>
        <p className="text-sm text-muted">{jobs.length} työtä kahdeksan päivän sisällä</p>
      </header>

      {days.map((day) => {
        const dayJobs = byDay.get(day) ?? [];
        if (dayJobs.length === 0 && day !== today) return null;

        return (
          <section key={day} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">
                {day === today ? 'Tänään' : weekdayName(isoWeekday(day))}
              </h2>
              <span className="text-xs text-faint tabular">{formatDateKey(day)}</span>
            </div>

            {dayJobs.length === 0 ? (
              <Card><Empty>Ei töitä.</Empty></Card>
            ) : (
              dayJobs.map((job) => (
                <Card key={job.id} className="p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-lg font-semibold tabular">
                      {timeOf(job.starts_at)}–{timeOf(job.ends_at)}
                    </span>
                    <StatusBadge status={job.status} />
                    <Link href={`/tyot/${job.id}`}
                          className="ml-auto text-xs text-accent hover:underline tabular">
                      {job.job_number} →
                    </Link>
                  </div>

                  <p className="mt-2 text-base font-medium">{job.customer_name ?? job.title}</p>
                  <p className="text-sm text-muted">
                    {[job.address, job.postal_code, job.city].filter(Boolean).join(', ') || 'Ei osoitetta'}
                  </p>
                  {!onlyMine && <p className="mt-1 text-xs text-faint">{job.staff_name}</p>}

                  {job.notes && (
                    <p className="mt-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
                      {job.notes}
                    </p>
                  )}

                  {/* Puhelimessa nämä ovat päivän tärkeimmät napit: reitti,
                      soitto asiakkaalle ja työn kvittaus tehdyksi. */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.address && (
                      <a href={mapUrl(job)} target="_blank" rel="noreferrer"
                         className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink">
                        Reitti
                      </a>
                    )}
                    {job.customer_phone && (
                      <a href={`tel:${job.customer_phone.replace(/\s/g, '')}`}
                         className="rounded-md border border-line px-3 py-2 text-sm">
                        Soita {job.customer_phone}
                      </a>
                    )}
                    <span className="ml-auto self-center text-sm tabular text-muted">
                      {(job.price_cents / 100).toLocaleString('fi-FI')} €
                    </span>
                    {job.status !== 'done' && <MarkDone id={job.id} />}
                  </div>
                </Card>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
