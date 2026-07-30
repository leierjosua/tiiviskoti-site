/* TiivisKoti-logo.

   Tämä on SAMA merkki kuin tiiviskoti.fi:n navigaatiossa (index.html
   `a.logo > svg.mark`), ei uudelleentulkinta: pyöristetty neliö, sen sisällä
   oven ääriviiva ja pystypalkki joka on tiiviste. Jos sivuston logo muuttuu,
   tämä on muutettava samalla.

   Kaksi sävyä, kuten sivustollakin:
     dark  = tummalla pinnalla (sivupalkki) — läpikuultava neliö, vihreä palkki
     light = vaalealla pinnalla — täysi vihreä neliö, vaalea palkki */

export function BrandMark({
  size = 26,
  tone = 'dark',
  className = '',
}: { size?: number; tone?: 'dark' | 'light'; className?: string }) {
  const onDark = tone === 'dark';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      className={className}
    >
      <rect
        width="100" height="100" rx="22"
        fill={onDark ? 'rgba(246,247,243,.14)' : '#217A4E'}
      />
      {/* Ovi */}
      <rect x="31" y="20" width="38" height="60" rx="3"
            fill="none" stroke="#F6F7F3" strokeWidth="5" />
      {/* Tiiviste */}
      <rect x="35" y="20" width="4" height="60"
            fill={onDark ? '#2E9E63' : '#F6F7F3'} />
    </svg>
  );
}

/** Nimilogo. `Tiivis` vahvana, `Koti` korostusvärillä — kuten sivustolla. */
export function BrandWord({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const onDark = tone === 'dark';
  return (
    <span className={`text-[15px] font-extrabold tracking-tight ${onDark ? 'text-nav-text' : 'text-text'}`}>
      Tiivis<span style={{ color: onDark ? '#2E9E63' : '#217A4E' }}>Koti</span>
    </span>
  );
}
