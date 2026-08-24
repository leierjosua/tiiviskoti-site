/* Evästeetön, anonyymi kävijäseuranta.

   EI evästeitä, EI localStoragea, EI henkilötietoja. Lähettää kevyitä
   beaconeja CRM:n /api/public/track-endpointille, joka laskee kävijästä
   päivittäin vaihtuvan anonyymin hashin (IP:tä ei tallenneta). Tietosuoja
   luku 7. Jos tämä poistetaan, seuranta lakkaa kokonaan.

   Kerää: sivunäytöt, scroll-syvyys, CTA-klikit ja varausfunnelin vaiheet
   (funnel tulee _shared.js:stä window.tkTrackilla). */
(function () {
  var EP = 'https://admin.tiiviskoti.fi/api/public/track';

  /* ---------- mainoskampanja ----------
     Mistä kävijä tuli: oma ?src=-merkintämme, mainostyökalun utm_*, tai
     pelkkä klikkitunniste (fbclid/gclid) josta tunnistetaan ainakin alusta.
     Ennen tässä luettiin vain ?src=, jolloin kaikki Metan ja Googlen kautta
     tullut liikenne kirjautui kampanjattomana — elokuussa 2026 se oli
     kaikki maksettu liikenne.

     TÄSTÄ EI LUETA localStoragea, vaikka _shared.js tallettaa kampanjan
     sinne 30 päiväksi. Tämä tiedosto on luvattu pitää tallennustilaan
     koskemattomana (ks. yllä), eikä lupausta rikota mittarin takia. Riittää
     että laskeutumissivun sivunäyttö kantaa kampanjan: saman kävijän muut
     tapahtumat yhdistyvät siihen raportissa visitor_hashin kautta.

     Sama tunnistus on _shared.js:ssä ja taloyhtio.html:ssä. Jos muutat
     sääntöä, muuta se kaikkiin kolmeen. */
  var CAMPAIGN_RE = /^[a-z0-9][a-z0-9._-]{0,59}$/;
  var campaign = null;
  try {
    var q = new URLSearchParams(location.search);
    /* utm_content ennen utm_campaignia — mainoksen nimi on se joka erottaa,
       kampanjan nimi ei. Ks. sama perustelu _shared.js:ssä. */
    var named = q.get('src') || q.get('utm_content') || q.get('utm_campaign') || q.get('utm_source');
    if (named) {
      /* Mainostyökalujen nimissä on välilyöntejä ja isoja kirjaimia. */
      /* Skandit ensin, muuten ääkköset katoavat ja nimi menee tunnistamattomaksi. */
      var v = String(named).toLowerCase().replace(/[äàáâã]/g,'a').replace(/[öòóôõ]/g,'o').replace(/å/g,'a').replace(/ü/g,'u').replace(/[éèêë]/g,'e')
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-').replace(/^[-._]+/, '').replace(/[-._]+$/, '')
        .slice(0, 60);
      campaign = CAMPAIGN_RE.test(v) ? v : null;
    } else if (q.get('fbclid')) campaign = 'meta-ads';
    else if (q.get('gclid') || q.get('wbraid') || q.get('gbraid')) campaign = 'google-ads';
  } catch (e) { /* ei väliä */ }

  /* ---------- A/B-testi ----------
     Versio arvotaan KERRAN SIVULATAUSTA KOHTI ja pidetään muistissa. Ei
     evästettä eikä localStoragea — tämä sivusto ei koske käyttäjän laitteen
     tallennustilaan, ja se lupaus pidetään myös testin takia.

     Sivulatauskohtaisuus riittää, koska koko varausputki (postinumero → aika
     → tiedot) tapahtuu yhden sivulatauksen sisällä vaihtuvana korttina.
     Kaikki saman latauksen tapahtumat kantavat siis samaa versiota, eikä
     kävijä näe kesken putken vaihtuvaa tekstiä.

     Rajoitus jonka kanssa on elettävä: sama ihminen voi saada eri version jos
     hän lataa sivun uudelleen. Raportti mittaa siis sivulatauksia, ei
     yksilöitä. Se on tarkoituksella: yksilön seuraaminen vaatisi tunnisteen
     tallentamisen selaimeen.

     `?ab=`-parametrilla version voi pakottaa testausta varten. */
  var VARIANTS = ['a', 'b'];
  var variant = window.tkVariant;
  if (VARIANTS.indexOf(variant) < 0) {
    /* Sivuilla joilla on tekstiversioita arvonta on tehty jo <head>issä, jotta
       teksti ei ehdi välähtää. Tänne päädytään vain muilla sivuilla. */
    try {
      var forced = new URLSearchParams(location.search).get('ab');
      variant = VARIANTS.indexOf(forced) >= 0 ? forced
        : VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
    } catch (e) { variant = VARIANTS[0]; }
    window.tkVariant = variant;
    document.documentElement.setAttribute('data-ab', variant);
  }

  function send(o) {
    if (!o.path) o.path = location.pathname;
    if (!o.variant) o.variant = variant;
    var data = JSON.stringify(o);
    try {
      var blob = new Blob([data], { type: 'text/plain' });
      if (navigator.sendBeacon && navigator.sendBeacon(EP, blob)) return;
    } catch (e) { /* fallback alla */ }
    try {
      fetch(EP, { method: 'POST', body: data, keepalive: true, headers: { 'content-type': 'text/plain' } });
    } catch (e) { /* seuranta ei saa kaataa mitään */ }
  }

  /* _shared.js kutsuu tätä varausvaiheista. */
  window.tkTrack = function (o) { if (o && o.type) send(o); };

  /* Sivunäyttö heti. */
  send({ type: 'pageview', ref: document.referrer || '', campaign: campaign });

  /* Scroll-syvyys: seurataan suurinta saavutettua %:a, lähetetään kerran
     kun sivulta poistutaan. */
  var maxPct = 0, sent = false;
  function onScroll() {
    var h = document.documentElement;
    var denom = h.scrollHeight - h.clientHeight;
    var pct = denom > 0 ? Math.round((h.scrollTop / denom) * 100) : 100;
    if (pct > maxPct) maxPct = pct > 100 ? 100 : pct;
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  function flush() {
    if (sent) return; sent = true;
    send({ type: 'scroll', scroll: maxPct });
  }
  addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);

  /* CTA-klikit: napit (btn- ja cta-luokat) ja puhelinlinkit. Nimi näkyvästä
     tekstistä, jolloin raportti on luettava ilman erillistä merkintää. */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a,button') : null;
    if (!el) return;
    var href = el.getAttribute('href') || '';
    var isTel = href.indexOf('tel:') === 0;
    var cls = typeof el.className === 'string' ? el.className : '';
    if (!(isTel || el.hasAttribute('data-cta') || /btn|cta/.test(cls))) return;
    var label = el.getAttribute('data-cta') ||
      (isTel ? 'Soita' : (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)) || 'nappi';
    send({ type: 'cta', cta: label });
  }, true);
})();
