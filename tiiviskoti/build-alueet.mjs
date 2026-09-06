/* =========================================================
   TiivisKoti — toiminta-aluesivujen generaattori.

   Aja kansiosta tiiviskoti:   node build-alueet.mjs

   Kirjoittaa:
     toiminta-alueet.html              (hub, listaa kaikki alueet)
     toiminta-alueet/<slug>.html       (yksi sivu per kunta)

   HUOM — TÄMÄ EI OLE SAMA ASIA KUIN _gen-*.mjs.
   Ne paikkaavat olemassa olevia tiedostoja rivinumeroiden perusteella ja
   ovat siksi rikki. Tämä kirjoittaa kokonaiset tiedostot alusta joka
   ajolla, joten se ei voi vanhentua samalla tavalla: jos generoitua
   sivua muokkaa käsin, seuraava ajo yksinkertaisesti korvaa muokkauksen.
   Muokkaa siis _alueet-data.mjs:ää, älä generoituja HTML-tiedostoja.

   Sisältö tulee _alueet-data.mjs:stä ja hinnat pricing.mjs:stä, jotta
   aluesivut eivät voi jäädä näyttämään vanhoja hintoja.
   ========================================================= */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { ALUEET, SITE } from './_alueet-data.mjs';
import { ARTIKKELIT } from './_artikkelit-data.mjs';
import { TYPES, MIN_PRICE, WINDOW_TIERS } from './pricing.mjs';

/* Ikkunaportaiden rajat ja haarukka johdetaan hinnastosta, ei kirjoiteta
   käsin. Aiemmin sivuilla luki "20+" myös sen jälkeen kun viimeinen porras
   oli siirtynyt — teksti ja laskuri erosivat toisistaan. */
const TIER_FROM = WINDOW_TIERS.map((_, i) => (i === 0 ? 1 : WINDOW_TIERS[i - 1].upTo + 1));
const tierRange = (i) => (i === WINDOW_TIERS.length - 1
  ? `${TIER_FROM[i]}+`
  : `${TIER_FROM[i]}\u2013${WINDOW_TIERS[i].upTo}`);
const WINDOW_HIGH = WINDOW_TIERS[0].price;
const WINDOW_LOW = WINDOW_TIERS[WINDOW_TIERS.length - 1].price;
const WINDOW_RANGE = `${WINDOW_LOW}\u2013${WINDOW_HIGH}`;

const TEL = '045 875 5996';
const TELH = '+358458755996';

/* Kuvat kierrätetään listasta, jotta vierekkäiset aluesivut eivät näytä
   identtisiltä. Sama kuva toistuu vasta viiden kunnan välein. */
const KUVAT = [
  ['hero-entrance.webp', 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen'],
  ['ikkunat.webp',       'Puutalon ikkuna ulkoa, valkoiset puitteet ja karmit'],
  ['ulko-ovet.webp',     'Puutalon valkoinen ulko-ovi ja katettu kuisti'],
  ['taloyhtiot.webp',    'TiivisKodin asentaja kävelee työvälineineen kohti taloa'],
  ['miksi-tyo.webp',     'TiivisKodin asentaja kävelee tiivistetarvikkeineen kohti puutaloa'],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- yhteiset palaset ---------- */

const nav = (R) => `<nav class="top" id="nav"><div class="wrap">
  <a href="/" class="logo"><svg class="mark" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#217A4E"/><rect x="31" y="20" width="38" height="60" rx="3" fill="none" stroke="#F6F7F3" stroke-width="5"/><rect x="35" y="20" width="4" height="60" fill="#F6F7F3"/></svg><span><span class="d">Tiivis</span><span class="b">Koti</span></span></a>
  <div class="nlinks" id="nlinks">
    <a href="/#palvelut">Palvelut</a><a href="#laskuri">Hinta</a><a href="${R}taloyhtio.html">Taloyhtiöt</a><a href="${R}toiminta-alueet.html">Toiminta-alueet</a><a href="${R}meista.html">Meistä</a><a href="/#saasto">Säästö</a>
  </div>
  <a href="tel:${TELH}" class="ntel">${TEL}</a>
  <a href="#laskuri" class="btn btn-p" style="padding:10px 20px">Varaa aika</a>
  <button class="burger" id="burger" aria-label="Valikko"><span></span><span></span><span></span></button>
</div></nav>`;

/* Footerin aluelista linkittää kaikkiin aluesivuihin. Ristiinlinkitys on
   se mekanismi jolla Google löytää sivut ilman että kukaan linkittää
   niihin ulkopuolelta. */
const alueLinkit = (R, paitsi) => ALUEET
  .map((a) => a.slug === paitsi
    ? `<span style="opacity:.55">${a.name}</span>`
    : `<a href="${R}toiminta-alueet/${a.slug}.html">${a.name}</a>`)
  .join('');

const footer = (R, paitsi) => `<footer class="mfoot"><div class="wrap">
  <div class="mf-grid">
    <div class="mf-brand">
      <a href="/" class="logo"><svg class="mark" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="rgba(246,247,243,.14)"/><rect x="31" y="20" width="38" height="60" rx="3" fill="none" stroke="#F6F7F3" stroke-width="5"/><rect x="35" y="20" width="4" height="60" fill="#2E9E63"/></svg><span><span class="d">Tiivis</span><span class="b" style="color:#2E9E63">Koti</span></span></a>
      <p>Ovien ja ikkunoiden tiivistevaihto Uudellamaalla ja Riihimäellä.</p>
      <div class="mf-rate"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg> Oma porukka, ei alihankintaa</div>
    </div>
    <div class="mf-col"><h4>Palvelut</h4><a href="/#palvelut">Ovet</a><a href="/#palvelut">Ikkunat</a><a href="${R}taloyhtio.html">Taloyhtiöt</a><a href="#laskuri">Hintalaskuri</a></div>
    <div class="mf-col"><h4>Yritys</h4><a href="/#miksi">Miksi me</a><a href="${R}artikkelit.html">Artikkelit</a><a href="/#saasto">Säästöarvio</a><a href="/#ukk">UKK</a><a href="#laskuri">Varaa aika</a></div>
    <div class="mf-col"><h4>Yhteys</h4><a href="tel:${TELH}">${TEL}</a><a href="mailto:info@tiiviskoti.fi">info@tiiviskoti.fi</a><a href="${R}toiminta-alueet.html">Toiminta-alueet</a><a href="https://www.facebook.com/profile.php?id=61573878654177" rel="me noopener">Facebook</a><span class="mf-hours"><b>Avoinna</b><span>Ma–Pe 8–20</span> · <span>La–Su 8–18.30</span></span></div>
  </div>
  <div class="mf-cities">
    <h4>Toiminta-alueet</h4>
    <div class="list">${alueLinkit(R, paitsi)}</div>
  </div>
  <div class="mf-bot"><span>© <span id="yr"></span> TiivisKoti · Y-tunnus 3414418-4</span><span><a href="${R}tietosuoja.html" style="text-decoration:underline;text-underline-offset:3px">Tietosuoja</a> · <a href="${R}kayttoehdot.html" style="text-decoration:underline;text-underline-offset:3px">Käyttöehdot</a></span></div>
</div></footer>`;

/* Sama pieni skripti kuin muillakin sivuilla: burger + vuosiluku +
   .rv-elementtien paljastus. Inline, koska se on 12 riviä eikä sen takia
   kannata tehdä uutta pyyntöä. */
const skripti = `<script>
document.getElementById('yr').textContent=new Date().getFullYear();
const nv=document.getElementById('nav');
addEventListener('scroll',()=>nv.classList.toggle('scr',scrollY>8),{passive:true});
const bg=document.getElementById('burger'),nl=document.getElementById('nlinks');
bg&&bg.addEventListener('click',()=>nl.classList.toggle('open'));
const io=new IntersectionObserver((es)=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('in')),{threshold:.12});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));
/* Syvälinkki #laskuriin: selain hyppää ankkuriin ennen kuin herokuva on
   ladannut, jolloin kuvan korkeus työntää kohdan pois ruudulta ja sivu jää
   ylös. Vieritetään uudelleen kun kuvat ovat paikoillaan. Tämä koskee vain
   mainoslinkkejä (tiiviskoti.fi/toiminta-alueet/espoo.html#laskuri) —
   sivun sisäiset klikkaukset toimivat jo ilman tätä. */
if(location.hash){
  const t=document.querySelector(location.hash);
  if(t) addEventListener('load',()=>t.scrollIntoView({block:'start'}),{once:true});
}
</script>`;

/* ---------- hintalaskuri ----------
   Laskuri kopioidaan index.html:stä sellaisenaan JOKA AJOLLA eikä
   kirjoiteta tähän käsin. Näin aluesivujen laskuri ei voi jäädä jälkeen
   etusivun laskurista: jos indexin laskuriin lisätään kenttä, se ilmestyy
   aluesivuille seuraavalla ajolla.

   _shared.js aktivoi laskurin, kalenterin ja lomakkeen vain jos niiden
   DOM-elementit ovat sivulla (ks. _shared.js:4), joten sama skripti
   toimii aluesivulla ilman muutoksia.

   Otsikko ja ingressi korvataan kuntakohtaisilla: muuten sivulle tulisi
   177 riviä täysin identtistä markkinointitekstiä, mikä on juuri sitä
   kaavamaisuutta jota aluesivuilla halutaan välttää. */
const IDX = readFileSync('index.html', 'utf8');

function laskuriOsio(R, a) {
  const alku = IDX.indexOf('<section class="sec alt" id="laskuri">');
  const loppu = IDX.indexOf('<!-- /VARAUS -->');
  if (alku < 0 || loppu < 0 || loppu <= alku) {
    throw new Error('Laskuriosiota ei löytynyt index.html:stä — tarkista onko #laskuri tai "<!-- /VARAUS -->" -kommentti muuttunut.');
  }
  let sec = IDX.slice(alku, loppu).trimEnd();

  /* Osion sisäiset linkit ovat juuren suhteen; aluesivu on alikansiossa. */
  sec = sec.replace(/(href=")(taloyhtio\.html|kayttoehdot\.html|tietosuoja\.html)/g, `$1${R}$2`);
  /* `_kartoitus.js` renderöi tietosuojalinkin vasta ajossa, joten generaattori
     ei voi korjata sitä. Etuliite annetaan moduulille data-attribuuttina. */
  sec = sec.replace(/data-root=""/g, `data-root="${R}"`);

  /* Kuntakohtainen otsikko geneerisen tilalle.

     HUOM: pelkkä <h2>:n korvaaminen EI riitä. _shared.js:n paintStepChrome()
     ylikirjoittaa otsikon ja ingressin askeleen data-title/data-sub-arvoista
     heti ensimmäisellä maalauksella, joten staattinen teksti näkyisi vain
     sekunnin murto-osan. Molemmat on vaihdettava. */
  if (a) {
    const otsikko = `Laske hintasi ${a.ine}`;
    const ingressi = `Valitse ${a.gen} kotisi ovet ja ikkunat — kiinteä hinta päivittyy heti.`;

    sec = sec.replace(/<h2 class="title">Laske hinta heti<\/h2>/,
      `<h2 class="title">${esc(otsikko)}</h2>`);
    sec = sec.replace(/<p class="sub step-sub">[^<]*<\/p>/,
      `<p class="sub step-sub">${esc(ingressi)}</p>`);
    sec = sec.replace(/data-title="Laske hinta heti"/,
      `data-title="${esc(otsikko)}"`);
    sec = sec.replace(/data-sub="Valitse ovet ja ikkunat[^"]*"/,
      `data-sub="${esc(ingressi)}"`);
  }
  return sec;
}

/* Hinnat renderöidään pricing.mjs:stä eikä kirjoiteta käsin, jottei
   aluesivuille jää vanhoja lukuja hinnaston muuttuessa. */
function hintaTaulukko() {
  const rivit = TYPES.map((t) => {
    const hinta = t.tiers
      ? `${t.tiers[0].price} €`
      : `${t.price} €`;
    const lisa = t.tiers
      ? `<span class="mut">${t.tiers.slice(1).map((_, i) => `${t.tiers[i + 1].price} € (${tierRange(i + 1)} kpl)`).join(' · ')}</span>`
      : (t.combo ? `<span class="mut">${t.combo} € samalla käynnillä muun työn kanssa</span>` : '');
    return `<tr><td><b>${esc(t.name)}</b><span class="mut">${esc(t.desc)}</span></td><td>${hinta}${lisa}</td></tr>`;
  }).join('\n      ');
  return `<table class="htbl">
    <thead><tr><th>Kohde</th><th style="text-align:right">Hinta</th></tr></thead>
    <tbody>
      ${rivit}
      <tr><td><b>Pienin veloitus / käynti</b><span class="mut">Sisältää matkat, kartoituksen ja lämpökamerakuvauksen</span></td><td>${MIN_PRICE} €</td></tr>
    </tbody>
  </table>`;
}

/* ---------- kuntasivu ---------- */

function kuntaSivu(a, i) {
  const R = '../';
  const url = `${SITE}/toiminta-alueet/${a.slug}.html`;
  const [kuva, alt] = KUVAT[i % KUVAT.length];
  const title = `Ovien ja ikkunoiden tiivistys ${a.ine} — TiivisKoti`;
  /* Alle 155 merkkiä: pidempi katkeaa hakutuloksessa kesken lauseen. */
  const desc = `Ovien ja ikkunoiden tiivistys ${a.ine} kiinteään hintaan: ikkuna ${WINDOW_RANGE} €, ovi ${TYPES[1].price} €. Näet hinnan laskurista ja varaat ajan heti.`;

  const faqLd = a.faq.map(([q, v]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: v },
  }));

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${url}#palvelu`,
        name: `Ovien ja ikkunoiden tiivistys ${a.ine}`,
        serviceType: 'Ovien ja ikkunoiden tiivisteiden vaihto',
        description: a.intro,
        url,
        image: `${SITE}/img/${kuva}`,
        provider: { '@id': `${SITE}/#business` },
        /* Maakunta kunnasta, ei vakiona: Riihimäki on Kanta-Hämettä, ja väärä
           maakunta rakenteisessa datassa on Googlelle suora virhe. */
        areaServed: { '@type': 'City', name: a.name, address: { '@type': 'PostalAddress', addressRegion: a.maakunta || 'Uusimaa', addressCountry: 'FI' } },
        /* Sama haarukka kuin palvelusivulla: yksikköhinta laskee määrän
           mukaan, joten yksi luku antaisi väärän kuvan. */
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'EUR',
          lowPrice: String(WINDOW_TIERS[WINDOW_TIERS.length - 1].price),
          highPrice: String(WINDOW_TIERS[0].price),
          offerCount: 1,
          description: `Ikkunan tiivistys ${a.ine}, sis. ALV 25,5 %. Pienin veloitus ${MIN_PRICE} € / käynti.`,
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#ukk`,
        mainEntity: faqLd,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#murupolku`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Etusivu', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Toiminta-alueet', item: `${SITE}/toiminta-alueet.html` },
          { '@type': 'ListItem', position: 3, name: a.name, item: url },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: title,
        isPartOf: { '@id': `${SITE}/#website` },
        about: { '@id': `${url}#palvelu` },
        inLanguage: 'fi-FI',
      },
    ],
  };

  /* Naapurilinkit: kaksi seuraavaa kuntaa listalta. Antaa jokaiselle
     sivulle sisäisiä linkkejä ilman että footer on ainoa reitti. */
  const naapurit = [ALUEET[(i + 1) % ALUEET.length], ALUEET[(i + 2) % ALUEET.length]];

  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TiivisKoti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg?v=3" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#F6F7F3" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="stylesheet" href="${R}_alueet.css" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
