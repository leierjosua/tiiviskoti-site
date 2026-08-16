/* Evästeetön, anonyymi kävijäseuranta.

   EI evästeitä, EI localStoragea, EI henkilötietoja. Lähettää kevyitä
   beaconeja CRM:n /api/public/track-endpointille, joka laskee kävijästä
   päivittäin vaihtuvan anonyymin hashin (IP:tä ei tallenneta). Tietosuoja
   luku 7. Jos tämä poistetaan, seuranta lakkaa kokonaan.

   Kerää: sivunäytöt, scroll-syvyys, CTA-klikit ja varausfunnelin vaiheet
   (funnel tulee _shared.js:stä window.tkTrackilla). */
(function () {
  var EP = 'https://admin.tiiviskoti.fi/api/public/track';
  var campaign = null;
  try { campaign = new URLSearchParams(location.search).get('src'); } catch (e) { /* ei väliä */ }

  function send(o) {
    if (!o.path) o.path = location.pathname;
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
