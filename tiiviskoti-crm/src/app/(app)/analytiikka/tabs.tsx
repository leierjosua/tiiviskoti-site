import Link from 'next/link';
import { cx } from '@/components/ui';

/* Analytiikka on kaksi eri kysymystä samasta yrityksestä: mistä asiakas
   tulee (sivusto) ja mitä siitä jää käteen (talous). Ne ovat eri sivuja,
   koska kumpikin on täysi näkymä — mutta saman valikkokohdan alla, jotta
   toisesta pääsee toiseen ilman että pitää tietää kumpi niistä on
   "Analytiikka". */
const TABS = [
  { href: '/analytiikka/talous',  label: 'Talous' },
  { href: '/analytiikka/sivusto', label: 'Sivusto' },
];

export function AnalyticsTabs({ current }: { current: string }) {
  return (
    <nav className="flex items-center gap-1 border-b border-line pb-px">
      {TABS.map((t) => {
        const active = current === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors',
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
