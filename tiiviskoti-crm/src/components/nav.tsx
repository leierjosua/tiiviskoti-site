'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cx } from './ui';
import { BrandMark, BrandWord } from './brand';
import { Icon, type IconName } from './icons';

/* =========================================================
   Navigaatio — tehty niin, että eksyminen on vaikeaa.

   PUHELIN: alapalkki kuten iPhonen sovelluksissa. Neljä tärkeintä kohtaa
   on aina näkyvissä isolla kuvakkeella JA sanalla, ja "Lisää" avaa loput
   koko näytön listana (kuten iPhonen Asetukset). Ennen valikko oli
   piilossa "Valikko"-napin takana yläkulmassa — piilotettu navigaatio on
   ikääntyvälle käyttäjälle sama kuin olematon.

   TYÖPÖYTÄ: sivupalkki ryhmiteltynä. 17 peräkkäistä linkkiä ilman
   ryhmiä oli lista jota piti lukea ylhäältä alas joka kerta; nyt
   päivittäiset työt ovat ylimpänä ja harvoin tarvittavat taitettuna.

   Lisää-näkymä liukuu alhaalta ja poistuu samaa reittiä (Apple: spatial
   consistency). prefers-reduced-motion → pelkkä häivytys (globals.css).
   ========================================================= */

export type NavGroup = 'paiva' | 'myynti' | 'lisaa';
export type NavItem = { href: string; label: string; short?: string; icon: IconName; group: NavGroup };

const GROUP_TITLES: Record<NavGroup, string> = {
  paiva: 'Päivän työt',
  myynti: 'Asiakkaat ja myynti',
  lisaa: 'Asetukset ja raportit',
};

/** Alapalkissa näkyvien kohtien määrä; loput Lisää-näkymässä. */
const TAB_COUNT = 4;

