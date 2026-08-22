'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cx } from './ui';
import { BrandMark, BrandWord } from './brand';

/* Navigaatio toimii kahdessa muodossa: työpöydällä kiinteä sivupalkki,
   puhelimessa yläpalkki jonka takaa valikko avautuu. Asentaja katsoo päivän
   työt puhelimesta, joten kiinteä sivupalkki ei riitä.

   Sivupalkki oli aiemmin tumma vihreä ja siten sivun raskain elementti,
   vaikka sisältö on se mitä katsotaan. Nyt se on vaalea paneeli ja erottuu
   työtilasta vain reunaviivalla — vihreä on säästetty aktiiviselle kohdalle,
   joka on ainoa asia mitä valikosta pitää nähdä yhdellä silmäyksellä. */

export type NavItem = { href: string; label: string };

export function Nav({ items, staffName, staffEmail, staffRole, logout, viewSwitch }: {
  items: NavItem[];
  staffName: string;
  staffEmail: string;
  staffRole: string;
  logout: React.ReactNode;
  /** Näkymän vaihto. Vain toimistolla — asentajalla ei ole mitä vaihtaa. */
  viewSwitch?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const links = (onClick?: () => void) => items.map((item) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'relative block rounded-lg py-2.5 pr-3 pl-4 transition-colors',
          active
            ? 'bg-accent-dim font-bold text-accent'
            : 'font-medium text-nav-muted hover:bg-ink-700 hover:text-nav-text',
        )}
      >
        {/* Aktiivinen kohta erottuu kolmella tavalla: pinta, lihavointi ja
            palkki. Pelkkä väri ei riitä — se katoaa värisokealta ja
            heikossa valossa. */}
        {active && (
          <span className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
        )}
        {item.label}
      </Link>
    );
  });

  const account = (
    <div className="rounded-lg bg-nav-deep px-3 py-3">
      <p className="truncate text-sm font-bold text-nav-text">{staffName}</p>
      <p className="truncate text-xs text-nav-muted">{staffEmail}</p>
      <p className="mt-0.5 text-xs text-faint">{staffRole}</p>
      <div className="mt-2">{logout}</div>
    </div>
  );

  return (
    <>
      {/* Puhelin: yläpalkki */}
      <header className="nav-surface sticky top-0 z-30 flex items-center gap-2.5 border-b border-nav-line bg-nav px-4 py-3 md:hidden">
        <BrandMark size={24} tone="light" />
        <BrandWord tone="light" />
        <span className="flex-1">{viewSwitch}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Valikko"
          className="rounded-lg border border-line bg-ink-800 px-3.5 py-2 text-sm font-semibold text-text transition-colors hover:bg-ink-700"
        >
          {open ? 'Sulje' : 'Valikko'}
        </button>
      </header>

      {open && (
        <div className="nav-surface border-b border-nav-line bg-nav px-3 pb-3 md:hidden">
          <nav className="space-y-0.5">{links(() => setOpen(false))}</nav>
          <div className="mt-3">{account}</div>
        </div>
      )}

      {/* Työpöytä: sivupalkki. Reunaviiva erottaa sen työtilasta nyt kun
          kumpikin on vaalea. */}
      <aside className="nav-surface hidden w-60 shrink-0 flex-col border-r border-nav-line bg-nav md:flex">
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-3">
          <BrandMark size={28} tone="light" />
          <BrandWord tone="light" />
        </div>

        {viewSwitch && <div className="px-4 pb-4">{viewSwitch}</div>}

        <nav className="flex-1 space-y-1 px-3">{links()}</nav>

        <div className="px-3 pb-4">{account}</div>
      </aside>
    </>
  );
}
