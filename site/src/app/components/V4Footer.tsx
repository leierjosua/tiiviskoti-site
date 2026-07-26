import Link from "next/link";
import Logo from "./Logo";

export default function V4Footer() {
  return (
    <footer className="mfoot">
      <div className="mfoot-curve" aria-hidden />
      <div className="wrap">
        <div className="mf-cta">
          <div>
            <h2>Valmis näkemään eron?</h2>
            <p>Laske ikkunoidesi hinta verkossa tai soita — vastaamme yleensä tunnissa.</p>
          </div>
          <div className="mf-cta-btns">
            <Link href="/#varaa" className="btn btn-w btn-lg">Laske hinta</Link>
            <a href="tel:+358458755996" className="btn btn-ghost btn-lg">045 875 5996</a>
          </div>
        </div>

        <div className="mf-grid">
          <div className="mf-brand">
            <Link href="/"><Logo dark /></Link>
            <p>Ammattitaitoinen ikkunanpesu koko Uudellamaalla. Kirkkaat ikkunat, näkymä joka kestää katseen.</p>
            <div className="mf-chips">
              <a href="mailto:info@lasikiilto.fi" className="mf-chip">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                info@lasikiilto.fi
              </a>
              <a href="tel:+358458755996" className="mf-chip">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A14 14 0 013 6a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
                045 875 5996
              </a>
              <span className="mf-chip">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11z" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.7" /></svg>
                Koko Uusimaa
              </span>
            </div>
            <span className="mf-badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" /><path d="M8.5 12.5l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Kotitalousvähennys työstä 40 %
            </span>
          </div>
          <div className="mf-col"><h4>Palvelut</h4><Link href="/#palvelut">Kodit</Link><Link href="/#palvelut">Taloyhtiöt</Link><Link href="/#palvelut">Liiketilat</Link><Link href="/#palvelut">Erikoislasit</Link></div>
          <div className="mf-col"><h4>Yritys</h4><Link href="/#laatu">Laatulupaus</Link><Link href="/#varaa">Ikkunalaskuri</Link><Link href="/meista">Meistä</Link><Link href="/ota-yhteytta">Ota yhteyttä</Link></div>
          <div className="mf-col"><h4>Tietoa</h4><Link href="/tietosuoja">Tietosuoja</Link><Link href="/kayttoehdot">Käyttöehdot</Link></div>
        </div>

        <div className="mf-bot">
          <span>© 2026 Lasikiilto Oy · Y-tunnus 0000000-0</span>
          <span><Link href="/tietosuoja">Tietosuoja</Link> · <Link href="/kayttoehdot">Käyttöehdot</Link></span>
        </div>
      </div>
    </footer>
  );
}