${nav(R)}

<div class="wrap crumb"><a href="/">Etusivu</a> › <a href="${R}toiminta-alueet.html">Toiminta-alueet</a> › ${a.name}</div>

<header class="hero"><div class="wrap hero-grid">
  <div>
    <div class="rating"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg> Oma porukka, ei alihankintaa</div>
    <h1>Ovien ja ikkunoiden<br>tiivistys <span class="a">${a.ine}.</span></h1>
    <p class="hero-sub">${esc(a.lead)}</p>
    <div class="hero-cta">
      <a href="#laskuri" class="btn btn-p btn-lg">Laske hinta ja varaa aika</a>
      <a href="tel:${TELH}" class="btn btn-o btn-lg">Soita ${TEL}</a>
    </div>
    <p class="hero-fine"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Kiinteä hinta heti · kotitalousvähennys −40 % · ei tarjouspyyntöjä</p>
  </div>
  <div class="hero-card rv">
    <img src="${R}img/${kuva}?v=3" alt="${esc(alt)}" width="1100" height="880" fetchpriority="high">
  </div>
</div></header>

<section class="wrap" style="padding-bottom:clamp(16px,3vw,32px)">
  <div class="metrics rv">
    <div class="metric"><b><span class="a">${WINDOW_RANGE} €</span></b><span>per ikkuna ${a.ine}, määrän mukaan</span></div>
    <div class="metric"><b><span class="a">${TYPES[1].price} €</span></b><span>ulko- ja parvekeovi</span></div>
    <div class="metric"><b><span class="a">${MIN_PRICE} €</span></b><span>pienin veloitus / käynti</span></div>
  </div>
</section>

<section class="sec"><div class="wrap">
  <div class="kicker">${a.name}</div>
  <h2 class="title">Millaisia kohteita ${a.ine} on</h2>
  <p class="sub" style="max-width:70ch">${esc(a.intro)}</p>
  <p class="sub" style="max-width:70ch;margin-top:18px">${esc(a.kulma)}</p>
</div></section>

<section class="sec alt"><div class="wrap">
  <div class="kicker">Alueet</div>
  <h2 class="title">Palvelemme koko ${a.gen} alueella</h2>
  <p class="sub">Muun muassa näissä ${a.gen} osissa — koko kunta kuuluu palvelualueeseen.</p>
  <div class="osat">${a.osat.map((o) => `<span class="osa">${esc(o)}</span>`).join('')}</div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="kicker">Hinnasto</div>
  <h2 class="title">Kiinteät hinnat ${a.ine}</h2>
  <p class="sub">Samat hinnat koko toiminta-alueella. Kaikki hinnat sisältävät ALV 25,5 %, tiivisteet ja työn.</p>
  ${hintaTaulukko()}
  <p class="sub" style="margin-top:18px;font-size:15px">Mahdollinen matkalisä määräytyy postinumeron mukaan ja näkyy laskurissa ennen varauksen vahvistamista — sitä ei lisätä jälkikäteen laskuun.</p>
</div></section>

${laskuriOsio(R, a)}

<section class="sec alt"><div class="wrap">
  <div class="kicker">Kysyttyä</div>
  <h2 class="title">Usein kysyttyä — ${a.name}</h2>
  ${a.faq.map(([q, v]) => `<details class="faq-d"><summary>${esc(q)}</summary><p>${esc(v)}</p></details>`).join('\n  ')}
</div></section>

<section class="sec"><div class="wrap">
  <div class="ctaband rv">
    <h2>Näet hinnan ${a.ine} heti — ilman tarjouspyyntöä</h2>
    <p>Valitse ovet ja ikkunat laskurista, niin näet kiinteän hinnan, arvioidun keston ja kotitalousvähennyksen. Ajan varaat suoraan kalenterista.</p>
    <div class="hero-cta">
      <a href="#laskuri" class="btn btn-p btn-lg">Varaa aika</a>
      <a href="tel:${TELH}" class="btn btn-o btn-lg on-deep">Soita ${TEL}</a>
    </div>
  </div>
  <p class="sub" style="margin-top:30px">Lähialueet: ${naapurit.map((n) => `<a href="${R}toiminta-alueet/${n.slug}.html" style="color:var(--green);font-weight:700">${n.name}</a>`).join(' · ')} · <a href="${R}toiminta-alueet.html" style="color:var(--green);font-weight:700">kaikki toiminta-alueet</a></p>
</div></section>

