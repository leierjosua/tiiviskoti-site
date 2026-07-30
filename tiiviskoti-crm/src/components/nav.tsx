'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cx } from './ui';
import { BrandMark, BrandWord } from './brand';

/* Navigaatio toimii kahdessa muodossa: työpöydällä kiinteä syvänvihreä
   sivupalkki, puhelimessa yläpalkki jonka takaa valikko avautuu. Asentaja
   katsoo päivän työt puhelimesta, joten kiinteä sivupalkki ei riitä. */

export type NavItem = { href: string; label: string };

export function Nav({ items, staffName, staffEmail, staffRole, logout }: {
  items: NavItem[];
  staffName: string;
  staffEmail: string;
  staffRole: string;
  logout: React.ReactNode;
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
          'relative block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-white/12 text-nav-text'
            : 'text-nav-muted hover:bg-white/6 hover:text-nav-text',
        )}
      >
        {/* Aktiivinen kohta saa vaalean palkin vasempaan reunaan: väri yksin
            ei riitä erottumaan tummalla pinnalla. */}
        {active && (
          <span className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-white/70" />
        )}
        {item.label}
      </Link>
    );
  });

  const account = (
    <div className="rounded-lg bg-white/6 px-3 py-2.5">
      <p className="truncate text-[13px] font-semibold text-nav-text">{staffName}</p>
      <p className="truncate text-[11px] text-nav-muted">{staffEmail}</p>
      <p className="mt-0.5 text-[11px] text-nav-muted/70">{staffRole}</p>
      <div className="mt-1.5">{logout}</div>
    </div>
  );

  return (
    <>
      {/* Puhelin: yläpalkki */}
      <header className="nav-surface sticky top-0 z-30 flex items-center gap-2.5 bg-nav px-4 py-3 md:hidden">
        <BrandMark size={22} />
        <span className="flex-1"><BrandWord /></span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Valikko"
          className="rounded-lg border border-nav-line px-3 py-1.5 text-sm text-nav-muted transition-colors hover:text-nav-text"
        >
          {open ? 'Sulje' : 'Valikko'}
        </button>
      </header>

      {open && (
        <div className="nav-surface bg-nav px-3 pb-3 md:hidden">
          <nav className="space-y-0.5">{links(() => setOpen(false))}</nav>
          <div className="mt-3">{account}</div>
        </div>
      )}

      {/* Työpöytä: sivupalkki */}
      <aside className="nav-surface hidden w-56 shrink-0 flex-col bg-nav shadow-(--shadow-nav) md:flex">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <BrandMark size={26} />
          <BrandWord />
        </div>

        <nav className="flex-1 space-y-0.5 px-3">{links()}</nav>

        <div className="px-3 pb-4">{account}</div>
      </aside>
    </>
  );
}
