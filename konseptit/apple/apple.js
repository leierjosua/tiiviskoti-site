// Scroll-reveal + esikatselujen välinen valitsin (vain esikatselua varten).
(() => {
  const els = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
  } else els.forEach((el) => el.classList.add('in'));

  const pages = [
    ['1-galleria.html', '1 Galleria'],
    ['2-selkea.html', '2 Selkeä'],
    ['3-kauppa.html', '3 Kauppa'],
    ['4-ilta.html', '4 Ilta'],
    ['5-puhelin.html', '5 Puhelin'],
  ];
  const here = location.pathname.split('/').pop();
  const bar = document.createElement('nav');
  bar.className = 'pv';
  bar.setAttribute('aria-label', 'Esikatselut');
  bar.innerHTML = pages.map(([f, t]) =>
    `<a href="${f}"${f === here ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  document.body.append(bar);
})();

// Hinnoittelu — sama kuin tiiviskoti/pricing.mjs (porrastus, minimi, kotitalousvähennys).
window.tkPrice = function ({ win = 0, door = 0, slide = 0, inner = 0 }) {
  const tier = win >= 14 ? 75 : win >= 10 ? 80 : win >= 5 ? 85 : 90;
  const innerEach = win + door + slide + inner > 1 ? 59 : 89;
  const sum = win * tier + door * 99 + slide * 149 + inner * innerEach;
  const total = sum > 0 ? Math.max(149, sum) : 0;
  const ded = Math.max(0, Math.min(2100, total * 0.9 * 0.4 - 150));
  return { tier, total, net: Math.round(total - ded) };
};
window.tkEur = (n) => n.toLocaleString('fi-FI') + ' €';