${footer(R, a.slug)}
${skripti}
<script defer src="${R}_analytics.js"></script><script type="module" src="${R}_shared.js"></script>
<script type="module" src="${R}_anchors.js"></script>
</body>
</html>
`;
}


/* ---------- palvelusivut (ikkunat / ovet) ----------

   MIKSI OMAT SIVUT: Google Ads mittasi jokaisen avainsanan
   aloitussivukokemuksen "alle keskitasoksi", koska kaikki mainokset veivät
   etusivulle, joka puhuu ikkunoista, ovista, säästöstä ja taloyhtiöistä
   yhtä aikaa. Hakija, joka kirjoittaa "ulko-oven tiivistys", ei halua
   valikkoa vaan sen yhden asian. Sama sivu palvelee myös orgaanista hakua.

   Sisältö on tarkoituksella aitoa eikä avainsanatäytettä: mitä työhön
   kuuluu, milloin se kannattaa tehdä ja mitä se maksaa. Ohut kopiosivu
   olisi Googlelle oma ongelmansa. */

const PALVELUT = [
  {
    slug: 'ikkunoiden-tiivistys',
    kuva: 'ikkunat.webp',
    alt: 'Puutalon ikkuna ulkoa, valkoiset puitteet ja karmit',
    title: `Ikkunoiden tiivistys ${WINDOW_RANGE} € / ikkuna — TiivisKoti`,
    h1a: 'Ikkunoiden tiivistys',
    h1b: 'kiinteään hintaan.',
    kicker: 'Ikkunat',
    hinta: WINDOW_RANGE,
    hintaMin: WINDOW_LOW,
    hintaMax: WINDOW_HIGH,
    hintaSelite: 'per ikkuna, määrän mukaan',
    desc: `Ikkunoiden tiivisteiden vaihto kiinteään hintaan ${WINDOW_RANGE} € / ikkuna. Karmi- ja puitetiivisteet, helojen säätö ja toimivuuden tarkistus. Näet hinnan heti laskurista ja varaat ajan verkosta.`,
    lead: 'Vaihdamme karmi- ja puitetiivisteet, säädämme helat ja tarkistamme että ikkuna sulkeutuu tiiviisti. Näet hinnan laskurista ilman tarjouspyyntöä.',
    oireetOtsikko: 'Milloin ikkunat kannattaa tiivistää',
    oireet: [
      ['Ikkunalaudalta tuntuu veto', 'Kylmä ilmavirta lattian rajassa tai ikkunapenkillä on tavallisin merkki painuneesta tiivisteestä.'],
      ['Tiiviste on kova tai halkeillut', 'Kumi kovettuu 10–15 vuodessa. Kun sitä painaa sormella eikä se jousta takaisin, se ei enää tiivistä.'],
      ['Lasin alareuna huurtuu', 'Sisäilman kosteus tiivistyy kylmään kohtaan. Vuotava tiiviste tuo kylmän pinnan lähemmäs sisätilaa.'],
      ['Ikkuna vinkuu tai on jäykkä', 'Helojen välykset ovat muuttuneet. Pelkkä uusi tiiviste ei riitä, jos puite ei purista sitä tasaisesti.'],
    ],
    faq: [
      ['Paljonko ikkunoiden tiivistys maksaa?', `Ikkuna maksaa ${WINDOW_HIGH} € kappaleelta, ja hinta laskee määrän mukaan: ${WINDOW_TIERS.slice(1).map((t, i) => `${TIER_FROM[i + 1]} ikkunasta ${t.price} €`).join(', ')}. Pienin veloitus käynniltä on ${MIN_PRICE} €. Hinnat sisältävät tiivisteet, työn ja ALV 25,5 %.`],
      ['Kuinka kauan yhden ikkunan tiivistys kestää?', 'Noin 20 minuuttia ikkunaa kohti. Tavallinen omakotitalon kierros on 2–4 tuntia, ja työ tehdään yhdellä käynnillä.'],
      ['Mitä tiivisteitä käytätte?', 'Aukon mukaan valittu silikonitiiviste. Paksuus valitaan mitatun välyksen mukaan — liian ohut ei tiivistä ja liian paksu estää ikkunaa sulkeutumasta.'],
      ['Voiko tiivisteet vaihtaa talvella?', 'Kyllä. Työ tehdään sisäkautta eikä se vaadi lämpimiä olosuhteita. Syksy on silti helpoin aika, koska vedon huomaa heti ensimmäisillä pakkasilla.'],
      ['Kannattaako vanhat ikkunat tiivistää vai vaihtaa?', 'Jos puitteet ja karmit ovat kunnossa, tiivistys maksaa murto-osan ikkunaremontista ja poistaa vedon. Lahonneita rakenteita se ei korjaa — kerromme rehellisesti jos vaihto on järkevämpi.'],
    ],
    ctaOtsikko: 'Näet ikkunoiden hinnan heti — ilman tarjouspyyntöä',
  },
  {
    slug: 'ovien-tiivistys',
    kuva: 'ulko-ovet.webp',
    alt: 'Puutalon valkoinen ulko-ovi ja katettu kuisti',
    title: `Ovien tiivistys ${TYPES[1].price} € / ovi — TiivisKoti`,
    h1a: 'Ovien tiivistys',
    h1b: 'kiinteään hintaan.',
    kicker: 'Ovet',
    hinta: TYPES[1].price,
    hintaSelite: 'ulko- ja parvekeovi',
    desc: `Ulko-oven, parvekeoven ja terassin liukuoven tiivistys kiinteään hintaan alkaen ${TYPES[1].price} €. Sivutiivisteet, kynnyskumi ja oven käynnin säätö samalla käynnillä.`,
    lead: 'Vaihdamme sivutiivisteet ja kynnyskumin sekä säädämme oven käynnin niin, että ovi painuu tasaisesti tiivistettä vasten. Kaikki samalla käynnillä.',
    oireetOtsikko: 'Milloin ovi kannattaa tiivistää',
    oireet: [
      ['Kynnyksestä vetää', 'Kynnyskumi kuluu ensimmäisenä, koska se jää oven ja kynnyksen väliin joka kerta.'],
      ['Ovi ei sulkeudu tiiviisti', 'Sarana on painunut tai käyntiväli muuttunut. Tiiviste ei auta, jos ovi ei purista sitä koko matkalta.'],
      ['Valo näkyy oven raosta', 'Nopein oma testi: jos ulkoa näkyy valoa karmin ja oven välistä, siitä kulkee myös ilma.'],
      ['Lukko takkuaa tai ovi kolisee', 'Merkki siitä että vastarauta ja tiiviste eivät ole samassa linjassa. Säätö kuuluu työhön.'],
    ],
    faq: [
      ['Paljonko ulko-oven tiivistys maksaa?', `Ulko-ovi ja parvekeovi maksavat ${TYPES[1].price} € ovelta riippumatta siitä, montako ovea kohteessa on. Pelkkä kynnyskumin vaihto on ${TYPES[5].price} € ja väli- tai huoneovi ${TYPES[4].price} €${TYPES[4].combo ? ` — tai ${TYPES[4].combo} €, kun samalla käynnillä on vähintään kaksi kohdetta` : ''}. Pienin veloitus käynniltä on ${MIN_PRICE} €.`],
      ['Sisältyykö kynnyskumi hintaan?', 'Kyllä. Ulko-oven hintaan kuuluvat sivutiivisteet, kynnyskumi ja oven käynnin säätö — ei erillisiä lisiä.'],
      ['Entä terassin liuku- tai pariovi?', `Iso lasiovi ja liukuovi ovat ${TYPES[3].price} €, koska niissä on enemmän tiivistettävää kehää ja kiskon huolto kuuluu työhön.`],
      ['Kuinka kauan oven tiivistys kestää?', 'Noin 30 minuuttia ovea kohti. Useampi ovi tehdään samalla käynnillä, jolloin hinta ovea kohti on edullisempi.'],
      ['Korjaako tiivistys vinon oven?', 'Säädämme käyntivälyksen ja saranat siltä osin kuin ne ovat säädettävissä. Jos ovilehti on vääntynyt tai karmi liikkunut, kerromme sen paikan päällä ennen työn aloittamista.'],
    ],
    ctaOtsikko: 'Näet ovien hinnan heti — ilman tarjouspyyntöä',
  },
];

/* Sama lista kuin tarjouksen "Työhön sisältyy" (tiiviskoti-crm:n
   inclusions.ts). Pidettävä yhtenäisenä: jos sivu lupaa eri asiat kuin
   tarjous, asiakas huomaa sen viimeistään paperilla. */
const SISALTYY = [
  'Aukkojen tarkastus ja oikean tiivistetyypin valinta kohteen mukaan',
  'Vanhojen tiivisteiden poisto ja kiinnityspintojen puhdistus',
  'Silikonimassan levitys kiinnityspinnalle tarvittaessa',
  'Uusien tiivisteiden asennus — tiivisteet ja tarvikkeet sisältyvät hintaan',
  'Ovien käynnin säätö ja saranoiden rasvaus',
  'Ikkunoiden ja ovien toimivuuden tarkastus työn jälkeen',
  'Työalueen suojaus ja siivous — vanhat tiivisteet ja jätteet viedään pois',
  'Kirjallinen raportti huollon vaiheista ja käytetyistä tuotteista',
];

function palveluSivu(c) {
  const R = '';
  const url = `${SITE}/${c.slug}.html`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${url}#palvelu`,
        name: c.h1a,
        serviceType: c.h1a,
        description: c.desc,
        url,
        image: `${SITE}/img/${c.kuva}`,
        provider: { '@id': `${SITE}/#business` },
        areaServed: { '@type': 'State', name: 'Uusimaa', address: { '@type': 'PostalAddress', addressRegion: 'Uusimaa', addressCountry: 'FI' } },
        /* Hinta on porrastettu, joten rakennedataan menee AggregateOffer eikä
           Offer: schema.org vaatii `price`-kenttään yhden luvun, ja "65–95"
           olisi kelvoton arvo. lowPrice/highPrice kertoo saman haarukan
           muodossa jonka hakukone ymmärtää. */
        offers: c.hintaMin
          ? { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: String(c.hintaMin), highPrice: String(c.hintaMax),
              offerCount: 1, description: `${c.h1a}, sis. ALV 25,5 %. Pienin veloitus ${MIN_PRICE} € / käynti.` }
          : { '@type': 'Offer', priceCurrency: 'EUR', price: String(c.hinta), description: `${c.h1a}, sis. ALV 25,5 %. Pienin veloitus ${MIN_PRICE} € / käynti.` },
      },
      { '@type': 'FAQPage', '@id': `${url}#ukk`, mainEntity: c.faq.map(([q, v]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: v } })) },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Etusivu', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: c.h1a, item: url },
        ],
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TiivisKoti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(c.title)}" />
<meta property="og:description" content="${esc(c.desc)}" />
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg?v=3" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#F6F7F3" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="stylesheet" href="${R}_alueet.css" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
${nav(R)}

