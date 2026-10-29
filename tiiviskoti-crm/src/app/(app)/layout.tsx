import { requireStaff, viewMode } from '@/lib/session';
import { logout } from '../login/actions';
import { Nav, type NavGroup } from '@/components/nav';
import type { IconName } from '@/components/icons';
import { ViewSwitch } from './view-switch';

/* Navigaatio riippuu kahdesta asiasta: roolista (mihin on oikeus) ja
   näkymästä (mitä juuri nyt tehdään). Toimistolainen voi katsoa asennuksen
   näkymää ilman että hän menettää oikeuksiaan — valikko kaventuu, koska
   asennusnäkymässä liidit ja mainoskonversiot ovat pelkkää kohinaa.

   Asentajalle jää kolme kohtaa: Etusivu, Kalenteri ja Työt, kaikki rajattuna
   hänen omiin kalentereihinsa. Asiakasrekisteriä hän ei näe — keikan
   asiakkaan nimi, osoite ja puhelin ovat keikan omalla sivulla, ja siinä on
   kaikki mitä työn tekemiseen tarvitaan. Omistajalta ja toimistolta sitä ei
   sen sijaan piiloteta asennusnäkymässäkään: heillä on siihen oikeus, ja
   näkymä on heille kulma samaan työhön eikä kapeampi tili.

   VALIKKO EI OLE SUOJAUS. Piilotettu linkki on vain siistimpi käyttöliittymä;
   pääsyn ratkaisee `requireManager` sivulla JA jokaisessa actionissa. */
const NAV: {
  href: string; label: string; short?: string; asennusLabel?: string;
  icon: IconName; group: NavGroup; asennus?: boolean; managerOnly?: boolean;
}[] = [
  /* Järjestys = alapalkin järjestys puhelimessa: neljä ensimmäistä näkyvät
     aina, loput "Lisää"-näkymässä. */
  { href: '/', label: 'Tänään', asennusLabel: 'Etusivu', icon: 'home', group: 'paiva', asennus: true },
  { href: '/kalenteri', label: 'Kalenteri', icon: 'calendar', group: 'paiva', asennus: true },
  { href: '/tyot', label: 'Työt', icon: 'wrench', group: 'paiva', asennus: true },
  { href: '/kartoitus', label: 'Kartoitus', icon: 'clipboard', group: 'paiva', asennus: true },
  /* Omat ajat on asentajan oma sivu, joten se on päivän töiden ryhmässä —
     ei asetusten seassa. */
  { href: '/omat-ajat', label: 'Omat ajat', icon: 'clock', group: 'paiva', asennus: true },
  { href: '/tarjoukset', label: 'Tarjoukset', icon: 'doc', group: 'myynti', managerOnly: true },
  { href: '/asiakkaat', label: 'Asiakkaat', icon: 'people', group: 'myynti', managerOnly: true, asennus: true },
  { href: '/liidit', label: 'Liidit (yhteydenotot)', short: 'Liidit', icon: 'inbox', group: 'myynti', managerOnly: true },
  { href: '/saatavuus', label: 'Saatavuus', icon: 'clock', group: 'lisaa', managerOnly: true },
  { href: '/kalenterit', label: 'Työajat', icon: 'calendar', group: 'lisaa', managerOnly: true },
  { href: '/alueet', label: 'Palvelualueet', icon: 'pin', group: 'lisaa', managerOnly: true },
  { href: '/tyontekijat', label: 'Työntekijät', icon: 'people', group: 'lisaa', managerOnly: true },
  { href: '/analytiikka', label: 'Analytiikka', icon: 'chart', group: 'lisaa', managerOnly: true },
  { href: '/ulkoreach', label: 'Ulkoreach', icon: 'megaphone', group: 'lisaa', managerOnly: true },
  { href: '/ads', label: 'Ads-konversiot', icon: 'chart', group: 'lisaa', managerOnly: true },
  { href: '/meta', label: 'Meta-mainokset', icon: 'megaphone', group: 'lisaa', managerOnly: true },
  { href: '/alekoodit', label: 'Alennuskoodit', icon: 'tag', group: 'lisaa', managerOnly: true },
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
    .map((i) => ({ href: i.href, label: (asennus && i.asennusLabel) || i.label, short: i.short, icon: i.icon, group: i.group }));

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
              className="min-h-12 w-full rounded-[12px] border-[1.5px] border-line bg-white px-4 text-[17px] font-semibold text-danger"
            >
              Kirjaudu ulos
            </button>
          </form>
        }
      />
      {/* Puhelimessa tilaa alapalkille (--tabbar-h, globals.css). */}
      <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(var(--tabbar-h)+24px)] md:p-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
