import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { Card, CardHeader, Empty, StatusBadge } from '@/components/ui';
import { dateKeyOf, formatDateKey, timeOf } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const [customer] = await sql<{
    id: string; full_name: string; email: string | null; phone: string | null;
    address: string | null; postal_code: string | null; city: string | null;
    notes: string | null; created_at: Date;
  }[]>`
    select id, full_name, email, phone, address, postal_code, city, notes, created_at
      from tk.customers where id = ${id}
  `;
  if (!customer) notFound();

  const jobs = await sql<{
    id: string; job_number: string; starts_at: Date; ends_at: Date;
    status: string; title: string; price_cents: number; staff_name: string;
  }[]>`
    select j.id, j.job_number, j.starts_at, j.ends_at, j.status::text as status,
           j.title, j.price_cents, s.full_name as staff_name
      from tk.jobs j
      join tk.calendars c on c.id = j.calendar_id
      join tk.staff s on s.id = c.staff_id
     where j.customer_id = ${id}
     order by j.starts_at desc
  `;

  const billed = jobs
    .filter((j) => j.status !== 'cancelled')
    .reduce((s, j) => s + j.price_cents, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/asiakkaat" className="text-xs text-muted hover:text-text">← Asiakkaat</Link>
        <h1 className="text-xl font-semibold tracking-tight">{customer.full_name}</h1>
        <p className="text-sm text-muted">
          {jobs.length} työtä · yhteensä {(billed / 100).toLocaleString('fi-FI')} €
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Yhteystiedot" />
          <div className="divide-y divide-line-soft text-sm">
            <div className="px-4 py-2.5">
              <div className="text-xs text-faint">Puhelin</div>
              {customer.phone
                ? <a href={`tel:${customer.phone}`} className="text-accent hover:underline tabular">{customer.phone}</a>
                : <span className="text-muted">—</span>}
            </div>
            <div className="px-4 py-2.5">
              <div className="text-xs text-faint">Sähköposti</div>
              {customer.email
                ? <a href={`mailto:${customer.email}`} className="text-accent hover:underline">{customer.email}</a>
                : <span className="text-muted">—</span>}
            </div>
            <div className="px-4 py-2.5">
              <div className="text-xs text-faint">Osoite</div>
              <span className="text-muted">
                {[customer.address, customer.postal_code, customer.city].filter(Boolean).join(', ') || '—'}
              </span>
            </div>
            <div className="px-4 py-2.5">
              <div className="text-xs text-faint">Asiakkaana alkaen</div>
              <span className="text-muted tabular">
                {formatDateKey(dateKeyOf(customer.created_at))}
              </span>
            </div>
          </div>
          <p className="border-t border-line px-4 py-3 text-xs text-faint">
            Yhteystietoja muokataan työn sivulta — muutos näkyy kaikissa tämän asiakkaan töissä.
          </p>
        </Card>

        <Card className="overflow-x-auto">
          <CardHeader title="Työhistoria" />
          {jobs.length === 0 ? (
            <Empty>Ei töitä.</Empty>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-faint">
                  <th className="px-4 py-2 font-medium">Numero</th>
                  <th className="px-4 py-2 font-medium">Päivä</th>
                  <th className="px-4 py-2 font-medium">Työ</th>
                  <th className="px-4 py-2 font-medium">Asentaja</th>
                  <th className="px-4 py-2 font-medium text-right">Hinta</th>
                  <th className="px-4 py-2 font-medium">Tila</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-ink-700">
                    <td className="px-4 py-2.5">
                      <Link href={`/tyot/${j.id}`} className="text-accent hover:underline tabular">
                        {j.job_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted tabular">
                      {formatDateKey(dateKeyOf(j.starts_at))} {timeOf(j.starts_at)}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5">{j.title}</td>
                    <td className="px-4 py-2.5 text-muted">{j.staff_name}</td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {(j.price_cents / 100).toLocaleString('fi-FI')} €
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={j.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
