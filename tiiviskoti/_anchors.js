/* TiivisKoti — sivunsisäisten ankkurilinkkien vieritys.
 *
 * MIKSI TÄMÄ ON OLEMASSA: sivut nojasivat pelkkään CSS:n
 * `html{scroll-behavior:smooth}` -sääntöön. Jos selain ei suorita pehmeää
 * vieritystä — käyttöjärjestelmän liikkeenvähennys, selaimen asetus,
 * jokin laajennus — Chrome ei putoa välittömään hyppyyn vaan **ei vieritä
 * lainkaan**. Osoiteriville ilmestyy #varaa, mutta sivu jää paikalleen.
 *
 * Todettu 26.8.2026 Josuan omassa selaimessa: navipalkin "Varaa aika",
 * heron kutsut ja tarjouspyyntönappi kaikki näyttivät rikkinäisiltä, koska
 * mitään ei tapahtunut. Vika ei ollut napeissa vaan vierityksessä.
 *
 * Korjaus: yritetään pehmeää vieritystä, ja jos sivu ei ole liikkunut
 * hetken päästä, hypätään perille. Käyttäjälle lopputulos on aina sama:
 * kohta johon linkki osoittaa tulee näkyviin.
 */

/* Kiinteä navipalkki peittäisi kohteen yläreunan ilman marginaalia. */
const OFFSET = 76;

export function scrollToId(id) {
  const target = document.getElementById(id);
  if (!target) return false;
  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - OFFSET);

  window.scrollTo({ top, behavior: 'smooth' });
  /* Varmistus. 350 ms riittää pehmeän vierityksen alkuun: jos se on
     käynnissä, sivu on jo liikkunut eikä hyppyä tehdä. Jos mitään ei
     tapahtunut, siirrytään suoraan.

     HUOM `behavior:'auto'` EI kelpaa varmistukseksi: se tarkoittaa "käytä
     CSS:n arvoa", ja CSS sanoo `smooth` — eli täsmälleen se polku joka on
     estynyt. Siksi tyyli ohitetaan hetkeksi ja palautetaan heti. */
  setTimeout(() => {
    if (Math.abs(window.scrollY - top) <= 40) return;
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, top);
    html.style.scrollBehavior = prev;
  }, 350);
  return true;
}

/* Yksi kuuntelija koko dokumentille: linkkejä on kymmeniä ja niitä
   lisätään sivuille jatkuvasti, joten sidonta elementti kerrallaan
   unohtuisi ensimmäisen uuden napin kohdalla. */
document.addEventListener('click', (ev) => {
  const a = ev.target.closest && ev.target.closest('a[href^="#"]');
  if (!a || a.target === '_blank') return;
  const id = a.getAttribute('href').slice(1);
  if (!id) return;
  if (!scrollToId(id)) return;
  ev.preventDefault();
  /* Osoiterivi päivitetään silti: linkin voi kopioida ja paluu selaimen
     takaisin-napilla toimii kuten ennen. */
  history.pushState(null, '', '#' + id);
});

/* Suora saapuminen osoitteella (mainoslinkit vievät #varaa-ankkuriin).
   Sama vika koskee myös tätä: ilman varmistusta kävijä laskeutuu sivun
   alkuun eikä siihen kohtaan josta mainos lupasi. */
window.addEventListener('load', () => {
  const id = location.hash.slice(1);
  if (!id) return;
  /* Kolme yritystä, ei yksi: sivun korkeus muuttuu vielä latauksen jälkeen
     kun kuvat, fontit ja laskurin vaiheet asettuvat paikoilleen. Yhdellä
     vierityksellä kävijä päätyi kohteen ohi — mitattu 1 037 px yli, kun
     laskuriin tultiin kumppanisivun linkistä. Toistetaan kunnes kohde on
     oikeassa kohdassa tai yritykset loppuvat. */
  const yrita = (ms) => setTimeout(() => {
    const t = document.getElementById(id);
    if (!t) return;
    if (Math.abs(t.getBoundingClientRect().top - OFFSET) > 80) scrollToId(id);
  }, ms);
  [60, 500, 1200].forEach(yrita);
});

window.tkScrollToId = scrollToId;
