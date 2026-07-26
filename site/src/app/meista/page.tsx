import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import V4Nav from "../components/V4Nav";
import V4Footer from "../components/V4Footer";
import SiteScripts from "../components/SiteScripts";

export const metadata: Metadata = {
  title: "Meistä — Ikkunanpesun ammattilaiset",
  description: "Lasikiilto on ikkunanpesun erikoisliike Uudellamaalla. Ammattitiimi, kiinteä hinta ja streakiton jälki — tai pesemme uudelleen.",
};

const VALUES = [
  { t: "Streakiton jälki", d: "Puhdas vesi -tekniikka jättää lasin kirkkaaksi ilman raitoja. Jos jokin jää huomautettavaa, pesemme uudelleen veloituksetta.", icon: <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" stroke="#0968C8" strokeWidth="1.8" strokeLinejoin="round" /> },
  { t: "Läpinäkyvä hinta", d: "Kiinteä hinta per ikkuna, ei piilokuluja. Näet summan heti ikkunalaskurista — ei tuntiarvioita.", icon: <path d="M12 3v18M7 7h7a3 3 0 010 6H8a3 3 0 000 6h8" stroke="#0968C8" strokeWidth="1.8" strokeLinecap="round" /> },
  { t: "Ammattitekijät", d: "Koulutetut ikkunanpesijät hoitavat työn huolella. Ammattivälineet, puhdas vesi ja auto mukana.", icon: <path d="M5 13l4 4L19 7" stroke="#0968C8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> },
];
const TEAM = [
  { ph: "/assets/photos/own/team-josua.jpg", n: "Josua Leier", r: "Perustaja", d: "Vastaa työn laadusta ja siitä, että jokainen lasi kiiltää tarkastuksen kestävästi." },
  { ph: "/assets/photos/own/team-olivia.jpg", n: "Olivia", r: "Ikkunanpesijä", d: "Huolellinen ja tarkka — karmit ja välitilat hoituvat viimeistä yksityiskohtaa myöten." },
  { ph: "/assets/photos/own/team-jenika.jpg", n: "Jenika", r: "Ikkunanpesijä", d: "Tehokas ja luotettava — jälki on streakiton myös isoilla lasipinnoilla." },
  { ph: "/assets/photos/own/team-sara.jpg", n: "Sara", r: "Ikkunanpesijä", d: "Ripeä ja tunnollinen — puhdas vesi -tekniikka taipuu myös korkealle." },
];

export default function Meista() {
  return (
    <div className="v4">
      <V4Nav />
      <section className="subhero"><div className="wrap">
        <div className="crumbs"><Link href="/">Etusivu</Link><span>/</span><span>Meistä</span></div>
        <h1>Kirkkaat ikkunat, ilman vaivaa</h1>
        <p>Olemme ikkunanpesuun erikoistunut tiimi Uudellamaalla. Tehtävämme on yksinkertainen: antaa sinulle kirkas näkymä ilman tikkailta kiipeilyä.</p>
      </div></section>

      <section className="sec"><div className="wrap about-grid">
        <div>
          <div className="eyebrow">Tarinamme</div>
          <h2 className="h2">Ikkunanpesu on työlästä — sinun ei tarvitse tehdä sitä itse</h2>
          <p style={{ marginTop: 16 }}>Itse pestynä ikkunoihin jää helposti raitoja ja kalkkia, ja korkeat lasit jäävät kokonaan pesemättä. Tikkailla kiipeily on riski, ja lopputulos harvoin kestää lähempää katsetta.</p>
          <p style={{ marginTop: 14 }}>Lasikiilto syntyi tähän tarpeeseen. Keskitymme yhteen asiaan ja teemme sen kunnolla: ikkunanpesuun, jonka jälki on streakiton ja kestää tarkastuksen. Sinä nautit näkymästä — me huolehdimme lasista.</p>
        </div>
        <div><Image className="about-photo" src="/assets/photos/brand/detail-wipe.jpg" alt="Ammattilainen pesee ikkunan streakittömän kirkkaaksi" width={800} height={1200} sizes="(max-width: 980px) 100vw, 45vw" /></div>
      </div></section>

      <section className="sec wash"><div className="wrap">
        <div className="center"><div className="eyebrow">Lupauksemme</div><h2 className="h2">Mihin voit luottaa</h2></div>
        <div className="values">
          {VALUES.map((v) => (
            <div className="value" key={v.t}>
              <div className="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none">{v.icon}</svg></div>
              <h3>{v.t}</h3><p>{v.d}</p>
            </div>
          ))}
        </div>
      </div></section>

      <section className="sec" id="tiimi"><div className="wrap">
        <div className="center"><div className="eyebrow">Tiimi</div><h2 className="h2">Tekijät</h2></div>
        <div className="team">
          {TEAM.map((t) => (
            <div className="tc" key={t.n}><Image src={t.ph} alt={t.n} width={640} height={640} sizes="(max-width: 980px) 50vw, 25vw" loading="lazy" /><div className="tb"><div className="tn">{t.n}</div><div className="tr">{t.r}</div><div className="td">{t.d}</div></div></div>
          ))}
        </div>
      </div></section>

      <V4Footer />
      <SiteScripts />
    </div>
  );
}
