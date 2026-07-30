import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { Card, CardHeader, Empty, Input } from '@/components/ui';
import { dateKeyOf, formatDateKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string; full_name: string; email: string | null; phone: string | null;
  address: string | null; postal_code: string | null; city: string | null;
  jobs: number; last_job: Date | null; total_cents: number;
};

export default async function CustomersPage({
  searchParams,
}: { searchParams: Promise<{ haku?: string }> }) {
  await requireStaff();
  const { haku } = await searchParams;
  const q = (haku ?? '').trim();

  /* Haku osuu nimeen, sähköpostiin, puhelimeen ja osoitteeseen — asiakas
     etsitään käytännössä aina jollakin näistä, ei koskaan id:llä. */
  const customers = await sql<CustomerRow[]>`
    select c.id, c.full_name, c.email, c.phone, c.address, c.postal_code, c.city,
           (select count(*)::int from tk.jobs j where j.customer_id = c.id) as jobs,
           (select max(j.starts_at) from tk.jobs j where j.customer_id = c.id) as last_job,
           (select coalesce(sum(j.price_cents), 0)::int from tk.jobs j
             where j.customer_id = c.id and j.status <> 'cancelled') as total_cents
      from tk.customers c
     ${q
       ? sql`where c.full_name ilike ${'%' + q + '%'}
                or coalesce(c.email, '') ilike ${'%' + q + '%'}
                or coalesce(c.phone, '') ilike ${'%' + q + '%'}
                or coalesce(c.address, '') ilike ${'%' + q + '%'}
                or coalesce(c.postal_code, '') like ${q + '%'}`
       : sql``}
     order by (select max(j.starts_at) from tk.jobs j where j.customer_id = c.id) desc nulls last,
              c.full_name
     limit 200
  `;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Asiakkaat</h1>
        <p className="text-sm text-muted">
          {q ? `${customers.length} osumaa haulla “${q}”` : `${customers.length} asiakasta`}
        </p>
      </header>

      <Card className="overflow-x-auto">
        <CardHeader
          title="Asiakkaat"
          action={
            <form className="flex gap-2">
              <Input name="haku" defaultValue={q} placeholder="Nimi, puhelin, osoite…"
                     className="w-56 py-1 text-xs" />
            </form>
          }
        />
        {customers.length === 0 ? (
          <Empty>{q ? 'Ei osumia.' : 'Ei asiakkaita vielä.'}</Empty>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-4 py-2 font-medium">Nimi</th>
                <th className="px-4 py-2 font-medium">Puhelin</th>
                <th className="px-4 py-2 font-medium">Osoite</th>
                <th className="px-4 py-2 font-medium text-right">Töitä</th>
                <th className="px-4 py-2 font-medium text-right">Yhteensä</th>
                <th className="px-4 py-2 font-medium">Viimeisin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-ink-700">
                  <td className="px-4 py-2.5">
                    <Link href={`/asiakkaat/${c.id}`} className="text-accent hover:underline">
                      {c.full_name}
                    </Link>
                    {c.email && <div className="text-xs text-faint">{c.email}</div>}
                  </td>
                  <td className="px-4 py-2.5 tabular">
                    {c.phone
                      ? <a href={`tel:${c.phone}`} className="hover:text-accent">{c.phone}</a>
                      : '—'}
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-2.5 text-muted">
                    {[c.address, c.postal_code, c.city].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{c.jobs}</td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {(c.total_cents / 100).toLocaleString('fi-FI')} €
                  </td>
                  <td className="px-4 py-2.5 text-muted tabular">
                    {c.last_job ? formatDateKey(dateKeyOf(c.last_job)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
