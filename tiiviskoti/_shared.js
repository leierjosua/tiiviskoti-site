/* =========================================================
   TiivisKoti — shared functionality for all visions.
   Design-agnostic: only touches DOM by id/class, no colors.
   Kaikki lohkot on suojattu: laskuri, kalenteri, FAQ ja lomake
   ajetaan vain jos niiden DOM-elementit ovat sivulla.

   Hinnat EIVÄT ole täällä — ne tulevat pricing.mjs:stä, jota myös
   api/create-booking.mjs käyttää. Näin laskurin näyttämä ja veloitettava
   hinta lasketaan samasta koodista eivätkä voi erota toisistaan.
   ========================================================= */
import { TYPES, EXTRAS, NET_FACTOR, WINDOW_TIERS, computePricing, unitPriceFor, tierPriceFor } from './pricing.mjs';

const ico = {
  ulko:'<svg viewBox="0 0 24 24" fill="none"><rect x="6" y="3" width="12" height="18" rx="1.5" stroke="currentColor" stroke-width="1.8"/><circle cx="14.5" cy="12" r="1.2" fill="currentColor"/></svg>',
  parveke:'<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="18" rx="1" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="3" width="8" height="18" rx="1" stroke="currentColor" stroke-width="1.8"/></svg>',
  terassi:'<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 4v16" stroke="currentColor" stroke-width="1.6"/><path d="M6 20l3-3M18 4l-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  vali:'<svg viewBox="0 0 24 24" fill="none"><rect x="7" y="3" width="10" height="18" rx="1.2" stroke="currentColor" stroke-width="1.8"/><circle cx="14" cy="12" r="1" fill="currentColor"/></svg>',
  ikkuna:'<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v18M4 12h16" stroke="currentColor" stroke-width="1.6"/></svg>',
  kynnys:'<svg viewBox="0 0 24 24" fill="none"><path d="M3 18h18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="6" y="6" width="12" height="8" rx="1.2" stroke="currentColor" stroke-width="1.7"/></svg>'
};
/* Ikkunan porrastuksen selite: näytetään kortissa, jotta asiakas näkee
   miksi yksikköhinta muuttuu määrää kasvattaessa. */
const TIER_HINT = 'Mitä useampi ikkuna, sitä halvempi: 5+ 85 € · 10+ 75 € · 20+ 65 €';

/* ---------- mainoskampanjan tunnistus ----------
   Osoitteen ?src=-parametri kertoo mistä mainoksesta kävijä tuli, esim.
   postilaatikkomainoksen QR:stä ?src=qr-a6. Tunniste kulkee varauksen
   mukana CRM:ään ja näkyy adminissa työn kohdalla.

   MIKSI USEA PARAMETRI: ?src= on meidän oma merkintämme, ja se toimii vain
   linkeissä jotka kirjoitamme itse. Meta ja Google lisäävät klikkiin OMAT
   parametrinsa (utm_*, fbclid, gclid) — ja ne ovat ainoat jotka näkyvät kun
   mainos on tehty mainostyökalussa eikä kukaan muistanut liittää ?src=-osaa.
   Elo 2026 mitattuna se koski kaikkea maksettua liikennettä: 89 kävijää
   viikossa Facebookista ja Instagramista, joista yhdelläkään ei ollut
   kampanjatunnistetta. Siksi luetaan kaikki neljä.

   MIKSI KLIKKITUNNISTEESTA JOHDETAAN KARKEA ARVO: pelkkä fbclid kertoo että
   kävijä tuli Metan mainoksesta vaikkei kerro mistä niistä. `meta-ads` on
   raportissa äärettömän paljon parempi kuin tyhjä — ja tarkan kampanjan saa
   lisäämällä mainokseen utm_campaign-parametrin.

   Sama tunnistus on kolmessa paikassa (tässä, `_analytics.js` ja
   `taloyhtio.html`) koska ne latautuvat eri tavoin eikä yksikään saa riippua
   toisesta: `_analytics.js` on mainosestojen kohde ja se estetään usein,
   eikä kaupan attribuutio saa kaatua siihen. Jos muutat sääntöä, muuta se
   kaikkiin kolmeen.

   MIKSI localStorage EIKÄ sessionStorage: painomainoksen nähnyt harkitsee
   tyypillisesti päiviä ennen varaamista, ja istunto katkeaa siinä välissä.
   sessionStorage riittää yhden sivulatauksen ketjuun (varaa -> ajanvaraus),
   mutta menettäisi juuri ne kaupat joita mainoksella tavoitellaan.

   MIKSI ENSIMMÄINEN VOITTAA: kaupan ansaitsee se mainos joka toi kävijän
   sivustolle. Jos hän palaa myöhemmin suoraan osoitteella, tunnistetta ei
   ylikirjoiteta tyhjällä eikä myöhemmällä.

   Vanhentumisaika rajaa virheattribuutiota: kuukauden takaisen mainoksen
   ei kuulu saada kunniaa tänään syntyneestä orgaanisesta varauksesta. */
const CAMPAIGN_KEY = 'tk_campaign';
const CAMPAIGN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CAMPAIGN_RE = /^[a-z0-9][a-z0-9._-]{0,59}$/;

/* ---------- Google Ads -klikin tunniste ----------
   Google lisää mainoslinkkiin ?gclid= (tai iOS:llä ?wbraid=/?gbraid=). Se
   talletetaan samalla logiikalla kuin ?src= ja lähetetään varauksen mukana,
   jotta tiedämme MIKÄ mainosklikki tuotti kaupan.

   MIKSI EI GOOGLEN SKRIPTIÄ: gtag.js asettaisi seurantaevästeet ja lähettäisi
   jokaisen kävijän Googlelle. Tietosuojaselosteemme lupaa ettei niin tehdä.
   Tämä tapa lähettää Googlelle vain sen, että tietty klikki johti kauppaan —
   ja vasta jälkikäteen, kun konversiot viedään Ads-tilille. Kävijöitä joista
   ei tule asiakasta ei raportoida Googlelle lainkaan.

   30 pv vastaa Google Adsin oletusattribuutioikkunaa. Ensimmäinen voittaa,
   samasta syystä kuin kampanjatunnisteessa. */
const GCLID_KEY = 'tk_gclid';
const GCLID_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const GCLID_RE = /^[A-Za-z0-9_-]{10,200}$/;

/* Tunnisteen tyyppi talletetaan arvon rinnalle (kenttä `k`).

   MIKSI: Adsin rajapinnassa gclid, wbraid ja gbraid ovat KOLME ERI KENTTÄÄ,
   eikä arvosta voi päätellä kumpi on kumpi — ne näyttävät samalta. Jos
   wbraid lähetetään gclidinä, Ads hylkää konversion. Tyyppi on siis
   tiedossa vain tässä, talteenoton hetkellä, ja se on kuljetettava mukana.

   Vanhat tallennukset ovat ilman `k`-kenttää. Ne ovat käytännössä
   gclideja, joten sitä käytetään oletuksena. */
const GCLID_KINDS = ['gclid', 'wbraid', 'gbraid'];

function readGclidEntry(){
  try{
    const s = JSON.parse(localStorage.getItem(GCLID_KEY) || 'null');
    if(!s || !GCLID_RE.test(s.v || '')) return undefined;
    if(Date.now() - (s.t || 0) > GCLID_MAX_AGE_MS) return undefined;
    return s;
  }catch(_){ return undefined; }
}

function readGclid(){
  const s = readGclidEntry();
  return s ? s.v : undefined;
}

function readGclidKind(){
  const s = readGclidEntry();
  if(!s) return undefined;
  return GCLID_KINDS.includes(s.k) ? s.k : 'gclid';
}

(function captureGclid(){
  let v, k;
  try{
    const q = new URLSearchParams(location.search);
    /* wbraid ja gbraid ovat iOS:n vastineet gclidille silloin kun selaimen
       seurantaa on rajoitettu. Talletetaan mikä tahansa niistä — mutta
       muistiin myös KUMPI, koska rajapinta erottelee ne. */
    for(const kind of GCLID_KINDS){
      const got = q.get(kind);
      if(got){ v = got; k = kind; break; }
    }
  }catch(_){ return; }
  if(!v || !GCLID_RE.test(v)) return;
  if(readGclid()) return;
  try{ localStorage.setItem(GCLID_KEY, JSON.stringify({ v, k, t: Date.now() })); }catch(_){}
})();

/* ---------- Meta-klikin tunnisteet (fbclid → _fbc, _fbp) ----------
   Sama periaate kuin gclidissä: talletetaan Facebook/Instagram-mainosklikin
   tunniste ja lähetetään vasta toteutuneen varauksen/liidin mukana Metan
   CAPIin (api/create-booking, api/create-lead). Selaimeen ei ladata Meta
   Pixeliä eikä aseteta seurantaevästeitä — tietosuojaseloste pysyy voimassa.

   _fbc rakennetaan fbclidistä Metan kaavalla fb.1.<aikaleima>.<fbclid>. Jos
   sivulla joskus on Meta Pixel, se asettaa _fbp/_fbc-evästeet ja ne luetaan
   suoraan; muuten fbclid-pohjainen arvo riittää osumaan. 7 pv = Metan
   klikkiattribuution oletusikkuna; TUOREIN klikki voittaa (ei ensimmäinen),
   jotta ansio menee viimeksi klikatulle mainokselle eikä vanhalle klikille,
   joka roikkui muistissa kuukausia ja ylikirjasi kaikki myöhemmät varaukset. */
const VID_KEY = 'tk_vid';

/* Pysyvä satunnaistunniste mainonnan mittausta varten.

   MIKSI: Meta yhdistää tapahtumat ihmisiin lähettämiemme tietojen
   perusteella. Ostoaikeen kohdalla kävijä ei ole vielä antanut nimeä eikä
   sähköpostia, joten ilman tätä sama ihminen näyttäisi joka käynnillä
   uudelta eikä Meta osaisi liittää aietta myöhempään kauppaan — juuri se
   yhteys tekee kohdentamisesta osuvaa.

   MITÄ TÄMÄ EI OLE: tunnus ei ole johdettu mistään henkilötiedosta eikä
   siitä voi päätellä kuka olet. Se ei seuraa sinua muille sivustoille.
   Kuvattu tietosuojaselosteen kohdassa 7. */
function readVid(){
  try{
    let v = localStorage.getItem(VID_KEY);
    if(!v){
      v = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
      localStorage.setItem(VID_KEY, v);
    }
    return v;
  }catch(e){ return undefined; } /* privaattitila: mittaus jää pois, sivu toimii */
}

const FBC_KEY = 'tk_fbc';
const FBCLID_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FBCLID_RE = /^[A-Za-z0-9._-]{5,400}$/;

function readCookie(name){
  try{
    const m = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()\[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : undefined;
  }catch(_){ return undefined; }
}

function readFbc(){
  // Selaimen oma _fbc-eväste voittaa, jos Pixel joskus lisätään.
  const cookie = readCookie('_fbc');
  if(cookie) return cookie;
  try{
    const s = JSON.parse(localStorage.getItem(FBC_KEY) || 'null');
    if(!s || !s.v) return undefined;
    if(Date.now() - (s.t || 0) > FBCLID_MAX_AGE_MS) return undefined;
    return s.v;
  }catch(_){ return undefined; }
}

// _fbp syntyy vain jos Meta Pixel on käytössä; ilman sitä palautuu undefined.
const FBP_KEY = 'tk_fbp';

/* Selaintunniste Metan omassa muodossa: fb.1.<aikaleima>.<satunnaisluku>.

   MIKSI ITSE TEHTY: _fbp-evästeen asettaa normaalisti Metan Pixel, jota
   tällä sivustolla ei ole eikä oteta. Ilman sitä Metalle menee tapahtumia
   ilman selaintunnistetta, ja Meta huomauttaa nimenomaan tästä ("low
   coverage of fbp"). Tunniste on satunnaisluku eikä sisällä mitään
   henkilötietoa — sama periaate kuin _fbc:llä, joka rakennetaan tässä
   tiedostossa fbclidistä samalla tavalla.

   Oikea Pixel-eväste voittaa aina, jos Pixel joskus lisätään. */
function readFbp(){
  const evasteesta = readCookie('_fbp');
  if(evasteesta) return evasteesta;
  try{
    let v = localStorage.getItem(FBP_KEY);
    if(!v){
      v = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e10);
      localStorage.setItem(FBP_KEY, v);
    }
    return v;
  }catch(e){ return undefined; }
}