<div class="wrap crumb"><a href="/">Etusivu</a> › ${esc(c.h1a)}</div>

<header class="hero"><div class="wrap hero-grid">
  <div>
    <div class="rating"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg> Oma porukka, ei alihankintaa</div>
    <h1>${esc(c.h1a)}<br><span class="a">${esc(c.h1b)}</span></h1>
    <p class="hero-sub">${esc(c.lead)}</p>
    <div class="hero-cta">
      <a href="#laskuri" class="btn btn-p btn-lg">Laske hinta ja varaa aika</a>
      <a href="tel:${TELH}" class="btn btn-o btn-lg">Soita ${TEL}</a>
    </div>
    <p class="hero-fine"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Kiinteä hinta heti · kotitalousvähennys −40 % · ei tarjouspyyntöjä</p>
  </div>
  <div class="hero-card rv">
    <img src="${R}img/${c.kuva}?v=3" alt="${esc(c.alt)}" width="1100" height="880" fetchpriority="high">
  </div>
</div></header>

<section class="wrap" style="padding-bottom:clamp(16px,3vw,32px)">
  <div class="metrics rv">
    <div class="metric"><b><span class="a">${c.hinta} €</span></b><span>${esc(c.hintaSelite)}</span></div>
    <div class="metric"><b><span class="a">1 käynti</span></b><span>työ valmiiksi kerralla</span></div>
    <div class="metric"><b><span class="a">−40 %</span></b><span>kotitalousvähennys työn osuudesta</span></div>
  </div>
</section>

<section class="sec"><div class="wrap">
  <div class="kicker">${esc(c.kicker)}</div>
  <h2 class="title">${esc(c.oireetOtsikko)}</h2>
  <div class="osat" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:24px">
    ${c.oireet.map(([o, t]) => `<div style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px">
      <b style="display:block;margin-bottom:6px">${esc(o)}</b><span style="color:var(--mute);font-size:15px;line-height:1.6">${esc(t)}</span></div>`).join('\n    ')}
  </div>
</div></section>

<section class="sec alt"><div class="wrap">
  <div class="kicker">Työn sisältö</div>
  <h2 class="title">Mitä työhön sisältyy</h2>
  <p class="sub">Sama sisältö jokaisessa kohteessa — ei lisälaskuja jälkikäteen.</p>
  <ul style="margin-top:22px;max-width:70ch;line-height:1.9;padding-left:22px">
    ${SISALTYY.map((x) => `<li>${esc(x)}</li>`).join('\n    ')}
  </ul>
</div></section>

<section class="sec"><div class="wrap">
  <div class="kicker">Hinnasto</div>
  <h2 class="title">Kiinteät hinnat</h2>
  <p class="sub">Samat hinnat koko Uudellamaalla. Kaikki hinnat sisältävät ALV 25,5 %, tiivisteet ja työn.</p>
  ${hintaTaulukko()}
  <p class="sub" style="margin-top:18px;font-size:15px">Mahdollinen matkalisä määräytyy postinumeron mukaan ja näkyy laskurissa ennen varauksen vahvistamista — sitä ei lisätä jälkikäteen laskuun.</p>
</div></section>

${laskuriOsio(R, null)}

<section class="sec alt"><div class="wrap">
  <div class="kicker">Kysyttyä</div>
  <h2 class="title">Usein kysyttyä</h2>
  ${c.faq.map(([q, v]) => `<details class="faq-d"><summary>${esc(q)}</summary><p>${esc(v)}</p></details>`).join('\n  ')}
</div></section>

<section class="sec"><div class="wrap">
  <div class="ctaband rv">
    <h2>${esc(c.ctaOtsikko)}</h2>
    <p>Valitse ovet ja ikkunat laskurista, niin näet kiinteän hinnan, arvioidun keston ja kotitalousvähennyksen. Ajan varaat suoraan kalenterista.</p>
    <div class="hero-cta">
      <a href="#laskuri" class="btn btn-p btn-lg">Varaa aika</a>
      <a href="tel:${TELH}" class="btn btn-o btn-lg on-deep">Soita ${TEL}</a>
    </div>
  </div>
  <p class="sub" style="margin-top:30px">Katso myös: <a href="${R}${c.slug === 'ikkunoiden-tiivistys' ? 'ovien-tiivistys' : 'ikkunoiden-tiivistys'}.html" style="color:var(--green);font-weight:700">${c.slug === 'ikkunoiden-tiivistys' ? 'ovien tiivistys' : 'ikkunoiden tiivistys'}</a> · <a href="${R}taloyhtio.html" style="color:var(--green);font-weight:700">taloyhtiöt</a> · <a href="${R}toiminta-alueet.html" style="color:var(--green);font-weight:700">toiminta-alueet</a></p>
</div></section>

