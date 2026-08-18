// Generoi tiiviskoti/tietosuoja.html poimimalla CSS, nav ja footer varaa.html:stä,
// niin että sivu on pikselintarkasti samaa designia eikä tyylejä duplikoida käsin.
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
// varaussivulle. Nykyisin no-op (footer periyttää /-linkit suoraan varaa.html:stä).
foot = foot.replace(/href="#varaa"/g, 'href="varaa.html"');

const extraCss = `
/* ---------- tietosuojaseloste ---------- */
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
.lg dl.kv dd{flex:0 1 42%;color:var(--mute);font-size:15px}
@media(max-width:620px){
  .lg dl.kv div{flex-direction:column;gap:4px}
  .lg dl.kv dt,.lg dl.kv dd{flex:1 1 auto}
}
`;

const body = `
<!-- TIETOSUOJASELOSTE -->
<section class="sec" id="tietosuoja" style="padding-top:clamp(40px,5vw,72px)"><div class="wrap">
  <div class="lg">
    <div class="kicker">Tietosuoja</div>
    <h1 class="title" style="font-size:clamp(30px,4vw,44px);margin-bottom:16px">Tietosuojaseloste</h1>
    <p class="lead">Tämä seloste kertoo, miten TiivisKoti käsittelee henkilötietoja tiiviskoti.fi-sivustolla ja
      asiakassuhteissa. Noudatamme EU:n yleistä tietosuoja-asetusta (GDPR) ja Suomen tietosuojalakia.</p>
    <span class="upd">Päivitetty 26.7.2026</span>

    <h2>1. Rekisterinpitäjä</h2>
    <div class="box">
      <p><b>TiivisKoti</b><br />
      Y-tunnus 3414418-4<br />
      Järvipuistonkatu 5, 04400 Järvenpää<br />
      Sähköposti: <a href="mailto:info@tiiviskoti.fi">info@tiiviskoti.fi</a><br />
      Puhelin: <a href="tel:+358458755996">045 875 5996</a></p>
      <p style="color:var(--mute);font-size:15px">Tietosuoja-asioissa voit olla yhteydessä suoraan yllä oleviin
        yhteystietoihin. Emme ole nimittäneet erillistä tietosuojavastaavaa, sillä toimintamme laajuus ei sitä edellytä.</p>
    </div>

    <h2>2. Mitä tietoja käsittelemme</h2>
    <h3>Ajanvaraus</h3>
    <p>Kun varaat ajan verkkosivuiltamme, käsittelemme: etu- ja sukunimi, sähköpostiosoite, puhelinnumero,
      katuosoite ja postinumero, valitsemasi ovi- ja ikkunatyypit sekä niiden määrät, valitsemasi lisäpalvelut,
      valitsemasi päivämäärä ja aikaikkuna, vapaaehtoisesti antamasi lisätiedot sekä varauksen laskettu hinta.</p>
    <h3>Yhteydenotot ja tarjouspyynnöt</h3>
    <p>Nimi, yhteystiedot ja viestin sisältö silloin kun otat meihin yhteyttä puhelimitse, sähköpostilla tai
      taloyhtiöiden tarjouspyyntölomakkeella.</p>
    <h3>Työn toteutus</h3>
    <p>Käyntiin ja tehtyyn työhön liittyvät merkinnät, kohteen tiedot sekä laskutus- ja maksutiedot.</p>
    <h3>Tekniset tiedot</h3>
    <p>Palvelun teknisissä lokeissa käsitellään IP-osoitetta ja selaintietoja tietoturvan varmistamiseksi ja
      virhetilanteiden selvittämiseksi.</p>
    <p>Emme kerää arkaluonteisia henkilötietoja emmekä tietoisesti käsittele alaikäisten tietoja.</p>

    <h2>3. Mihin tietoja käytetään ja millä perusteella</h2>
    <dl class="kv">
      <div><dt>Varauksen vastaanotto, vahvistus ja työn toteuttaminen</dt><dd>Sopimus (GDPR 6.1 b)</dd></div>
      <div><dt>Varausta koskevat vahvistus- ja muistutusviestit</dt><dd>Sopimus (GDPR 6.1 b)</dd></div>
      <div><dt>Laskutus, kirjanpito ja lakisääteiset velvoitteet</dt><dd>Lakisääteinen velvoite (GDPR 6.1 c)</dd></div>
      <div><dt>Takuuasiat ja asiakaspalautteen käsittely</dt><dd>Sopimus (GDPR 6.1 b)</dd></div>
      <div><dt>Palvelun tekninen toiminta, virheselvitys ja tietoturva</dt><dd>Oikeutettu etu (GDPR 6.1 f)</dd></div>
    </dl>
    <p style="margin-top:18px">Emme tee automaattista päätöksentekoa emmekä profilointia. Emme lähetä
      suoramarkkinointia ilman erillistä suostumustasi, emmekä myy tai luovuta tietojasi kolmansille
      markkinointitarkoituksiin.</p>
    <p>Tietojen antaminen on vapaaehtoista, mutta ilman nimeä, yhteystietoja ja kohteen osoitetta emme voi ottaa
      varausta vastaan emmekä toteuttaa työtä.</p>

    <h2>4. Kuinka kauan tietoja säilytetään</h2>
    <ul>
      <li><b>Asiakas- ja varaustiedot:</b> asiakassuhteen ajan.</li>
      <li><b>Laskutus- ja kirjanpitotiedot:</b> kirjanpitolain mukaisesti kuusi vuotta sen tilikauden päättymisestä,
        jonka aikana työ on tehty.</li>
      <li><b>Toteutumattomat varaukset ja tarjouspyynnöt:</b> 12 kuukautta.</li>
      <li><b>Tekniset lokit:</b> enintään 12 kuukautta.</li>
    </ul>
    <p>Säilytysajan päätyttyä tiedot poistetaan.</p>

    <h2>5. Kenelle tietoja luovutetaan</h2>
    <p>Käytämme tietojen käsittelyssä alla lueteltuja palveluntarjoajia. Ne käsittelevät tietoja
      toimeksiannostamme henkilötietojen käsittelijöinä, eivät omiin tarkoituksiinsa.</p>
    <ul>
      <li><b>Vercel Inc.</b> — verkkosivuston ylläpito ja varauslomakkeen tekninen käsittely.</li>
      <li><b>Supabase</b> — asiakas- ja varaustietokanta. Tiedot sijaitsevat Lontoon konesalissa
        (Yhdistynyt kuningaskunta).</li>
      <li><b>Google</b> — varausvahvistusten lähetys sähköpostilla sekä asennusaikojen kalenterisynkronointi.</li>
      <li><b>Google Fonts</b> — sivuston kirjasimet ladataan Googlen palvelimelta, jolloin selaimesi IP-osoite
        välittyy Googlelle sivun latautuessa.</li>
    </ul>
    <p>Lisäksi tietoja luovutetaan kirjanpidosta huolehtivalle taholle sekä viranomaisille silloin kun laki
      sitä edellyttää.</p>

    <h2>6. Tietojen siirto EU:n ulkopuolelle</h2>
    <p>Osa palveluntarjoajistamme on yhdysvaltalaisia yrityksiä. Näissä siirroissa nojaudumme Euroopan komission
      hyväksymiin vakiosopimuslausekkeisiin ja soveltuvin osin EU:n ja Yhdysvaltojen väliseen
      tietosuojakehykseen (Data Privacy Framework). Tietokantamme sijaitsee Yhdistyneessä kuningaskunnassa,
      jonka tietosuojan tason Euroopan komissio on todennut riittäväksi.</p>

    <h2>7. Evästeet ja mainonnan mittaus</h2>
    <p>Sivustollamme <b>ei käytetä seuranta- eikä analytiikkaevästeitä</b>. Emme seuraa kävijöitä sivustolta
      toiselle emmekä luovuta kävijätietoja mainosverkostoille profilointia varten. Siksi sivustolla ei ole
      evästebanneria eikä esimerkiksi Google Analyticsia.</p>
    <p>Mittaamme sivuston käyttöä <b>evästeettömästi ja anonyymisti</b> oman järjestelmämme avulla:
      kirjaamme muun muassa sivunäyttöjä, mistä kävijä saapui, laitetyypin sekä varauspolun etenemisen.
      Tämä ei käytä evästeitä eikä tallenna mitään selaimesi muistiin. Kävijästä muodostetaan palvelimella
      <b>päivittäin vaihtuva satunnaistunniste</b> (johdettu selaimen tiedoista), josta ei voi palata
      sinuun — <b>IP-osoitettasi ei tallenneta</b>. Tietoja käytetään vain sivuston ja palvelun
      kehittämiseen, ei profilointiin, eikä niitä luovuteta kolmansille. Käsittelyn perusteena on
      oikeutettu etu.</p>
    <p>Selaimen muistiin tallennetaan seuraavat tiedot. Mitään niistä ei lähetetä kolmansille sivustolla
      käynnin aikana:</p>
    <ul>
      <li><code>tk_booking</code> (istuntomuisti) — säilyttää hintalaskurissa tekemäsi valinnat, kun siirryt
        varaussivulle. Poistuu kun suljet selainvälilehden. Palvelun pyytämäsi toiminnon kannalta
        välttämätön tieto, joten se ei edellytä suostumusta.</li>
      <li><code>tk_campaign</code> ja <code>tk_gclid</code> (paikallinen muisti, 30 vrk) — merkintä siitä,
        mistä mainoksesta tulit sivustolle. Tallennetaan vain jos saavuit mainoslinkistä. Näitä ei käytetä
        profilointiin eikä sinun tunnistamiseesi.</li>
    </ul>
    <p><b>Jos teet varauksen mainoslinkistä tultuasi</b>, ilmoitamme Google Adsille että kyseinen
      mainosklikki johti kauppaan. Ilmoitus sisältää mainosklikin tunnisteen, ajankohdan ja kaupan arvon —
      <b>ei nimeäsi, yhteystietojasi eikä osoitettasi</b>. Käsittelyn perusteena on oikeutettu etu (oman
      mainontamme tuloksellisuuden mittaaminen). Jos et tee varausta, Googlelle ei ilmoiteta mitään.
      Voit estää tämän tyhjentämällä selaimesi paikallisen muiston tai käyttämällä sivustoa ilman
      mainoslinkkiä.</p>

    <h2>8. Oikeutesi</h2>
    <p>Sinulla on oikeus:</p>
    <ul>
      <li>saada tietää, mitä tietoja sinusta käsittelemme, ja saada niistä jäljennös</li>
      <li>saada virheelliset tai puutteelliset tiedot oikaistuiksi</li>
      <li>pyytää tietojesi poistamista, kun käsittelylle ei ole enää laillista perustetta</li>
      <li>rajoittaa käsittelyä tai vastustaa sitä</li>
      <li>saada antamasi tiedot koneellisesti luettavassa muodossa</li>
      <li>peruuttaa antamasi suostumus milloin tahansa</li>
    </ul>
    <div class="box">
      <p>Käytä oikeuksiasi lähettämällä pyyntö osoitteeseen
        <a href="mailto:info@tiiviskoti.fi">info@tiiviskoti.fi</a>. Vastaamme pyyntöön kuukauden kuluessa.
        Voimme joutua varmistamaan henkilöllisyytesi ennen tietojen luovuttamista.</p>
    </div>
    <p>Jos katsot, että käsittelemme henkilötietojasi tietosuojalainsäädännön vastaisesti, voit tehdä valituksen
      valvontaviranomaiselle:</p>
    <p style="color:var(--mute);font-size:15px">Tietosuojavaltuutetun toimisto<br />
      PL 800, 00531 Helsinki<br />
      <a href="mailto:tietosuoja@om.fi">tietosuoja@om.fi</a> · p. 029 566 6700</p>

    <h2>9. Tietoturva</h2>
    <p>Sivusto ja varauslomake toimivat salatun HTTPS-yhteyden yli. Asiakas- ja varaustiedot ovat
      pääsynhallinnan takana, ja niitä käsittelevät vain ne henkilöt, joiden työtehtävät sitä edellyttävät.
      Tietokannan täydet käyttöoikeudet ovat ainoastaan palvelinpuolella — niitä ei koskaan välitetä selaimeen.</p>

    <h2>10. Muutokset tähän selosteeseen</h2>
    <p>Kehitämme palveluamme, joten tätä selostetta voidaan päivittää. Ajantasainen versio on aina tällä sivulla,
      ja päivityspäivä näkyy sivun alussa.</p>
  </div>
</div></section>
`;

