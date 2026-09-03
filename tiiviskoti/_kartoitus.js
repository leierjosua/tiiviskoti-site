/* =========================================================
   TiivisKoti — taloyhtiön veloituksettoman KARTOITUSKÄYNNIN varaus.

   YKSI LÄHDE KAHDELLE SIVULLE. Tätä käyttävät sekä `taloyhtio.html` että
   etusivun varauskortti (`_shared.js` → taloyhtiövälilehti). Moduuli omistaa
   sekä logiikan ETTÄ kalenterin ja lomakkeen markupin, koska pelkän logiikan
   jakaminen olisi jättänyt kaksi kopiota HTML:stä — ja ne erkanisivat
   toisistaan ensimmäisessä muutoksessa.

   Sivu antaa vain tyhjät säiliöt ja kertoo miten vaiheesta toiseen
   siirrytään (`goTo`). Vaihemoottori on sivun oma, koska etusivulla se on
   osa isompaa korttia ja taloyhtiösivulla oma korttinsa.

   Vapaat ajat tulevat CRM:n rajapinnasta, joka laskee ne kartoituskalenterin
   työajoista, poikkeuspäivistä ja jo varatuista käynneistä — ei koskaan
   arvottuna. Jos rajapinta ei vastaa, näytetään puhelinnumero eikä
   keksittyjä aikoja.
   ========================================================= */

const CRM_BASE = 'https://tiiviskoti-crm.vercel.app';

/* Kartoituskäynnin kesto. PIDÄ SYNKASSA CRM:n `KARTOITUS_MINUTES`-vakion
   kanssa (tiiviskoti-crm/src/lib/availability.ts) — muuten sivu tarjoaa eri
   mittaisia aikoja kuin kalenteriin varataan. CRM ei lue tätä lukua
   pyynnöstä, vaan käyttää aina omaansa. */
export const KARTOITUS_MIN = 20;

const MONTHS = ['tammikuu','helmikuu','maaliskuu','huhtikuu','toukokuu','kesäkuu','heinäkuu','elokuu','syyskuu','lokakuu','marraskuu','joulukuu'];
const WD = ['sunnuntai','maanantai','tiistai','keskiviikko','torstai','perjantai','lauantai'];

/* Ajat näytetään AINA Suomen aikaa, ei selaimen aikavyöhykkeellä: rajapinta
   palauttaa UTC:tä, ja `new Date(iso).getHours()` antaisi ulkomailla olevalle
   isännöitsijälle väärän kellonajan. */
const FI_TIME = new Intl.DateTimeFormat('fi-FI', { timeZone:'Europe/Helsinki', hour:'2-digit', minute:'2-digit', hour12:false });
const FI_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Helsinki', year:'numeric', month:'2-digit', day:'2-digit' });
const fiTime = (d) => FI_TIME.format(d).replace('.', ':');
const fiDateKey = (d) => FI_DATE.format(d);
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

/* ---------- markup ----------
   Renderöidään JS:stä, jotta kalenteri on olemassa täsmälleen yhtenä
   kappaleena. Luokat ovat samat kuin sivujen CSS:ssä (.bcal-head, .day,
   .slot, .bk-*), joten ulkoasu tulee sivulta eikä täältä. */

const CAL_HTML = `
  <div class="bcal-head">
    <button type="button" class="mnav" data-k="prev" aria-label="Edellinen kuukausi">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="mname" data-k="mname"></div>
    <button type="button" class="mnav" data-k="next" aria-label="Seuraava kuukausi">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
  <div class="dow"><span>Ma</span><span>Ti</span><span>Ke</span><span>To</span><span>Pe</span><span>La</span><span>Su</span></div>
  <div class="grid-days" data-k="grid"></div>
  <div class="slots-wrap">
    <div class="slots-title" data-k="slotstitle">Valitkaa päivä nähdäksenne vapaat ajat</div>
    <div class="slots" data-k="slots"></div>
  </div>
  <button type="button" class="btn btn-p btn-lg" data-k="todetails" style="width:100%;margin-top:18px" disabled>Valitkaa ensin aika</button>`;

