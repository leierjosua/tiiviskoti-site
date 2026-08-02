/* =========================================================
   TiivisKoti — alalaidan CTA-palkki (mobiili)

   Palkki EI roiku ruudun pohjalla koko ajan. Se peitti sisältöä sivun
   joka vaiheessa ja toisti napin joka oli usein jo näkyvissä: hero,
   laskuri/tarjous ja footer kantavat kukin oman CTA:nsa.

   Sääntö: palkki nousee esiin vain kun ruudulla EI ole sivun omaa CTA:ta
   ja sivua on vieritetty yli puoli näkymää.

   Oma tiedostonsa eikä osa _shared.js:ää, koska palkki on sivuilla joilla
   ei ole laskuria eikä _shared.js:ää lainkaan (taloyhtio.html on oma
   sivunsa omalla skriptillään). Varaussivuilla (varaa/ajanvaraus) palkkia
   ei ole ollenkaan: siellä koko sivu on se toiminto, ja palkki linkitti
   omaan osioonsa eli takaisin siihen mitä katsottiin.
   ========================================================= */
const mcta = document.querySelector('.mcta');
if(mcta){
  const own = [];
  const hero = document.querySelector('header.hero'); if(hero) own.push(hero);

  /* Sivun omat CTA-napit tarkkaillaan sellaisenaan, ei kiinteänä osiolistana:
     näin uusi CTA-osio vaimentaa palkin automaattisesti eikä tätä listaa
     tarvitse muistaa päivittää. Navin ja palkin omat napit eivät laske. */
  document.querySelectorAll('a.btn-p, a.btn-lg').forEach(b=>{
    if(!b.closest('.mcta') && !b.closest('nav.top')) own.push(b);
  });

  /* Palkin oma kohdeosio kokonaisuudessaan: laskuri ja tarjouslomake ovat
     puhelimessa monta näkymää pitkiä, ja niiden keskellä palkki tarjoaisi
     hyppyä sinne missä ollaan jo. Sivujen väliset linkit
     (index.html#laskuri) eivät osu tähän. */
  const ctaBtn = mcta.querySelector('.btn-p');
  const href = ctaBtn ? ctaBtn.getAttribute('href')||'' : '';
  if(href.startsWith('#') && href.length>1){
    const t = document.querySelector(href); if(t) own.push(t);
  }
  const foot = document.querySelector('footer.mfoot'); if(foot) own.push(foot);

  const onScreen = new Set();
  const sync = ()=>{
    const scrolled = window.scrollY > innerHeight*0.5;
    mcta.classList.toggle('show', scrolled && onScreen.size===0);
  };

  const hasIO = 'IntersectionObserver' in window && own.length>0;
  if(hasIO){
    const io = new IntersectionObserver(ents=>{
      ents.forEach(en=>{ en.isIntersecting ? onScreen.add(en.target) : onScreen.delete(en.target); });
      sync();
    },{threshold:0});
    own.forEach(el=>io.observe(el));
  }
  addEventListener('scroll', sync, {passive:true});
  /* Ensimmäinen tila jätetään havainnoijan tehtäväksi: ankkurilinkillä
     (#laskuri) saavuttaessa scrollY on heti iso mutta onScreen vielä tyhjä,
     joten tässä kutsuttu sync välähdyttäisi palkin näkyviin. */
  if(!hasIO) sync();
}