const out = `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tietosuojaseloste — TiivisKoti</title>
<meta name="description" content="Miten TiivisKoti käsittelee henkilötietoja: mitä tietoja kerätään, mihin niitä käytetään, kuinka kauan niitä säilytetään ja mitkä ovat oikeutesi." />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="https://tiiviskoti.fi/tietosuoja.html" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TiivisKoti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:url" content="https://tiiviskoti.fi/tietosuoja.html" />
<meta property="og:title" content="Tietosuojaseloste — TiivisKoti" />
<meta property="og:description" content="Miten TiivisKoti käsittelee henkilötietoja: mitä tietoja kerätään, mihin niitä käytetään, kuinka kauan niitä säilytetään ja mitkä ovat oikeutesi." />
<meta property="og:image" content="https://tiiviskoti.fi/img/og-tiiviskoti.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="TiivisKodin asentaja asentaa uutta karmitiivistettä oven karmiin" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Tietosuojaseloste — TiivisKoti" />
<meta name="twitter:description" content="Miten TiivisKoti käsittelee henkilötietoja: mitä tietoja kerätään, mihin niitä käytetään, kuinka kauan niitä säilytetään ja mitkä ovat oikeutesi." />
<meta name="twitter:image" content="https://tiiviskoti.fi/img/og-tiiviskoti.jpg" />
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

writeFileSync(`${DIR}/tietosuoja.html`, out, 'utf8');
console.log(`tietosuoja.html kirjoitettu, ${out.length} merkkiä`);
console.log(`CSS ${css.split('\n').length} riviä, nav ${nav.split('\n').length}, footer ${foot.split('\n').length}`);
