// Generoi tiiviskoti/kayttoehdot.html poimimalla CSS, nav ja footer varaa.html:stä.
// Sama tekniikka kuin _gen-tietosuoja.mjs — design ei voi eriytyä.
//
// SISÄLLÖN LÄHTEET (ei keksittyä):
//   - peruutus/siirto ja takuun pituus: käyttäjän vastaus 2026-07-26
//   - takuun rajoitukset: adminin tarjous-PDF (OfferPdfContent.tsx s. 4), jotta
//     verkkosivu ja sopimuspaperi eivät sano eri asiaa
//   - hinnat: pricing.mjs MIN_PRICE + WINDOW_TIERS + TYPES + EXTRAS
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = import.meta.dirname;
const src = readFileSync(`${DIR}/varaa.html`, 'utf8');

// Poimi jaetut osat varaa.html:stä HTML-markkereilla — EI kovakoodatuilla
// rivinumeroilla. Rivinumerot ajautuivat aiemmin pieleen varaa.html:n
// muuttuessa ja tuottivat sivun ilman navia, footeria ja canonicalia.
const grab = (open, close, label) => {
  const i = src.indexOf(open);
  const j = i === -1 ? -1 : src.indexOf(close, i + open.length);
  if (i === -1 || j === -1) {
    throw new Error(`varaa.html: osaa "${label}" ei löytynyt (${open} … ${close})`);
  }
  return src.slice(i, j + close.length);
};

const styleBlock = grab('<style>', '</style>', 'style');
const css  = styleBlock.slice('<style>'.length, -'</style>'.length); // sisältö ilman tageja
const nav  = grab('<nav', '</nav>', 'nav');
let   foot = grab('<footer', '</footer>', 'footer');
const mcta = ''; // varaa.html:stä poistettiin alalaidan mobiili-CTA-palkki

// Defensiivinen: jos varaa.html joskus taas käyttää #varaa-ankkureita, ohjaa ne
// varaussivulle. Nykyisin no-op (footer käyttää jo /-linkkejä).
foot = foot.replace(/href="#varaa"/g, 'href="varaa.html"');

const extraCss = `
/* ---------- käyttöehdot (sama tyyli kuin tietosuojaseloste) ---------- */
.lg{max-width:820px;margin-inline:auto}
.lg .lead{font-size:19px;color:var(--text);margin-bottom:8px}
.lg .upd{display:inline-block;font-size:14px;font-weight:700;color:var(--green);
  background:var(--green-soft);border-radius:999px;padding:6px 14px;margin-bottom:26px}
.lg h2{font-size:clamp(22px,2.4vw,27px);margin:44px 0 14px;padding-top:22px;border-top:1px solid var(--line)}
.lg h2:first-of-type{border-top:0;padding-top:0;margin-top:34px}
.lg h3{font-size:18px;margin:24px 0 8px}
.lg p{margin-bottom:14px}
.lg ul{margin:0 0 16px 22px}
.lg li{margin-bottom:8px}
.lg a{color:var(--green);font-weight:700}
.lg .box{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  padding:24px 26px;margin-bottom:18px;box-shadow:var(--sh)}
.lg .box p:last-child{margin-bottom:0}
.lg dl.kv{margin:0}
.lg dl.kv div{display:flex;gap:16px;padding:12px 0;border-bottom:1px solid var(--line)}
.lg dl.kv div:last-child{border-bottom:0}
.lg dl.kv dt{flex:1 1 58%;color:var(--ink);font-weight:600}
.lg dl.kv dd{flex:0 1 42%;color:var(--mute);font-size:15px;text-align:right}
@media(max-width:620px){
  .lg dl.kv div{flex-direction:column;gap:4px}
  .lg dl.kv dt,.lg dl.kv dd{flex:1 1 auto;text-align:left}
}
`;