(function captureFbclid(){
  let v;
  try{ v = new URLSearchParams(location.search).get('fbclid'); }catch(_){ return; }
  if(!v || !FBCLID_RE.test(v)) return;
  if(readCookie('_fbc')) return;   // Pixelin oma _fbc voittaa, jos Pixel joskus lisätään
  // TUOREIN klikki voittaa: uusi fbclid ylikirjoittaa aiemman tallennetun,
  // jotta ansio menee viimeksi klikatulle mainokselle (last click) — ei
  // ensimmäiselle, joka jäisi roikkumaan ja vinouttaisi attribuution.
  const fbc = `fb.1.${Date.now()}.${v}`;
  try{ localStorage.setItem(FBC_KEY, JSON.stringify({ v: fbc, t: Date.now() })); }catch(_){}
})();

function readCampaign(){
  try{
    const s = JSON.parse(localStorage.getItem(CAMPAIGN_KEY) || 'null');
    if(!s || !CAMPAIGN_RE.test(s.v || '')) return undefined;
    if(Date.now() - (s.t || 0) > CAMPAIGN_MAX_AGE_MS) return undefined;
    return s.v;
  }catch(_){ return undefined; }
}

/* Mainostyökalujen kampanjanimissä on välilyöntejä, isoja kirjaimia ja
   putkimerkkejä ("Taloyhtiö | Uusimaa"). Ne eivät kelpaa sellaisenaan, mutta
   niiden hylkääminen hukkaisi juuri sen tiedon jota ollaan hakemassa —
   siivotaan siis muotoon jonka kanta hyväksyy. */
/* Meta koodaa {{campaign.name}}-makron arvon kertaalleen itse, ja osoiterivi
   koodaa sen toistamiseen. URLSearchParams purkaa vain yhden kerroksen, joten
   "Taloyhtiöt" saapuu tänne muodossa "Taloyhti%C3%B6t" ja siivous tekisi siitä
   "taloyhti-c3-b6t". Puretaan jäljelle jäänyt kerros ennen siivousta. */
function decodeCampaign(raw){
  let v = String(raw || '');
  for(let i=0; i<2 && /%[0-9a-fA-F]{2}/.test(v); i++){
    try{ const d = decodeURIComponent(v); if(d === v) break; v = d; }
    catch(_){ break; } /* vajaa %-jono: parempi siivota kuin hylätä koko nimi */
  }
  return v;
}

function normalizeCampaign(raw){
  const v = decodeCampaign(raw)
    .toLowerCase()
    /* Skandit ennen siivousta, muuten "kipukärki" -> "kipuk-rki" ja
       "Taloyhtiö (pää)" -> "taloyhti-p". Mainosten nimissä on ääkkösiä. */
    .replace(/[äàáâã]/g,'a').replace(/[öòóôõ]/g,'o').replace(/å/g,'a').replace(/ü/g,'u').replace(/[éèêë]/g,'e')
    .replace(/[^a-z0-9._-]+/g, '-')
    /* " - " tuottaa kolme viivaa: välilyönnit muuttuvat viivoiksi mutta itse
       viiva on sallittu merkki. Tiivistetään, muuten mainosnimet näyttävät
       raportissa muodossa "tk26---video-ikkunakoukku". */
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+/, '')
    .replace(/[-._]+$/, '')
    .slice(0, 60);
  return CAMPAIGN_RE.test(v) ? v : undefined;
}

/* Kampanja osoiterivistä. Palauttaa undefined jos mitään tunnistettavaa ei
   ole. Ei kosketa tallennustilaan — sen tekee captureCampaign. */
function campaignFromUrl(){
  let q;
  try{ q = new URLSearchParams(location.search); }catch(_){ return undefined; }
  /* utm_content ENNEN utm_campaignia: Meta täyttää sen mainoksen nimellä ja
     campaignin kampanjan nimellä. Kampanjoita on kaksi, mainoksia 13 — jos
     luetaan kampanja, raporttiin syntyy kaksi arvoa eikä näy mikä mainos toi
     kävijän. Juuri sitä varten url_tags alun perin lisättiin. */
  const named = q.get('src') || q.get('utm_content') || q.get('utm_campaign') || q.get('utm_source');
  if(named) return normalizeCampaign(named);
  /* Nimetöntä klikkiä ei jätetä tunnistamattomaksi: alusta tiedetään silti. */
  if(q.get('fbclid')) return 'meta-ads';
  if(q.get('gclid') || q.get('wbraid') || q.get('gbraid')) return 'google-ads';
  return undefined;
}

(function captureCampaign(){
  /* Arvo tulee osoiterivistä, jota kuka tahansa voi muokata. Kelpaamaton
     hylätään tässä, jottei sitä tarvitse siivota myöhemmin ketjussa. */
  const v = campaignFromUrl();
  if(!v) return;
  if(readCampaign()) return;
  try{ localStorage.setItem(CAMPAIGN_KEY, JSON.stringify({ v, t: Date.now() })); }catch(_){}
})();

const FAQ = [
  ['Paljonko tiivistys maksaa?','Pienin veloitus on 149 €, joka kattaa käynnin, matkat, kartoituksen ja lämpökamerakuvauksen. Sen jälkeen hinta muodostuu valitsemistasi kohteista kiinteillä hinnoilla. Ikkuna maksaa 95 € kappaleelta, ja hinta laskee määrän mukaan: 5–9 ikkunaa 85 €, 10–19 ikkunaa 75 € ja 20 ikkunasta ylöspäin 65 € kappaleelta. Ulko- ja parvekeovi on 99 €, terassin liuku- tai pariovi 149 €. Esimerkiksi yksi ikkuna on 149 € (minimiveloitus) ja kuusi ikkunaa 6 × 85 € = 510 €. Näet kokonaishinnan heti laskurista, ja kotitalousvähennys pienentää työn osuutta jopa 40 %.'],
  ['Miksi väliovi on halvempi kun tilaan samalla muutakin?','Suurin yksittäinen kustannus pienessä työssä on matka ja työpisteen pystytys. Kun asentaja on jo paikalla, seuraava kohde maksaa vähemmän: väli- tai huoneovi 89 € → 59 €, kun samaan käyntiin kuuluu vähintään yksi muu ovi tai ikkuna. Ulko- ja parvekeovi on 99 € aina, myös yksin tilattuna. Laskuri huomioi tämän automaattisesti.'],
  ['Mitä tiivisteiden vaihtoon sisältyy?','Vanhojen tiivisteiden poisto, pintojen puhdistus, uudet silikonitiivisteet sekä oven käynnin säätö niin, että ovi painuu tasaisesti tiivisteitä vasten. Ulko-oviin kuuluu myös kynnyskumi.'],
  ['Kannattaako vetävä ovi tiivistää vai vaihtaa?','Jos ovilehti ja karmi ovat suorassa ja ovi toimii, tiivisteiden uusiminen riittää lähes aina. Se maksaa murto-osan uuden oven hinnasta (2 200–4 900 €) ja poistaa vedon. Katsomme oven kunnon paikan päällä ja sanomme, jos tiivistys ei sinun kohdallasi riitä.'],
  ['Kuinka paljon säästän lämmityksessä?','Vetävä ovi tai ikkuna nostaa lämmityskulua tyypillisesti 10–15 %. Kun raot umpeutuvat, sama sisälämpötila vaatii vähemmän energiaa. Emme lupaa tiettyä säästöä etukäteen, koska lopputulos riippuu talosta, lämmitystavasta ja siitä kuinka moni kohta vuotaa. Kuvaamme kohteen lämpökameralla, jolloin näet mistä kohdista juuri sinun kodissasi vuotaa.'],
  ['Onko työllä takuu ja oletteko vakuutettuja?','Kyllä. Työllä ja asennetuilla materiaaleilla on kahden vuoden takuu, yrityksillä asennustyön takuu on vuosi. Meillä on toiminnan vastuuvakuutus, joka kattaa työn aikana kohteelle sattuvat vahingot. Jos veto ei loppunut, tulemme uudestaan veloituksetta.'],
  ['Millä alueella toimitte?','Koko Uudenmaan alueella — Helsinki, Espoo, Vantaa ja kehyskunnat. Kerro postinumerosi varauksen yhteydessä, niin vahvistamme, että palvelemme alueellasi.'],
  ['Miten ajanvaraus toimii?','Valitset laskurista ovet ja ikkunat, näet kiinteän hinnan ja siirryt varaamaan vapaan ajan kalenterista. Saat vahvistuksen sähköpostiin. Hinta on kiinteä jo ennen varausta — tarkistamme sen vielä paikan päällä ennen työn aloitusta.'],
  ['Miten kotitalousvähennys toimii?','Ovien ja ikkunoiden tiivistys on kotitaloustyötä. Saat meiltä laskun, jossa työn osuus on valmiiksi eritelty — ilmoitat sen OmaVerossa ja vähennät jopa 40 % työn osuudesta (enintään 2 250 € / henkilö vuonna 2026).']
];

/* ---------- laskuri ----------
   `state` pitää sekä kohdemäärät (tyypin id) että askeltimella valittavien
   lisätöiden määrät avaimella `extra_<id>` — computePricing lukee molemmat
   samasta oliosta. `extraState` on päälle/pois valittavien lisätöiden tila. */
const QTY_EXTRAS = EXTRAS.filter(e=>e.per==='kpl');
const state = {}; TYPES.forEach(t=>state[t.id]=0); QTY_EXTRAS.forEach(e=>state['extra_'+e.id]=0);
const extraState = {}; EXTRAS.forEach(e=>extraState[e.id]=false);

const totalItems = ()=>TYPES.reduce((s,t)=>s+(state[t.id]||0),0);

/* Kortissa näytettävä yksikköhinta lasketaan aina nykyisellä valinnalla,
   jotta ikkunoiden määräporras ja ovien saman käynnin hinta näkyvät heti.
   Kun kohdetta ei ole vielä valittu, hinta lasketaan ikään kuin yksi
   lisättäisiin — muuten kortti lupaisi kalliimman hinnan kuin klikkaus antaa. */
function unitInfo(t){
  const qty = state[t.id]||0, tot = totalItems();
  const eff = qty>0 ? tot : tot+1;
  const now = unitPriceFor(t, Math.max(qty,1), eff);
  const list = t.tiers ? tierPriceFor(1) : t.price;
  return {now, was: now<list ? list : null};
}

