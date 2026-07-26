import Image from "next/image";
import WindowBookingCard from "./components/WindowBookingCard";
import ContactForm from "./components/ContactForm";
import SiteScripts from "./components/SiteScripts";
import V4Nav from "./components/V4Nav";
import V4Footer from "./components/V4Footer";

const ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const CHK = (s = "#0968C8") => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke={s} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// Ikkunatyyppien hinnasto — sama kuin WindowBookingCard-laskurissa.
const PRICES: [string, string][] = [
  ["Vakioikkuna (2-lasinen, molemmat puolet)", "8 €/kpl"],
  ["Parvekelasit (per elementti)", "11 €/kpl"],
  ["Iso ikkuna (yli 2 m² / kolmiruutuinen)", "14 €/kpl"],
  ["Kattoikkunat (Velux-tyyppinen)", "16 €/kpl"],
  ["Näyteikkuna (per ruutu)", "15 €/kpl"],
  ["Lasiseinä / -ovi (terassi)", "18 €/kpl"],
];
const ADDONS: [string, string][] = [
  ["Sälekaihtimet", "+35 €"], ["Syväpuhdistus karmit", "+25 €"], ["Hyönteisverkot", "+20 €"],
  ["Kattoränni-tarkistus", "+45 €"], ["Aurinkopaneelit", "+60 €"], ["Parvekelattia", "+30 €"],
];
const TEAM = [
  { ph: "/assets/photos/own/team-josua.jpg", n: "Josua Leier", r: "Perustaja", d: "Vastaa työn laadusta ja siitä, että jokainen lasi kiiltää tarkastuksen kestävästi." },
  { ph: "/assets/photos/own/team-olivia.jpg", n: "Olivia", r: "Ikkunanpesijä", d: "Huolellinen ja tarkka — karmit ja välitilat hoituvat viimeistä yksityiskohtaa myöten." },
  { ph: "/assets/photos/own/team-jenika.jpg", n: "Jenika", r: "Ikkunanpesijä", d: "Tehokas ja luotettava — jälki on streakiton myös isoilla lasipinnoilla." },
  { ph: "/assets/photos/own/team-sara.jpg", n: "Sara", r: "Ikkunanpesijä", d: "Ripeä ja tunnollinen — puhdas vesi -tekniikka taipuu myös korkealle." },
];
const AVATARS = [
  ["/assets/photos/own/team-josua.jpg", "Josua"], ["/assets/photos/own/team-olivia.jpg", "Olivia"],
  ["/assets/photos/own/team-jenika.jpg", "Jenika"], ["/assets/photos/own/team-sara.jpg", "Sara"],
];
const INC = [
  { t: "Ikkunat & lasipinnat", ph: "/assets/photos/brand/detail-wipe.jpg", items: ["Lasin sisä- ja ulkopuoli", "Puhdas vesi -tekniikka, ei raitoja", "Peilit ja lasiovet", "Kaiteet ja lasiterassit"] },
  { t: "Karmit & välitilat", ph: "/assets/photos/stock/photo-clean-counter.jpg", items: ["Ikkunanpuitteet ja karmit", "Tiivisteet ja saranat", "Ikkunalaudat", "Välitilojen pölyt ja lika"] },
  { t: "Parveke & terassi", ph: "/assets/photos/brand/bright-empty.jpg", items: ["Parvekkeen liukulasit", "Terassin lasiseinät", "Lasikaiteet", "Parvekelattia (lisäpalvelu)"] },
];
const REVIEWS = [
  { i: "M", t: "En uskonut, että ikkunoista tulee näin kirkkaat. Ei yhtään raitaa, ja karmitkin puhdistettiin. Näkymä järvelle on kuin uusi.", n: "Marika S.", s: "Espoo · omakotitalo" },
  { i: "P", t: "Hinta näkyi heti laskurista eikä muuttunut matkalla. Nopea, siisti ja ystävällinen. Taloyhtiömme jatkaa sopimuksella.", n: "Petri N.", s: "Helsinki · taloyhtiö" },
  { i: "A", t: "Näyteikkunamme ovat nyt aina edustavat. Tulevat sovitusti aamuisin ennen avaamista. Suosittelen jokaiselle liikkeelle.", n: "Anni K.", s: "Vantaa · liiketila" },
];
const FAQ: [string, string][] = [
  ["Paljonko ikkunanpesu maksaa?", "Hinta määräytyy ikkunatyypeittäin, alkaen 4 € per ikkuna (sisä- ja ulkopuoli). Näet kokonaishinnan heti ikkunalaskurista. Minimiveloitus on 65 €, ja kotitalousvähennys pienentää työn osuutta jopa 40 %."],
  ["Pesettekö sekä sisä- että ulkopuolen?", "Kyllä. Vakiohintaan sisältyy molemmat puolet lasista sekä karmit, tiivisteet ja ikkunalaudat. Pelkän ulkopuolen pesusta saat pienemmän hinnan tarjouksella."],
  ["Jääkö laseihin raitoja?", "Ei. Käytämme osmoosipuhdistettua vettä ja ammattilastoja, jotka eivät jätä kalkki- tai pesuainejälkiä. Ellet ole tyytyväinen, pesemme uudelleen veloituksetta 48 tunnin sisällä."],
  ["Miten pestään korkealla olevat ikkunat?", "Puhdas vesi -tekniikan teleskooppivarrella yllämme turvallisesti maasta jopa neljänteen kerrokseen ilman tikkaita. Korkeammat kohteet hoidamme erikseen sovitusti."],
  ["Millä alueella toimitte?", "Koko Uudenmaan alueella — Helsinki, Espoo, Vantaa ja kehyskunnat. Kerro postinumerosi varauksen yhteydessä, niin vahvistamme palvelemme alueellasi."],
  ["Miten kotitalousvähennys toimii?", "Kotona tehty ikkunanpesu on kotitaloustyötä. Saat meiltä laskun, jossa työn osuus on valmiiksi eritelty — ilmoitat sen OmaVerossa ja vähennät jopa 40 % työn osuudesta."],
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

export default function Home() {
  return (
    <div className="v4">
      <V4Nav />

      {/* HERO */}
      <header className="phero" id="hinta">
        <Image src="/assets/photos/brand/team-action.jpg" alt="" fill priority sizes="100vw" className="phero-img" />
        <div className="phero-tint" aria-hidden />
        <div className="wrap phero-in">
          <span className="rate"><span className="ava">{AVATARS.map(([src, alt]) => <Image key={src} src={src} alt={alt} width={56} height={56} />)}</span> 4,9/5 · yli 600 ikkunaa pesty</span>
          <h1>Ikkunat niin kirkkaat,<br />että lasi katoaa.</h1>
          <p className="phero-sub">Ammattitaitoinen ikkunanpesu kotiin, taloyhtiöön ja liiketilaan. Kiinteä hinta heti — laske se ikkunalaskurilla parissa minuutissa.</p>
          <div className="phero-cta">
            <a href="#varaa" className="btn btn-w btn-lg">Laske ikkunoiden hinta {ARROW}</a>
          </div>
          <div className="phero-note">Näet hinnan heti · ilmainen, ei sitoumusta · kotitalousvähennys −40 %</div>
          <div className="phero-stats">
            <div><b>alk. 4 €</b><span>per ikkuna</span></div>
            <div><b>−40 %</b><span>kotitalousvähennys</span></div>
            <div><b>48 h</b><span>tyytyväisyystakuu</span></div>
          </div>
        </div>
        <div className="phero-curve" aria-hidden />
      </header>

      {/* laskuri */}
      <section className="sec csec">
        <div className="wrap">
          <div className="center rv"><div className="eyebrow">Ikkunalaskuri</div><h2 className="h2">Laske ikkunoidesi hinta — varaus vie pari minuuttia</h2>
            <p className="lead">Ei tarjouspyyntöjä eikä soittelua. Valitse ikkunatyypit ja määrät, näe kiinteä hinta ja vahvista.</p></div>
          <div className="csec-calc rv" style={{ maxWidth: 820 }}>
            <WindowBookingCard />
          </div>
        </div>
      </section>

      {/* miksi ammattilainen */}
      <section className="sec wash"><div className="wrap depgrid">
        <div className="rv">
          <div className="eyebrow">Miksi ammattilainen</div>
          <h2 className="h2">Kirkas näkymä kestää kuukausia</h2>
          <p className="lead" style={{ marginTop: 16 }}>Itse pestynä ikkunoihin jää helposti raitoja ja kalkkia, ja korkeat lasit jäävät pesemättä. Ammattilaisen puhdas vesi -tekniikka jättää streakittömän jäljen — ja pääset itse eroon tikkailta kiipeilystä.</p>
          <a href="#varaa" className="btn btn-p" style={{ marginTop: 26 }}>Laske hintasi {ARROW}</a>
        </div>
        <div className="depcard rv">
          <div className="dt">Ikkunanpesun hyödyt</div>
          <div className="dr"><span>Vakioikkuna, molemmat puolet</span><b>alk. 8 €</b></div>
          <div className="dr"><span>Karmit ja välitilat</span><b>hintaan kuuluu</b></div>
          <div className="dr"><span>Kotitalousvähennys</span><b>−40 % työstä</b></div>
          <div className="dr hl"><span>Minimiveloitus</span><b>65 €</b></div>
          <div className="dnote">Laskumme sisältää valmiin erittelyn OmaVeroa varten — vähennyksen ilmoittaminen vie pari minuuttia.</div>
        </div>
      </div></section>

      {/* steps */}
      <section className="sec"><div className="wrap">
        <div className="center rv"><div className="eyebrow">Näin se toimii</div><h2 className="h2">Kolme askelta kirkkaisiin ikkunoihin</h2></div>
        <div className="steps">
          <div className="step rv"><div className="n">1</div><h3>Laske &amp; varaa</h3><p>Valitse ikkunatyypit laskurista — näet kiinteän hinnan heti. Varaa sopiva aika verkossa.</p></div>
          <div className="step rv"><div className="n">2</div><h3>Me pesemme</h3><p>Ammattilainen tulee paikalle välineineen. Puhdas vesi -tekniikka yltää jopa neljänteen kerrokseen ilman tikkaita.</p></div>
          <div className="step rv"><div className="n">3</div><h3>Nautit näkymästä</h3><p>Streakiton, sormenjäljetön jälki. Ellet ole tyytyväinen, pesemme uudelleen 48 h sisällä veloituksetta.</p></div>
        </div>
      </div></section>

      {/* includes */}
      <section className="sec wash" id="sisaltyy"><div className="wrap">
        <div className="center rv"><div className="eyebrow">Mitä sisältyy</div><h2 className="h2">Emme pese vain lasia</h2>
          <p className="lead">Vakiohintaan kuuluu koko ikkuna — lasit, karmit ja välitilat.</p></div>
        <div className="inc3">
          {INC.map((g) => (
            <div className="inccard rv" key={g.t}>
              <div className="incph"><Image src={g.ph} alt={g.t} width={800} height={600} sizes="(max-width: 980px) 100vw, 33vw" loading="lazy" /></div>
              <div className="incbody">
                <h3>{g.t}</h3>
                <ul>{g.items.map((it) => <li key={it}>{CHK()} {it}</li>)}</ul>
              </div>
            </div>
          ))}
        </div>
        <p className="incnote rv">Taloyhtiöt ja liiketilat hinnoittelemme sopimuksella — <a href="/ota-yhteytta">pyydä tarjous</a>.</p>
      </div></section>

      {/* guarantee */}
      <section className="sec gband" id="laatu">
        <div className="wrap">
          <div className="rv">
            <div className="eyebrow">Laatutakuu</div>
            <h2 className="h2">Streakiton jälki — tai pesemme uudelleen</h2>
            <ul className="gp">
              <li>{CHK()}<span><b>Puhdas vesi -tekniikka.</b> Osmoosipuhdistettu vesi ei jätä kalkkiraitoja — lasi kuivuu itsestään kirkkaaksi, ilman kemikaaleja.</span></li>
              <li>{CHK()}<span><b>Karmit ja välitilat aina mukana.</b> Emme pese vain lasia — karmit, tiivisteet ja ikkunalaudat kuuluvat hintaan.</span></li>
              <li>{CHK()}<span><b>Vakuutettu ja luotettava.</b> Koulutetut ammattilaiset, täysi vastuuvakuutus ja kiinteä hinta ilman yllätyksiä.</span></li>
            </ul>
            <a href="#varaa" className="btn btn-p btn-lg" style={{ marginTop: 30 }}>Laske hintasi laatutakuulla {ARROW}</a>
          </div>
          <div className="gpic rv">
            <Image src="/assets/photos/brand/bright-empty.jpg" alt="Valoisa huone, jonka ikkunat on pesty kirkkaiksi" width={2400} height={1792} sizes="(max-width: 980px) 100vw, 50vw" loading="lazy" />
            <Image className="gstamp" src="/assets/stamp.png" alt="Tyytyväisyystakuu — tarkastettu ja hyväksytty" width={276} height={276} />
          </div>
        </div>
      </section>

      {/* pricing */}
      <section className="sec wash" id="hinnoittelu"><div className="wrap">
        <div className="center rv"><div className="eyebrow">Hinnoittelu</div><h2 className="h2">Kiinteä hinta per ikkuna — tiedät summan etukäteen</h2>
          <p className="lead">Sama summa laskurissa, vahvistuksessa ja laskulla. Ei tuntiarvioita.</p></div>
        <div className="ptab rv">
          {PRICES.map(([k, v]) => <div className="pr" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}
          <div className="pr q"><span className="k">Taloyhtiöt &amp; liiketilat</span><span className="v">Sopimuksesta</span></div>
        </div>
        <div className="kv rv">
          <div className="big">−40<span style={{ fontSize: ".5em" }}>%</span></div>
          <div className="kb"><h3>Kotitalousvähennys — puolet pois hinnasta</h3>
            <p>Kotona tehty ikkunanpesu on kotitaloustyötä, joten voit vähentää työn osuudesta jopa 40 % verotuksessasi. Käytännössä pesu maksaa murto-osan listahinnasta.</p>
            <span className="ex"><span className="o">120 €</span><span className="ar">→</span><span className="n">n. 74 €</span></span>
          </div>
        </div>
        <h3 className="subh3 rv">Lisäpalvelut</h3>
        <p className="subh3-lead rv">Kiinteä lisähinta per palvelu — valitse varauksen yhteydessä.</p>
        <div className="addons rv">
          {ADDONS.map(([n, p]) => <div className="ad" key={n}><span className="an">{n}</span><span className="ap">{p}</span></div>)}
        </div>
        <div className="center rv" style={{ marginTop: 40 }}><a href="#varaa" className="btn btn-p btn-lg">Laske oma hintasi &amp; varaa {ARROW}</a></div>
      </div></section>

      {/* team + reviews */}
      <section className="sec" id="tiimi"><div className="wrap">
        <div className="center rv"><div className="eyebrow">Tekijät</div><h2 className="h2">Kasvot, jotka tulevat paikalle</h2>
          <p className="lead">Koulutetut ammattilaiset hoitavat ikkunasi huolella — tässä tekijät.</p></div>
        <div className="team">
          {TEAM.map((t) => (
            <div className="tc rv" key={t.n}><Image src={t.ph} alt={t.n} width={640} height={640} sizes="(max-width: 980px) 50vw, 25vw" loading="lazy" /><div className="tb"><div className="tn">{t.n}</div><div className="tr">{t.r}</div><div className="td">{t.d}</div></div></div>
          ))}
        </div>
        <div className="revs" id="arvostelut">
          {REVIEWS.map((r) => (
            <div className="rev rv" key={r.n}><p>&ldquo;{r.t}&rdquo;</p><div className="by"><div className="av">{r.i}</div><div><b>{r.n}</b><span>{r.s}</span></div></div></div>
          ))}
        </div>
      </div></section>

      {/* yhteydenotto */}
      <section className="sec wash" id="yhteys"><div className="wrap contact-grid">
        <div className="rv">
          <div className="eyebrow">Kysyttävää?</div>
          <h2 className="h2">Iso kohde, taloyhtiö tai jokin mietityttää?</h2>
          <p className="lead" style={{ marginTop: 16 }}>Jätä viesti, niin vastaamme yleensä tunnissa. Taloyhtiöt, liiketilat ja erikoislasit hinnoittelemme sopimuksella — kerro lyhyesti kohteesta.</p>
          <ul className="cinfo" style={{ marginTop: 26 }}>
            <li><span className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A14 14 0 013 6a2 2 0 012-2z" stroke="#0968C8" strokeWidth="1.8" strokeLinejoin="round" /></svg></span><div><b>Soita suoraan</b><a href="tel:+358458755996">045 875 5996</a></div></li>
            <li><span className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="#0968C8" strokeWidth="1.8" strokeLinejoin="round" /></svg></span><div><b>Sähköposti</b><a href="mailto:info@lasikiilto.fi">info@lasikiilto.fi</a></div></li>
          </ul>
        </div>
        <div className="rv"><ContactForm /></div>
      </div></section>

      {/* faq */}
      <section className="sec" id="ukk"><div className="wrap">
        <div className="center rv"><div className="eyebrow">Usein kysyttyä</div><h2 className="h2">Hyvä tietää ikkunanpesusta</h2></div>
        <div className="faq" id="faq">
          {FAQ.map(([q, a]) => (
            <div className="q" key={q}>
              <button type="button">{q}<svg className="cv" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              <div className="a"><p>{a}</p></div>
            </div>
          ))}
        </div>
      </div></section>

      <V4Footer />

      <div className="mcta">
        <a href="tel:+358458755996" className="btn g"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A14 14 0 013 6a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg></a>
        <a href="#varaa" className="btn btn-p">Laske hinta &amp; varaa</a>
      </div>

      <SiteScripts />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
    </div>
  );
}