const body = `
<!-- KÄYTTÖEHDOT -->
<section class="sec" id="kayttoehdot" style="padding-top:clamp(40px,5vw,72px)"><div class="wrap">
  <div class="lg">
    <div class="kicker">Käyttöehdot</div>
    <h1 class="title" style="font-size:clamp(30px,4vw,44px);margin-bottom:16px">Palvelun käyttöehdot</h1>
    <p class="lead">Näitä ehtoja sovelletaan TiivisKodin palveluihin, jotka varataan osoitteessa
      tiiviskoti.fi. Lue ehdot ennen varauksen tekemistä — varaamalla ajan hyväksyt ne.</p>
    <span class="upd">Päivitetty 26.7.2026</span>

    <h2>1. Palveluntarjoaja</h2>
    <div class="box">
      <p><b>TiivisKoti</b><br />
      Y-tunnus 3414418-4<br />
      Järvipuistonkatu 5, 04400 Järvenpää<br />
      <a href="mailto:info@tiiviskoti.fi">info@tiiviskoti.fi</a> · <a href="tel:+358458755996">045 875 5996</a></p>
    </div>

    <h2>2. Palvelun sisältö</h2>
    <p>Tiivistevaihtoon kuuluu vanhojen tiivisteiden poisto, pintojen puhdistus, uudet EPDM- tai
      silikonitiivisteet sekä oven käynnin säätö niin, että ovi painuu tasaisesti tiivisteitä vasten.
      Ulko-oviin kuuluu lisäksi kynnyskumi. Työ tehdään asiakkaan osoitteessa sovittuna aikana.</p>
    <p>Toiminta-alue on Uusimaa. Vahvistamme varauksen yhteydessä, että palvelemme antamassasi
      postinumerossa.</p>

    <h2>3. Hinnat</h2>
    <p>Hinta muodostuu valitsemistasi kohteista kiinteillä hinnoilla:</p>
    <dl class="kv">
      <div><dt>Ikkuna, 1–4 kpl</dt><dd>95 € / kpl</dd></div>
      <div><dt>Ikkuna, 5–9 kpl</dt><dd>85 € / kpl</dd></div>
      <div><dt>Ikkuna, 10–19 kpl</dt><dd>75 € / kpl</dd></div>
      <div><dt>Ikkuna, 20 kpl tai enemmän</dt><dd>65 € / kpl</dd></div>
      <div><dt>Ulko-ovi tai parvekeovi</dt><dd>119 € / kpl</dd></div>
      <div><dt>Terassin liuku- tai pariovi</dt><dd>149 € / kpl</dd></div>
      <div><dt>Väli- / huoneovi</dt><dd>89 € / kpl</dd></div>
      <div><dt>Pelkkä kynnyskumi</dt><dd>45 € / kpl</dd></div>
    </dl>
    <p style="margin-top:18px"><b>Minimiveloitus on 149 €</b> käynniltä. Se kattaa käynnin, matkat,
      kohteen kartoituksen ja lämpökamerakuvauksen. Jos valittujen kohteiden ja lisätöiden summa jää
      alle 149 €:n, erotus veloitetaan omana rivinään ja varauksen hinnaksi tulee 149 €. Kun summa
      ylittää 149 €, veloitamme vain kohteiden mukaisen hinnan.</p>
    <p><b>Saman käynnin hinta.</b> Kun samaan käyntiin kuuluu vähintään kaksi
      kohdetta, ulko- ja parvekeoven hinta on 99 € / kpl ja väli- tai huoneoven 59 € / kpl.
      Ikkunoiden yksikköhinta määräytyy saman käynnin ikkunamäärän mukaan yllä olevan
      porrastuksen mukaisesti.</p>
    <p><b>Lisätyöt</b> veloitetaan erikseen vain, jos ne on tilattu: karmin ja seinän välin
      akryylisaumaus 19 € / aukko, helojen ja käyntivälyksen säätö 15 € / ikkuna sekä kahvan vaihto
      29 € / kpl ja vaihdettavan kahvan hinta.</p>
    <p>Hinnat sisältävät arvonlisäveron 25,5 %. Näet kokonaishinnan hintalaskurista ennen
      varausta.</p>
    <p><b>Hinta tarkistetaan paikan päällä.</b> Jos työn laajuus poikkeaa varauksessa ilmoitetusta —
      esimerkiksi ovia on eri määrä tai ovi vaatii työtä, joka ei kuulu tiivistevaihtoon — sovimme
      uudesta hinnasta kanssasi ennen työn aloittamista. Emme tee veloitettavaa lisätyötä ilman
      suostumustasi.</p>
    <p>Ovien ja ikkunoiden tiivistys on kotitaloustyötä, joten työn osuudesta voi saada
      kotitalousvähennyksen. Erittelemme työn osuuden laskuun valmiiksi.</p>

    <h2>4. Varaus ja vahvistus</h2>
    <p>Varaus tehdään valitsemalla kohteet hintalaskurista ja varaamalla vapaa aika kalenterista.
      Varauksesta lähtee vahvistus antamaasi sähköpostiosoitteeseen. Varaus on sitova vasta kun olet
      saanut vahvistuksen.</p>
    <p>Emme tee erillisiä veloituksettomia kartoituskäyntejä yksityisasiakkaille — hinta määräytyy
      laskurista ja tarkistetaan työn yhteydessä. Taloyhtiöiden osalta sovimme kartoituksesta erikseen
      tarjouspyynnön perusteella.</p>

    <h2>5. Peruutus ja ajan siirto</h2>
    <div class="box">
      <p><b>Voit peruuttaa tai siirtää varauksen milloin tahansa maksutta.</b> Emme veloita
        peruutus- tai siirtomaksua.</p>
      <p style="color:var(--mute);font-size:15px">Ilmoita muutoksesta mieluiten mahdollisimman
        varhain soittamalla <a href="tel:+358458755996">045 875 5996</a> tai sähköpostilla
        <a href="mailto:info@tiiviskoti.fi">info@tiiviskoti.fi</a>, jotta voimme antaa vapautuneen ajan
        toiselle asiakkaalle.</p>
    </div>

    <h2>6. Kuluttajan peruuttamisoikeus (etämyynti)</h2>
    <p>Kun varaat palvelun verkkosivuiltamme, kyse on etämyynnistä. Kuluttajalla on
      kuluttajansuojalain mukaan lähtökohtaisesti <b>14 vuorokauden peruuttamisoikeus</b> sopimuksen
      tekemisestä.</p>
    <p>Kun varaat tietyn ajankohdan, joka on ennen 14 vuorokauden määräajan päättymistä, pyydät
      samalla nimenomaisesti, että palvelun suorittaminen aloitetaan jo peruuttamisaikana. Tällöin:</p>
    <ul>
      <li>peruuttamisoikeus <b>päättyy</b>, kun palvelu on kokonaan suoritettu;</li>
      <li>jos peruutat työn jo alettua mutta ennen sen valmistumista, veloitamme suoritettua osaa
        vastaavan kohtuullisen osuuden hinnasta.</li>
    </ul>
    <p>Käytännössä kohdan 5 mukainen maksuton peruutusoikeus on sinulle laajempi kuin lain
      vähimmäisvaatimus: ennen työn aloittamista voit peruuttaa aina veloituksetta.</p>

    <h2>7. Maksu</h2>
    <p>Palvelu laskutetaan työn tekemisen jälkeen. Varauksen yhteydessä ei peritä maksua eikä
      ennakkomaksua. Laskun eräpäivä ja maksutiedot ilmoitetaan laskussa.</p>

    <h2>8. Takuu</h2>
    <dl class="kv">
      <div><dt>Materiaalitakuu (tiivisteet)</dt><dd>2 vuotta</dd></div>
      <div><dt>Asennustyön takuu</dt><dd>2 vuotta</dd></div>
    </dl>
    <p style="margin-top:18px">Takuu edellyttää, että ovea käytetään ja huolletaan normaalisti.
      Takuu ei kata vikoja, jotka johtuvat:</p>
    <ul>
      <li>oven tai karmin rakenteellisista puutteista, joista on kerrottu tilaajalle ennen työn
        tekemistä;</li>
      <li>ulkoisista olosuhteista, väärästä käytöstä tai huolimattomuudesta;</li>
      <li>muun kuin TiivisKodin tai sen valtuuttaman asentajan tekemistä muutoksista.</li>
    </ul>
    <p>Takuu on voimassa Suomessa. Takuu ei rajoita kuluttajalle kuluttajansuojalain nojalla
      kuuluvia oikeuksia.</p>

    <h2>9. Työkohteen edellytykset</h2>
    <p>Huolehdi, että asentaja pääsee sovittuna aikana käsittelemään sovitut ovet ja ikkunat ja että
      niiden edestä on siirretty tarpeeton tavara. Jos työtä ei voida tehdä sovittuna aikana siitä
      syystä, ettei kohteeseen päästy, sovimme uuden ajan — tästä ei veloiteta erikseen.</p>

    <h2>10. Vastuunrajoitus</h2>
    <p>Vastaamme työstämme näiden ehtojen ja kuluttajansuojalain mukaisesti. Emme vastaa välillisistä
      vahingoista, kuten saamatta jääneestä tulosta tai muusta epäsuorasta menetyksestä.</p>

    <h2>11. Huomautukset ja erimielisyydet</h2>
    <p>Jos työssä on mielestäsi virhe, ilmoita siitä meille mahdollisimman pian osoitteeseen
      <a href="mailto:info@tiiviskoti.fi">info@tiiviskoti.fi</a> tai numeroon
      <a href="tel:+358458755996">045 875 5996</a>. Pyrimme aina ensisijaisesti korjaamaan asian.</p>
    <p>Jos erimielisyyttä ei saada sovittua, kuluttaja voi saattaa asian
      <b>kuluttajariitalautakunnan</b> käsiteltäväksi (kuluttajariita.fi). Ennen sitä kannattaa olla
      yhteydessä <b>kuluttajaneuvontaan</b> (kkv.fi/kuluttajaneuvonta). Sopimukseen sovelletaan Suomen
      lakia.</p>

    <h2>12. Henkilötiedot</h2>
    <p>Käsittelemme varauksen yhteydessä antamiasi tietoja
      <a href="tietosuoja.html">tietosuojaselosteemme</a> mukaisesti.</p>

    <h2>13. Ehtojen muutokset</h2>
    <p>Voimme päivittää näitä ehtoja. Varaukseesi sovelletaan niitä ehtoja, jotka olivat voimassa
      varauksen tekohetkellä. Ajantasainen versio on aina tällä sivulla ja päivityspäivä näkyy sivun
      alussa.</p>
  </div>
</div></section>
`;