const FORM_HTML = `
  <div class="steprecap">
    <div>
      <div class="when" data-k="when">—</div>
      <div class="svc">Veloitukseton kartoituskäynti · noin ${KARTOITUS_MIN} min</div>
    </div>
    <button type="button" class="chg" data-k="change">Vaihda aika</button>
  </div>
  <div class="bk-field"><label>Taloyhtiön nimi</label>
    <input class="bk-input" data-k="yhtio" placeholder="As Oy Esimerkki" /></div>
  <div class="bk-field"><label>Taloyhtiön katuosoite</label>
    <input class="bk-input" data-k="addr" placeholder="Esimerkkikuja 5" autocomplete="street-address" /></div>
  <div class="bk-row">
    <div class="bk-field"><label>Yhteyshenkilö</label>
      <input class="bk-input" data-k="contact" placeholder="Etu- ja sukunimi" autocomplete="name" /></div>
    <div class="bk-field"><label>Rooli</label>
      <select class="bk-input" data-k="role"><option>Isännöitsijä</option><option>Hallituksen puheenjohtaja</option><option>Hallituksen jäsen</option><option>Muu</option></select></div>
  </div>
  <div class="bk-row">
    <div class="bk-field"><label>Puhelin</label>
      <input class="bk-input" data-k="phone" type="tel" placeholder="045 123 4567" autocomplete="tel" /></div>
    <div class="bk-field"><label>Sähköposti</label>
      <input class="bk-input" data-k="email" type="email" placeholder="nimi@esimerkki.fi" autocomplete="email" /></div>
  </div>
  <div class="bk-field"><label>Ovien ja ikkunoiden määrä (arvio)</label>
    <select class="bk-input" data-k="doors"><option>En osaa sanoa</option><option>1–5 kpl</option><option>6–15 kpl</option><option>16–30 kpl</option><option>Yli 30 kpl</option></select></div>
  <div class="bk-err" data-k="err" style="display:none"></div>
  <button type="button" class="btn btn-p btn-lg" data-k="book" style="width:100%">Varaa ilmainen kartoituskäynti</button>
  <div class="bk-trust">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" stroke-width="1.8"/></svg>
    Käynti on veloitukseton eikä sido taloyhtiötä mihinkään · <a href="tietosuoja.html" data-k="privacy" style="text-decoration:underline;text-underline-offset:2px;color:inherit">Tietosuoja</a>
  </div>`;

const DONE_HTML = `
  <div class="ok"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <h3>Kartoituskäynti vahvistettu</h3>
  <div class="refno" data-k="ref">—</div>
  <p class="bsub" data-k="donetext" style="max-width:46ch;margin:8px auto 0"></p>`;

/**
 * @param {object} o
 * @param {HTMLElement} o.noteEl      palvelualueen tilalaatikko (vaihe 1)
 * @param {HTMLElement} o.calEl       kalenterin säiliö (vaihe 2)
 * @param {HTMLElement} o.formEl      lomakkeen säiliö (vaihe 3)
 * @param {HTMLElement} o.doneEl      vahvistuksen säiliö
 * @param {HTMLInputElement} o.postalEl postinumerokenttä
 * @param {HTMLElement} [o.continueEl] vaiheen 1 jatkonappi (disabloidaan kunnes aikoja on)
 * @param {(name:'cal'|'form'|'done')=>void} o.goTo vaiheensiirto — sivun oma
 * @param {string} [o.rootPrefix] polkuetuliite alikansiosivuille ("../")
 * @param {()=>string|undefined} [o.fbc] Meta-klikin tunnisteet CAPIa varten
 * @param {()=>string|undefined} [o.campaign] mainoskampanja (?src=, utm_*, klikkitunniste)
 * @param {()=>string|undefined} [o.gclid] Google Ads -klikin tunniste
 */
