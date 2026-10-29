'use client';

import { useRef, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';
import { setViewMode } from './view-actions';
import { VIEW_LABELS, type ViewMode } from '@/lib/view';

/* Näkymän vaihto navin ylälaidassa, koska sen on oltava näkyvissä koko
   ajan: ilman sitä toimistolainen ei tiedä katsovansa asentajan näkymää,
   ja ihmettelee miksi puolet luvuista puuttuu. */
export function ViewSwitch({ current }: { current: ViewMode }) {
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);


  const modes: ViewMode[] = ['toimisto', 'asennus'];

  /* Kaksi näkyvää vaihtoehtoa rinnakkain (iOS:n segmenttivalitsin)
     pudotusvalikon sijaan: valittu tila näkyy suoraan, ja vaihto on yksi
     napautus. Ei <form>:ia (ks. git-historia: submit ei ehtinyt lähteä). */
  return (
    <div ref={box} role="radiogroup" aria-label="Näkymä"
         className="inline-flex rounded-[12px] bg-ink-700 p-1">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={mode === current}
          disabled={pending}
          onClick={() => {
            if (mode !== current) startTransition(() => setViewMode(mode, pathname));
          }}
          className={cx(
            'min-h-10 rounded-[9px] px-3.5 text-[15px] disabled:cursor-progress',
            mode === current
              ? 'bg-white font-bold text-text shadow-[0_1px_3px_rgba(0,0,0,.15)]'
              : 'font-medium text-muted',
          )}
        >
          {VIEW_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
