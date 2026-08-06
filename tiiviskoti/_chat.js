/* =========================================================
   TiivisKoti — "Tarvitsetko apua?" -ponnahdusikkuna

   Kaksi polkua: varaus (hintalaskuriin) ja kysymys (lomake, johon
   vastataan sähköpostilla). Kysymys menee api/ask.mjs:n kautta samaan
   `form_submissions`-tauluun kuin taloyhtiöliidit, eli se näkyy adminin
   Liidit-näkymässä eikä jää pelkän sähköpostin varaan.

   OMA TIEDOSTONSA ja tyylit JS:stä, koska sivuja on kuusi ja kullakin on
   oma inline-<style>. CSS:n kopiointi kuuteen paikkaan hajoaisi
   ensimmäisessä muutoksessa.

   EI AUKEA ITSESTÄÄN. Automaattisesti avautuva chat peittää sisällön ja
   ärsyttää; nappi riittää kutsuksi.

   Väripaletti tulee sivun :root-muuttujista. Fallback-arvot ovat mukana,
   jottei widget mene rikki sivulla jolta jokin muuttuja puuttuu.
   ========================================================= */

(function () {
  if (document.getElementById('tkChat')) return;      // ei kahdesti

  /* Varausnappi vie hintalaskuriin. Etusivulla se on ankkuri samalla
     sivulla, muualla linkki etusivulle — laskuri on vain siellä. */
  const LASKURI = document.getElementById('laskuri') ? '#laskuri' : 'index.html#laskuri';

  const css = `
#tkChat{position:fixed;right:16px;bottom:16px;z-index:90;
  font-family:inherit;display:flex;flex-direction:column;align-items:flex-end;gap:10px}
#tkChat.lift{bottom:calc(16px + var(--tk-mcta,72px))}
#tkChat *{box-sizing:border-box}

.tkc-fab{display:inline-flex;align-items:center;gap:9px;border:0;cursor:pointer;
  background:var(--green,#217A4E);color:#fff;font-family:inherit;font-weight:700;
  font-size:15px;padding:13px 19px;border-radius:99px;
  box-shadow:0 6px 22px rgba(22,58,40,.28);transition:transform .18s,background .18s}
.tkc-fab:hover{background:var(--deep,#163A28);transform:translateY(-1px)}
.tkc-fab svg{width:20px;height:20px;flex:none}
.tkc-fab .x{display:none}
#tkChat.open .tkc-fab .t,#tkChat.open .tkc-fab .c{display:none}
#tkChat.open .tkc-fab .x{display:block}
#tkChat.open .tkc-fab{padding:13px;background:var(--deep,#163A28)}

.tkc-panel{width:min(340px,calc(100vw - 32px));background:var(--card,#fff);
  border:1px solid var(--line,#E4E8E0);border-radius:18px;overflow:hidden;
  box-shadow:0 18px 50px rgba(22,58,40,.22);
  opacity:0;transform:translateY(10px) scale(.98);pointer-events:none;
  transition:opacity .2s,transform .2s}
#tkChat.open .tkc-panel{opacity:1;transform:none;pointer-events:auto}

.tkc-head{background:var(--deep,#163A28);color:#fff;padding:16px 18px}
/* Väri on pakko sanoa: sivuilla on globaali b,strong{color:var(--ink)},
   joka muuten maalaisi otsikon tummanvihreäksi tummanvihreälle pohjalle. */
.tkc-head b{display:block;font-size:16px;font-weight:800;letter-spacing:-.01em;color:#fff}
.tkc-head span{display:block;margin-top:3px;font-size:13px;color:rgba(255,255,255,.72)}
.tkc-body{padding:14px}

.tkc-opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;
  background:var(--bg,#F6F7F3);border:1px solid var(--line,#E4E8E0);border-radius:13px;
  padding:13px 14px;margin-bottom:9px;cursor:pointer;font-family:inherit;color:inherit;
  text-decoration:none;transition:border-color .16s,background .16s}
.tkc-opt:hover{border-color:var(--green,#217A4E);background:#fff}
.tkc-opt .ic{flex:none;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;
  background:var(--green,#217A4E);color:#fff}
.tkc-opt .ic svg{width:18px;height:18px}
.tkc-opt b{display:block;font-size:14.5px;font-weight:700;color:var(--ink,#183A28)}
.tkc-opt span{display:block;font-size:12.5px;color:var(--mute,#7B857D);margin-top:1px}

.tkc-field{margin-bottom:9px}
.tkc-field label{display:block;font-size:12.5px;font-weight:700;
  color:var(--ink,#183A28);margin-bottom:4px}
.tkc-field input,.tkc-field textarea{width:100%;font-family:inherit;font-size:14.5px;
  color:var(--ink,#183A28);background:var(--bg,#F6F7F3);
  border:1px solid var(--line,#E4E8E0);border-radius:10px;padding:10px 12px}
.tkc-field textarea{resize:vertical;min-height:78px}
.tkc-field input:focus,.tkc-field textarea:focus{outline:2px solid var(--green,#217A4E);
  outline-offset:-1px;background:#fff}
.tkc-send{width:100%;border:0;cursor:pointer;background:var(--green,#217A4E);color:#fff;
  font-family:inherit;font-weight:800;font-size:15px;padding:13px;border-radius:11px}
.tkc-send:hover{background:var(--deep,#163A28)}
.tkc-send:disabled{opacity:.6;cursor:default}
.tkc-back{background:none;border:0;cursor:pointer;font-family:inherit;font-size:13px;
  color:var(--mute,#7B857D);padding:8px 0 2px;text-decoration:underline}
.tkc-err{font-size:13px;color:#B3261E;margin-bottom:8px}
.tkc-fine{font-size:11.5px;line-height:1.45;color:var(--mute,#7B857D);margin-top:9px}
.tkc-fine a{color:inherit}
.tkc-ok{text-align:center;padding:8px 4px 4px}
.tkc-ok .tick{width:46px;height:46px;border-radius:99px;background:var(--green,#217A4E);
  color:#fff;display:grid;place-items:center;margin:0 auto 11px}
.tkc-ok .tick svg{width:24px;height:24px}
.tkc-ok b{display:block;font-size:16px;color:var(--ink,#183A28)}
.tkc-ok p{font-size:13.5px;color:var(--mute,#7B857D);margin:6px 0 0;line-height:1.5}

/* Piilotettu hunajapurkki: robotit täyttävät sen, ihmiset eivät näe sitä. */
.tkc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}

@media (max-width:420px){
  #tkChat{right:12px;bottom:12px}
  .tkc-fab{font-size:14px;padding:12px 16px}
}
@media (prefers-reduced-motion:reduce){
  .tkc-fab,.tkc-panel{transition:none}
}`;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const ico = {
    chat: '<svg viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-3.9-.9L3 20.5l1.6-4.6A8.4 8.4 0 013 11.5a8.4 8.4 0 019-8.4 8.4 8.4 0 019 8.4z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    close: '<svg class="x" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9 6 9-6M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const root = document.createElement('div');
  root.id = 'tkChat';
  root.innerHTML = `
    <div class="tkc-panel" id="tkcPanel" role="dialog" aria-modal="false"
         aria-labelledby="tkcTitle" hidden>
      <div class="tkc-head">
        <b id="tkcTitle">Miten voimme auttaa?</b>
        <span>Vastaamme arkisin saman päivän aikana.</span>
      </div>
      <div class="tkc-body" id="tkcBody"></div>
    </div>
    <button class="tkc-fab" id="tkcFab" type="button"
            aria-expanded="false" aria-controls="tkcPanel">
      <span class="c">${ico.chat}</span>${ico.close}<span class="t">Tarvitsetko apua?</span>
    </button>`;
  document.body.appendChild(root);

  const fab   = root.querySelector('#tkcFab');
  const panel = root.querySelector('#tkcPanel');
  const body  = root.querySelector('#tkcBody');

  /* ---------- näkymät ---------- */
  const viewMenu = () => {
    body.innerHTML = `
      <a class="tkc-opt" href="${LASKURI}" id="tkcBook">
        <span class="ic">${ico.cal}</span>
        <span><b>Varaa aika</b><span>Laske hinta ja valitse aika verkosta</span></span>
      </a>
      <button class="tkc-opt" type="button" id="tkcAsk">
        <span class="ic">${ico.mail}</span>
        <span><b>Kysy meiltä</b><span>Vastaamme sähköpostilla</span></span>
      </button>`;
    body.querySelector('#tkcAsk').addEventListener('click', viewForm);
    body.querySelector('#tkcBook').addEventListener('click', () => close(false));
    return body.querySelector('#tkcBook');
  };

  const viewForm = () => {
    body.innerHTML = `
      <form id="tkcForm" novalidate>
        <div class="tkc-err" id="tkcErr" style="display:none"></div>
        <div class="tkc-field">
          <label for="tkcName">Nimi</label>
          <input id="tkcName" name="name" autocomplete="name" maxlength="200" required>
        </div>
        <div class="tkc-field">
          <label for="tkcEmail">Sähköposti</label>
          <input id="tkcEmail" name="email" type="email" inputmode="email"
                 autocomplete="email" maxlength="200" required>
        </div>
        <div class="tkc-field">
          <label for="tkcMsg">Kysymyksesi</label>
          <textarea id="tkcMsg" name="message" maxlength="4000" required
                    placeholder="Esim. montako ikkunaa ehditte tiivistää yhdellä käynnillä?"></textarea>
        </div>
        <input class="tkc-hp" id="tkcHp" name="yritys" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="tkc-send" type="submit" id="tkcSend">Lähetä kysymys</button>
        <button class="tkc-back" type="button" id="tkcBack">← Takaisin</button>
        <p class="tkc-fine">Käsittelemme tietosi
          <a href="tietosuoja.html">tietosuojaselosteen</a> mukaisesti.</p>
      </form>`;
    body.querySelector('#tkcBack').addEventListener('click', () => viewMenu().focus());
    body.querySelector('#tkcForm').addEventListener('submit', submit);
    body.querySelector('#tkcName').focus();
  };

  const viewSent = (ref) => {
    body.innerHTML = `
      <div class="tkc-ok">
        <div class="tick">${ico.tick}</div>
        <b>Kiitos, viesti lähti!</b>
        <p>Vastaamme sähköpostiisi arkisin saman päivän aikana.<br>
           Viite <strong>${ref}</strong></p>
      </div>`;
  };

  /* ---------- lähetys ---------- */
  async function submit(e) {
    e.preventDefault();
    const err  = body.querySelector('#tkcErr');
    const send = body.querySelector('#tkcSend');
    const val  = (id) => body.querySelector(id).value.trim();
    const näytä = (m) => { err.textContent = m; err.style.display = 'block'; };

    /* Hunajapurkki täytettynä = robotti. Näytetään sama kiitos kuin
       ihmiselle: virheilmoitus kertoisi mikä kenttä paljasti sen. */
    if (body.querySelector('#tkcHp').value) { viewSent('TK-KYS-000000'); return; }

    const data = {
      name: val('#tkcName'),
      email: val('#tkcEmail'),
      message: val('#tkcMsg'),
      pageUrl: location.href.slice(0, 500),
    };
    if (!data.name) return näytä('Kerro nimesi, jotta tiedämme kenelle vastaamme.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return näytä('Tarkista sähköpostiosoite.');
    if (!data.message) return näytä('Kirjoita kysymyksesi.');

    /* Mainoskampanja mukaan, jos kävijä tuli mainoslinkistä. Sama avain
       kuin varauksissa (_shared.js), mutta luetaan tässä erikseen: chat on
       sivuilla joilla _shared.js:ää ei ole lainkaan. */
    try {
      const s = JSON.parse(localStorage.getItem('tk_campaign') || 'null');
      if (s && s.v && Date.now() - (s.t || 0) < 30 * 864e5) data.campaign = s.v;
    } catch (_) { /* ei kampanjaa */ }

    err.style.display = 'none';
    send.disabled = true;
    send.textContent = 'Lähetetään…';
    try {
      const r = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'fail');
      viewSent(j.ref || '');
    } catch (_) {
      send.disabled = false;
      send.textContent = 'Lähetä kysymys';
      näytä('Viestin lähetys ei onnistunut. Soita 045 875 5996 tai kirjoita info@tiiviskoti.fi.');
    }
  }

  /* ---------- avaus ja sulku ---------- */
  let palautaFokus = false;

  function open() {
    panel.hidden = false;
    root.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');
    viewMenu();
    palautaFokus = true;
    panel.querySelector('a,button').focus();
  }

  function close(focusFab = true) {
    root.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
    /* hidden vasta animaation jälkeen, jottei paneeli katoa nykäyksellä */
    setTimeout(() => { if (!root.classList.contains('open')) panel.hidden = true; }, 200);
    if (focusFab && palautaFokus) fab.focus();
    palautaFokus = false;
  }

  fab.addEventListener('click', () => (root.classList.contains('open') ? close() : open()));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('open')) close();
  });
  /* Ulkopuolinen klikkaus tunnistetaan pointerdownista eikä clickistä.
     Näkymänvaihto korvaa paneelin sisällön innerHTML:llä, jolloin klikattu
     nappi on jo poistettu DOM:sta siinä vaiheessa kun click kuplii tänne —
     root.contains(e.target) olisi silloin epätosi ja paneeli sulkeutuisi
     heti auettuaan. pointerdown tapahtuu ennen mitään muutoksia. */
  document.addEventListener('pointerdown', (e) => {
    if (root.classList.contains('open') && !root.contains(e.target)) close(false);
  });

  /* ---------- mobiilin CTA-palkki ----------
     Palkki (.mcta) nousee ruudun pohjalle ja peittäisi napin. Sitä ei voi
     havaita CSS:llä, koska palkki on widgetin sisarus eikä esivanhempi,
     joten seurataan sen luokkaa ja nostetaan nappi palkin verran ylös. */
  const mcta = document.querySelector('.mcta');
  if (mcta) {
    const seuraa = () => {
      const näkyy = mcta.classList.contains('show');
      root.style.setProperty('--tk-mcta', mcta.offsetHeight + 'px');
      root.classList.toggle('lift', näkyy);
    };
    new MutationObserver(seuraa).observe(mcta, { attributes: true, attributeFilter: ['class'] });
    seuraa();
  }
})();
