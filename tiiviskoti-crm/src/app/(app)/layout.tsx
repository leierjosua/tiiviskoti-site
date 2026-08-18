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
  { href: '/analytiikka/sivusto', label: 'Analytiikka', managerOnly: true },
  { href: '/ads', label: 'Ads-konversiot', managerOnly: true },
  { href: '/meta', label: 'Meta-mainokset', managerOnly: true },
  { href: '/alekoodit', label: 'Alennuskoodit', managerOnly: true },
  { href: '/tyontekijat', label: 'Työntekijät', managerOnly: true },
];

const ROLE_LABELS: Record<string, string> = {
  owner: 'Omistaja',
  admin: 'Toimisto',
  installer: 'Asentaja',
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const isManager = staff.role !== 'installer';

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav
        items={NAV.filter((i) => isManager || !i.managerOnly).map(({ href, label }) => ({ href, label }))}
        staffName={staff.fullName}
        staffEmail={staff.email}
        staffRole={ROLE_LABELS[staff.role] ?? staff.role}
        logout={
          <form action={logout}>
            <button
              type="submit"
              className="text-xs font-semibold text-accent underline underline-offset-2 transition-colors hover:text-text"
            >
              Kirjaudu ulos
            </button>
          </form>
        }
      />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