const typesEl = document.getElementById('calcTypes');
const extrasEl = document.getElementById('calcExtras');
if(typesEl && extrasEl){
  TYPES.forEach(t=>{
    const c = document.createElement('div');
    c.className='wtype'; c.dataset.id=t.id;
    c.innerHTML =
      `<div class="wtype-ic">${ico[t.id]}</div>
       <div class="wtype-top"><div class="wtype-name">${t.name}</div><div class="wtype-desc">${t.desc}${t.tiers?`<span class="wtype-tier">${TIER_HINT}</span><span class="wtype-next" data-next="${t.id}" hidden></span>`:''}</div><span class="wtype-price" data-p="${t.id}">${t.price} €/kpl</span></div>
       <div class="stepper"><div class="stepper-btns"><button class="stp minus" aria-label="Vähennä" data-a="-1" disabled>−</button><span class="qty" data-q="${t.id}">0</span><button class="stp plus" aria-label="Lisää" data-a="1">+</button></div></div>`;
    typesEl.appendChild(c);
  });
  EXTRAS.forEach(e=>{
    const unit = e.unit ? `/${e.unit}` : '';
    const pr = `+${e.price} €${unit}${e.note?` <span class="extra-note">${e.note}</span>`:''}`;
    if(e.per==='kpl'){
      /* Määrällinen lisätyö tarvitsee oman askeltimen, eikä nappia voi
         upottaa nappiin — siksi div eikä button. */
      const d = document.createElement('div');
      d.className='extra extra-q'; d.dataset.id=e.id;
      d.innerHTML = `<span class="extra-nm">${e.name}</span><span class="extra-pr">${pr}</span>`+
        `<span class="extra-stp"><button type="button" class="stp minus" aria-label="Vähennä ${e.name}" data-a="-1" disabled>−</button><span class="qty" data-q="extra_${e.id}">0</span><button type="button" class="stp plus" aria-label="Lisää ${e.name}" data-a="1">+</button></span>`;
      d.addEventListener('click',ev=>{
        const btn = ev.target.closest('.stp'); if(!btn) return;
        const k = 'extra_'+e.id;
        state[k] = Math.max(0, Math.min(99, state[k] + +btn.dataset.a));
        d.querySelector('.qty').textContent = state[k];
        d.querySelector('.minus').disabled = state[k]===0;
        d.classList.toggle('on', state[k]>0);
        render();
      });
      extrasEl.appendChild(d);
    } else {
      const b = document.createElement('button');
      b.type='button'; b.className='extra'; b.dataset.id=e.id;
      b.innerHTML = `<span class="extra-chk">✓</span><span class="extra-nm">${e.name}</span><span class="extra-pr">${pr}</span>`;
      b.addEventListener('click',()=>{ extraState[e.id]=!extraState[e.id]; b.classList.toggle('on',extraState[e.id]); render(); });
      extrasEl.appendChild(b);
    }
  });
  typesEl.addEventListener('click', e=>{
    const btn = e.target.closest('.stp'); if(!btn) return;
    const card = btn.closest('.wtype'); const id = card.dataset.id;
    state[id] = Math.max(0, Math.min(99, state[id]+ +btn.dataset.a));
    const q = card.querySelector('.qty'); q.textContent = state[id];
    q.classList.remove('pop'); void q.offsetWidth; q.classList.add('pop');
    card.querySelector('.minus').disabled = state[id]===0;
    card.classList.toggle('has', state[id]>0);
    render();
  });
}
let shownPrice = 0, rafId=null;
function tweenPrice(target){
  cancelAnimationFrame(rafId);
  const el = document.getElementById('cpPrice');
  const start = shownPrice, t0 = performance.now(), dur = 450;
  function frame(now){
    const p = Math.min(1,(now-t0)/dur), eased = 1-Math.pow(1-p,3);
    el.textContent = Math.round(start+(target-start)*eased).toLocaleString('fi-FI');
    if(p<1) rafId=requestAnimationFrame(frame); else shownPrice=target;
  }
  rafId=requestAnimationFrame(frame);
}
const booking = { total:0, count:0, lines:[], serviceLabel:'Valitse kohteet laskurista' };
function render(){
  const windows = state.ikkuna||0;
  /* Ikkunakohtainen lisätyö ei voi jäädä päälle ilman ikkunoita. */
  EXTRAS.forEach(e=>{ if(e.per==='ikkuna' && windows===0) extraState[e.id]=false; });

  /* Korttien yksikköhinnat elävät valinnan mukana: ikkunan määräporras ja
     ovien saman käynnin hinta näkyvät heti, ei vasta yhteenvedossa. */
  if(typesEl) TYPES.forEach(t=>{
    const el = typesEl.querySelector(`[data-p="${t.id}"]`); if(!el) return;
    const u = unitInfo(t);
    el.innerHTML = (u.was?`<s>${u.was} €</s> `:'')+`${u.now} €/kpl`;
    el.classList.toggle('disc', !!u.was);

    /* Seuraavan portaan vihje. Rajakustannus lasketaan oikeasta
       hinnoittelusta, ei käsin: 9. ikkunan jälkeen kymmenes laskee
       KOKONAISHINTAA, koska halvempi porras koskee kaikkia kappaleita.
       Sitä ei saa esittää arvaamalla. */
    const vihje = typesEl.querySelector(`[data-next="${t.id}"]`);
    if(vihje && t.tiers){
      const n = state[t.id]||0;
      const hinta = (k)=> k*tierPriceFor(k);
      let teksti = '';
      if(n>0){
        /* Ylimmän portaan upTo on Infinity, ei null — Number.isFinite
           on ainoa ehto joka rajaa sen pois luotettavasti. */
        const raja = WINDOW_TIERS.find(x=>Number.isFinite(x.upTo) && n<=x.upTo);
        const seuraava = raja ? raja.upTo+1 : null;
        if(seuraava && seuraava-n<=3){
          const ero = hinta(seuraava)-hinta(n);
          const puuttuu = seuraava-n;
          const kpl = puuttuu===1 ? '1 ikkuna' : `${puuttuu} ikkunaa`;
          teksti = ero<0
            ? `Vielä ${kpl} lisää → kokonaishinta laskee ${Math.abs(ero)} €`
            : `Vielä ${kpl} lisää → ${tierPriceFor(seuraava)} €/kpl kaikista (${ero} € lisää)`;
        }
      }
      vihje.textContent = teksti;
      vihje.hidden = !teksti;
    }
  });
  if(extrasEl) EXTRAS.forEach(e=>{
    const el = extrasEl.querySelector(`.extra[data-id="${e.id}"]`); if(!el) return;
    if(e.per==='ikkuna'){ el.disabled = windows===0; el.classList.toggle('off', windows===0); }
    el.classList.toggle('on', e.per==='kpl' ? (state['extra_'+e.id]||0)>0 : !!extraState[e.id]);
  });

  const q = computePricing(state, extraState);
  booking.total = q.total; booking.count = q.count;
  /* Yhteenvetoteksti listaa vain ovet ja ikkunat — lisätyöt vain lukumääränä,
     muuten teksti kasvaa varaussivulla ja kalenteritapahtuman otsikossa
     lukukelvottomaksi. Täysi erittely menee joka tapauksessa riveinä kantaan. */
  booking.lines = q.lines.filter(l=>l.kind==='type').map(l=>l.qty>1?`${l.qty}× ${l.name}`:l.name);
  const nExtra = q.lines.filter(l=>l.kind==='extra').length;
  booking.serviceLabel = q.count>0
    ? `Tiivistys: ${booking.lines.join(', ')}`+(nExtra?` + ${nExtra} lisätyö${nExtra>1?'tä':''}`:'')
    : 'Valitse kohteet laskurista';

  /* Säilytä laskurin valinta varaus-sivulle.
     KRIITTINEN: mukana on oltava kohdekohtainen erittely, ei vain summa.
     Varaussivulla ei ole laskurin DOMia, joten `state` on siellä nollilla —
     ilman tätä lomake lähettäisi tyhjän valinnan ja jokainen varaus
     tallentuisi 0 €:na (näin kävi kertaalleen oikeasti). */
  /* Vain LASKURISIVU kirjoittaa valinnan talteen. Muilla sivuilla `state` on
     parhaimmillaan sama kuin tallennettu ja pahimmillaan tyhjä — ja tyhjän
     kirjoittaminen pyyhki asiakkaan valinnan. Tämä havaittiin kun varaus
     jaettiin kahdelle sivulle: aloituskortti tallensi nollat päälle ja hinta
     katosi. Yksi kirjoittaja, monta lukijaa. */
  if(typesEl){
    try{ sessionStorage.setItem('tk_booking', JSON.stringify({
      total: booking.total, count: booking.count, serviceLabel: booking.serviceLabel,
      counts: {...state}, extras: {...extraState},
    })); }catch(_){}
  }
  syncBookingSummary();

  if(!document.getElementById('cpLines')) return;
  const linesEl=document.getElementById('cpLines');
  linesEl.innerHTML = q.total===0 ? '<div class="rc-empty">Lisää ovia tai ikkunoita nähdäksesi hinnan.</div>'
    : q.lines.map(l=>{
        const cnt = l.qty>1 ? `<span class="cnt">${l.qty}×</span> ` : '';
        const unit = l.qty>1 ? ` <span class="cp-unit">${l.unit} €/${l.unitName}</span>` : '';
        const note = l.note ? ` <span class="cp-unit">${l.note}</span>` : '';
        return `<div class="cp-line"><span>${cnt}${l.name}${unit}${note}</span><b>${l.sum.toLocaleString('fi-FI')} €</b></div>`;
      }).join('');
  /* Alennuskoodi näkyy jo laskurissa, ei vasta varauksen viimeisellä
     ruudulla. Kumppanisivuilta (esim. /paivakumpu) tullaan koodi valmiina,
     ja jäsenetu on koko käynnin syy — jos laskuri näyttäisi täyden hinnan,
     se kertoisi väärän luvun juuri sille kävijälle jolle etu luvattiin.

     Summa haetaan palvelimelta, koska alennuksen laskenta (prosentti vai
     euro, minimisumma, käyttökerrat) on siellä. Uusi tarkistus ajetaan vain
     kun välisumma on oikeasti muuttunut — muuten jokainen +-painallus
     lähettäisi oman kutsunsa. */
  /* Kentän arvo, ei `discount.code`: ensimmäinen tarkistus sivun latauksessa
     ohitetaan kun välisumma on 0 ("valitse ensin kohteet"), jolloin
     `discount.code` jää tyhjäksi eikä tarkistus koskaan käynnistyisi
     uudelleen. Kentässä koodi kuitenkin on. */
  const koodiKentassa = (document.getElementById('fCode')?.value || '').trim();
  if (koodiKentassa && q.total > 0) {
    const nyt = subtotalCents();
    if (nyt !== lastDiscountSubtotal) {
      lastDiscountSubtotal = nyt;
      clearTimeout(discountTimer);
      discountTimer = setTimeout(checkDiscount, 250);
    }
  }
  const ale = discount.state === 'ok' ? discount.cents / 100 : 0;
  if (ale > 0) {
    linesEl.insertAdjacentHTML('beforeend',
      `<div class="cp-line" style="color:var(--green)"><span>Alennuskoodi ${discount.code}</span><b>−${ale.toLocaleString('fi-FI')} €</b></div>`);
  }
  const naytettava = Math.max(0, q.total - ale);
  tweenPrice(naytettava);
  document.getElementById('cpNet').textContent = (naytettava>0?Math.round(naytettava*NET_FACTOR).toLocaleString('fi-FI'):'0')+' €';
  document.getElementById('cpCount').textContent = q.count;
  const hrs = q.minutes/60;
  document.getElementById('cpTime').textContent = q.total===0?'0 h':(hrs<1?Math.round(q.minutes)+' min':(Math.round(hrs*2)/2).toLocaleString('fi-FI')+' h');
  const btn=document.getElementById('cpBtn'), active = q.total>0;
  btn.style.pointerEvents=active?'auto':'none'; btn.style.opacity=active?'1':'.5';
  if('disabled' in btn) btn.disabled=!active;
}

/* ---------- FAQ ----------
   index.html sisältää kysymykset valmiiksi (ks. _gen-faq.mjs), jotta ne
   näkyvät myös crawlereille jotka eivät aja JavaScriptiä. Siellä tästä
   jää jäljelle vain avaus/sulkeutuminen. Rakentaminen on tallella niitä
   sivuja varten joilla on #faq mutta ei valmista markupia — ja jotta
   FAQ-taulukon muokkaus näkyy heti, vaikka generaattori olisi ajamatta. */
const faqEl=document.getElementById('faq');
if(faqEl){
  if(!faqEl.querySelector('.q')){
    FAQ.forEach(([q,a])=>{
      const d=document.createElement('div'); d.className='q';
      d.innerHTML=`<button type="button">${q}<svg class="cv" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button><div class="a"><p>${a}</p></div>`;
      faqEl.appendChild(d);
    });
  }
  faqEl.addEventListener('click',e=>{
    const btn=e.target.closest('button'); if(!btn) return;
    const q=btn.parentElement, a=q.querySelector('.a'), open=q.classList.contains('op');
    faqEl.querySelectorAll('.q').forEach(x=>{x.classList.remove('op'); x.querySelector('.a').style.maxHeight='';});
    if(!open){ q.classList.add('op'); a.style.maxHeight=a.scrollHeight+'px'; }
  });
}

/* ---------- kalenterivaraus ----------

   Vapaat ajat tulevat CRM:n rajapinnasta, joka laskee ne asentajien
   työajoista, poikkeuspäivistä ja jo varatuista töistä.

   Aiemmin tämä arpoi "varatut" ajat päivämäärän hajautusarvosta, eli sivu
   näytti asiakkaalle saatavuutta jolla ei ollut mitään tekemistä sen
   kanssa oliko kalenterissa tilaa. Älä palauta arvontaa: jos rajapinta ei
   vastaa, näytetään puhelinnumero eikä keksittyjä aikoja. */
import { mountKartoitus } from './_kartoitus.js';
let kartoitusApi = null;