${footer(R, c.slug)}
${skripti}
<script defer src="${R}_analytics.js"></script><script type="module" src="${R}_shared.js"></script>
<script type="module" src="${R}_anchors.js"></script>
</body>
</html>
`;
}


/* ---------- kumppanisivut (jäsenedut) ----------

   Yhdistys linkittää omalta jäsensivultaan tänne, ja me ylläpidämme
   tarjouksen sisältöä itse — juuri niin kuin Päiväkummun Omakotiyhdistys
   ehdotti. Oma sivu on myös ainoa tapa kertoa ehdot kerralla oikein:
   pelkkä "10 % alennus" heidän sivullaan jättäisi auki mistä alennus
   lasketaan ja miten se otetaan käyttöön.

   `noindex`: etu on jäsenille, ei hakukoneelle. Sivu ei myöskään saa
   kilpailla omien palvelusivujen kanssa samoista hauista. Linkki toimii
   silti normaalisti.

   Alennus on oikea koodi CRM:ssä (tk.discount_codes), ei pelkkä lupaus
   sivulla: laskuri tarkistaa sen ja vähentää summan ennen varausta. */

const KUMPPANIT = [
  {
    slug: 'paivakumpu',
    yhdistys: 'Päiväkummun Omakotiyhdistys ry',
    lyhyt: 'Päiväkummun Omakotiyhdistys',
    gen: 'Päiväkummun Omakotiyhdistyksen',
    koodi: 'PAIVAKUMPU',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'korson-omakotiyhdistys',
    yhdistys: 'Korson Omakotiyhdistys ry',
    lyhyt: 'Korson Omakotiyhdistys',
    gen: 'Korson Omakotiyhdistyksen',
    koodi: 'KORSO',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'rekola-asolan-omakotiyhdistys',
    yhdistys: 'Rekola-Asolan Omakotiyhdistys ry',
    lyhyt: 'Rekola-Asolan Omakotiyhdistys',
    gen: 'Rekola-Asolan Omakotiyhdistyksen',
    koodi: 'REKOLA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'tikkurilan-omakotiyhdistys',
    yhdistys: 'Tikkurilan Omakotiyhdistys ry',
    lyhyt: 'Tikkurilan Omakotiyhdistys',
    gen: 'Tikkurilan Omakotiyhdistyksen',
    koodi: 'TIKKURILA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'nikinmaen-omakotiyhdistys',
    yhdistys: 'Nikinmäen Omakotiyhdistys ry',
    lyhyt: 'Nikinmäen Omakotiyhdistys',
    gen: 'Nikinmäen Omakotiyhdistyksen',
    koodi: 'NIKINMAKI',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'keravan-omakotiyhdistys',
    yhdistys: 'Keravan Omakotiyhdistys ry',
    lyhyt: 'Keravan Omakotiyhdistys',
    gen: 'Keravan Omakotiyhdistyksen',
    koodi: 'KERAVA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'keravan-jokivarren-omakotiyhdistys',
    yhdistys: 'Keravan Jokivarren Omakotiyhdistys ry',
    lyhyt: 'Keravan Jokivarren Omakotiyhdistys',
    gen: 'Keravan Jokivarren Omakotiyhdistyksen',
    koodi: 'JOKIVARSI',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'tuusulan-omakotiyhdistys',
    yhdistys: 'Tuusulan Omakotiyhdistys ry',
    lyhyt: 'Tuusulan Omakotiyhdistys',
    gen: 'Tuusulan Omakotiyhdistyksen',
    koodi: 'TUUSULA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'jarvenpaan-kiinteistoyhdistys',
    yhdistys: 'Järvenpään Kiinteistöyhdistys ry',
    lyhyt: 'Järvenpään Kiinteistöyhdistys',
    gen: 'Järvenpään Kiinteistöyhdistyksen',
    koodi: 'JARVENPAA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'nurmijarven-omakotiyhdistys',
    yhdistys: 'Nurmijärven Omakotiyhdistys ry',
    lyhyt: 'Nurmijärven Omakotiyhdistys',
    gen: 'Nurmijärven Omakotiyhdistyksen',
    koodi: 'NURMIJARVI',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'hyvinkaan-seudun-omakotiyhdistys',
    yhdistys: 'Hyvinkään Seudun Omakotiyhdistys ry',
    lyhyt: 'Hyvinkään Seudun Omakotiyhdistys',
    gen: 'Hyvinkään Seudun Omakotiyhdistyksen',
    koodi: 'HYVINKAA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'sipoon-omakotiyhdistys',
    yhdistys: 'Sipoon Omakotiyhdistys ry',
    lyhyt: 'Sipoon Omakotiyhdistys',
    gen: 'Sipoon Omakotiyhdistyksen',
    koodi: 'SIPOO',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'mantsalan-omakotiyhdistys',
    yhdistys: 'Mäntsälän Omakotiyhdistys ry',
    lyhyt: 'Mäntsälän Omakotiyhdistys',
    gen: 'Mäntsälän Omakotiyhdistyksen',
    koodi: 'MANTSALA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'porvoon-omakotiyhdistys',
    yhdistys: 'Porvoon Omakotiyhdistys ry',
    lyhyt: 'Porvoon Omakotiyhdistys',
    gen: 'Porvoon Omakotiyhdistyksen',
    koodi: 'PORVOO',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'askolan-omakotiyhdistys',
    yhdistys: 'Askolan Omakotiyhdistys ry',
    lyhyt: 'Askolan Omakotiyhdistys',
    gen: 'Askolan Omakotiyhdistyksen',
    koodi: 'ASKOLA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'myrskylan-omakotiyhdistys',
    yhdistys: 'Myrskylän Omakotiyhdistys ry',
    lyhyt: 'Myrskylän Omakotiyhdistys',
    gen: 'Myrskylän Omakotiyhdistyksen',
    koodi: 'MYRSKYLA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'loviisan-seudun-omakotiyhdistys',
    yhdistys: 'Loviisan Seudun Omakotiyhdistys ry',
    lyhyt: 'Loviisan Seudun Omakotiyhdistys',
    gen: 'Loviisan Seudun Omakotiyhdistyksen',
    koodi: 'LOVIISA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'lohjan-seudun-omakotiyhdistys',
    yhdistys: 'Lohjan Seudun Omakotiyhdistys ry',
    lyhyt: 'Lohjan Seudun Omakotiyhdistys',
    gen: 'Lohjan Seudun Omakotiyhdistyksen',
    koodi: 'LOHJA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'vihdin-omakotiyhdistys',
    yhdistys: 'Vihdin Omakotiyhdistys ry',
    lyhyt: 'Vihdin Omakotiyhdistys',
    gen: 'Vihdin Omakotiyhdistyksen',
    koodi: 'VIHTI',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'karkkilan-omakotiyhdistys',
    yhdistys: 'Karkkilan Omakotiyhdistys ry',
    lyhyt: 'Karkkilan Omakotiyhdistys',
    gen: 'Karkkilan Omakotiyhdistyksen',
    koodi: 'KARKKILA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'espoon-ja-kauniaisten-pienkiinteistot',
    yhdistys: 'Espoon ja Kauniaisten Pienkiinteistöt ry',
    lyhyt: 'Espoon ja Kauniaisten Pienkiinteistöt',
    gen: 'Espoon ja Kauniaisten Pienkiinteistöjen',
    koodi: 'ESPOO',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'lounais-espoon-omakotiyhdistys',
    yhdistys: 'Lounais-Espoon Omakotiyhdistys ry',
    lyhyt: 'Lounais-Espoon Omakotiyhdistys',
    gen: 'Lounais-Espoon Omakotiyhdistyksen',
    koodi: 'LOUNAISESPOO',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'koillis-helsingin-omakotiyhdistys',
    yhdistys: 'Koillis-Helsingin Omakotiyhdistys ry',
    lyhyt: 'Koillis-Helsingin Omakotiyhdistys',
    gen: 'Koillis-Helsingin Omakotiyhdistyksen',
    koodi: 'KOILLISHKI',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'malmin-seudun-omakotiyhdistys',
    yhdistys: 'Malmin Seudun Omakotiyhdistys ry',
    lyhyt: 'Malmin Seudun Omakotiyhdistys',
    gen: 'Malmin Seudun Omakotiyhdistyksen',
    koodi: 'MALMI',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'kaarelan-omakotiyhdistys',
    yhdistys: 'Kaarelan Omakotiyhdistys ry',
    lyhyt: 'Kaarelan Omakotiyhdistys',
    gen: 'Kaarelan Omakotiyhdistyksen',
    koodi: 'KAARELA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'pakilan-kiinteistonomistajain-yhdistys',
    yhdistys: 'Pakilan Kiinteistönomistajain Yhdistys ry',
    lyhyt: 'Pakilan Kiinteistönomistajain Yhdistys',
    gen: 'Pakilan Kiinteistönomistajain Yhdistyksen',
    koodi: 'PAKILA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'laajasalon-pienkiinteistoyhdistys',
    yhdistys: 'Laajasalon Pienkiinteistöyhdistys ry',
    lyhyt: 'Laajasalon Pienkiinteistöyhdistys',
    gen: 'Laajasalon Pienkiinteistöyhdistyksen',
    koodi: 'LAAJASALO',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  {
    slug: 'vartio-ja-mellunkylan-omakotiyhdistys',
    yhdistys: 'Vartio- ja Mellunkylän Omakotiyhdistys ry',
    lyhyt: 'Vartio- ja Mellunkylän Omakotiyhdistys',
    gen: 'Vartio- ja Mellunkylän Omakotiyhdistyksen',
    koodi: 'VARTIOKYLA',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
  /* Yhteissivu kolmelle yhdistykselle: Mäntsälän jäsenedut ovat myös Askolan
     ja Pornaisten jäsenten käytössä (Mäntsälän pj. 30.8.2026). Mäntsälän ja
     Askolan omat sivut jäävät ennalleen — niihin on jo lähetetty linkkejä.
     Pornaisilla ei ole omaa sivua, tämä on heidän ainoansa. `genP` on monikon
     genetiivi, jota yksittäisillä yhdistyksillä ei tarvita. */
  {
    slug: 'mantsala-askola-pornainen',
    yhdistys: 'Mäntsälän, Askolan ja Pornaisten Omakotiyhdistykset',
    lyhyt: 'Mäntsälä, Askola ja Pornainen',
    gen: 'Mäntsälän, Askolan tai Pornaisten Omakotiyhdistyksen',
    genP: 'Mäntsälän, Askolan ja Pornaisten Omakotiyhdistysten',
    koodi: 'MAPO',
    prosentti: 10,
    kuva: 'hero-entrance.webp',
    alt: 'TiivisKodin asentajat vaalean puutalon pihassa työvälineineen',
  },
];

function kumppaniSivu(k) {
  const R = '';
  const url = `${SITE}/${k.slug}`;
  const title = `${k.lyhyt}: −${k.prosentti} % ovien ja ikkunoiden tiivistyksestä — TiivisKoti`;
  const desc = `${k.genP ?? k.yhdistys} jäsenetu: ${k.prosentti} % alennus ovien ja ikkunoiden tiivistyksestä. Koodi ${k.koodi} varauksen yhteydessä — hinta näkyy laskurissa jo alennettuna.`;
  /* Laskuri on samalla sivulla, joten painike vie sen kohdalle eikä
     etusivulle. Koodi tulee bodyn data-attribuutista. */
  const varausUrl = '#laskuri';

  /* Esimerkit lasketaan hinnastosta, ei kirjoiteta käsin: jos hinnat
     muuttuvat, sivu ei jää lupaamaan vanhoja lukuja. */
  const alennettu = (e) => Math.round(e * (1 - k.prosentti / 100));
  const esimerkit = [
    ['1 ikkuna', MIN_PRICE, 'pienin veloitus käynniltä'],
    ['5 ikkunaa', 5 * WINDOW_TIERS[1].price, `${WINDOW_TIERS[1].price} € / ikkuna`],
    ['10 ikkunaa', 10 * WINDOW_TIERS[2].price, `${WINDOW_TIERS[2].price} € / ikkuna`],
    ['Ulko-ovi + 5 ikkunaa', TYPES[1].price + 5 * WINDOW_TIERS[1].price, 'ovi ja ikkunat samalla käynnillä'],
  ];

  return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="robots" content="noindex, follow" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TiivisKoti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg?v=3" />
<meta name="theme-color" content="#F6F7F3" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="stylesheet" href="${R}_alueet.css" />
</head>
<body data-koodi="${k.koodi}">
${nav(R)}

<div class="wrap crumb"><a href="/">Etusivu</a> › Jäsenetu · ${esc(k.lyhyt)}</div>

<header class="hero"><div class="wrap hero-grid">
  <div>
    <div class="rating"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg> Jäsenetu · ${esc(k.yhdistys)}</div>
    <h1>Jäsenetu:<br><span class="a">−${k.prosentti} % tiivistyksestä.</span></h1>
    <p class="hero-sub">${esc(k.gen)} jäsenenä saat ${k.prosentti} % alennuksen ovien ja ikkunoiden tiivistyksestä. Alennus lasketaan koko työn hinnasta, ja näet sen laskurissa ennen varauksen vahvistamista.</p>
    <div class="hero-cta">
      <a href="${varausUrl}" class="btn btn-p btn-lg">Laske hinta jäsenetuhinnalla</a>
      <a href="tel:${TELH}" class="btn btn-o btn-lg">Soita ${TEL}</a>
    </div>
    <p class="hero-fine"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Koodi <b style="margin:0 4px">${k.koodi}</b> — täyttyy valmiiksi yllä olevasta painikkeesta</p>
  </div>
  <div class="hero-card rv">
    <img src="${R}img/${k.kuva}?v=3" alt="${esc(k.alt)}" width="1100" height="880" fetchpriority="high">
  </div>
</div></header>

<section class="wrap" style="padding-bottom:clamp(16px,3vw,32px)">
  <div class="metrics rv">
    <div class="metric"><b><span class="a">−${k.prosentti} %</span></b><span>koko työn hinnasta</span></div>
    <div class="metric"><b><span class="a">−40 %</span></b><span>kotitalousvähennys päälle</span></div>
    <div class="metric"><b><span class="a">1 käynti</span></b><span>ovet ja ikkunat kerralla</span></div>
  </div>
</section>

<section class="sec"><div class="wrap">
  <div class="kicker">Näin käytät</div>
  <h2 class="title">Etu käyttöön kolmessa vaiheessa</h2>
  <div class="osat" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:24px">
    <div style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px">
      <b style="display:block;margin-bottom:6px">1. Laske hinta</b>
      <span style="color:var(--mute);font-size:15px;line-height:1.6">Valitse ovet ja ikkunat laskurista. Näet kiinteän hinnan heti — ei tarjouspyyntöä.</span></div>
    <div style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px">
      <b style="display:block;margin-bottom:6px">2. Syötä koodi ${k.koodi}</b>
      <span style="color:var(--mute);font-size:15px;line-height:1.6">Alennuskoodin kenttä on varauksen yhteystiedoissa. Tältä sivulta tullessa se on jo täytetty.</span></div>
    <div style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px">
      <b style="display:block;margin-bottom:6px">3. Varaa aika</b>
      <span style="color:var(--mute);font-size:15px;line-height:1.6">Valitse sopiva aika kalenterista. Vahvistus tulee sähköpostiin heti.</span></div>
  </div>
</div></section>

<section class="sec alt"><div class="wrap">
  <div class="kicker">Esimerkkejä</div>
  <h2 class="title">Mitä etu tarkoittaa euroina</h2>
  <p class="sub">Hinnat sisältävät tiivisteet, työn ja ALV 25,5 %. Kotitalousvähennys lasketaan vielä tämän päälle.</p>
  <div class="hinta-taulu" style="margin-top:22px">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="text-align:left;padding:12px 8px;border-bottom:2px solid var(--green)">Kohde</th>
        <th style="text-align:right;padding:12px 8px;border-bottom:2px solid var(--green)">Normaali</th>
        <th style="text-align:right;padding:12px 8px;border-bottom:2px solid var(--green)">Jäsenhinta</th>
      </tr></thead>
      <tbody>
        ${esimerkit.map(([nimi, hinta, selite]) => `<tr>
          <td style="padding:12px 8px;border-bottom:1px solid var(--line)"><b>${esc(nimi)}</b><br><span style="color:var(--mute);font-size:14px">${esc(selite)}</span></td>
          <td style="padding:12px 8px;border-bottom:1px solid var(--line);text-align:right;color:var(--mute)">${hinta} €</td>
          <td style="padding:12px 8px;border-bottom:1px solid var(--line);text-align:right;font-weight:800;color:var(--green)">${alennettu(hinta)} €</td>
        </tr>`).join('\n        ')}
      </tbody>
    </table>
  </div>
  <p class="sub" style="margin-top:16px;font-size:15px">Tarkka hinta riippuu kohteiden määrästä ja tyypistä — laskuri näyttää sen ennen varausta.</p>
</div></section>

<section class="sec"><div class="wrap">
  <div class="kicker">Työn sisältö</div>
  <h2 class="title">Mitä työhön sisältyy</h2>
  <p class="sub">Sama sisältö jokaisessa kohteessa — ei lisälaskuja jälkikäteen.</p>
  <ul style="margin-top:22px;max-width:70ch;line-height:1.9;padding-left:22px">
    ${SISALTYY.map((x) => `<li>${esc(x)}</li>`).join('\n    ')}
  </ul>
</div></section>

${laskuriOsio(R, null)}

<section class="sec alt"><div class="wrap">
  <div class="kicker">Ehdot</div>
  <h2 class="title">Edun ehdot lyhyesti</h2>
  <ul class="sub" style="max-width:70ch;line-height:1.9;padding-left:22px;margin-top:18px">
    <li>Etu koskee ${esc(k.genP ?? `${k.yhdistys}:n`)} jäseniä.</li>
    <li>Alennus ${k.prosentti} % lasketaan työn kokonaishinnasta, myös mahdollisesta matkalisästä.</li>
    <li>Koodi <b>${k.koodi}</b> syötetään varauksen yhteydessä. Jälkikäteen sitä ei voi lisätä valmiiseen varaukseen.</li>
    <li>Etua ei voi yhdistää muihin alennuskoodeihin.</li>
    <li>Kotitalousvähennyksen voi hyödyntää normaalisti alennetusta hinnasta.</li>
    <li>Voimassa toistaiseksi. Ilmoitamme yhdistykselle, jos etu muuttuu.</li>
  </ul>
</div></section>

<section class="sec"><div class="wrap">
  <div class="ctaband rv">
    <h2>Laske hinta jäsenetuhinnalla</h2>
    <p>Valitse ovet ja ikkunat, niin näet kiinteän hinnan alennuksineen. Koodi on valmiina, ajan varaat suoraan kalenterista.</p>
    <div class="hero-cta">
      <a href="${varausUrl}" class="btn btn-p btn-lg">Laske hinta ja varaa aika</a>
      <a href="tel:${TELH}" class="btn btn-o btn-lg on-deep">Soita ${TEL}</a>
    </div>
  </div>
  <p class="sub" style="margin-top:30px">Lue lisää: <a href="${R}ikkunoiden-tiivistys.html" style="color:var(--green);font-weight:700">ikkunoiden tiivistys</a> · <a href="${R}ovien-tiivistys.html" style="color:var(--green);font-weight:700">ovien tiivistys</a> · <a href="${R}toiminta-alueet.html" style="color:var(--green);font-weight:700">toiminta-alueet</a></p>
</div></section>

${footer(R, k.slug)}
${skripti}
<script defer src="${R}_analytics.js"></script><script type="module" src="${R}_shared.js"></script>
<script type="module" src="${R}_anchors.js"></script>
</body>
</html>
`;
}

