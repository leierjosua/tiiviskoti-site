import Link from "next/link";
import type { Metadata } from "next";
import V4Nav from "../components/V4Nav";
import V4Footer from "../components/V4Footer";
import SiteScripts from "../components/SiteScripts";

export const metadata: Metadata = {
  title: "Tietosuojaseloste",
  description: "Näin Lasikiilto.fi käsittelee henkilötietojasi EU:n yleisen tietosuoja-asetuksen (GDPR) mukaisesti.",
};

export default function Tietosuoja() {
  return (
    <div className="v4">
      <V4Nav />
      <section className="subhero"><div className="wrap">
        <div className="crumbs"><Link href="/">Etusivu</Link><span>/</span><span>Tietosuojaseloste</span></div>
        <h1>Tietosuojaseloste</h1>
        <p>Näin käsittelemme henkilötietojasi EU:n yleisen tietosuoja-asetuksen (GDPR) mukaisesti.</p>
      </div></section>

      <section className="sec"><div className="wrap"><div className="prose">
        <p className="upd">Päivitetty 17.6.2026</p>

        <h2>1. Rekisterinpitäjä</h2>
        <p>Lasikiilto Oy · Y-tunnus 0000000-0 · Sähköposti: <a href="mailto:info@lasikiilto.fi">info@lasikiilto.fi</a> · Puhelin: 045 875 5996 · Verkkosivusto: www.lasikiilto.fi</p>
        <p>Vastaamme henkilötietojen käsittelystä tämän selosteen mukaisesti. Kaikissa tietosuojaan liittyvissä asioissa voit ottaa yhteyttä osoitteeseen info@lasikiilto.fi.</p>

        <h2>2. Kerättävät henkilötiedot ja tietolähteet</h2>
        <p>Keräämme henkilötietoja ensisijaisesti sinulta itseltäsi ajanvarauksen, tarjouspyynnön tai yhteydenoton yhteydessä. Kerättäviä tietoja ovat:</p>
        <ul>
          <li>Nimi ja yhteystiedot (sähköposti, puhelinnumero)</li>
          <li>Siivouskohteen osoite ja tiedot (koko, valitut lisäpalvelut)</li>
          <li>Varaus- ja palvelutiedot sekä toivottu ajankohta</li>
          <li>Laskutukseen liittyvät tiedot</li>
          <li>Viestinnän sisältö (esim. lomakkeen lisätiedot)</li>
        </ul>

        <h2>3. Henkilötietojen käsittelyn tarkoitukset</h2>
        <ul>
          <li>Ajanvarausten ja tarjouspyyntöjen käsittely ja vahvistaminen</li>
          <li>Siivouspalvelun toteuttaminen ja aikataulutus</li>
          <li>Asiakaspalvelu ja yhteydenpito</li>
          <li>Laskutus ja kirjanpito</li>
          <li>Lakisääteisten velvoitteiden noudattaminen</li>
        </ul>

        <h2>4. Käsittelyn oikeusperusteet</h2>
        <ul>
          <li><b>Sopimus</b> — varauksen ja palvelun toteuttaminen sekä asiakassuhteen hoitaminen.</li>
          <li><b>Lakisääteinen velvoite</b> — esimerkiksi kirjanpitolain vaatimukset.</li>
          <li><b>Oikeutettu etu</b> — palvelun ja asiakaskokemuksen kehittäminen sekä tietoturva.</li>
          <li><b>Suostumus</b> — mahdollinen sähköinen suoramarkkinointi (vain erikseen annetulla suostumuksella).</li>
        </ul>

        <h2>5. Evästeet</h2>
        <p>Verkkosivustomme käyttää vain toiminnan kannalta välttämättömiä evästeitä. Emme tällä hetkellä käytä analytiikka- tai markkinointievästeitä emmekä seuraa kävijöitä kolmansien osapuolten työkaluilla. Mikäli otamme analytiikan käyttöön, pyydämme siihen suostumuksesi ja päivitämme tämän selosteen.</p>

        <h2>6. Tietojen luovuttaminen ja käsittelijät</h2>
        <p>Emme myy emmekä luovuta henkilötietojasi ulkopuolisille markkinointitarkoituksiin. Käytämme luotettavia palveluntarjoajia tietojen käsittelyssä:</p>
        <ul>
          <li>Verkkosivuston ja tietokannan ylläpito (palvelinympäristö, esim. Vercel ja Supabase).</li>
          <li>Sähköpostipalvelu — varaus- ja yhteydenottoviestien välitys (Google Workspace / Gmail).</li>
        </ul>
        <p>Lisäksi tietoja voidaan luovuttaa viranomaisille, jos laki sitä edellyttää.</p>

        <h2>7. Tietojen siirto EU/ETA-alueen ulkopuolelle</h2>
        <p>Pyrimme käsittelemään tiedot EU/ETA-alueella. Mikäli käsittelijä siirtää tietoja alueen ulkopuolelle, huolehdimme asianmukaisista suojatoimista (esim. EU:n vakiosopimuslausekkeet).</p>

        <h2>8. Tietojen säilyttäminen</h2>
        <p>Säilytämme henkilötietoja vain niin kauan kuin on tarpeen käsittelyn tarkoituksen toteuttamiseksi. Laskutus- ja kirjanpitotiedot säilytetään kirjanpitolain edellyttämän ajan (pääsääntöisesti 6 vuotta). Tarjouspyynnöt ja varaukset, jotka eivät johda asiakassuhteeseen, poistetaan kohtuullisen ajan kuluessa.</p>

        <h2>9. Rekisteröidyn oikeudet</h2>
        <ul>
          <li>Saada tietää, mitä tietoja sinusta käsittelemme, ja tarkastaa ne</li>
          <li>Pyytää virheellisten tietojen oikaisua</li>
          <li>Pyytää tietojen poistamista (&rdquo;oikeus tulla unohdetuksi&rdquo;)</li>
          <li>Rajoittaa tai vastustaa käsittelyä</li>
          <li>Peruuttaa antamasi suostumus milloin tahansa</li>
          <li>Saada tietosi siirrettävässä muodossa</li>
        </ul>
        <p>Voit käyttää oikeuksiasi ottamalla yhteyttä: <a href="mailto:info@lasikiilto.fi">info@lasikiilto.fi</a>.</p>

        <h2>10. Tietoturva</h2>
        <p>Suojaamme henkilötietoja asianmukaisin teknisin ja organisatorisin toimenpitein. Pääsy tietoihin on rajattu vain niille, jotka tarvitsevat niitä työtehtäviensä hoitamiseen.</p>

        <h2>11. Valvontaviranomainen</h2>
        <p>Jos katsot, että henkilötietojesi käsittely ei ole lainmukaista, sinulla on oikeus tehdä valitus tietosuojavaltuutetun toimistolle (tietosuoja.fi).</p>

        <h2>12. Muutokset tähän selosteeseen</h2>
        <p>Voimme päivittää tätä tietosuojaselostetta toimintamme tai lainsäädännön muuttuessa. Ajantasainen versio on aina nähtävissä tällä sivulla.</p>
      </div></div></section>

      <V4Footer />
      <SiteScripts />
    </div>
  );
}
