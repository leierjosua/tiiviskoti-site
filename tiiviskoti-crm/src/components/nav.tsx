'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cx } from './ui';

/* Navigaatio toimii kahdessa muodossa: työpöydällä kiinteä sivupalkki,
   puhelimessa yläpalkki jonka takaa valikko avautuu. Asentaja katsoo päivän
   työt puhelimesta, joten kiinteä sivupalkki ei riitä. */

export type NavItem = { href: string; label: string };

export function Nav({ items, staffName, staffEmail, logout }: {
  items: NavItem[];
  staffName: string;
  staffEmail: string;
  logout: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const links = (onClick?: () => void) => items.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={onClick}
      className={cx(
        'block rounded-md px-3 py-2 text-sm transition-colors',
        isActive(item.href)
          ? 'bg-accent/15 text-accent'
          : 'text-muted hover:bg-ink-700 hover:text-text',
      )}
    >
      {item.label}
    </Link>
  ));

  return (
    <>
      {/* Puhelin: yläpalkki */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink-800 px-4 py-3 md:hidden">
        <span className="h-5 w-5 rounded bg-accent" aria-hidden />
        <span className="flex-1 text-sm font-semibold tracking-tight">TiivisKoti</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Valikko"
          className="rounded-md border border-line px-3 py-1.5 text-sm text-muted"
        >
          {open ? 'Sulje' : 'Valikko'}
        </button>
      </header>

      {open && (
        <div className="border-b border-line bg-ink-800 px-2 py-2 md:hidden">
          <nav className="space-y-0.5">{links(() => setOpen(false))}</nav>
          <div className="mt-2 border-t border-line px-3 pt-2">
            <p className="truncate text-xs text-text">{staffName}</p>
            <p className="mb-1 truncate text-xs text-faint">{staffEmail}</p>
            {logout}
          </div>
        </div>
      )}

      {/* Työpöytä: sivupalkki */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-ink-800 md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="h-5 w-5 rounded bg-accent" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">TiivisKoti</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">{links()}</nav>
        <div className="border-t border-line px-3 py-3">
          <p className="truncate text-xs text-text">{staffName}</p>
          <p className="mb-2 truncate text-xs text-faint">{staffEmail}</p>
          {logout}
        </div>
      </aside>
    </>
  );
}