const out = `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Käyttöehdot — TiivisKoti</title>
<meta name="description" content="TiivisKodin palvelun käyttöehdot: hinnat, varaus ja vahvistus, maksuton peruutus, kuluttajan peruuttamisoikeus, maksu, takuu ja vastuu." />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="https://tiiviskoti.fi/kayttoehdot.html" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TiivisKoti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:url" content="https://tiiviskoti.fi/kayttoehdot.html" />
<meta property="og:title" content="Käyttöehdot — TiivisKoti" />
<meta property="og:description" content="TiivisKodin palvelun käyttöehdot: hinnat, varaus ja vahvistus, maksuton peruutus, kuluttajan peruuttamisoikeus, maksu, takuu ja vastuu." />
<meta property="og:image" content="https://tiiviskoti.fi/img/og-tiiviskoti.jpg?v=3" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="TiivisKodin asentaja asentaa uutta karmitiivistettä oven karmiin" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Käyttöehdot — TiivisKoti" />
<meta name="twitter:description" content="TiivisKodin palvelun käyttöehdot: hinnat, varaus ja vahvistus, maksuton peruutus, kuluttajan peruuttamisoikeus, maksu, takuu ja vastuu." />
<meta name="twitter:image" content="https://tiiviskoti.fi/img/og-tiiviskoti.jpg?v=3" />
<meta name="theme-color" content="#F6F7F3" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<style>
${css}
${extraCss}</style>
</head>
<body>
${nav}
${body}
${foot}

${mcta}

<script src="_shared.js"></script>
</body>
</html>
`;

writeFileSync(`${DIR}/kayttoehdot.html`, out, 'utf8');
console.log(`kayttoehdot.html kirjoitettu, ${out.length} merkkiä`);