const CRM_BASE = 'https://tiiviskoti-crm.vercel.app';
const MONTHS = ['tammikuu','helmikuu','maaliskuu','huhtikuu','toukokuu','kesäkuu','heinäkuu','elokuu','syyskuu','lokakuu','marraskuu','joulukuu'];
function pad(n){return String(n).padStart(2,'0');}
function keyOf(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
const today = new Date(); today.setHours(0,0,0,0);
const maxBook = new Date(today); maxBook.setDate(maxBook.getDate()+70);
let viewY = today.getFullYear(), viewM = today.getMonth(), selDay = null, selSlot = null;

/* slotsByDay: 'YYYY-MM-DD' → [{time:'08:00', startsAt:ISO, calendarId}]

   avail.state:
     'postal'   = postinumeroa ei ole vielä annettu (aloitustila)
     'loading'  = haetaan
     'ready'    = aikoja on
     'none'     = alue palvellaan mutta kalenteri on täynnä
     'unserved' = postinumero ei kuulu mihinkään palvelualueeseen
     'error'    = rajapinta ei vastannut

   Postinumero on pakko tietää ENNEN aikoja: vapaat ajat riippuvat siitä
   kenen alueella kohde on. Ilman sitä näytettäisiin aikoja asentajilta jotka
   eivät tule paikalle — sama valheellinen kalenteri eri muodossa. */
const avail = { state:'postal', slotsByDay:new Map(), minutes:0, postal:'', area:null, travelFeeCents:0 };

/* Ajat näytetään AINA Suomen aikaa, ei selaimen aikavyöhykkeellä. Rajapinta
   palauttaa UTC:tä, ja `new Date(iso).getHours()` antaisi ulkomailla olevalle
   asiakkaalle väärän kellonajan — klo 8 työ näkyisi Espanjassa klo 7. */
const FI_TIME = new Intl.DateTimeFormat('fi-FI', {
  timeZone:'Europe/Helsinki', hour:'2-digit', minute:'2-digit', hour12:false,
});
const FI_DATE = new Intl.DateTimeFormat('sv-SE', {   // sv-SE antaa 'YYYY-MM-DD'
  timeZone:'Europe/Helsinki', year:'numeric', month:'2-digit', day:'2-digit',
});
const fiTime = (d)=>FI_TIME.format(d).replace('.',':');
const fiDateKey = (d)=>FI_DATE.format(d);

/** Kalenterivarauksen kesto: sama arvio kuin laskurin "arvioitu kesto".
 *  Vähintään 30 min, ettei rajapinnalta pyydetä nollan mittaista aikaa. */
function bookingMinutes(){
  try{ const m = computePricing(state, extraState).minutes; if(m>0) return Math.max(30, m); }catch(_){}
  return 120;
}

/* Postinumeron kohtalo mittaukseen.

   MIKSI: suppilossa oli aukko, jota ei voinut päätellä mistään. Kävijä joka
   ei koskaan syöttänyt postinumeroa ja kävijä jolle vastattiin "emme palvele"
   näyttivät raportissa täsmälleen samalta — kummaltakin puuttui seuraava
   vaihe. Siksi ei tiedetty kumpaa korjata: houkuttelevuutta vai aluetta.

   Sama postinumero ja sama lopputulos kirjataan vain kerran sivulatausta
   kohti, koska tämä ajetaan joka kerta kun kentässä on viisi numeroa —
   muuten yksi epäröivä näppäily tuottaisi kymmenen tapahtumaa. */
let _trackedArea = '';
function trackArea(tulos){
  if(!window.tkTrack) return;
  const avain = avail.postal + ':' + tulos;
  if(_trackedArea === avain) return;
  _trackedArea = avain;
  window.tkTrack({ type:'cta', cta:tulos });
}

async function loadAvailability(){
  /* Ehtona on aluehuomio TAI kalenteri — ei pelkkä kalenteri. Aloituskortin
     sivulla (varaa.html) ei ole kalenteria mutta alue on silti tarkistettava,
     jotta asiakas näkee palvellaanko häntä ennen kuin hän siirtyy eteenpäin.
     Aiemmin tämä poistui heti eikä aluetarkistus ajanut lainkaan. */
  if(!document.getElementById('areaNote') && !document.getElementById('gridDays')) return;

  /* Ilman kelvollista postinumeroa ei haeta mitään eikä näytetä aikoja. */
  if(!/^\d{5}$/.test(avail.postal)){
    avail.state='postal'; avail.slotsByDay=new Map(); avail.area=null; avail.travelFeeCents=0;
    selDay=null; selSlot=null; renderCal(); renderSlots(); renderAreaNote(); syncBookingSummary();
    return;
  }

  avail.state='loading'; renderCal(); renderSlots(); renderAreaNote();
  const minutes = bookingMinutes();
  avail.minutes = minutes;
  try{
    const r = await fetch(`${CRM_BASE}/api/public/availability?postal=${avail.postal}&days=70&minutes=${minutes}`);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();

    if(data.served === false){
      trackArea('Postinumero: ei palvella');
      avail.state='unserved'; avail.slotsByDay=new Map(); avail.area=null; avail.travelFeeCents=0;
      selDay=null; selSlot=null; renderCal(); renderSlots(); renderAreaNote(); syncBookingSummary();
      return;
    }

    avail.area = data.area ? data.area.name : null;
    avail.travelFeeCents = data.area ? (data.area.travelFeeCents||0) : 0;
    const map = new Map();
    (data.slots||[]).forEach(s=>{
      const d = new Date(s.startsAt);
      const key = fiDateKey(d);
      if(!map.has(key)) map.set(key, []);
      map.get(key).push({ time:fiTime(d), startsAt:s.startsAt, calendarId:s.calendarId });
    });
    avail.slotsByDay = map;
    avail.state = map.size ? 'ready' : 'none';
    /* Erotellaan "alue kelpaa mutta kalenteri on tyhjä" siitä että aikoja on:
       edellinen on menetetty varaus jota ei näy mistään muualta. */
    trackArea(map.size ? 'Postinumero: palvellaan' : 'Postinumero: ei vapaita aikoja');

    /* Hyppy ensimmäiseen vapaaseen päivään.

       MIKSI: kalenteri avautuu kuluvaan kuukauteen, ja päivät ilman aikoja
       ovat harmaita ja disabled. Kun seuraava vapaa aika on kahden viikon
       päässä, kävijä näki kokonaisen kuukauden klikkaamattomia päiviä ja
       kehotuksen "Valitse päivä" jota hän ei voinut noudattaa — ainoa tie
       eteenpäin oli huomata kuukausinuoli. Mainosliikenteessä se on se
       kohta josta poistutaan.

       Siirto tehdään vain jos asiakas ei ole itse valinnut päivää, TAI jos
       hänen valintansa jäi ilman aikoja (kesto kasvoi tai joku ehti varata).
       Muuten näkymä hyppäisi hänen altaan kesken selaamisen. */
    const jumpNeeded = !selDay || !(map.get(keyOf(selDay)) || []).length;
    if (map.size && jumpNeeded) {
      const [y, m, dd] = [...map.keys()].sort()[0].split('-').map(Number);
      const firstFree = new Date(y, m - 1, dd); firstFree.setHours(0, 0, 0, 0);
      viewY = firstFree.getFullYear(); viewM = firstFree.getMonth();
      selDay = firstFree; selSlot = null;
    }
  }catch(_){
    trackArea('Postinumero: tarkistus epäonnistui');
    avail.state = 'error';
  }
  renderAreaNote();
  /* Valittu aika voi kadota päivityksessä (kesto muuttui tai joku ehti
     varata sen), joten valinta nollataan jos se ei enää ole tarjolla. */
  if(selDay && selSlot && !freeSlots(selDay).some(s=>s.time===selSlot)){ selSlot=null; }
  renderCal(); renderSlots(); syncBookingSummary();
  /* Alue voi tuoda matkalisän, joka muuttaa kortissa näkyvää summaa. */
  if(window.__renderGatePrice) window.__renderGatePrice();
  /* Matkalisä muuttaa summaa, ja koodilla voi olla alaraja — sama koodi voi
     siis kelvata tai olla kelpaamatta alueen vaihtuessa. Tarkistetaan
     uudelleen, jottei näytetty alennus jää vanhan summan mukaiseksi. */
  if(discount.state==='ok' || discount.state==='bad') checkDiscount();
}

function freeSlots(d){
  if(d<today || d>maxBook) return [];
  return avail.slotsByDay.get(keyOf(d)) || [];
}
function renderCal(){
  const grid = document.getElementById('gridDays'); if(!grid) return;
  document.getElementById('mName').textContent = `${MONTHS[viewM]} ${viewY}`;
  const first = new Date(viewY, viewM, 1); let startDow = first.getDay(); startDow = startDow===0?6:startDow-1;
  const daysInMonth = new Date(viewY, viewM+1, 0).getDate();
  grid.innerHTML='';
  for(let i=0;i<startDow;i++){ const e=document.createElement('div'); e.className='day empty'; grid.appendChild(e); }
  for(let dn=1; dn<=daysInMonth; dn++){
    const d = new Date(viewY, viewM, dn); d.setHours(0,0,0,0);
    const el = document.createElement('button'); el.type='button'; el.textContent = dn;
    const isToday = d.getTime()===today.getTime(); if(isToday) el.classList.add('today');
    /* Viikonpäiviä ei enää suodateta täällä: työajat tulevat asentajien
       kalentereista, joten lauantai voi olla auki ja tiistai kiinni. */
    if(d<today||d>maxBook){ el.className='day off'+(isToday?' today':''); el.disabled=true; grid.appendChild(el); continue; }
    const free = freeSlots(d);
    if(free.length===0){ el.className='day full'+(isToday?' today':''); el.disabled=true; }
    else { el.className='day free'+(isToday?' today':''); const dot=document.createElement('span'); dot.className='dot'; el.appendChild(dot);
      if(selDay && keyOf(selDay)===keyOf(d)) el.classList.add('sel');
      el.addEventListener('click',()=>{ selDay=d; selSlot=null; renderCal(); renderSlots(); syncBookingSummary(); }); }
    grid.appendChild(el);
  }
  document.getElementById('mPrev').disabled = (viewY===today.getFullYear() && viewM===today.getMonth());
}
/* Palvelualueen tila kalenterin yläpuolella: kerrotaan palvellaanko
   postinumerossa, ja jos ei, tarjotaan yhteydenottolomake. */
function renderAreaNote(){
  const box = document.getElementById('areaNote'); if(!box) return;
  const s = avail.state;

  if(s==='postal'){
    box.className='area-note';
    box.innerHTML='<b>Syötä postinumero</b><span>Näytämme vapaat ajat sen asentajan kalenterista, joka palvelee aluettasi.</span>';
    return;
  }
  if(s==='loading'){
    box.className='area-note';
    box.innerHTML='<b>Tarkistetaan aluetta…</b>';
    return;
  }
  if(s==='unserved'){
    box.className='area-note bad';
    box.innerHTML=
      `<b>Emme vielä palvele postinumerossa ${avail.postal}</b>`+
      '<span>Jätä yhteystietosi, niin otamme yhteyttä kun laajennumme alueellesi — tai soita '+
      '<a href="tel:+358458755996">045 875 5996</a>.</span>'+
      '<div id="leadWrap" style="margin-top:12px"></div>';
    renderLeadForm();
    return;
  }
  if(s==='error'){
    box.className='area-note bad';
    box.innerHTML='<b>Alueen tarkistus ei onnistunut</b><span>Soita <a href="tel:+358458755996">045 875 5996</a>, niin sovitaan aika puhelimessa.</span>';
    return;
  }

  const fee = avail.travelFeeCents;
  box.className='area-note ok';
  box.innerHTML =
    `<b>Palvelemme postinumerossa ${avail.postal}${avail.area?` · ${avail.area}`:''}</b>`+
    (fee>0
      ? `<span>Alueelle lisätään matkalisä <b>${(fee/100).toLocaleString('fi-FI')} €</b>, joka näkyy hinnassa alla.</span>`
      : '<span>Ei matkalisää tälle alueelle.</span>');
}

/* Yhteydenottolomake palvelualueen ulkopuolelta. Rakennetaan JS:llä, koska
   se näkyy vain harvoin — turha viedä tilaa HTML:stä joka latauksella. */
function renderLeadForm(){
  const wrap = document.getElementById('leadWrap'); if(!wrap) return;
  wrap.innerHTML =
    '<div class="lead-f">'+
    '<input id="ldName" type="text" placeholder="Nimi" autocomplete="name">'+
    '<input id="ldPhone" type="tel" placeholder="Puhelin" autocomplete="tel">'+
    '<input id="ldEmail" type="email" placeholder="Sähköposti (vapaaehtoinen)" autocomplete="email">'+
    '<button type="button" id="ldSend" class="btn btn-p">Ota yhteyttä minuun</button>'+
    '<div id="ldMsg" class="lead-msg"></div>'+
    '</div>';
  const btn = document.getElementById('ldSend');
  btn.addEventListener('click', async ()=>{
    const msg = document.getElementById('ldMsg');
    const name = document.getElementById('ldName').value.trim();
    const phone = document.getElementById('ldPhone').value.trim();
    const email = document.getElementById('ldEmail').value.trim();
    if(!name || !phone){ msg.textContent='Anna vähintään nimi ja puhelinnumero.'; msg.className='lead-msg bad'; return; }
    btn.disabled=true; msg.textContent='Lähetetään…'; msg.className='lead-msg';
    try{
      const r = await fetch(`${CRM_BASE}/api/public/lead`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ name, phone, email, postal:avail.postal,
          /* Laajentumisalueen liidi on mainoksen tulos siinä missä varauskin —
             ja juuri se kertoo mihin kaupunkiin kannattaa laajentua. */
          campaign: readCampaign(), gclid: readGclid() }),
      });
      if(!r.ok) throw new Error('HTTP '+r.status);
      msg.textContent='Kiitos! Otamme yhteyttä kun palvelemme alueellasi.';
      msg.className='lead-msg ok';
      document.querySelector('.lead-f').querySelectorAll('input,button').forEach(el=>el.disabled=true);
    }catch(_){
      msg.textContent='Lähetys ei onnistunut. Soita 045 875 5996.';
      msg.className='lead-msg bad';
      btn.disabled=false;
    }
  });
}

