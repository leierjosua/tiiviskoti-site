export default function Logo({ dark = false }: { dark?: boolean }) {
  // Lasikiilto — ikkuna-symboli + sanamerkki. Vaalealla pohjalla ink + kirkas sininen,
  // tummalla (footer) kokovalkoinen (.dk-luokka hoitaa väritykset globals.css:ssä).
  const stroke = dark ? "#FFFFFF" : "#FFFFFF";
  const box = dark ? "rgba(255,255,255,.16)" : "#0968C8";
  return (
    <span className={`logo${dark ? " dk" : ""}`} aria-label="Lasikiilto">
      <svg className="ico" viewBox="0 0 100 100" fill="none">
        <rect width="100" height="100" rx="24" fill={box} />
        <rect x="26" y="22" width="48" height="56" rx="6" fill="none" stroke={stroke} strokeWidth="6" />
        <line x1="50" y1="22" x2="50" y2="78" stroke={stroke} strokeWidth="6" />
        <line x1="26" y1="50" x2="74" y2="50" stroke={stroke} strokeWidth="6" />
        <path d="M34 30 L44 40" stroke={stroke} strokeWidth="4" strokeLinecap="round" opacity={0.7} />
      </svg>
      <span className="lw">
        <span className="d">Lasi</span>
        <span className="b">kiilto</span>
      </span>
    </span>
  );
}
