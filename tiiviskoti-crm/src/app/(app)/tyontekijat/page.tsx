import { listStaff } from '@/lib/data';
import { requireManager } from '@/lib/session';
import { adminAuthConfigured } from '@/lib/supabase-admin';
import { Card, CardHeader, Empty, PageHead } from '@/components/ui';
import { AddStaffForm, SetPasswordForm, ToggleActive } from './ui';

export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Omistaja',
  admin: 'Toimisto',
  installer: 'Asentaja',
};

export default async function StaffPage() {
  const me = await requireManager();
  const staff = await listStaff();
  /* Salasanan asetus on omistajan oikeus, ei toimiston: sillä ottaa
     kenen tahansa tunnuksen haltuun. Sama tarkistus tehdään uudelleen
     server actionissa — tämä vain piilottaa lomakkeen, ei suojaa mitään. */
  const canSetPasswords = me.role === 'owner';

  return (
    <div className="space-y-6">
      <PageHead
        title="Työntekijät"
        sub="Kirjautuminen vaatii sekä Supabase Auth -tunnuksen että aktiivisen rivin täällä."
      />

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

        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader title="Lisää työntekijä" />
            <div className="p-4">
              <AddStaffForm />
            </div>
          </Card>

          {canSetPasswords && (
            <Card className="h-fit">
              <CardHeader title="Aseta salasana" />
              <div className="p-4">
                <SetPasswordForm
                  configured={adminAuthConfigured()}
                  people={staff
                    .filter((p) => p.active)
                    .map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }))}
                />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
