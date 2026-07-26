import Link from "next/link";
import Logo from "./Logo";

export default function V4Nav() {
  return (
    <nav className="top" id="nav"><div className="wrap">
      <Link href="/"><Logo /></Link>
      <div className="nlinks" id="nlinks">
        <Link href="/#varaa">Ikkunalaskuri</Link><Link href="/#palvelut">Palvelut</Link><Link href="/#laatu">Laatu</Link><Link href="/meista">Meistä</Link><Link href="/ota-yhteytta">Ota yhteyttä</Link>
      </div>
      <a href="tel:+358458755996" className="ntel"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A14 14 0 013 6a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>045 875 5996</a>
      <Link href="/#varaa" className="btn btn-p" style={{ padding: "11px 22px" }}>Laske hinta</Link>
      <button className="burger" id="burger" aria-label="Valikko"><span /><span /><span /></button>
    </div></nav>
  );
}
