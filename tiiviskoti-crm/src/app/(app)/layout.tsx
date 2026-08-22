import { requireStaff, viewMode } from '@/lib/session';
import { logout } from '../login/actions';
import { Nav } from '@/components/nav';
import { ViewSwitch } from './view-switch';

/* Navigaatio riippuu kahdesta asiasta: roolista (mihin on oikeus) ja
   näkymästä (mitä juuri nyt tehdään). Toimistolainen voi katsoa asennuksen
   näkymää ilman että hän menettää oikeuksiaan — valikko kaventuu, koska
   asennusnäkymässä liidit ja mainoskonversiot ovat pelkkää kohinaa. */
const NAV = [
  { href: '/', label: 'Tänään', asennusLabel: 'Etusivu', asennus: true },
  { href: '/kalenteri', label: 'Kalenteri', asennus: true },
  { href: '/tyot', label: 'Työt', asennus: true },
  { href: '/tarjoukset', label: 'Tarjoukset', managerOnly: true },
  { href: '/asiakkaat', label: 'Asiakkaat', asennus: true },
  { href: '/kalenterit', label: 'Työajat', managerOnly: true },
  { href: '/alueet', label: 'Palvelualueet', managerOnly: true },
  { href: '/liidit', label: 'Liidit', managerOnly: true },
  { href: '/ulkoreach', label: 'Ulkoreach', managerOnly: true },
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
  const view = await viewMode(staff);
  const asennus = view === 'asennus';

  const items = NAV
    .filter((i) => (isManager || !i.managerOnly) && (!asennus || i.asennus))
    .map((i) => ({ href: i.href, label: (asennus && i.asennusLabel) || i.label }));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav
        items={items}
        staffName={staff.fullName}
        staffEmail={staff.email}
        staffRole={ROLE_LABELS[staff.role] ?? staff.role}
        viewSwitch={isManager ? <ViewSwitch current={view} /> : undefined}
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