/* ---------- hub-sivu ---------- */

function hubSivu() {
  const R = '';
  const url = `${SITE}/toiminta-alueet.html`;
  const title = 'Toiminta-alueet: tiivistys Uudellamaalla — TiivisKoti';
  /* "Uudellamaalla ja Riihimäellä", ei pelkkä kuntamäärä + Uusimaa: Riihimäki
     on Kanta-Hämettä, joten "N kuntaa Uudellamaalla" olisi suoraan väärin. */
  const desc = `Tiivistämme ovet ja ikkunat ${ALUEET.length} kunnassa Uudellamaalla ja Riihimäellä. Samat kiinteät hinnat: ikkuna ${WINDOW_TIERS[0].price} €, ovi ${TYPES[1].price} €.`;

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#webpage`,
        url,
        name: title,
        description: desc,
        isPartOf: { '@id': `${SITE}/#website` },
        inLanguage: 'fi-FI',
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#lista`,
        itemListElement: ALUEET.map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `Ovien ja ikkunoiden tiivistys ${a.ine}`,
          url: `${SITE}/toiminta-alueet/${a.slug}.html`,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#murupolku`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Etusivu', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Toiminta-alueet', item: url },
        ],
      },
    ],
  };

  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TiivisKoti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg?v=3" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#F6F7F3" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="stylesheet" href="_alueet.css" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
${nav(R)}

<div class="wrap crumb"><a href="/">Etusivu</a> › Toiminta-alueet</div>

<header class="sec" style="padding-bottom:0"><div class="wrap">
  <div class="kicker">Toiminta-alueet</div>
  <h1 style="font-size:clamp(34px,4.8vw,54px);max-width:20ch">Tiivistämme ovet ja ikkunat ${ALUEET.length} kunnassa Uudellamaalla ja Riihimäellä</h1>
  <p class="sub" style="max-width:64ch">Sama kiinteä hinta jokaisessa kunnassa: ikkuna ${WINDOW_RANGE} € määrän mukaan, ulko- ja parvekeovi ${TYPES[1].price} €, pienin veloitus ${MIN_PRICE} € per käynti. Valitse kuntasi, niin näet mitä juuri siellä tyypillisesti tiivistetään.</p>
  <div class="aluegrid">
    ${ALUEET.map((a) => `<a class="aluecard rv" href="toiminta-alueet/${a.slug}.html">
      <b>${a.name}</b>
      <span>${esc(a.lead)}</span>
      <span class="lnk">Katso ${a.name} <svg class="arrow" viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </a>`).join('\n    ')}
  </div>
</div></header>

${laskuriOsio(R, null)}

<section class="sec"><div class="wrap">
  <div class="ctaband rv">
    <h2>Etkö löydä kuntaasi?</h2>
    <p>Palvelemme ${ALUEET.length}:a kuntaa Uudellamaalla ja Riihimäellä. Syötä postinumerosi laskuriin, niin näet heti palvelemmeko osoitettasi, mitkä ajat ovat vapaana ja mahdollisen matkalisän.</p>
    <div class="hero-cta">
      <a href="/#laskuri" class="btn btn-p btn-lg">Tarkista postinumerolla</a>
      <a href="tel:${TELH}" class="btn btn-o btn-lg on-deep">Soita ${TEL}</a>
    </div>
  </div>
</div></section>

${footer(R, null)}
${skripti}
<script defer src="${R}_analytics.js"></script><script type="module" src="${R}_shared.js"></script>
<script type="module" src="${R}_anchors.js"></script>
</body>
</html>
`;
}

function meistaSivu() {
  const R = '';
  const url = `${SITE}/meista.html`;
  const title = 'Meistä: oma porukka, ei alihankintaa — TiivisKoti';
  const desc = 'Sama porukka vastaa puhelimeen, kartoittaa ja asentaa. Ovien ja ikkunoiden tiivistys kiinteään hintaan Uudellamaalla ja Riihimäellä.';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    '@id': `${url}#webpage`,
    url,
    name: title,
    description: desc,
    isPartOf: { '@id': `${SITE}/#website` },
    inLanguage: 'fi-FI',
  };

  /* Henkilökuvat poistettu 2026-08-22: puhelimella otetut muotokuvat antoivat
     yrityksestä harrastelijamaisen vaikutelman, mikä on taloyhtiöasiakkaalle
     juuri väärä signaali. Tilalle nimikirjainmerkki brändin väreissä — se
     kestää katsoa, skaalautuu joka kokoon eikä vanhene.

     Henkilöt itse jäävät sivulle: "oma porukka alusta loppuun" on koko
     sivun myyntiargumentti, joten nimet, roolit ja vastuut ovat edelleen
     esillä. Vain valokuva on poissa. Sana "alihankinta" poistettiin
     25.8.2026 Josuan pyynnöstä — argumentti sanotaan nyt myönteisenä
     (mitä teemme) eikä kiellon kautta (mitä emme teetä). Todisteet siirretään kuvien sijaan
     konkreettisiin faktoihin (Y-tunnus, vakuutus, takuu) alle.

     ÄLÄ kirjoita tähän henkilömäärää ("kaksi tekijää", "kahden hengen").
     Tekijöitä on enemmän kuin tällä listalla; alla luetellaan vain
     vastuuhenkilöt, ja siksi otsikko on "Vastuuhenkilöt" eikä "Tiimi". */
  const tiimi = [
    {
      kuva: 'meista-josua.jpg',
      name: 'Josua',
      role: 'Omistaja &amp; asentaja',
      bio: 'Vastaa yrityksestä ja hinnoittelusta — ja siitä että jokainen käynti hoidetaan juuri niin kuin on luvattu.',
    },
    {
      kuva: 'meista-daniel.jpg',
      name: 'Daniel',
      role: 'Omistaja &amp; asentaja',
      bio: 'Tekee kartoitukset ja tiivisteasennukset itse työmaalla. Työn hoitaa oma porukkamme alusta loppuun.',
    },
  ];

  /* Kasvokuvien rinnalle mitattavia lupauksia: taloyhtiön hallitus arvioi
     toimittajaa myös näillä. */
  const faktat = [
    { iso: 'Y-tunnus', pieni: '3414418-4 · rekisteröity yritys' },
    { iso: 'Oma porukka', pieni: 'omat asentajat, ei alihankintaa' },
    { iso: 'Kiinteä hinta', pieni: 'näet summan ennen varausta' },
    { iso: '0 €', pieni: 'kartoituskäynti, ei sitoumusta' },
  ];

  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TiivisKoti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg?v=3" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#F6F7F3" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="stylesheet" href="_alueet.css" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
