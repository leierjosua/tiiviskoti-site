import { requireStaff } from '@/lib/session';
import { logout } from '../login/actions';
import { Button } from '@/components/ui';
import { Nav } from '@/components/nav';

const NAV = [
  { href: '/', label: 'Tänään' },
  { href: '/kalenteri', label: 'Kalenteri' },
  { href: '/tyot', label: 'Työt' },
  { href: '/asiakkaat', label: 'Asiakkaat' },
  { href: '/kalenterit', label: 'Työajat', managerOnly: true },
  { href: '/alueet', label: 'Palvelualueet', managerOnly: true },
  { href: '/liidit', label: 'Liidit', managerOnly: true },
  { href: '/tyontekijat', label: 'Työntekijät', managerOnly: true },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const isManager = staff.role !== 'installer';

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav
        items={NAV.filter((i) => isManager || !i.managerOnly).map(({ href, label }) => ({ href, label }))}
        staffName={staff.fullName}
        staffEmail={staff.email}
        logout={
          <form action={logout}>
            <Button variant="ghost" type="submit" className="w-full justify-start px-0 text-xs">
              Kirjaudu ulos
            </Button>
          </form>
        }
      />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