export function mountKartoitus(o) {
  const { noteEl, calEl, formEl, doneEl, postalEl, continueEl, goTo } = o;
  const fbc = o.fbc || (() => undefined);
  const fbp = o.fbp || (() => undefined);
  /* Kampanja kulkee varauksen mukana CRM:ään, jotta kartoituskäynnit voi
     lukea mainoskohtaisesti eikä vain yhtenä "verkosta tuli" -kasana. */
  const campaign = o.campaign || (() => undefined);
  const gclid = o.gclid || (() => undefined);
  const R = o.rootPrefix || '';

  calEl.innerHTML = CAL_HTML;
  formEl.innerHTML = FORM_HTML;
  doneEl.innerHTML = DONE_HTML;

  const q = (host, k) => host.querySelector(`[data-k="${k}"]`);
  // Aluesivut ovat alikansiossa, joten tietosuojalinkki tarvitsee etuliitteen.
  if (R) { const p = q(formEl, 'privacy'); if (p) p.setAttribute('href', R + 'tietosuoja.html'); }

  /* Tämän päivän raja Suomen ajassa, jottei ulkomailta katsottaessa kadoteta
     tai lisätä yhtä päivää kalenterin alkuun. */
  const todayKey = fiDateKey(new Date());
  const today = new Date(Number(todayKey.slice(0,4)), Number(todayKey.slice(5,7))-1, Number(todayKey.slice(8,10)));
  const maxDay = new Date(today); maxDay.setDate(maxDay.getDate() + 70);

  /* Postinumeron kohtalo mittaukseen — sama kuvio kuin varauspolussa
     (_shared.js `trackArea`). Ilman tätä taloyhtiöpolussa ei erotu se joka
     ei koskaan syöttänyt postinumeroa siitä jolle vastattiin "emme palvele":
     kummaltakin puuttuu vain seuraava vaihe. Sama postinumero ja tulos
     kirjataan kerran, koska haku ajetaan joka kerta kun kentässä on viisi
     numeroa. */
  let trackedArea = '';
  function trackArea(tulos) {
    if (!window.tkTrack) return;
    const avain = st.postal + ':' + tulos;
    if (trackedArea === avain) return;
    trackedArea = avain;
    window.tkTrack({ type: 'cta', cta: tulos });
  }

  /* state: 'postal' | 'loading' | 'ready' | 'none' | 'unserved' | 'error' */
  const st = { state:'postal', slotsByDay:new Map(), postal:'', area:null, leadRef:'', booked:false };
  let viewY = today.getFullYear(), viewM = today.getMonth(), selDay = null, selSlot = null;

  const freeSlots = (d) => (!d || d < today || d > maxDay) ? [] : (st.slotsByDay.get(keyOf(d)) || []);
  const selected = () => (!selDay || !selSlot) ? null : (freeSlots(selDay).find((s) => s.time === selSlot) || null);
  const fields = () => {
    const v = (k) => (q(formEl, k).value || '').trim();
    return { yhtio:v('yhtio'), addr:v('addr'), contact:v('contact'), role:v('role'),
             phone:v('phone'), email:v('email'), doors:v('doors') };
  };

  /* ---------- saatavuus ---------- */
  async function load() {
    if (!/^\d{5}$/.test(st.postal)) {
      st.state = 'postal'; st.slotsByDay = new Map(); st.area = null;
      selDay = null; selSlot = null; renderAll(); return;
    }
    st.state = 'loading'; renderAll();
    try {
      /* `kartoitus=1` hakee ajat kartoituskäyntien omasta kalenterista, ei
         asennuskalenterista. Ilman sitä sivu tarjoaisi asentajan maksullisia
         työaikoja veloituksettomaan käyntiin. */
      const r = await fetch(`${CRM_BASE}/api/public/availability?postal=${st.postal}&days=70&minutes=${KARTOITUS_MIN}&kartoitus=1`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (data.served === false) {
        trackArea('Kartoitus: ei palvella');
        st.state = 'unserved'; st.slotsByDay = new Map(); st.area = null;
        selDay = null; selSlot = null; renderAll(); return;
      }
      st.area = data.area ? data.area.name : null;
      const map = new Map();
      (data.slots || []).forEach((s) => {
        const k = fiDateKey(new Date(s.startsAt));
        if (!map.has(k)) map.set(k, []);
        map.get(k).push({ time: fiTime(new Date(s.startsAt)), startsAt: s.startsAt, calendarId: s.calendarId });
      });
      st.slotsByDay = map;
      st.state = map.size ? 'ready' : 'none';
      trackArea(map.size ? 'Kartoitus: palvellaan' : 'Kartoitus: ei vapaita aikoja');

      /* Sama hyppy ensimmäiseen vapaaseen päivään kuin varauskalenterissa
         (_shared.js) — perustelu siellä. Kartoituskäynnillä tämä on jos
         mahdollista vielä tärkeämpi: taloyhtiön yhteyshenkilö käy sivulla
         kerran, työajan lomassa. */
      const jumpNeeded = !selDay || !(map.get(keyOf(selDay)) || []).length;
      if (map.size && jumpNeeded) {
        const [y, m, dd] = [...map.keys()].sort()[0].split('-').map(Number);
        const firstFree = new Date(y, m - 1, dd); firstFree.setHours(0, 0, 0, 0);
        viewY = firstFree.getFullYear(); viewM = firstFree.getMonth();
        selDay = firstFree; selSlot = null;
      }
    } catch (_) { trackArea('Kartoitus: tarkistus epäonnistui'); st.state = 'error'; }
    // Valittu aika voi kadota päivityksessä (joku ehti varata sen).
    if (selDay && selSlot && !freeSlots(selDay).some((s) => s.time === selSlot)) selSlot = null;
    renderAll();
  }

  /* ---------- renderöinti ----------
     Huomiolaatikon rakenne on sama kuin etusivun aluehuomiossa: `<b>`
     otsikoksi ja `<span>` selitteeksi, jotta `.area-note`-tyylit osuvat. */
  function renderNote() {
    if (!noteEl) return;
    const s = st.state;
    const tel = '<a href="tel:+358458755996">045 875 5996</a>';
    if (s === 'postal') { noteEl.className = 'area-note';
      noteEl.innerHTML = '<b>Syötä postinumero</b><span>Kartoituskäynneillä on oma kalenterinsa — näytämme vapaat ajat heti.</span>'; return; }
    if (s === 'loading') { noteEl.className = 'area-note'; noteEl.innerHTML = '<b>Tarkistetaan aluetta…</b>'; return; }
    if (s === 'unserved') { noteEl.className = 'area-note bad';
      noteEl.innerHTML = `<b>Emme vielä palvele postinumerossa ${st.postal}</b><span>Otamme mielellämme yhteyttä kun laajennumme alueellenne — soittakaa ${tel}.</span>`; return; }
    if (s === 'error') { noteEl.className = 'area-note bad';
      noteEl.innerHTML = `<b>Alueen tarkistus ei onnistunut</b><span>Soittakaa ${tel}, niin sovitaan aika puhelimessa.</span>`; return; }
    if (s === 'none') { noteEl.className = 'area-note bad';
      noteEl.innerHTML = `<b>Kalenteri on täynnä seuraavien viikkojen osalta</b><span>Soittakaa ${tel}, niin etsimme ajan yhdessä.</span>`; return; }
    noteEl.className = 'area-note ok';
    noteEl.innerHTML = `<b>Palvelemme postinumerossa ${st.postal}${st.area ? ` · ${st.area}` : ''}</b><span>Käynti kestää noin ${KARTOITUS_MIN} minuuttia eikä maksa mitään.</span>`;
  }

  function renderCal() {
    const grid = q(calEl, 'grid');
    q(calEl, 'mname').textContent = `${MONTHS[viewM]} ${viewY}`;
    let startDow = new Date(viewY, viewM, 1).getDay(); startDow = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    grid.innerHTML = '';
    for (let i = 0; i < startDow; i++) {
      const e = document.createElement('div'); e.className = 'day empty'; grid.appendChild(e);
    }
    for (let dn = 1; dn <= daysInMonth; dn++) {
      const d = new Date(viewY, viewM, dn);
      const el = document.createElement('button'); el.type = 'button'; el.textContent = dn;
      const isToday = d.getTime() === today.getTime(); if (isToday) el.classList.add('today');
      if (d < today || d > maxDay) { el.className = 'day off' + (isToday ? ' today' : ''); el.disabled = true; grid.appendChild(el); continue; }
      const free = freeSlots(d);
      if (free.length === 0) { el.className = 'day full' + (isToday ? ' today' : ''); el.disabled = true; }
      else {
        el.className = 'day free' + (isToday ? ' today' : '');
        const dot = document.createElement('span'); dot.className = 'dot'; el.appendChild(dot);
        if (selDay && keyOf(selDay) === keyOf(d)) el.classList.add('sel');
        el.addEventListener('click', () => { selDay = d; selSlot = null; renderCal(); renderSlots(); renderCta(); });
      }
      grid.appendChild(el);
    }
    q(calEl, 'prev').disabled = (viewY === today.getFullYear() && viewM === today.getMonth());
  }

  function renderSlots() {
    const wrap = q(calEl, 'slots'), title = q(calEl, 'slotstitle');
    wrap.innerHTML = '';
    if (!selDay) { title.textContent = 'Valitkaa päivä nähdäksenne vapaat ajat'; return; }
    const free = freeSlots(selDay);
    title.textContent = `Vapaat ajat — ${WD[selDay.getDay()]} ${selDay.getDate()}.${selDay.getMonth()+1}.`;
    if (free.length === 0) { wrap.innerHTML = '<div class="slots-empty">Ei vapaita aikoja tänä päivänä. Valitkaa toinen päivä.</div>'; return; }
    free.forEach((s) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'slot' + (selSlot === s.time ? ' sel' : ''); b.textContent = s.time;
      b.addEventListener('click', () => { selSlot = s.time; renderSlots(); renderCta(); });
      wrap.appendChild(b);
    });
  }

  function renderCta() {
    const sel = selected();
    // Siirtyminen on oma tekonsa, jotta valitun ajan voi vielä vaihtaa
    // ennen kuin näkymä vaihtuu.
    const next = q(calEl, 'todetails');
    next.disabled = !sel;
    next.textContent = sel
      ? `Jatka — ${WD[selDay.getDay()].slice(0,2)} ${selDay.getDate()}.${selDay.getMonth()+1}. klo ${sel.time}`
      : 'Valitkaa ensin aika';
    // Vaiheen 1 jatkonappi aukeaa vasta kun aikoja on oikeasti löytynyt.
    if (continueEl) continueEl.disabled = st.state !== 'ready';
    // Kooste vaiheessa 3: valittu aika on esillä myös kun kalenteri ei näy.
    q(formEl, 'when').textContent = sel
      ? `${WD[selDay.getDay()]} ${selDay.getDate()}.${selDay.getMonth()+1}. klo ${sel.time}`
      : '—';
  }

  function renderAll() { renderNote(); renderCal(); renderSlots(); renderCta(); }

  /* ---------- liidi ja varaus ----------
     Liidi tallennetaan kerran ja vain kerran. Jos ajan varaus kaatuu ja
     asiakas yrittää uudelleen, samaa yhteydenottoa ei kirjata kahdesti —
     mutta ensimmäinen yritys on jo turvannut liidin. */
  async function ensureLead(f) {
    if (st.leadRef) return st.leadRef;
    try {
      const r = await fetch('/api/create-lead', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          yhtio:f.yhtio, contact:f.contact, role:f.role, phone:f.phone, email:f.email,
          addr:`${f.addr}, ${st.postal}`, doors:f.doors,
          message:'Varasi kartoituskäynnin verkosta.',
          pageUrl: location.href, fbc: fbc(), fbp: fbp(),
          campaign: campaign(), gclid: gclid(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok && d.ref) { st.leadRef = d.ref; return d.ref; }
    } catch (_) { /* Liidin kaatuminen ei saa estää ajan varausta. */ }
    return '';
  }

  async function book() {
    const sel = selected(); if (!sel) return;
    const err = q(formEl, 'err'), btn = q(formEl, 'book');
    const f = fields();

    const missing = [];
    if (!f.yhtio) missing.push('taloyhtiön nimi');
    if (!f.addr) missing.push('katuosoite');
    if (!f.contact) missing.push('yhteyshenkilö');
    if (!f.phone) missing.push('puhelin');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) missing.push('sähköposti');
    if (missing.length) {
      err.textContent = `Täyttäkää vielä: ${missing.join(', ')}.`;
      err.style.display = 'block';
      q(formEl, missing[0] === 'sähköposti' ? 'email' : 'yhtio').focus();
      return;
    }

    err.style.display = 'none';
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Varataan…';

    // Liidi ensin: jos ajan varaus epäonnistuu, yhteydenotto on silti tallessa.
    await ensureLead(f);

    try {
      const r = await fetch('/api/create-kartoitus', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          calendarId: sel.calendarId, startsAt: sel.startsAt,
          association: f.yhtio, contactName: f.contact, role: f.role,
          email: f.email, phone: f.phone,
          address: f.addr, postal: st.postal,
          doors: f.doors, leadRef: st.leadRef,
          fbc: fbc(), fbp: fbp(),
          campaign: campaign(), gclid: gclid(),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        /* Aika ehdittiin varata tai alue ei ole meidän — kumpikin vaatii oman
           viestinsä, muuten asiakkaalle valitetaan väärästä asiasta. */
        if (data.error === 'slot_taken') {
          err.textContent = 'Valitettavasti tuo aika ehdittiin juuri varata. Valitkaa toinen aika kalenterista.';
          err.style.display = 'block';
          selSlot = null; btn.disabled = false; btn.textContent = label;
          await load(); goTo('cal'); return;
        }
        if (data.error === 'area_not_served' || data.error === 'calendar_not_kartoitus') {
          err.textContent = 'Emme valitettavasti palvele tätä aluetta vielä. Yhteydenottonne on tallessa ja olemme teihin yhteydessä.';
        } else if (data.error === 'in_past') {
          err.textContent = 'Valittu aika on jo mennyt. Valitkaa uusi aika kalenterista.';
          selSlot = null; await load();
        } else {
          err.textContent = 'Ajan varaus ei onnistunut. Yhteydenottonne on silti tallessa ja otamme yhteyttä — tai soittakaa 045 875 5996.';
        }
        err.style.display = 'block';
        btn.disabled = false; btn.textContent = label;
        return;
      }
      st.booked = true;
      q(doneEl, 'ref').textContent = data.ref;
      q(doneEl, 'donetext').textContent =
        `Nähdään ${WD[selDay.getDay()]}na ${selDay.getDate()}.${selDay.getMonth()+1}. klo ${sel.time} osoitteessa ${f.addr}, ${st.postal}. ` +
        `Lähetimme vahvistuksen osoitteeseen ${f.email}. ` +
        `Varmistattehan, että pääsemme rappukäytäviin ja yhteistiloihin käynnin aikana.`;
      goTo('done');
    } catch (_) {
      err.textContent = 'Yhteysvirhe. Yhteydenottonne on tallessa ja otamme yhteyttä — tai soittakaa 045 875 5996.';
      err.style.display = 'block';
      btn.disabled = false; btn.textContent = label;
    }
  }

  /* ---------- kytkennät ---------- */
  q(calEl, 'prev').addEventListener('click', () => { if (viewM === 0) { viewM = 11; viewY--; } else viewM--; renderCal(); });
  q(calEl, 'next').addEventListener('click', () => { if (viewM === 11) { viewM = 0; viewY++; } else viewM++; renderCal(); });
  q(calEl, 'todetails').addEventListener('click', () => { if (selected()) goTo('form'); });
  q(formEl, 'change').addEventListener('click', () => goTo('cal'));
  q(formEl, 'book').addEventListener('click', book);

  if (postalEl) {
    postalEl.addEventListener('input', (e) => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 5);
      e.target.value = v;
      /* Haku käynnistyy heti viidennestä numerosta, mutta vaihe EI vaihdu
         itsestään: asiakas näkee ensin palvellaanko häntä ja painaa sitten
         itse eteenpäin. Automaattinen hyppy veisi näkyvistä juuri sen tiedon
         jota hän odotti. */
      if (v.length === 5) { st.postal = v; load(); }
      else { st.state = 'postal'; st.slotsByDay = new Map(); st.area = null; renderAll(); }
    });
    postalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (st.state === 'ready') goTo('cal'); }
    });
  }

  renderAll();

  return {
    state: () => st.state,
    isBooked: () => st.booked,
    /** Asettaa postinumeron ja hakee ajat (esim. ?pn= tai toiselta sivulta). */
    async setPostal(pn) {
      const v = String(pn || '').replace(/\D/g, '').slice(0, 5);
      if (v.length !== 5) return false;
      if (postalEl) postalEl.value = v;
      st.postal = v;
      await load();
      return st.state === 'ready';
    },
    /** Esitäyttö tarjouspyyntölomakkeesta, jottei samoja tietoja anneta kahdesti. */
    prefill(p, ref) {
      if (ref) st.leadRef = ref;
      const set = (k, val) => { if (val) q(formEl, k).value = val; };
      set('yhtio', p.yhtio); set('addr', p.addr); set('contact', p.contact);
      set('role', p.role); set('phone', p.phone); set('email', p.email); set('doors', p.doors);
      const m = String(p.addr || '').match(/\b(\d{5})\b/);
      if (m && m[1] !== st.postal) this.setPostal(m[1]);
    },
    /** Nollaa valinnan mutta ei kenttiä — käytetään kun polkua vaihdetaan. */
    resetSelection() { selDay = null; selSlot = null; renderAll(); },
    /** Unohtaa liidin viitteen, jotta seuraava yhteydenotto kirjautuu omanaan. */
    forgetLead() { st.leadRef = ''; },
  };
}