${nav(R)}

<div class="wrap crumb"><a href="/">Etusivu</a> › Meistä</div>

<header class="sec" style="padding-bottom:0"><div class="wrap">
  <div class="kicker">Meistä</div>
  <h1 style="font-size:clamp(34px,4.8vw,54px);max-width:18ch">Oma porukka alusta loppuun</h1>
  <p class="sub" style="max-width:60ch">Meidät tapaat myös työmaalla: oma porukkamme vastaa puhelimeen, tekee maksuttoman kartoituksen ja asentaa tiivisteet. Ei myyntimiehiä — siksi hinta on kiinteä ja vastuu selvä.</p>
</div></header>

<div class="wrap" style="padding-top:clamp(18px,2.6vw,26px)">
  <img class="rv" src="img/meista-porukka.webp?v=3" alt="TiivisKodin asentajat työvälineineen asiakkaan pihassa" width="1100" height="619" loading="lazy" style="width:100%;max-width:820px;height:auto;display:block;border-radius:20px;border:1px solid var(--line)">
</div>

<section class="sec" style="padding-top:clamp(20px,3vw,32px)"><div class="wrap">
  <h2 class="rv" style="font-size:clamp(22px,2.6vw,28px);max-width:24ch;margin-bottom:6px">Vastuuhenkilöt</h2>
  <p class="rv" style="font-size:15px;color:var(--mute);max-width:56ch;margin-bottom:20px">Heidät tavoitat koko projektin ajan ja he vastaavat siitä että työ etenee sovitusti. Asennukset tekee oma porukkamme — emme käytä alihankkijoita.</p>
  <div class="rv" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;max-width:720px">
    ${tiimi.map((t) => `<figure style="margin:0;background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;display:flex;gap:16px;align-items:flex-start;padding:20px">
      <img src="img/${t.kuva}" alt="${t.name}, ${t.role.replace(/&amp;/g, 'ja').toLowerCase()}" width="104" height="130" loading="lazy" style="flex:0 0 auto;width:104px;height:130px;object-fit:cover;border-radius:14px;border:1px solid var(--line);background:var(--green-soft)">
      <figcaption style="min-width:0">
        <b style="display:block;font-size:18px;color:var(--ink)">${t.name}</b>
        <span style="display:block;margin-top:2px;font-size:14px;font-weight:700;color:var(--green)">${t.role}</span>
        <span style="display:block;margin-top:9px;font-size:14.5px;line-height:1.55;color:var(--text)">${t.bio}</span>
      </figcaption>
    </figure>`).join('\n    ')}
  </div>

  <div class="rv" style="margin-top:clamp(30px,4vw,44px)">
    <h2 style="font-size:clamp(22px,2.6vw,28px);max-width:24ch">Mihin voit luottaa</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:14px;margin-top:16px">
      ${faktat.map((f) => `<div class="wstat">
        <b style="font-size:20px;white-space:normal">${f.iso}</b>
        <span>${f.pieni}</span>
      </div>`).join('\n      ')}
    </div>
  </div>
</div></section>

<section class="sec alt"><div class="wrap">
  <div class="rv" style="max-width:760px">
    <div class="kicker">Näin työ etenee</div>
    <h2 style="font-size:clamp(24px,3vw,34px);max-width:20ch">Sama porukka alusta loppuun</h2>
    <div style="display:grid;gap:14px;margin-top:22px">
      ${[
        ['1', 'Kartoitus veloituksetta', 'Käymme kohteessa, mittaamme vetokohdat ja käymme ovet läpi yksi kerrallaan. Et maksa käynnistä mitään etkä sitoudu mihinkään.'],
        ['2', 'Kiinteä hinta kirjallisena', 'Saat hinnan ennen työn aloitusta. Se ei muutu matkan varrella — jos laajuus poikkeaa, sovimme siitä kanssasi etukäteen.'],
        ['3', 'Asennus sovittuna päivänä', 'Vanhat tiivisteet pois, pinnat puhtaaksi, uudet tiivisteet ja oven käynnin säätö. Jäljet siivotaan mennessä.'],
        ['4', 'Jälkihoito', 'Jos jokin ei toimi kuten pitää, tulemme korjaamaan sen.'],
      ].map(([n, t, d]) => `<div style="display:flex;gap:16px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px;box-shadow:var(--sh)">
        <span aria-hidden="true" style="flex:0 0 auto;width:28px;height:28px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px">${n}</span>
        <div style="min-width:0">
          <b style="display:block;font-size:16.5px;color:var(--ink)">${t}</b>
          <span style="display:block;margin-top:5px;font-size:14.5px;line-height:1.6;color:var(--text)">${d}</span>
        </div>
      </div>`).join('\n      ')}
    </div>
  </div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="ctaband rv">
    <h2>Tiivistetään sinunkin kotisi</h2>
    <p>Syötä postinumerosi laskuriin — näet heti palvelemmeko osoitettasi, kiinteän hinnan ja vapaat ajat.</p>
    <div class="hero-cta">
      <a href="/#laskuri" class="btn btn-p btn-lg">Laske hinta ja varaa aika</a>
      <a href="tel:${TELH}" class="btn btn-o btn-lg on-deep">Soita ${TEL}</a>
    </div>
  </div>
</div></section>

${footer(R, null)}
${skripti}
<script defer src="${R}_analytics.js"></script><script type="module" src="${R}_shared.js"></script>
<script type="module" src="${R}_anchors.js"></script>
</body>
</html>
`;
}

/* ---------- ajo ---------- */

mkdirSync('toiminta-alueet', { recursive: true });

/* Poista sivut joita ei enää ole datassa. Ilman tätä kunnan poistaminen
   _alueet-data.mjs:stä jättäisi HTML-tiedoston paikalleen: se katoaisi
   footerista ja sitemapista mutta pysyisi Googlen indeksissä ja lupaisi
   palvelua alueella jota ei palvella. Juuri sen takia Inkoo, Raasepori ja
   Hanko poistettiin — ne ovat 10xxx-postinumeroita eikä niitä palvella.
   Palvelualue on Uudenmaan 00–09xxx-kunnat sekä Riihimäki (11xxx).

   HUOM: sitemap.xml EI päivity tästä skriptistä, vaan se ylläpidetään käsin.
   Kun lisäät tai poistat kunnan, muista sitemap erikseen. */
const pitaa = new Set(ALUEET.map((a) => `${a.slug}.html`));
for (const f of readdirSync('toiminta-alueet')) {
  if (f.endsWith('.html') && !pitaa.has(f)) {
    unlinkSync(`toiminta-alueet/${f}`);
    console.log('✗ poistettu vanhentunut', f);
  }
}


/* ---------- artikkelit ---------- */

/* Hintaluvut yhdestä paikasta: artikkelidata sisältää {{TOKEN}}-merkinnät,
   jotka korvataan tässä pricing.mjs:n arvoilla. Näin artikkeli ei voi jäädä
   lupaamaan hintaa, joka ei ole enää voimassa. */
function hinnatTekstiin(teksti) {
  const w = WINDOW_TIERS.map((t) => t.price);
  const ovi = TYPES[1];
  const arvot = {
    IKKUNA: w[0], IKKUNA5: w[1], IKKUNA10: w[2], IKKUNA20: w[3],
    /* Rajat mukaan, jotta artikkeliteksti ei väitä väärää kappalemäärää. */
    RAJA2: TIER_FROM[1], RAJA3: TIER_FROM[2], RAJA4: TIER_FROM[3],
    IKKUNA_HAARUKKA: WINDOW_RANGE,
    OVI: ovi.price, OVICOMBO: ovi.combo ?? ovi.price,
    TERASSI: TYPES[3].price, VALIOVI: TYPES[4].price,
    MIN: MIN_PRICE,
    ESIM5: 5 * w[1],
    ESIM10: 10 * w[2],
    ESIMOVI: (ovi.combo ?? ovi.price) + 5 * w[1],
  };
  /* Kotitalousvähennysesimerkki: 40 % työn osuudesta, omavastuu 100 €.
     Työn osuus 90 % vastaa sitä mitä laskulle oikeasti eritellään. */
  arvot.TYO10 = Math.round(arvot.ESIM10 * 0.9);
  arvot.VAH10 = Math.round(arvot.TYO10 * 0.4);
  arvot.VAHNET10 = arvot.VAH10 - 100;
  return String(teksti).replace(/\{\{([A-Z0-9]+)\}\}/g, (koko, avain) => {
    if (!(avain in arvot)) throw new Error(`Tuntematon hintatoken ${koko} artikkelissa`);
    return String(arvot[avain]);
  });
}

const artikkeliUrl = (slug) => `${SITE}/artikkelit/${slug}.html`;

function artikkeliSivu(a) {
  const R = '../';
  const url = artikkeliUrl(a.slug);
  const t = hinnatTekstiin;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: a.title,
        description: t(a.desc),
        datePublished: a.julkaistu,
        dateModified: a.julkaistu,
        inLanguage: 'fi-FI',
        mainEntityOfPage: url,
        image: `${SITE}/img/og-tiiviskoti.jpg?v=3`,
        author: { '@type': 'Organization', name: 'TiivisKoti', url: `${SITE}/` },
        publisher: { '@id': `${SITE}/#business` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#ukk`,
        mainEntity: a.faq.map(([q, v]) => ({
          '@type': 'Question', name: t(q),
          acceptedAnswer: { '@type': 'Answer', text: t(v) },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Etusivu', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Artikkelit', item: `${SITE}/artikkelit.html` },
          { '@type': 'ListItem', position: 3, name: a.title, item: url },
        ],
      },
    ],
  };

  const liittyvat = a.liittyy
    .map((slug) => ARTIKKELIT.find((x) => x.slug === slug))
    .filter(Boolean);

  return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(a.titleSeo ?? a.title)} — TiivisKoti</title>
