import { listStaff } from '@/lib/data';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty } from '@/components/ui';
import { AddStaffForm, ToggleActive } from './ui';

export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Omistaja',
  admin: 'Toimisto',
  installer: 'Asentaja',
};

export default async function StaffPage() {
  await requireManager();
  const staff = await listStaff();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Työntekijät</h1>
        <p className="text-sm text-muted">
          Kirjautuminen vaatii sekä Supabase Auth -tunnuksen että aktiivisen rivin täällä.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-x-auto">
          <CardHeader title="Henkilöstö" />
          {staff.length === 0 ? (
            <Empty>Ei työntekijöitä.</Empty>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-faint">
                  <th className="px-4 py-2 font-medium">Nimi</th>
                  <th className="px-4 py-2 font-medium">Sähköposti</th>
                  <th className="px-4 py-2 font-medium">Puhelin</th>
                  <th className="px-4 py-2 font-medium">Rooli</th>
                  <th className="px-4 py-2 font-medium text-right">Tila</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {staff.map((person) => (
                  <tr key={person.id} className={person.active ? '' : 'text-faint'}>
                    <td className="px-4 py-2.5">{person.full_name}</td>
                    <td className="px-4 py-2.5 text-muted">{person.email}</td>
                    <td className="px-4 py-2.5 text-muted tabular">{person.phone ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted">{ROLE_LABELS[person.role]}</td>
                    <td className="px-4 py-2.5 text-right">
                      <ToggleActive id={person.id} active={person.active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Lisää työntekijä" />
          <div className="p-4">
            <AddStaffForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