function renderSlots(){
  const wrap=document.getElementById('slots'); if(!wrap) return;
  const title=document.getElementById('slotsTitle'); wrap.innerHTML='';

  /* Saatavuuden tila kerrotaan suoraan. Erityisesti virhetilanteessa EI
     näytetä aikoja, koska väärä lupaus on pahempi kuin puuttuva kalenteri. */
  if(avail.state==='postal'){ title.textContent='Syötä ensin postinumero'; return; }
  if(avail.state==='unserved'){ title.textContent='Alue ei ole palvelualueellamme'; return; }
  if(avail.state==='loading'){ title.textContent='Haetaan vapaita aikoja…'; return; }
  if(avail.state==='error'){
    title.textContent='Vapaita aikoja ei juuri nyt saada haettua';
    wrap.innerHTML='<div class="slots-empty">Soita <a href="tel:+358458755996" style="font-weight:700;text-decoration:underline">045 875 5996</a>, niin sovitaan aika puhelimessa.</div>';
    return;
  }
  if(avail.state==='none'){
    title.textContent='Ei vapaita aikoja';
    wrap.innerHTML='<div class="slots-empty">Kalenteri on täynnä. Soita <a href="tel:+358458755996" style="font-weight:700;text-decoration:underline">045 875 5996</a>, niin etsitään aika.</div>';
    return;
  }

  if(!selDay){ title.textContent='Valitse päivä nähdäksesi vapaat ajat'; return; }
  const free=freeSlots(selDay);
  const wd=['sunnuntai','maanantai','tiistai','keskiviikko','torstai','perjantai','lauantai'][selDay.getDay()];
  title.textContent = `Vapaat ajat — ${wd} ${selDay.getDate()}.${selDay.getMonth()+1}.`;
  if(free.length===0){ wrap.innerHTML='<div class="slots-empty">Ei vapaita aikoja tänä päivänä. Valitse toinen päivä.</div>'; return; }
  free.forEach(s=>{ const b=document.createElement('button'); b.type='button'; b.className='slot'+(selSlot===s.time?' sel':''); b.textContent=s.time;
    b.addEventListener('click',()=>{ selSlot=s.time; renderSlots(); syncBookingSummary(); }); wrap.appendChild(b); });
}

/** Valittuna oleva aika täysine tietoineen (ISO-alku ja kalenteri), jotta
 *  varaus osuu täsmälleen siihen slottiin jonka asiakas näki. */
function selectedSlot(){
  if(!selDay || !selSlot) return null;
  return freeSlots(selDay).find(s=>s.time===selSlot) || null;
}
const mPrevBtn=document.getElementById('mPrev'), mNextBtn=document.getElementById('mNext');
if(mPrevBtn) mPrevBtn.addEventListener('click',()=>{ if(viewM===0){viewM=11;viewY--;}else viewM--; renderCal(); });
if(mNextBtn) mNextBtn.addEventListener('click',()=>{ if(viewM===11){viewM=0;viewY++;}else viewM++; renderCal(); });
/* ---------- VAIHENÄKYMÄ ----------
   Kalenteri, yhteystiedot ja kuittaus ovat saman kortin vaiheita. Sivu ei
   vaihdu missään kohtaa: vain kortin sisältö ristihäivytetään paikallaan ja
   kortin korkeus animoidaan uuteen mittaan, jottei alla oleva sisältö nytkähdä.
   Näkymän vaihtaminen ei nollaa mitään tilaa — takaisin pääsee aina. */
const stepCard = document.getElementById('stepCard');
/* Etusivun polku halutaan järjestyksessä postinumero → laskuri → kalenteri:
   asiakas näkee palvelemmeko alueella ENNEN palveluvalintaa. HTML:ssä laskuri on
   ensin (se on myös #laskuri-ankkuri ja "Laske hinta" -osio), joten siirretään
   postinumerovaihe sen eteen ennen kuin vaiheet luetaan DOM:ista. Sivuilla joilla
   ei ole molempia (ajanvaraus.html) tämä ei tee mitään. */
if(stepCard){
  const _calc=stepCard.querySelector('[data-step="calc"]');
  const _postal=stepCard.querySelector('[data-step="postal"]');
  if(_calc && _postal) stepCard.insertBefore(_postal, _calc);
}
/* Vaiheet luetaan DOM:ista, jolloin sama moottori ajaa etusivun täyden polun
   (laskuri → postinumero → aika → tiedot → valmis) ja ajanvaraus.html:n
   lyhyemmän polun ilman erillistä koodia. Kukin vaihe kertoo itse otsikkonsa,
   paluulinkkinsä ja tarvitseeko se leveän kortin. */
const stepNodes = stepCard ? [...stepCard.children].filter(n=>n.hasAttribute('data-step')) : [];

/* KAKSI POLKUA SAMASSA KORTISSA.

   Kuluttaja: postinumero → laskuri → aika → tiedot → valmis.
   Taloyhtiö: postinumero → aika → tiedot → valmis (veloitukseton kartoitus).

   Postinumerovaihe on jaettu — välilehdet ovat siinä. Muut vaiheet kertovat
   `data-path`-attribuutilla kummalle polulle ne kuuluvat, ja `seq()` palauttaa
   vain aktiivisen polun vaiheet. Näin kortissa on aina yksi vaihelaskuri
   kerrallaan eikä kuluttajan "1/4" näy taloyhtiön polulla. */
let stepPath = 'koti';
const seq = () => stepNodes.filter(n => !n.dataset.path || n.dataset.path === stepPath);
const stepIdx = name => seq().findIndex(n=>n.dataset.step===name);
let curIdx = 0;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Pisteet vastaavat aktiivista polkua, joten ne rakennetaan uudelleen kun
   polku vaihtuu. Valmis-vaihe ei ole oma askeleensa: se on lopputulos. */
function buildDots(){
  const dots=document.getElementById('stepDots');
  if(!dots) return;
  dots.innerHTML='';
  seq().filter(n=>!/done$/.test(n.dataset.step)).forEach(()=>dots.appendChild(document.createElement('i')));
}
if(stepCard) buildDots();

/* Polun vaihto: piilotetaan nykyinen vaihe, vaihdetaan polku ja palataan
   jaettuun postinumerovaiheeseen. Kutsutaan välilehtiä painettaessa. */
function setStepPath(path){
  if(path===stepPath) return;
  const cur=seq()[curIdx];
  if(cur) cur.hidden=true;
  stepPath=path;
  curIdx=0;
  const first=seq()[0];
  if(first) first.hidden=false;
  buildDots();
  paintStepChrome();
}

function paintStepChrome(){
  if(!stepNodes.length) return;
  const cur=seq()[curIdx];
  if(!cur) return;
  const back=document.getElementById('stepBack'), tag=document.getElementById('stepTag');
  const dots=document.getElementById('stepDots');
  const head=stepCard.closest('section');
  /* h1 sallitaan h2:n rinnalla: varaa.html ja ajanvaraus.html ovat omia
     sivujaan, joissa tämä on sivun ainoa otsikko — h2 ilman h1:tä on sekä
     hakukoneelle että ruudunlukijalle rikkinäinen rakenne. Etusivulla ja
     aluesivuilla laskuri on osio muun sisällön joukossa, joten siellä se on
     yhä h2. */
  const title=head && head.querySelector('h1.title, h2.title');
  const sub=head && head.querySelector('.step-sub');
  const kicker=head && head.querySelector('.kicker');

  if(back){
    const label=cur.dataset.back;
    back.hidden=!label;
    const span=back.querySelector('span'); if(span && label) span.textContent=label;
  }
  /* Jaettu postinumerovaihe kuuluu molempiin polkuihin, mutta vaiheiden
     kokonaismäärä eroaa (4 vs 3). Polkukohtainen tagi voittaa. */
  if(tag) tag.textContent = cur.dataset['tag'+stepPath.charAt(0).toUpperCase()+stepPath.slice(1)] || cur.dataset.tag || '';
  if(dots) [...dots.children].forEach((d,i)=>{
    d.className = i===curIdx ? 'on' : (i<curIdx ? 'done' : '');
  });
  /* Polkukohtainen otsikko voittaa, kuten tagissakin: kuluttajalle
     luvataan hinta, taloyhtiölle veloitukseton kartoitus. Sama vaihe,
     eri lupaus — ilman tätä toinen polku lupaisi väärää asiaa. */
  const polkuAvain = (nimi) => nimi + stepPath.charAt(0).toUpperCase() + stepPath.slice(1);
  const otsikko = cur.dataset[polkuAvain('title')] || cur.dataset.title;
  if(title && otsikko) title.textContent = otsikko;
  if(kicker && cur.dataset.kicker) kicker.textContent = cur.dataset.kicker;
  if(sub){
    const alaotsikko = cur.dataset[polkuAvain('sub')] || cur.dataset.sub;
    if(alaotsikko){ sub.textContent=alaotsikko; sub.style.display=''; }
    else sub.style.display='none';
  }
  /* Osion oma paluulinkki (ajanvaraus.html: "muuta postinumeroa") kuuluu vain
     ensimmäiseen vaiheeseen — myöhemmin kortin oma Takaisin hoitaa paluun. */
  const bl=head && head.querySelector('.backlink');
  if(bl) bl.style.display = curIdx===0 ? '' : 'none';
  stepCard.classList.toggle('wide', cur.dataset.wide==='1');
}

/* Vaihto: vanha näkymä häivytetään nopeasti pois, uusi tilalle, ja kortin
   mitat animoidaan uusiin. Leveys animoidaan koska laskuri tarvitsee kaksi
   saraketta ja loput vaiheet ovat kapeita — ilman sitä kortti hyppäisi. */
