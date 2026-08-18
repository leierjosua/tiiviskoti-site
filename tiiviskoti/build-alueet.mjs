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
import { TYPES, MIN_PRICE, WINDOW_TIERS } from './pricing.mjs';

const TEL = '045 875 5996';
const TELH = '+358458755996';

/* Kuvat kierrätetään listasta, jotta vierekkäiset aluesivut eivät näytä
   identtisiltä. Sama kuva toistuu vasta viiden kunnan välein. */
const KUVAT = [
  ['hero-entrance.webp', 'Punainen puutalo, jonka valkoiset ikkunanpuitteet on juuri tiivistetty'],
  ['ikkunat.webp',       'Asentaja uusii ikkunan karmitiivistettä'],
  ['ulko-ovet.webp',     'Uusi tiiviste asennettuna ulko-oven karmiin'],
  ['taloyhtiot.webp',    'Kerrostalon julkisivu ja parvekeovet'],
  ['miksi-tyo.webp',     'TiivisKodin asentaja työssä'],
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
      <div class="mf-rate"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg> Vastuuvakuutettu · 2 vuoden takuu työlle</div>
    </div>
    <div class="mf-col"><h4>Palvelut</h4><a href="/#palvelut">Ovet</a><a href="/#palvelut">Ikkunat</a><a href="${R}taloyhtio.html">Taloyhtiöt</a><a href="#laskuri">Hintalaskuri</a></div>
    <div class="mf-col"><h4>Yritys</h4><a href="/#miksi">Miksi me</a><a href="/#saasto">Säästöarvio</a><a href="/#ukk">UKK</a><a href="#laskuri">Varaa aika</a></div>
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
      ? `<span class="mut">${t.tiers[1].price} € (5–9 kpl) · ${t.tiers[2].price} € (10–19) · ${t.tiers[3].price} € (20+)</span>`
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
  const desc = `Tiivistämme ovet ja ikkunat ${a.ine} kiinteään hintaan: ikkuna ${WINDOW_TIERS[0].price} €, ulko- ja parvekeovi ${TYPES[1].price} €, pienin veloitus ${MIN_PRICE} €. Näet hinnan heti laskurista ja varaat ajan suoraan kalenterista.`;

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
        offers: {
          '@type': 'Offer',
          priceCurrency: 'EUR',
          price: String(WINDOW_TIERS[0].price),
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
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg" />
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
    <div class="rating"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg> Vastuuvakuutettu · 2 vuoden takuu työlle</div>
    <h1>Ovien ja ikkunoiden<br>tiivistys <span class="a">${a.ine}.</span></h1>
    <p class="hero-sub">${esc(a.lead)}</p>
    <div class="hero-cta">
      <a href="#laskuri" class="btn btn-p btn-lg">Laske hinta ja varaa aika</a>
      <a href="tel:${TELH}" class="btn btn-o btn-lg">Soita ${TEL}</a>
    </div>
    <p class="hero-fine"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Kiinteä hinta heti · kotitalousvähennys −40 % · ei tarjouspyyntöjä</p>
  </div>
  <div class="hero-card rv">
    <img src="${R}img/${kuva}" alt="${esc(alt)}" width="1100" height="880" fetchpriority="high">
  </div>
</div></header>

<section class="wrap" style="padding-bottom:clamp(16px,3vw,32px)">
  <div class="metrics rv">
    <div class="metric"><b><span class="a">${WINDOW_TIERS[0].price} €</span></b><span>per ikkuna ${a.ine}</span></div>
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
</body>
</html>
`;
}

/* ---------- hub-sivu ---------- */

function hubSivu() {
  const R = '';
  const url = `${SITE}/toiminta-alueet.html`;
  const title = 'Toiminta-alueet — TiivisKoti | Ovien ja ikkunoiden tiivistys Uudellamaalla ja Riihimäellä';
  /* "Uudellamaalla ja Riihimäellä", ei pelkkä kuntamäärä + Uusimaa: Riihimäki
     on Kanta-Hämettä, joten "N kuntaa Uudellamaalla" olisi suoraan väärin. */
  const desc = `TiivisKoti tiivistää ovet ja ikkunat ${ALUEET.length} kunnassa Uudellamaalla ja Riihimäellä — Helsingistä Riihimäelle. Samat kiinteät hinnat koko alueella: ikkuna ${WINDOW_TIERS[0].price} €, ovi ${TYPES[1].price} €.`;

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
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg" />
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
  <p class="sub" style="max-width:64ch">Sama kiinteä hinta jokaisessa kunnassa: ikkuna ${WINDOW_TIERS[0].price} €, ulko- ja parvekeovi ${TYPES[1].price} €, pienin veloitus ${MIN_PRICE} € per käynti. Valitse kuntasi, niin näet mitä juuri siellä tyypillisesti tiivistetään.</p>
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
</body>
</html>
`;
}

function meistaSivu() {
  const R = '';
  const url = `${SITE}/meista.html`;
  const title = 'Meistä — TiivisKoti';
  const desc = 'TiivisKoti on kahden tekijän yritys: sama porukka vastaa puhelimeen, tekee maksuttoman kartoituksen ja asentaa tiivisteet. Ovien ja ikkunoiden tiivistevaihto kiinteään hintaan Uudellamaalla ja Riihimäellä.';

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

  /* Kuvat: valkopaita = Josua (omistaja), tumma paita = Daniel (puheenjohtaja
     ja asentaja). Kuvat rajattu 4:5 (800×1000). */
  const tiimi = [
    {
      img: 'meista-omistaja.jpg',
      alt: 'Josua, TiivisKodin omistaja',
      name: 'Josua',
      role: 'Omistaja &amp; asentaja',
      bio: 'Vastaa yrityksestä ja hinnoittelusta — ja siitä että jokainen käynti hoidetaan juuri niin kuin on luvattu.',
    },
    {
      img: 'meista-asentaja.jpg',
      alt: 'Daniel, TiivisKodin puheenjohtaja ja asentaja',
      name: 'Daniel',
      role: 'Puheenjohtaja &amp; asentaja',
      bio: 'Tekee kartoitukset ja tiivisteasennukset itse työmaalla. Sinua palvelee sama henkilö alusta loppuun.',
    },
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
<meta property="og:image" content="${SITE}/img/og-tiiviskoti.jpg" />
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
  <h1 style="font-size:clamp(34px,4.8vw,54px);max-width:18ch">Kaksi tekijää, ei alihankintaa</h1>
  <p class="sub" style="max-width:60ch">Meidät tapaat myös työmaalla: sama porukka vastaa puhelimeen, tekee maksuttoman kartoituksen ja asentaa tiivisteet. Ei myyntimiehiä eikä alihankintaa — siksi hinta on kiinteä ja vastuu selvä.</p>
</div></header>

<section class="sec" style="padding-top:clamp(20px,3vw,32px)"><div class="wrap">
  <div class="rv" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;max-width:720px">
    ${tiimi.map((t) => `<figure style="margin:0;background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden">
      <img src="img/${t.img}" alt="${esc(t.alt)}" width="800" height="1000" loading="lazy" style="width:100%;height:auto;display:block;aspect-ratio:4/5;object-fit:cover;object-position:center" />
      <figcaption style="padding:16px 18px">
        <b style="display:block;font-size:18px;color:var(--ink)">${t.name}</b>
        <span style="display:block;margin-top:2px;font-size:14px;font-weight:700;color:var(--green)">${t.role}</span>
        <span style="display:block;margin-top:9px;font-size:14.5px;line-height:1.55;color:var(--text)">${t.bio}</span>
      </figcaption>
    </figure>`).join('\n    ')}
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

writeFileSync('toiminta-alueet.html', hubSivu());
console.log('✓ toiminta-alueet.html');

writeFileSync('meista.html', meistaSivu());
console.log('✓ meista.html');

ALUEET.forEach((a, i) => {
  writeFileSync(`toiminta-alueet/${a.slug}.html`, kuntaSivu(a, i));
  console.log(`✓ toiminta-alueet/${a.slug}.html`);
});

console.log(`\n${ALUEET.length} aluesivua + hub kirjoitettu.`);
