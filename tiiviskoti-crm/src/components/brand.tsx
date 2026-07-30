/* TiivisKoti-merkki: ovi jonka karmissa on tiiviste.
   Sama ajatus kuin sivuston logossa — oven kehä ja sisempi viiva, joka on
   se tiiviste jota yritys myy. Piirretään SVG:nä eikä kuvatiedostona,
   jotta se pysyy terävänä ja perii värin ympäristöstä. */

export function BrandMark({ className = '', size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      {/* Karmi */}
      <rect x="3.5" y="2.5" width="17" height="19" rx="2.5"
            stroke="currentColor" strokeWidth="1.8" />
      {/* Tiiviste: sisempi kehä */}
      <rect x="6.5" y="5.5" width="11" height="13" rx="1.5"
            stroke="currentColor" strokeWidth="1.3" opacity=".55" />
      {/* Kahva */}
      <circle cx="15.4" cy="12" r="1.15" fill="currentColor" />
    </svg>
  );
}

/** Sivupalkin ja kirjautumissivun nimilogo. */
export function BrandWord({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const strong = tone === 'light' ? 'text-nav-text' : 'text-text';
  const soft = tone === 'light' ? 'text-nav-muted' : 'text-accent';
  return (
    <span className={`text-[15px] font-extrabold tracking-tight ${strong}`}>
      Tiivis<span className={soft}>Koti</span>
    </span>
  );
}
