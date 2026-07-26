import Link from "next/link";
import type { Metadata } from "next";
import V4Nav from "../components/V4Nav";
import V4Footer from "../components/V4Footer";
import SiteScripts from "../components/SiteScripts";

export const metadata: Metadata = {
  title: "Palvelu- ja käyttöehdot",
  description: "Lasikiilto.fi-palvelun tilaamista ja käyttöä koskevat ehdot.",
};

export default function Kayttoehdot() {
  return (
    <div className="v4">
      <V4Nav />
      <section className="subhero"><div className="wrap">
        <div className="crumbs"><Link href="/">Etusivu</Link><span>/</span><span>Käyttöehdot</span></div>
        <h1>Palvelu- ja käyttöehdot</h1>
        <p>Nämä ehdot koskevat Lasikiilto.fi-palvelun tilaamista ja käyttöä.</p>
      </div></section>

      <section className="sec"><div className="wrap"><div className="prose">
        <p className="upd">Päivitetty 17.6.2026</p>

        <h2>1. Yleistä</h2>
        <p>Nämä käyttöehdot koskevat Lasikiilto.fi:n tarjoamia ikkunanpesu- ja siivouspalveluita sekä verkkosivuston kautta tehtyjä ajanvarauksia ja tarjouspyyntöjä. Tilaamalla palvelun asiakas hyväksyy nämä ehdot.</p>

        <h2>2. Palvelun sisältö</h2>
        <p>Vakiohintaan sisältyvä työ on kuvattu sivulla <Link href="/#sisaltyy">Mitä sisältyy</Link>. Palvelu kattaa yleisten tilojen, keittiön sekä kylpyhuoneen ja WC:n siivouksen kuvatussa laajuudessa. Lisäpalvelut (esim. uuni, jääkaappi, sauna) tilataan erikseen ja hinnoitellaan etukäteen.</p>

        <h2>3. Ajanvaraus ja vahvistus</h2>
        <p>Varauksen voi tehdä verkkosivuston ajanvarauksen kautta tai ottamalla yhteyttä. Verkossa tehty varaus on alustava varauspyyntö, jonka vahvistamme erikseen. Varatessa annettu kiinteä hinta perustuu kohteen ilmoitettuun kokoon (m²) ja valittuihin lisäpalveluihin, ja se vahvistetaan varauksen yhteydessä.</p>

        <h2>4. Hinnoittelu ja maksu</h2>
        <ul>
          <li>Palvelun hinta on kiinteä ja määräytyy asunnon koon (m²) mukaan, alkaen 210 € (sisältää alv). Yli 190 m² kohteista annetaan erillinen tarjous.</li>
          <li>Lisäpalvelut veloitetaan kiinteällä lisähinnalla (esim. uuni/jääkaappi/sauna +70 €, silitys +35 €, roskakaappi +18 €).</li>
          <li>Maksu tapahtuu laskulla työn valmistuttua, ellei toisin sovita.</li>
          <li>Asiakas voi olla oikeutettu kotitalousvähennykseen työn osuudesta verottajan ohjeiden mukaisesti.</li>
        </ul>

        <h2>5. Asiakkaan vastuut ja edellytykset</h2>
        <p>Jotta työ voidaan suorittaa sujuvasti ja sovitussa ajassa, asiakkaan tulee huolehtia seuraavista:</p>
        <ul>
          <li>Pääsy kohteeseen sovittuna aikana (avaimet tai paikalla olo).</li>
          <li>Kohde on pääosin tyhjä irtaimistosta ja suurista muuttoroskista.</li>
          <li>Mikäli tilattu jääkaappi/pakastin: kaapit ovat tyhjät ja sulatetut etukäteen.</li>
          <li>Mikäli tilattu uunin puhdistus: uuni on siirretty etukäteen, jos se vaatii siirtoa.</li>
          <li>Toimivat vesi- ja sähköliitännät kohteessa.</li>
        </ul>
        <p>Jos edellytykset eivät täyty ja työ pitkittyy tai estyy, tämä voi vaikuttaa kestoon ja hintaan.</p>

        <h2>6. Mitä palveluun ei kuulu</h2>
        <p>Vakiosiivoukseen ei sisälly muun muassa: liesituulettimen suodattimen pesu, pinttyneiden tahrojen poisto ovista ja seinistä, viemäreiden ja putkien tukosten avaaminen, raskaiden huonekalujen siirtäminen, yli 180 cm korkeudella sijaitsevat kohteet eikä ikkunanpesu (tilattavissa erikseen).</p>

        <h2>7. Peruutukset ja muutokset</h2>
        <p>Varauksen voi perua tai siirtää veloituksetta viimeistään 24 tuntia ennen sovittua ajankohtaa ottamalla yhteyttä. Tätä myöhemmistä peruutuksista tai esteen vuoksi peruuntuneesta käynnistä voidaan veloittaa kohtuullinen korvaus. Pyrimme aina löytämään joustavan ratkaisun.</p>

        <h2>8. Tyytyväisyystakuu ja reklamaatiot</h2>
        <p>Teemme työn huolella tarkastuksen vaatimustason mukaisesti. Jos työn jäljessä on huomautettavaa, ilmoita siitä 48 tunnin kuluessa työn valmistumisesta, niin korjaamme puutteet veloituksetta kohtuullisessa ajassa.</p>

        <h2>9. Vastuunrajoitus</h2>
        <p>Vastaamme palvelun suorittamisesta huolellisesti ja ammattitaitoisesti. Emme vastaa vahingoista, jotka johtuvat asiakkaan antamista puutteellisista tiedoista, kohteen olosuhteista tai pinta- ja materiaalivaurioista, jotka ovat syntyneet ennen työtä tai jotka eivät kestä tavanomaista puhdistusta. Vastuumme rajoittuu kulloinkin kyseessä olevan palvelun hintaan.</p>

        <h2>10. Sovellettava laki ja erimielisyydet</h2>
        <p>Näihin ehtoihin sovelletaan Suomen lakia. Erimielisyydet pyritään ratkaisemaan ensisijaisesti neuvottelemalla. Kuluttaja-asiakas voi saattaa asian myös kuluttajariitalautakunnan käsiteltäväksi.</p>
      </div></div></section>

      <V4Footer />
      <SiteScripts />
    </div>
  );
}