export function Nav({ items, staffName, staffEmail, staffRole, logout, viewSwitch }: {
  items: NavItem[];
  staffName: string;
  staffEmail: string;
  staffRole: string;
  logout: React.ReactNode;
  /** Näkymän vaihto. Vain toimistolla — asentajalla ei ole mitä vaihtaa. */
  viewSwitch?: React.ReactNode;
}) {
  const [sheet, setSheet] = useState(false);
  const pathname = usePathname();

  // Sivun vaihtuessa Lisää-näkymä sulkeutuu itsestään.
  useEffect(() => { setSheet(false); }, [pathname]);
  // Taustan vieritys pois päältä kun näkymä on auki.
  useEffect(() => {
    document.body.style.overflow = sheet ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sheet]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const tabs = items.slice(0, TAB_COUNT);
  const moreActive = !tabs.some((t) => isActive(t.href));
  const groups = (['paiva', 'myynti', 'lisaa'] as NavGroup[])
    .map((g) => ({ g, list: items.filter((i) => i.group === g) }))
    .filter((x) => x.list.length > 0);

  const account = (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-dim text-accent">
        <Icon name="user" size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-semibold text-text">{staffName}</p>
        <p className="truncate text-[15px] text-faint">{staffRole} · {staffEmail}</p>
      </div>
    </div>
  );

  /* ---------- työpöytä: sivupalkin rivi ---------- */
  const sideLink = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'press flex min-h-12 items-center gap-3 rounded-[12px] px-3 text-[17px]',
          active ? 'bg-accent text-white font-semibold' : 'text-text hover:bg-ink-700',
        )}
      >
        <Icon name={item.icon} size={22} className={active ? 'text-white' : 'text-accent'} />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      {/* ---------- puhelin: yläpalkki (vain brändi + näkymän vaihto) ---------- */}
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-nav-line bg-white/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 md:hidden">
        <BrandMark size={28} tone="light" />
        <BrandWord tone="light" />
        <span className="flex-1" />
        {viewSwitch}
      </header>

      {/* ---------- puhelin: alapalkki ---------- */}
      <nav
        aria-label="Päävalikko"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-nav-line bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        <div className="grid grid-cols-5">
          {tabs.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'press flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[13px] leading-none',
                  active ? 'font-bold text-accent' : 'font-medium text-muted',
                )}
              >
                <Icon name={item.icon} size={27} />
                <span className="max-w-full truncate">{item.short ?? item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-expanded={sheet}
            className={cx(
              'flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[13px] leading-none',
              moreActive ? 'font-bold text-accent' : 'font-medium text-muted',
            )}
          >
            <Icon name="more" size={27} />
            Lisää
          </button>
        </div>
      </nav>

      {/* ---------- puhelin: Lisää-näkymä ---------- */}
      <div
        className={cx(
          'fixed inset-0 z-50 transition-opacity duration-200 md:hidden',
          sheet ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!sheet}
      >
        <div className="absolute inset-0 bg-black/30" onClick={() => setSheet(false)} />
        <div
          role="dialog"
          aria-label="Kaikki toiminnot"
          className={cx(
            'absolute inset-x-0 bottom-0 top-6 overflow-y-auto rounded-t-[22px] bg-ink-900 pb-[calc(24px+env(safe-area-inset-bottom))]',
            'transition-transform duration-[380ms] ease-[cubic-bezier(.32,.72,0,1)]',
            sheet ? 'translate-y-0' : 'translate-y-full',
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between bg-ink-900/90 px-5 pt-4 pb-3 backdrop-blur-xl">
            <h2 className="text-[28px] font-bold">Kaikki toiminnot</h2>
            <button
              type="button"
              onClick={() => setSheet(false)}
              className="min-h-12 rounded-full bg-accent px-5 text-[17px] font-semibold text-white"
            >
              Valmis
            </button>
          </div>

          <div className="space-y-6 px-4">
            {groups.map(({ g, list }) => (
              <section key={g}>
                <h3 className="px-3 pb-2 text-[15px] font-semibold text-faint">{GROUP_TITLES[g]}</h3>
                <div className="divide-y divide-line-soft overflow-hidden rounded-[14px] bg-white">
                  {list.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className="flex min-h-14 items-center gap-3.5 px-4 text-[18px] active:bg-ink-700"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent text-white">
                          <Icon name={item.icon} size={21} />
                        </span>
                        <span className={cx('flex-1', active && 'font-bold text-accent')}>{item.label}</span>
                        <span aria-hidden className="text-[22px] text-faint">›</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}

            <section className="space-y-4 rounded-[14px] bg-white p-4">
              {account}
              {logout}
            </section>
          </div>
        </div>
      </div>

      {/* ---------- työpöytä: sivupalkki ---------- */}
      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col overflow-y-auto border-r border-nav-line bg-nav md:flex">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-4">
          <BrandMark size={32} tone="light" />
          <BrandWord tone="light" />
        </div>

        {viewSwitch && <div className="px-5 pb-4">{viewSwitch}</div>}

        <nav aria-label="Päävalikko" className="flex-1 space-y-5 px-3">
          {groups.map(({ g, list }) => g === 'lisaa' ? (
            /* Harvoin tarvitut taitettuna, mutta auki jos olet jo siellä. */
            <details key={g} open={list.some((i) => isActive(i.href))} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-[12px] px-3 text-[15px] font-semibold text-faint hover:bg-ink-700">
                {GROUP_TITLES[g]}
                <span aria-hidden className="text-[18px] transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="mt-1 space-y-0.5">{list.map(sideLink)}</div>
            </details>
          ) : (
            <div key={g}>
              <p className="px-3 pb-1.5 text-[15px] font-semibold text-faint">{GROUP_TITLES[g]}</p>
              <div className="space-y-0.5">{list.map(sideLink)}</div>
            </div>
          ))}
        </nav>

        <div className="m-3 space-y-3 rounded-[14px] bg-nav-deep p-4">
          {account}
          {logout}
        </div>
      </aside>
    </>
  );
}