function goStepIdx(next, opts){
  const nodes=seq();
  if(!nodes.length || next<0 || next>=nodes.length || next===curIdx) return;
  const from=nodes[curIdx], to=nodes[next];
  const swap=()=>{
    from.hidden=true; to.hidden=false; curIdx=next; paintStepChrome();
    if(window.tkTrack) window.tkTrack({type:'funnel', step:to.dataset.step});
    /* Kortin yläreuna samaan kohtaan kuin mistä lähdettiin, jotta näkymä
       todella vaihtuu "samassa paikassa" eikä hyppää sivun toiseen kohtaan. */
    if(!(opts&&opts.noScroll)){
      const y=stepCard.getBoundingClientRect().top+window.scrollY-96;
      window.scrollTo({top:Math.max(0,y), behavior: reduceMotion ? 'auto' : 'smooth'});
    }
    /* Kohdistus vain isolla ruudulla: puhelimessa se avaisi näppäimistön heti
       ja peittäisi juuri vaihtuneen näkymän. */
    const focusId=to.dataset.focus;
    if(focusId && innerWidth>620){
      const f=document.getElementById(focusId);
      if(f) setTimeout(()=>f.focus({preventScroll:true}),240);
    }
  };
  if(reduceMotion || !stepCard.animate){ swap(); return; }
  const r0=stepCard.getBoundingClientRect();
  stepCard.classList.add('leaving');
  setTimeout(()=>{
    stepCard.classList.remove('leaving');
    swap();
    const r1=stepCard.getBoundingClientRect();
    const frames=[{},{}];
    if(Math.abs(r1.height-r0.height)>2){ frames[0].height=r0.height+'px'; frames[1].height=r1.height+'px'; }
    if(Math.abs(r1.width-r0.width)>2){ frames[0].maxWidth=r0.width+'px'; frames[1].maxWidth=r1.width+'px'; }
    if(Object.keys(frames[0]).length){
      stepCard.animate(frames,{duration:300, easing:'cubic-bezier(.2,.6,.3,1)'});
    }
  },130);
}
/* Nimellä siirtyminen — kutsupaikat lukevat paremmin kuin indeksit. */
function goStep(name, opts){ goStepIdx(stepIdx(name), opts); }

function syncRecap(){
  const w=document.getElementById('bRecapWhen'); if(!w) return;
  const s=document.getElementById('bRecapSvc');
  if(selDay && selSlot){
    const wd=['sunnuntai','maanantai','tiistai','keskiviikko','torstai','perjantai','lauantai'][selDay.getDay()];
    w.textContent = `${wd} ${selDay.getDate()}.${selDay.getMonth()+1}. klo ${selSlot}`;
  } else { w.textContent='Aikaa ei valittu'; }
  if(s) s.textContent = booking.serviceLabel || '';
}

/* Jatka-nappi aukeaa vasta kun aika on valittu — muuten lomakkeelle pääsisi
   ilman ajankohtaa ja vahvistus kaatuisi vasta lähetyksessä. */
function syncToDetails(){
  const b=document.getElementById('toDetails'); if(!b) return;
  const ok = !!(selDay && selSlot);
  b.disabled=!ok;
  b.style.opacity = ok ? '' : '.5';
  b.style.cursor = ok ? '' : 'not-allowed';
  b.textContent = ok ? 'Jatka yhteystietoihin' : 'Valitse ensin aika';
}

/* Laskurin CTA vie kalenterivaiheeseen samalla kortilla; postinumero on jo
   kysytty ensimmäisessä vaiheessa. Vanhoilla sivuilla cpBtn on linkki
   varaa.html:ään, jolloin tätä ei ole. */
const cpBtnEl=document.getElementById('cpBtn');
if(cpBtnEl && cpBtnEl.tagName==='BUTTON'){
  cpBtnEl.addEventListener('click',()=>{
    if(!(booking.count>0 && booking.total>0)) return;
    trackIntent();
    goStep('cal');
  });
}

/* Ostoaie Metalle: kävijä on valinnut kohteet ja nähnyt hinnan, ja siirtyy
   valitsemaan aikaa. Tätä tapahtuu moninkertaisesti varauksiin nähden, ja
   juuri sitä Metan optimointi tarvitsee oppiakseen ketkä ovat ostajia.
   Lähetys menee palvelimen kautta (api/track-intent), joten mainosten
   estäjät tai iOS eivät voi kadottaa sitä.

   TUNNISTE PYSYY SAMANA saman hinta-arvion ajan: ilman sitä edestakaisin
   liikkuva kävijä näyttäisi Metalle kymmeneltä eri ostoaikeelta ja
   optimointi oppisi väärin. Muutos hinnassa tai määrässä on aito uusi aie. */
let lastIntentKey = null;
function trackIntent(){
  try{
    const key = booking.total + ':' + booking.count;
    if(key === lastIntentKey) return;
    lastIntentKey = key;
    const pn = (document.getElementById('fPostal')||{}).value || '';
    fetch('/api/track-intent',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      keepalive:true,
      body: JSON.stringify({
        /* booking.total on EUROINA (pricing.mjs: total = work + travelFee).
           Palvelin jakaa sadalla, joten muunnos on tehtävä tässä — muuten
           Metalle menisi sadasosa oikeasta arvosta ja optimointi opettelisi
           tavoittelemaan lähes arvottomia tapahtumia. */
        totalCents: Math.round(booking.total * 100),
        count: booking.count,
        postal: /^\d{5}$/.test(pn.trim()) ? pn.trim() : undefined,
        eventId: 'ic-' + key + '-' + Math.floor(Date.now()/60000),
        fbc: readFbc(), fbp: readFbp(), vid: readVid(),
      }),
    }).catch(()=>{});
  }catch(e){/* seuranta ei saa estää varausta */}
}

const toDetailsBtn=document.getElementById('toDetails');
if(toDetailsBtn) toDetailsBtn.addEventListener('click',()=>{
  if(!(selDay && selSlot)) return;
  syncRecap(); goStep('form');
});
const stepBackBtn=document.getElementById('stepBack');
if(stepBackBtn) stepBackBtn.addEventListener('click',()=>goStepIdx(curIdx-1));
const recapChangeBtn=document.getElementById('bRecapChange');
if(recapChangeBtn) recapChangeBtn.addEventListener('click',()=>goStep('cal'));

/* ---------- alennuskoodi ----------

   Koodi tarkistetaan palvelimelta (`/api/check-discount` → CRM), koska
   koodit ja niiden arvot elävät kannassa. Selain ei tiedä eikä saa tietää
   mitään koodin arvosta: se lähettää kirjoitetun koodin ja näyttää sen
   summan jonka palvelin palauttaa.

   TÄMÄ ON VAIN NÄYTTÖÄ. Veloitettava alennus lasketaan uudelleen varauksen
   yhteydessä samasta funktiosta, joten tässä näytetty ja lopulta veloitettu
   summa eivät voi erota — paitsi jos koodi ehtii kulua välissä loppuun,
   jolloin varaus hylätään selvällä virheellä eikä hiljaa täydellä hinnalla. */
const discount = { code:'', cents:0, state:'idle' };  // idle | checking | ok | bad
let discountSeq = 0, discountTimer = null, lastDiscountSubtotal = -1;

/** Summa jolle alennus lasketaan: työ + alueen matkalisä. */
function subtotalCents(){
  return Math.round((booking.total + (avail.travelFeeCents||0)/100) * 100);
}

function renderDiscountNote(msg, kind){
  const el = document.getElementById('fCodeNote'); if(!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  el.style.color = kind==='ok' ? 'var(--green)' : (kind==='bad' ? '#B4453A' : 'var(--mute)');
}

async function checkDiscount(){
  const input = document.getElementById('fCode'); if(!input) return;
  const raw = input.value.trim();
  const seq = ++discountSeq;   // vanhentunut vastaus ei saa ylikirjoittaa uutta

  if(!raw){
    discount.code=''; discount.cents=0; discount.state='idle';
    renderDiscountNote('', ''); syncBookingSummary(); return;
  }
  /* Ilman kohdevalintaa alarajan tarkistus ei kerro mitään järkevää, joten
     odotetaan että laskurista on tullut summa. */
  if(booking.total<=0){
    discount.state='idle'; discount.cents=0;
    renderDiscountNote('Valitse ensin kohteet laskurista.', ''); return;
  }

  discount.state='checking';
  renderDiscountNote('Tarkistetaan…', '');
  try{
    const emailEl = document.getElementById('fEmail');
    const r = await fetch('/api/check-discount',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        code: raw,
        subtotalCents: subtotalCents(),
        email: emailEl ? emailEl.value.trim() : undefined,
      }),
    });
    if(seq !== discountSeq) return;
    const data = await r.json().catch(()=>({}));
    if(seq !== discountSeq) return;

    if(r.ok && data.ok){
      discount.code = data.code; discount.cents = data.amountCents||0; discount.state='ok';
      renderDiscountNote(`Koodi ${data.code}: −${(discount.cents/100).toLocaleString('fi-FI')} €`, 'ok');
      /* Vastaus tulee vasta valinnan jälkeen, joten laskuri on jo piirretty
         täydellä hinnalla. Ilman uudelleenpiirtoa alennus näkyisi vain
         koodikentän vieressä eikä summassa — ja summa on se mitä katsotaan. */
      render();
    } else {
      discount.code=''; discount.cents=0; discount.state='bad';
      render();
      renderDiscountNote(
        data && data.message ? data.message
          : 'Koodin tarkistus ei onnistunut. Voit varata ilman koodia.',
        'bad');
    }
  }catch(_){
    if(seq !== discountSeq) return;
    /* Verkkovirhe ei saa estää varaamista: koodi jää pois, ja jos se olisi
       ollut kelvollinen, sen voi hyvittää jälkikäteen. */
    discount.code=''; discount.cents=0; discount.state='bad';
    renderDiscountNote('Koodia ei saatu tarkistettua. Voit varata ilman koodia.', 'bad');
  }
  syncBookingSummary();
}

const fCodeEl = document.getElementById('fCode');
if(fCodeEl){
  /* Koodi osoitteesta: kumppanisivut (esim. /paivakumpu) linkittävät
     laskuriin muodossa `?koodi=PAIVAKUMPU`. Ilman tätä jäsen joutuisi
     kopioimaan koodin käsin toiselta sivulta — ja juuri siinä kohdassa
     etu jää käyttämättä. Tarkistus ajetaan heti, jotta kenttä kertoo
     kelpaako koodi ennen kuin asiakas täyttää loput tiedot. */
  try {
    const q = new URLSearchParams(location.search);
    const koodi = (q.get('koodi') || q.get('code') || document.body.dataset.koodi || '')
      .trim().toUpperCase().slice(0, 24);
    if (koodi && /^[A-Z0-9-]+$/.test(koodi)) {
      fCodeEl.value = koodi;
      checkDiscount();
    }
  } catch (_) { /* kelvoton osoite — koodi jää täyttämättä käsin */ }

  fCodeEl.addEventListener('input',()=>{
    /* Koodi kirjoitetaan mainoksesta käsin, joten kirjoitusasu vaihtelee.
       Näytetään se isoin kirjaimin heti — palvelin normalisoi saman. */
    const pos = fCodeEl.selectionStart;
    fCodeEl.value = fCodeEl.value.toUpperCase();
    if(pos!==null) try{ fCodeEl.setSelectionRange(pos,pos); }catch(_){}
    clearTimeout(discountTimer);
    discountTimer = setTimeout(checkDiscount, 500);
  });
  fCodeEl.addEventListener('blur',()=>{ clearTimeout(discountTimer); checkDiscount(); });
}

function syncBookingSummary(){
  syncToDetails(); syncRecap();
  const nameEl=document.getElementById('bServiceName'); if(!nameEl) return;
  nameEl.textContent = booking.serviceLabel;
  const priceEl = document.getElementById('bPrice');
  if(booking.total>0){
    /* Matkalisä tulee palvelualueesta, joten se voidaan näyttää vasta kun
       postinumero on tiedossa. Näytetty summa on sama jonka CRM veloittaa:
       työ + alueen lisä − mahdollinen alennuskoodi. */
    const fee = (avail.travelFeeCents||0)/100;
    const ale = discount.state==='ok' ? discount.cents/100 : 0;
    const shown = Math.max(0, booking.total + fee - ale);
    const net = Math.round(shown*NET_FACTOR);
    priceEl.innerHTML = `${shown.toLocaleString('fi-FI')} € `
      + (fee>0 ? `<span style="font-size:13px;opacity:.75;font-weight:600">· sis. matkalisä ${fee.toLocaleString('fi-FI')} €</span> ` : '')
      + (ale>0 ? `<span style="font-size:13px;opacity:.75;font-weight:600">· koodi ${discount.code} −${ale.toLocaleString('fi-FI')} €</span> ` : '')
      + `<span style="font-size:13px;opacity:.75;font-weight:600">· vähennyksen jälk. n. ${net.toLocaleString('fi-FI')} €</span>`;
  } else { priceEl.textContent = 'Valitse kohteet hintalaskurista nähdäksesi hinnan'; }
  const whenEl=document.getElementById('bWhen'), whenTxt=document.getElementById('bWhenText'); whenEl.style.display='flex';
  if(selDay && selSlot){ const wd=['su','ma','ti','ke','to','pe','la'][selDay.getDay()];
    whenTxt.textContent = `${wd} ${selDay.getDate()}.${selDay.getMonth()+1}.${selDay.getFullYear()} klo ${selSlot}`; }
  else { whenTxt.textContent='Valitse aika kalenterista'; }
}
/* Emme tee ilmaisia kartoituskäyntejä: varausta ei voi lähettää ilman laskurista
   tullutta ovivalintaa. Estää myös suoraan varaa.html:ään saapuvat (kaupunkilinkit,
   hakukone, vanha bookmark) tekemästä 0 €:n varausta. */
