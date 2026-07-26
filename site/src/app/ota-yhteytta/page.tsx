import type { Metadata } from "next";
import Link from "next/link";
import V4Nav from "../components/V4Nav";
import V4Footer from "../components/V4Footer";
import SiteScripts from "../components/SiteScripts";
import ContactForm from "../components/ContactForm";

export const metadata: Metadata = {
  title: "Ota yhteyttä",
  description: "Kysy mitä tahansa ikkunanpesusta tai pyydä tarjous taloyhtiölle tai liiketilalle. Vastaamme yleensä tunnissa.",
};

export default function OtaYhteytta() {
  return (
    <div className="v4">
      <V4Nav />
      <section className="subhero"><div className="wrap">
        <div className="crumbs"><Link href="/">Etusivu</Link><span>/</span><span>Ota yhteyttä</span></div>
        <h1>Ota yhteyttä</h1>
        <p>Kysy mitä tahansa ikkunanpesusta tai pyydä tarjous taloyhtiölle tai liiketilalle. Vastaamme yleensä tunnissa.</p>
      </div></section>

      <section className="sec"><div className="wrap contact-grid">
        <div>
          <div className="eyebrow">Yhteystiedot</div>
          <h2 className="h2" style={{ marginBottom: 24 }}>Autamme mielellämme</h2>
          <ul className="cinfo">
            <li><span className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="#0968C8" strokeWidth="1.8" strokeLinejoin="round" /></svg></span><div><b>Sähköposti</b><a href="mailto:info@lasikiilto.fi">info@lasikiilto.fi</a></div></li>
            <li><span className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A14 14 0 013 6a2 2 0 012-2z" stroke="#0968C8" strokeWidth="1.8" strokeLinejoin="round" /></svg></span><div><b>Puhelin</b><a href="tel:+358458755996">045 875 5996</a></div></li>
            <li><span className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11z" stroke="#0968C8" strokeWidth="1.8" /><circle cx="12" cy="10" r="2.3" stroke="#0968C8" strokeWidth="1.8" /></svg></span><div><b>Toiminta-alue</b><span>Koko Uusimaa</span></div></li>
          </ul>
        </div>
        <ContactForm />
      </div></section>

      <V4Footer />
      <SiteScripts />
    </div>
  );
}
