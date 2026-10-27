/* Etusivu (body.selkea): valikon tila ruudunlukijalle + yhteydenottolomake.
   Lomake lähettää täsmälleen saman sisällön kuin ota-yhteytta.html
   (kind:'yksityinen' → CRM:n kuluttajajono), jotta kaksi lomaketta ei
   hajaannu eri muotoihin. */

const burger = document.getElementById('burger');
const links = document.getElementById('nlinks');
if (burger && links) {
  /* _shared.js vaihtaa .op-luokan; tässä vain kerrotaan tila ja nimi. */
  const sync = () => {
    const open = links.classList.contains('op');
    burger.setAttribute('aria-expanded', String(open));
    burger.querySelector('b').textContent = open ? 'Sulje' : 'Valikko';
  };
  new MutationObserver(sync).observe(links, { attributes: true, attributeFilter: ['class'] });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && links.classList.contains('op')) { links.classList.remove('op'); burger.focus(); }
  });
}

const form = document.getElementById('yhForm');
if (form) {
  const err = document.getElementById('yhErr');
  const ok = document.getElementById('yhOk');
  const nappi = document.getElementById('yhSubmit');
  const virhe = (teksti, kentta) => {
    err.textContent = teksti; err.hidden = false;
    if (kentta) document.getElementById(kentta).focus();
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    const v = (id) => document.getElementById(id).value.trim();
    /* Yksi kenttä puhelimelle TAI sähköpostille: @-merkki ratkaisee kumpi. */
    const yhteys = v('yhPhone'), onEmail = yhteys.includes('@');
    const data = { kind: 'yksityinen', contact: v('yhName'),
      phone: onEmail ? '' : yhteys, email: onEmail ? yhteys : v('yhEmail'),
      addr: v('yhAddr'), message: v('yhMsg'), pageUrl: location.href };
    if (!data.contact) return virhe('Kirjoita nimesi, niin tiedämme kenelle vastata.', 'yhName');
    if (!data.phone && !data.email) return virhe('Anna puhelinnumero tai sähköposti, jotta voimme vastata.', 'yhPhone');
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return virhe('Kirjoita sähköposti muodossa nimi@esimerkki.fi tai anna puhelinnumero.', 'yhPhone');
    nappi.disabled = true; nappi.textContent = 'Lähetetään…';
    try {
      const r = await fetch('/api/create-lead', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'fail');
      form.hidden = true; ok.hidden = false; ok.setAttribute('tabindex', '-1'); ok.focus();
    } catch (_) {
      virhe('Viestin lähetys ei onnistunut. Yritä hetken kuluttua uudelleen tai soita 045 7831 1972.');
      nappi.disabled = false; nappi.textContent = 'Lähetä viesti';
    }
  });
}