<meta name="description" content="${esc(t(a.desc))}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="TiivisKoti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(a.title)}" />
<meta property="og:description" content="${esc(t(a.desc))}" />
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg?v=3" />
<meta property="article:published_time" content="${a.julkaistu}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#F6F7F3" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="stylesheet" href="${R}_alueet.css" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
${nav(R)}

<div class="wrap crumb"><a href="/">Etusivu</a> › <a href="${R}artikkelit.html">Artikkelit</a> › ${esc(a.title)}</div>

<article class="sec"><div class="wrap" style="max-width:76ch">
  <div class="kicker">${esc(a.kicker)}</div>
  <h1 style="font-size:clamp(30px,4.2vw,46px);line-height:1.15;margin:8px 0 18px">${esc(a.h1)}</h1>
  <p style="font-size:19px;line-height:1.7;color:var(--mute);margin-bottom:8px">${esc(t(a.lead))}</p>
  <p style="font-size:14px;color:var(--mute)">Päivitetty <time datetime="${a.julkaistu}">${a.julkaistu.split('-').reverse().join('.')}</time></p>

  ${a.osiot.map(([otsikko, kappaleet]) => `<h2 style="font-size:clamp(22px,2.6vw,30px);margin:38px 0 14px">${esc(otsikko)}</h2>
  ${kappaleet.length > 2 && kappaleet.every((k) => k.length < 240)
    ? `<ul style="line-height:1.85;padding-left:22px">${kappaleet.map((k) => `<li style="margin-bottom:10px">${esc(t(k))}</li>`).join('')}</ul>`
    : kappaleet.map((k) => `<p style="line-height:1.8;margin-bottom:14px">${esc(t(k))}</p>`).join('\n  ')}`).join('\n  ')}

  <div style="background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px;margin:40px 0">
    <b style="display:block;font-size:19px;margin-bottom:8px">Laske oman kohteesi hinta</b>
    <p style="color:var(--mute);line-height:1.7;margin-bottom:18px">Syötä ovien ja ikkunoiden määrä, niin näet kiinteän hinnan heti. Voit varata ajan samalla — tarjouspyyntöä ei tarvita.</p>
    <a href="/#laskuri" class="btn btn-p btn-lg">Laske hinta ja varaa aika</a>
    <a href="tel:${TELH}" class="btn btn-o btn-lg">Soita ${TEL}</a>
  </div>

  <h2 style="font-size:clamp(22px,2.6vw,30px);margin:38px 0 14px">Usein kysyttyä</h2>
  ${a.faq.map(([q, v]) => `<details class="faq-d"><summary>${esc(t(q))}</summary><p>${esc(t(v))}</p></details>`).join('\n  ')}

  ${liittyvat.length ? `<h2 style="font-size:clamp(22px,2.6vw,30px);margin:44px 0 14px">Lue myös</h2>
  <ul style="line-height:2;padding-left:22px">
    ${liittyvat.map((x) => `<li><a href="${R}artikkelit/${x.slug}.html" style="color:var(--green);font-weight:700">${esc(x.title)}</a></li>`).join('\n    ')}
  </ul>` : ''}

  <p style="margin-top:36px;color:var(--mute)">Tiivistämme ovet ja ikkunat <a href="${R}toiminta-alueet.html" style="color:var(--green);font-weight:700">${ALUEET.length} kunnassa</a> Uudellamaalla ja Riihimäellä. Taloyhtiöille on <a href="${R}taloyhtio.html" style="color:var(--green);font-weight:700">oma palvelunsa</a>.</p>
</div></article>

${footer(R, null)}
${skripti}
</body>
</html>`;
}

function artikkelitHub() {
  const R = '';
  const url = `${SITE}/artikkelit.html`;
  const title = 'Artikkelit ovien ja ikkunoiden tiivistyksestä — TiivisKoti';
  const desc = 'Vedon syyt, tiivisteiden vaihdon hinta, kotitalousvähennys ja säästöarviot. Käytännön tietoa ovien ja ikkunoiden tiivistyksestä.';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', '@id': `${url}#page`, name: title, description: desc, inLanguage: 'fi-FI',
        isPartOf: { '@id': `${SITE}/#website` },
      },
      {
        '@type': 'ItemList', '@id': `${url}#lista`,
        itemListElement: ARTIKKELIT.map((a, i) => ({
          '@type': 'ListItem', position: i + 1, name: a.title, url: artikkeliUrl(a.slug),
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Etusivu', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Artikkelit', item: url },
        ],
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TiivisKoti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg?v=3" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#F6F7F3" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="stylesheet" href="${R}_alueet.css" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
${nav(R)}

<div class="wrap crumb"><a href="/">Etusivu</a> › Artikkelit</div>

<section class="sec"><div class="wrap">
  <div class="kicker">Artikkelit</div>
  <h1 style="font-size:clamp(32px,4.4vw,50px);max-width:22ch">Tietoa ovien ja ikkunoiden tiivistyksestä</h1>
  <p class="sub" style="max-width:65ch">Mistä veto johtuu, mitä tiivisteiden vaihto maksaa ja paljonko se säästää. Kirjoitettu sen pohjalta mitä kohteissa oikeasti nähdään.</p>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-top:34px">
    ${ARTIKKELIT.map((a) => `<a href="${R}artikkelit/${a.slug}.html" style="display:block;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;text-decoration:none;color:inherit">
      <div class="kicker" style="margin-bottom:8px">${esc(a.kicker)}</div>
      <b style="display:block;font-size:19px;line-height:1.35;margin-bottom:10px">${esc(a.title)}</b>
      <span style="color:var(--mute);font-size:15px;line-height:1.65">${esc(hinnatTekstiin(a.lead))}</span>
    </a>`).join('\n    ')}
  </div>
</div></section>

${footer(R, null)}
${skripti}
</body>
</html>`;
}


for (const k of KUMPPANIT) {
  writeFileSync(`${k.slug}.html`, kumppaniSivu(k));
  console.log('✓', k.slug + '.html');
}

for (const c of PALVELUT) {
  writeFileSync(`${c.slug}.html`, palveluSivu(c));
  console.log('✓', c.slug + '.html');
}

writeFileSync('toiminta-alueet.html', hubSivu());
console.log('✓ toiminta-alueet.html');

writeFileSync('meista.html', meistaSivu());
console.log('✓ meista.html');

ALUEET.forEach((a, i) => {
  writeFileSync(`toiminta-alueet/${a.slug}.html`, kuntaSivu(a, i));
  console.log(`✓ toiminta-alueet/${a.slug}.html`);
});


/* ---------- artikkelit ---------- */

mkdirSync('artikkelit', { recursive: true });
for (const a of ARTIKKELIT) {
  writeFileSync(`artikkelit/${a.slug}.html`, artikkeliSivu(a));
  console.log('✓ artikkelit/' + a.slug + '.html');
}
writeFileSync('artikkelit.html', artikkelitHub());
console.log('✓ artikkelit.html');

/* ---------- sitemap ---------- */

/* Sitemap ylläpidettiin ennen käsin, jolloin lastmod jäi kuukausia vanhaksi
   ja uudet sivut piti muistaa lisätä erikseen. Nyt se syntyy samasta
   lähteestä kuin sivutkin. Kumppanisivut jätetään pois: ne ovat noindex. */
function sitemapXml() {
  const tanaan = new Date().toISOString().slice(0, 10);
  const sivut = [
    { loc: `${SITE}/`, pri: '1.0', freq: 'weekly' },
    { loc: `${SITE}/ikkunoiden-tiivistys.html`, pri: '0.9', freq: 'monthly' },
    { loc: `${SITE}/ovien-tiivistys.html`, pri: '0.9', freq: 'monthly' },
    { loc: `${SITE}/taloyhtio.html`, pri: '0.9', freq: 'monthly' },
    { loc: `${SITE}/toiminta-alueet.html`, pri: '0.8', freq: 'monthly' },
    { loc: `${SITE}/artikkelit.html`, pri: '0.8', freq: 'weekly' },
    ...ARTIKKELIT.map((a) => ({ loc: artikkeliUrl(a.slug), pri: '0.7', freq: 'monthly', mod: a.julkaistu })),
    ...ALUEET.map((a) => ({ loc: `${SITE}/toiminta-alueet/${a.slug}.html`, pri: '0.7', freq: 'monthly' })),
    { loc: `${SITE}/meista.html`, pri: '0.5', freq: 'yearly' },
    { loc: `${SITE}/varaa.html`, pri: '0.5', freq: 'monthly' },
    { loc: `${SITE}/ajanvaraus.html`, pri: '0.5', freq: 'monthly' },
    { loc: `${SITE}/tietosuoja.html`, pri: '0.3', freq: 'yearly' },
    { loc: `${SITE}/kayttoehdot.html`, pri: '0.3', freq: 'yearly' },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sivut.map((s) => `  <url>
    <loc>${s.loc}</loc>
    <lastmod>${s.mod ?? tanaan}</lastmod>
    <changefreq>${s.freq}</changefreq>
    <priority>${s.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
}
writeFileSync('sitemap.xml', sitemapXml());
console.log('✓ sitemap.xml');

console.log(`\n${ALUEET.length} aluesivua + hub kirjoitettu.`);