function gateBookingOnCalculator(){
  const form=document.getElementById('bForm'); if(!form) return;
  const btn=document.getElementById('bSubmit'); if(!btn) return;
  const ok = booking.count>0 && booking.total>0;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '' : '.5';
  btn.style.cursor = ok ? '' : 'not-allowed';
  let note=document.getElementById('bNeedCalc');
  if(!ok){
    if(!note){
      note=document.createElement('div');
      note.id='bNeedCalc';
      note.style.cssText='background:var(--green-soft);border:1px solid var(--line2);border-radius:10px;padding:14px 16px;margin-bottom:14px;font-size:14.5px;line-height:1.5';
      note.innerHTML='Valitse ensin ovet ja ikkunat hintalaskurista — näet kiinteän hinnan ennen varausta. <a href="/#laskuri" style="color:var(--green);font-weight:700;text-decoration:underline">Siirry laskuriin</a>';
      form.parentNode.insertBefore(note, form);
    }
    note.style.display='block';
  } else if(note){ note.style.display='none'; }
}
const bFormEl=document.getElementById('bForm');
if(bFormEl) bFormEl.addEventListener('submit',async e=>{
  e.preventDefault(); const err=document.getElementById('bErr'); err.style.display='none';
  if(!(booking.count>0 && booking.total>0)){
    err.innerHTML='Valitse ensin ovet tai ikkunat hintalaskurista. <a href="/#laskuri" style="text-decoration:underline;font-weight:700">Siirry laskuriin</a>';
    err.style.display='block'; return;
  }
  if(avail.state==='unserved'){
    err.textContent=`Emme vielä palvele postinumerossa ${avail.postal}. Jätä yhteystietosi yltä, niin otamme yhteyttä.`;
    err.style.display='block'; return;
  }
  /* Postinumero luetaan `avail.postal`ista eikä lomakkeen kentästä: kenttä on
     aloituskortissa varaa.html:ssä, ja tällä sivulla numero on tullut
     kyselyparametrina. Aiemmin tämä luki suoraan #fPostal-elementtiä, joka
     ei ole tällä sivulla olemassa lainkaan. */
  const postal = avail.postal;
  if(!/^\d{5}$/.test(postal)){
    err.innerHTML='Postinumero puuttuu. <a href="varaa.html" style="text-decoration:underline;font-weight:700">Aloita alusta</a>.';
    err.style.display='block';
    return;
  }
  const slot = selectedSlot();
  if(!slot){ err.textContent='Valitse ensin vapaa päivä ja aika kalenterista.'; err.style.display='block'; return; }

  const submitBtn=document.getElementById('bSubmit');
  const btnLabel=submitBtn.textContent;
  submitBtn.disabled=true; submitBtn.textContent='Lähetetään…';

  const payload={
    name: document.getElementById('fName').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    phone: document.getElementById('fPhone').value.trim(),
    address: document.getElementById('fAddr').value.trim(),
    postal,
    notes: document.getElementById('fNotes').value.trim(),
    /* Täsmällinen alkuhetki ja kalenteri siitä slotista jonka asiakas näki.
       Palvelin varaa ajan näillä ja ratkaisee alueen postinumerosta. */
    startsAt: slot.startsAt,
    calendarId: slot.calendarId,
    /* Lähetetään raaka valinta, ei hintoja: palvelin laskee summan samasta
       pricing.mjs:stä eikä luota clientin lukuihin. */
    counts: {...state},
    extras: {...extraState},
    /* Vain koodi, ei sen arvoa: palvelin laskee vähennyksen omasta
       taulustaan. Lähetetään vain jos koodi todella kelpasi tarkistuksessa,
       jottei kelvoton koodi kaada varausta turhaan. */
    discountCode: discount.state==='ok' ? discount.code : undefined,
    /* Mainoskampanja, jos kävijä tuli mainoslinkistä viimeisen 30 pv aikana.
       Pelkkä merkintä raportointia varten — ei vaikuta hintaan. */
    campaign: readCampaign(),
    /* Google Ads -klikin tunniste, jos kävijä tuli mainoksesta. Tallentuu
       työn kentäksi CRM:ään, josta se viedään Adsiin konversiona. Peruttu
       varaus vie gclidin mukanaan — peruttua kauppaa ei raportoida. */
    gclid: readGclid(),
    /* Kumpi Googlen tunnisteista yllä on. Ilman tätä iOS:n wbraid
       lähtisi Adsille gclidinä ja konversio hylättäisiin. */
    gclidKind: readGclidKind(),
    /* Meta-klikin tunnisteet CAPIa varten, jos kävijä tuli Facebook/Instagram
       -mainoksesta. Sama logiikka kuin gclidillä: pelkkä tunniste, lähetetään
       vain toteutuneen varauksen mukana. */
    fbc: readFbc(),
    fbp: readFbp(),
    /* Sama tunniste kuin ostoaikeessa: Meta yhdistää aikeen ja kaupan
       samaksi ihmiseksi vain jos tunniste on sama. */
    vid: readVid(),
  };

  try{
    const r=await fetch('/api/create-booking',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload),
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok || !data.ok){
      if(data && data.error==='no_items'){
        err.innerHTML='Varaus vaatii vähintään yhden oven tai ikkunan. <a href="/#laskuri" style="text-decoration:underline;font-weight:700">Valitse kohteet laskurista</a>';
      } else if(data && data.error==='slot_taken'){
        /* Joku ehti varata saman ajan. Haetaan vapaat ajat uudelleen, jotta
           asiakas näkee heti mitä on jäljellä eikä yritä samaa aikaa toiste. */
        err.textContent='Valitettavasti tämä aika ehdittiin juuri varata. Valitse toinen aika kalenterista.';
        loadAvailability();
      } else if(data && data.error==='area_not_served'){
        err.textContent=`Emme vielä palvele postinumerossa ${data.postal||postal}. Jätä yhteystietosi kalenterin yläpuolelta.`;
        loadAvailability();
      } else if(data && data.error==='discount_invalid'){
        /* Koodi ehti kulua loppuun tai vanhentua lomakkeen täytön aikana.
           Aika on yhä vapaa — varaus peruuntui kokonaan — joten koodi
           nollataan ja asiakas voi lähettää saman lomakkeen uudelleen. */
        const why = {
          expired:'Koodin voimassaolo on päättynyt.',
          exhausted:'Koodi ehti juuri tulla käytetyksi loppuun.',
          already_used:'Koodi on jo käytetty tällä sähköpostilla.',
          inactive:'Koodi ei ole enää käytössä.',
          not_started:'Koodi ei ole vielä voimassa.',
          below_min:'Tilaus jää koodin alarajan alle.',
        }[data.reason] || 'Koodia ei voitu käyttää.';
        discount.code=''; discount.cents=0; discount.state='bad';
        renderDiscountNote(why, 'bad');
        syncBookingSummary();
        err.textContent = `${why} Varausta ei tehty. Lähetä uudelleen — hinta on ilman koodia.`;
      } else if(data && data.error==='calendar_area_mismatch'){
        /* Postinumero on vaihtunut valinnan jälkeen niin, että aika kuuluu
           toiselle alueelle. Haetaan ajat uudelleen oikealle alueelle. */
        err.textContent='Postinumero ja valittu aika eivät täsmää. Valitse aika uudelleen.';
        loadAvailability();
      } else {
        err.textContent = data && data.error==='validation'
          ? 'Tarkista lomakkeen tiedot ja yritä uudelleen.'
          : 'Varauksen tallennus ei onnistunut. Yritä hetken kuluttua uudelleen tai soita 045 875 5996.';
      }
      err.style.display='block';
      submitBtn.disabled=false; submitBtn.textContent=btnLabel;
      return;
    }

    const name = payload.name.split(' ')[0] || 'hei';
    const wd=['su','ma','ti','ke','to','pe','la'][selDay.getDay()];
    const when = `${wd} ${selDay.getDate()}.${selDay.getMonth()+1}. klo ${selSlot}`;
    goStep('done');
    document.getElementById('bRef').textContent=data.ref;
    const totalEur=(data.total_cents||0)/100;
    /* Toteutunut alennus tulee palvelimelta eikä paikallisesta tilasta:
       se on sama luku joka on vahvistuspostissa ja laskulla. */
    const aleEur=(data.discount_cents||0)/100;
    const priceTxt = ` Kohde: ${booking.count} kohdetta · ${totalEur.toLocaleString('fi-FI')} €`
      + (aleEur>0 ? ` (koodi ${data.discount_code} −${aleEur.toLocaleString('fi-FI')} €)` : '') + '.';
    document.getElementById('bDoneText').textContent = `Kiitos, ${name}! Olemme sinuun yhteydessä ja vahvistamme ajan osoitteeseen ${payload.email}. Aika: ${when}.${priceTxt}`;
    try{ sessionStorage.removeItem('tk_booking'); }catch(_){}
    /* Varattu aika katoaa vapaista vasta kun se haetaan uudelleen — nyt
       kalenteri kertoo totuuden eikä sitä voi merkitä paikallisesti. */
    selSlot=null; loadAvailability();
    submitBtn.disabled=false; submitBtn.textContent=btnLabel;
  }catch(ex){
    err.textContent='Yhteysvirhe. Tarkista verkkoyhteys ja yritä uudelleen, tai soita 045 875 5996.';
    err.style.display='block';
    submitBtn.disabled=false; submitBtn.textContent=btnLabel;
  }
});
const bResetEl=document.getElementById('bReset');
if(bResetEl) bResetEl.addEventListener('click',()=>{
  document.getElementById('bForm').reset();
  selDay=null; selSlot=null; renderCal(); renderSlots(); syncBookingSummary();
  goStep('cal');
});
/* Postinumero ohjaa koko kalenteria: kun se on täydet 5 numeroa, haetaan
   alue ja sen vapaat ajat. Haku viivästetään hieman, jottei jokainen
   näppäinpainallus lähetä pyyntöä. */
const fPostalEl=document.getElementById('fPostal');
if(fPostalEl){
  let postalTimer=null;
  fPostalEl.addEventListener('input',e=>{
    e.target.value=e.target.value.replace(/\D/g,'').slice(0,5);
    const v=e.target.value;
    if(v===avail.postal) return;
    avail.postal=v;
    clearTimeout(postalTimer);
    /* Keskeneräinen postinumero nollaa kalenterin heti — muuten edellisen
       alueen ajat jäisivät näkyviin väärälle postinumerolle. */
    if(v.length<5){ loadAvailability(); return; }
    postalTimer=setTimeout(()=>loadAvailability(), 250);
  });
}

/* ---------- ALOITUSKORTTI ----------
   Varauksen ensimmäinen vaihe. Kalenteri on piilossa kunnes postinumero on
   annettu ja "Näytä vapaat ajat" painettu: aiemmin kalenteri oli heti näkyvissä
   tyhjänä, mikä näytti rikkinäiseltä ennen kuin postinumero oli syötetty.

   Taloyhtiö ei varaa aikaa verkosta — sen hinta muodostuu kartoituksessa —
   joten se polku ohjaa taloyhtiösivulle. */
/* Ehto on polkuvalitsimessa eikä kortin id:ssä: etusivulla sama lohko on yksi
   vaihe isommassa kortissa, varaa.html:ssä oma .gate-korttinsa. */
