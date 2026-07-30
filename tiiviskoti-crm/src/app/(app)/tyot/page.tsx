import Link from 'next/link';
import { listJobs } from '@/lib/data';
import { addDays, dateKeyOf, formatDateKey, helsinkiDateTime, timeOf } from '@/lib/time';
import { Card, CardHeader, Empty, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const RANGES = {
  tulevat: { label: 'Tulevat', from: 0, to: 120 },
  menneet: { label: 'Menneet', from: -120, to: 0 },
} as const;

type RangeKey = keyof typeof RANGES;

export default async function JobsPage({
  searchParams,
}: { searchParams: Promise<{ jakso?: string }> }) {
  const { jakso } = await searchParams;
  const key: RangeKey = jakso === 'menneet' ? 'menneet' : 'tulevat';
  const range = RANGES[key];

  const today = dateKeyOf(new Date());
  const from = helsinkiDateTime(addDays(today, range.from), '00:00');
  const to = helsinkiDateTime(addDays(today, range.to), '00:00');

  const jobs = await listJobs(from.toISOString(), to.toISOString());
  const ordered = key === 'menneet' ? [...jobs].reverse() : jobs;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Työt</h1>
          <p className="text-sm text-muted">{ordered.length} työtä</p>
        </div>
        <Link
          href="/tyot/uusi"
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink hover:bg-accent/90"
        >
          Uusi työ
        </Link>
      </header>

      <Card className="overflow-x-auto">
        <CardHeader
          title="Varaukset"
          action={
            <div className="flex gap-1 text-xs">
              {(Object.keys(RANGES) as RangeKey[]).map((r) => (
                <Link
                  key={r}
                  href={`/tyot?jakso=${r}`}
                  className={
                    r === key
                      ? 'rounded bg-ink-600 px-2 py-1 text-text'
                      : 'rounded px-2 py-1 text-muted hover:text-text'
                  }
                >
                  {RANGES[r].label}
                </Link>
              ))}
            </div>
          }
        />

        {ordered.length === 0 ? (
          <Empty>Ei töitä tällä jaksolla.</Empty>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-4 py-2 font-medium">Numero</th>
                <th className="px-4 py-2 font-medium">Päivä</th>
                <th className="px-4 py-2 font-medium">Aika</th>
                <th className="px-4 py-2 font-medium">Asiakas</th>
                <th className="px-4 py-2 font-medium">Osoite</th>
                <th className="px-4 py-2 font-medium">Asentaja</th>
                <th className="px-4 py-2 font-medium">Tila</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {ordered.map((job) => (
                <tr key={job.id} className="hover:bg-ink-700">
                  <td className="px-4 py-2.5">
                    <Link href={`/tyot/${job.id}`} className="text-accent hover:underline tabular">
                      {job.job_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted tabular">
                    {formatDateKey(dateKeyOf(job.starts_at))}
                  </td>
                  <td className="px-4 py-2.5 tabular">
                    {timeOf(job.starts_at)}–{timeOf(job.ends_at)}
                  </td>
                  <td className="px-4 py-2.5">{job.customer_name ?? '—'}</td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-muted">
                    {[job.address, job.postal_code, job.city].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{job.staff_name}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={job.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
