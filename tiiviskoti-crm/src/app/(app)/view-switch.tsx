'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';
import { setViewMode } from './view-actions';
import { VIEW_LABELS, type ViewMode } from '@/lib/view';

/* Näkymän vaihto. Pieni tunnus navin ylälaidassa, koska sen on oltava
   näkyvissä koko ajan: ilman sitä toimistolainen ei tiedä katsovansa
   asentajan näkymää, ja ihmettelee miksi puolet luvuista puuttuu.

   Ei <select>: valintalista näyttäisi lomakekentältä, ja tämä ei ole
   lomake vaan tilanvaihto. */
export function ViewSwitch({ current }: { current: ViewMode }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const modes: ViewMode[] = ['toimisto', 'asennus'];

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full border border-line bg-nav-deep px-3 py-1.5
                   text-[11px] font-extrabold tracking-wide text-muted uppercase
                   transition-colors hover:border-accent hover:text-accent"
      >
        {VIEW_LABELS[current]}
        <span aria-hidden className="text-[9px]">▼</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-40 mt-1.5 w-44 rounded-lg border border-line
                     bg-ink-800 p-1.5 shadow-(--shadow-card)"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-bold tracking-wide text-faint uppercase">
            Näkymä
          </p>
          {/* Ei <form>: valikon sulkeminen klikillä purki lomakkeen DOM:ista
              ennen kuin submit ehti lähteä, eikä näkymä vaihtunut koskaan.
              Action kutsutaan suoraan, ja valikko suljetaan vasta kun se on
              mennyt läpi. */}
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => {
                if (mode === current) { setOpen(false); return; }
                setOpen(false);
                startTransition(() => setViewMode(mode, pathname));
              }}
              className={cx(
                'block w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                'disabled:cursor-progress disabled:opacity-60',
                mode === current
                  ? 'bg-accent-dim font-bold text-accent'
                  : 'font-medium text-text hover:bg-ink-700',
              )}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