if(document.getElementById('tabKoti')){
  const tabKoti=document.getElementById('tabKoti'), tabYhtio=document.getElementById('tabYhtio');
  const paneKoti=document.getElementById('gateKoti'), paneYhtio=document.getElementById('gateYhtio');
  const bookWrap=document.getElementById('bookWrap');
  const gShow=document.getElementById('gShow');

  function pickPath(koti){
    tabKoti.classList.toggle('on', koti);   tabKoti.setAttribute('aria-selected', String(koti));
    tabYhtio.classList.toggle('on', !koti); tabYhtio.setAttribute('aria-selected', String(!koti));
    paneKoti.hidden = !koti; paneYhtio.hidden = koti;
    /* Taloyhtiöön siirryttäessä kalenteri piiloon: sen ajat eivät koske
       taloyhtiötä, eikä auki jäänyt kalenteri saa jäädä harhauttamaan. */
    if(!koti && bookWrap) bookWrap.hidden = true;
  }
  tabKoti.addEventListener('click', ()=>{ pickPath(true); setStepPath('koti'); });
  tabYhtio.addEventListener('click', ()=>{ pickPath(false); setStepPath('yhtio'); });

  /* Taloyhtiön varaus on nyt SAMASSA kortissa, ei erillisellä sivulla:
     kalenteri ja lomake tulevat `_kartoitus.js`:stä, samasta moduulista jota
     taloyhtio.html käyttää. Aiemmin tästä lähdettiin taloyhtio.html:lle
     ?pn=-parametrilla — se kierros jää pois. */
  const yhtioPostal=document.getElementById('fPostalYhtio');
  const yhtioGo=document.getElementById('gYhtioGo');
  if(yhtioPostal && yhtioGo && document.getElementById('yCal')){
    kartoitusApi = mountKartoitus({
      noteEl: document.getElementById('yhtioNote'),
      calEl: document.getElementById('yCal'),
      formEl: document.getElementById('yForm'),
      doneEl: document.getElementById('yDone'),
      postalEl: yhtioPostal,
      continueEl: yhtioGo,
      goTo: (name)=>goStep('y-'+name),
      rootPrefix: (yhtioGo.dataset.root||''),
      fbc: ()=>readFbc(), fbp: ()=>readFbp(), vid: ()=>readVid(),
      campaign: ()=>readCampaign(), gclid: ()=>readGclid(),
    });
    yhtioGo.addEventListener('click',(e)=>{
      e.preventDefault();
      if(kartoitusApi.state()==='ready') goStep('y-cal');
    });

    /* Toinen polku: tarjous ilman käyntiä. Vie taloyhtiösivun lomakkeeseen,
       koska sitä ei ole etusivulla — postinumero kulkee mukana `?pn=`:ssä ja
       `#tarjous` kertoo perillä ettei kalenteria pidä avata.

       Ehto on löysempi kuin varausnapilla: varaus vaatii vapaita aikoja,
       tarjouspyyntö vain viisi numeroa. Tarjouksen voi siis pyytää vaikka
       kalenteri olisi täynnä tai aluehaku kaatuisi — juuri silloin se on
       ainoa jäljellä oleva tie. */
    const yhtioQuote=document.getElementById('gYhtioQuote');
    if(yhtioQuote){
      const root=(yhtioGo.dataset.root||'');
      const syncQuote=()=>{ yhtioQuote.disabled=!/^\d{5}$/.test((yhtioPostal.value||'').trim()); };
      yhtioPostal.addEventListener('input',syncQuote);
      syncQuote();
      yhtioQuote.addEventListener('click',()=>{
        const pn=(yhtioPostal.value||'').trim();
        location.href=`${root}taloyhtio.html?pn=${encodeURIComponent(pn)}#tarjous`;
      });
    }
  }

  /* Kortin hinta tulee laskurin valinnasta. Ilman valintaa ei näytetä
     summaa vaan ohjataan laskuriin — emme tee ilmaisia kartoituskäyntejä,
     joten varaus ilman kohteita ei ole mahdollinen. */
  function renderGatePrice(){
    const p=document.getElementById('gPrice'), n=document.getElementById('gNet'),
          m=document.getElementById('gMeta'), e=document.getElementById('gEdit');
    if(!p) return;
    const q = computePricing(state, extraState);
    const fee = (avail.travelFeeCents||0)/100;
    if(q.total<=0){
      p.textContent='Valitse kohteet';
      n.innerHTML='<a href="/#laskuri" style="color:var(--green);font-weight:700">Siirry hintalaskuriin</a>';
      m.textContent='Näet kiinteän hinnan ennen varausta';
      e.style.display='none';
      return;
    }
    const ale = discount.state==='ok' ? discount.cents/100 : 0;
    const total=Math.max(0, q.total+fee-ale);
    p.textContent=`${total.toLocaleString('fi-FI')} €`;
    n.textContent=`~${Math.round(total*NET_FACTOR).toLocaleString('fi-FI')} € kotitalousväh. jälkeen`;
    const hrs=q.minutes/60;
    const kesto = hrs<1 ? Math.round(q.minutes)+' min' : (Math.round(hrs*2)/2).toLocaleString('fi-FI')+' h';
    m.textContent = `sis. ALV 25,5 % · ${kesto}`
      + (fee>0 ? ` · sis. matkalisä ${fee.toLocaleString('fi-FI')} €` : '')
      + (ale>0 ? ` · koodi ${discount.code} −${ale.toLocaleString('fi-FI')} €` : '');
    e.style.display='';
  }
  window.__renderGatePrice = renderGatePrice;

  gShow.addEventListener('click', async ()=>{
    if(!/^\d{5}$/.test(avail.postal)){
      renderAreaNote();
      document.getElementById('fPostal').focus();
      return;
    }
    gShow.disabled=true; const lbl=gShow.textContent; gShow.textContent='Tarkistetaan…';
    /* Alue tarkistetaan ENNEN siirtymistä: jos postinumeroa ei palvella, on
       parempi näyttää yhteydenottolomake tässä kuin viedä asiakas tyhjälle
       kalenterisivulle. */
    await loadAvailability();
    gShow.disabled=false; gShow.textContent=lbl;

    if(avail.state==='ready' || avail.state==='none'){
      /* Alue vahvistettu → siirrytään laskuriin (palveluvalinta); kalenteri
         tulee vasta laskurin jälkeen. Etusivulla laskuri on saman kortin vaihe.
         varaa.html:ssä ei ole laskurivaihetta, joten ohjataan etusivun laskuriin
         ja postinumero kuljetetaan mukana (?pn=), ettei sitä syötetä kahdesti —
         näin varaus ei koskaan ohita palveluvalintaa (muuten hinta jäisi 0 €).
         Ennen tässä mentiin suoraan ajanvaraukseen (postinumero → aika) ohi
         laskurin, jolloin kohteita ei valittu ja varaus kaatui/jäi tyhjäksi. */
      if(stepIdx('calc')>=0) goStep('calc');
      else location.href = `/?pn=${encodeURIComponent(avail.postal)}#laskuri`;
    }
  });

  /* "Muokkaa valintaa" palaa laskuriin — etusivulla vaiheena, muualla linkkinä. */
  const gEditBtn=document.getElementById('gEdit');
  if(gEditBtn && gEditBtn.tagName==='BUTTON'){
    gEditBtn.addEventListener('click',()=>goStep('calc'));
  }

  pickPath(true);
}

/* nouda laskurin valinta varaus-sivulla (jos tullaan laskurista) */
/* Ehto on "sivulla EI ole elävää laskuria" — ei "sivulla on varauslomake".
   Valinta on palautettava sekä aloituskortille (varaa.html, näyttää hinnan)
   että ajanvaraussivulle (ajanvaraus.html, lähettää varauksen), ja kummallakin
   on eri elementit. Aiemmin ehto oli sidottu lomakkeeseen, joten kortti jäi
   ilman hintaa kun sivut jaettiin. */
if(!document.getElementById('calcTypes')){
  try{ const saved=JSON.parse(sessionStorage.getItem('tk_booking')||'null');
    if(saved && saved.total>0){
      booking.total=saved.total; booking.count=saved.count; booking.serviceLabel=saved.serviceLabel;
      /* Palauta kohdekohtainen valinta state/extraStateen — lomakkeen payload
         luetaan niistä. Ilman tätä varaus lähtisi tyhjänä ja tallentuisi 0 €:na. */
      Object.entries(saved.counts||{}).forEach(([k,v])=>{ if(Object.prototype.hasOwnProperty.call(state,k)) state[k]=Math.max(0,parseInt(v,10)||0); });
      Object.entries(saved.extras||{}).forEach(([k,v])=>{ if(Object.prototype.hasOwnProperty.call(extraState,k)) extraState[k]=!!v; });
    }
  }catch(_){}
  gateBookingOnCalculator();
  /* Kortin hinta piirretään VASTA tässä: `state` on palautettu vasta nyt,
     ja aiemmin kutsuttuna kortti näyttäisi "Valitse kohteet" vaikka valinta
     olisi olemassa. */
  if(window.__renderGatePrice) window.__renderGatePrice();
}

/* varaa.html ohjaa etusivun laskuriin postinumeron kanssa (?pn=). Esitäytetään
   postinumero ja siirrytään suoraan laskurivaiheeseen, ettei sitä tarvitse
   syöttää kahdesti — flow on silloin postinumero → laskuri → aika. Vain
   etusivulla, jolla on sekä postinumerokenttä että laskurivaihe. */
if(document.getElementById('fPostal') && document.getElementById('gShow') && stepIdx('calc')>=0){
  const pn0 = new URLSearchParams(location.search).get('pn') || '';
  if(/^\d{5}$/.test(pn0)){
    const inp=document.getElementById('fPostal');
    inp.value=pn0;
    /* Sama polku kuin käyttäjän klikatessa "Näytä vapaat ajat": input-tapahtuma
       asettaa avail.postalin ja tarkistaa alueen, minkä jälkeen gShow-klikki
       siirtää laskurivaiheeseen (postinumero → laskuri → aika). Viive antaa
       aluetarkistuksen (250 ms debounce) ehtiä ennen klikkiä. */
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => { const b=document.getElementById('gShow'); if(b) b.click(); }, 600);
  }
}

/* Ajanvaraussivu (ajanvaraus.html) saa postinumeron kyselyparametrina
   aloituskortista. Ilman sitä sivulla ei ole mitään näytettävää, joten
   asiakas ohjataan takaisin alkuun sen sijaan että hän näkisi tyhjän
   kalenterin ja arvailisi mikä meni vikaan. */
/* Ehto on postinumerokentän puuttuminen: etusivulla kalenteri ja postinumero
   ovat saman kortin vaiheita, joten sieltä ei ole mihinkään ohjattavaa. Vain
   ajanvaraus.html on se sivu jolla kalenteri on ilman omaa postinumerovaihetta. */
if(document.getElementById('gridDays') && !document.getElementById('fPostal')){
  const pn = new URLSearchParams(location.search).get('pn') || '';
  if(/^\d{5}$/.test(pn)){
    avail.postal = pn;
  } else {
    location.replace('varaa.html');
  }
}

/* Vapaat ajat haetaan heti kun kalenteri on sivulla. Tämä on viimeisenä,
   jotta `state`/`extraState` on jo palautettu sessionStorageesta ja pyyntö
   lähtee oikealla kestolla. */
if(document.getElementById('gridDays')) loadAvailability();

/* ---------- nav / burger / reveal ---------- */
const nav=document.getElementById('nav'), nl=document.getElementById('nlinks');
if(nav){ const onScroll=()=>nav.classList.toggle('scr',window.scrollY>10); onScroll();
  addEventListener('scroll',onScroll,{passive:true}); }
const burger=document.getElementById('burger');
if(burger){ burger.addEventListener('click',()=>nl.classList.toggle('op'));
  nl.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nl.classList.remove('op'))); }
document.querySelectorAll('.calc-types,.revs,.steps,.grid-3').forEach(g=>[...g.children].forEach((ch,i)=>ch.style.transitionDelay=i*55+'ms'));
const rvEls=[...document.querySelectorAll('.rv')];
if('IntersectionObserver' in window){
  const io=new IntersectionObserver((ents)=>{ents.forEach(en=>{if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}});},{rootMargin:'0px 0px -6% 0px',threshold:0.05});
  rvEls.forEach(el=>io.observe(el));
} else { rvEls.forEach(el=>el.classList.add('in')); }
setTimeout(()=>rvEls.forEach(el=>{ if(el.getBoundingClientRect().top<innerHeight) el.classList.add('in'); }),1000);
const yrEl=document.getElementById('yr'); if(yrEl) yrEl.textContent=new Date().getFullYear();
render(); renderCal(); renderSlots(); syncBookingSummary();
if(document.getElementById('stepCard')){
  paintStepChrome();
  /* Funnelin ensimmäinen vaihe (näkyvissä jo latauksessa) analytiikkaan. */
  if(window.tkTrack && seq()[curIdx]) window.tkTrack({type:'funnel', step:seq()[curIdx].dataset.step});
}
