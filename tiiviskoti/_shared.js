/* =========================================================
   TiivisKoti — shared functionality for all visions.
   Design-agnostic: only touches DOM by id/class, no colors.
   Kaikki lohkot on suojattu: laskuri, kalenteri, FAQ ja lomake
   ajetaan vain jos niiden DOM-elementit ovat sivulla.

   Hinnat EIVÄT ole täällä — ne tulevat pricing.mjs:stä, jota myös
   api/create-booking.mjs käyttää. Näin laskurin näyttämä ja veloitettava
   hinta lasketaan samasta koodista eivätkä voi erota toisistaan.
   ========================================================= */
import { TYPES, EXTRAS, NET_FACTOR, computePricing, unitPriceFor, tierPriceFor } from './pricing.mjs';

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

const FAQ = [
  ['Paljonko tiivistys maksaa?','Pienin veloitus on 149 €, joka kattaa käynnin, matkat, kartoituksen ja lämpökamerakuvauksen. Sen jälkeen hinta muodostuu valitsemistasi kohteista kiinteillä hinnoilla. Ikkuna maksaa 95 € kappaleelta, ja hinta laskee määrän mukaan: 5–9 ikkunaa 85 €, 10–19 ikkunaa 75 € ja 20 ikkunasta ylöspäin 65 € kappaleelta. Ulko- ja parvekeovi on 119 €, terassin liuku- tai pariovi 149 €. Esimerkiksi yksi ikkuna on 149 € (minimiveloitus) ja kuusi ikkunaa 6 × 85 € = 510 €. Näet kokonaishinnan heti laskurista, ja kotitalousvähennys pienentää työn osuutta jopa 40 %.'],
  ['Miksi ovi on halvempi kun tilaan samalla muutakin?','Suurin yksittäinen kustannus pienessä työssä on matka ja työpisteen pystytys. Kun asentaja on jo paikalla, seuraava kohde maksaa vähemmän: ulko- ja parvekeovi 119 € → 99 € ja väli- tai huoneovi 89 € → 59 €, kun samaan käyntiin kuuluu vähintään yksi muu ovi tai ikkuna. Laskuri huomioi tämän automaattisesti.'],
  ['Mitä tiivisteiden vaihtoon sisältyy?','Vanhojen tiivisteiden poisto, pintojen puhdistus, uudet EPDM- tai silikonitiivisteet sekä oven käynnin säätö niin, että ovi painuu tasaisesti tiivisteitä vasten. Ulko-oviin kuuluu myös kynnyskumi.'],
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
       <div class="wtype-top"><div class="wtype-name">${t.name}</div><div class="wtype-desc">${t.desc}${t.tiers?`<span class="wtype-tier">${TIER_HINT}</span>`:''}</div><span class="wtype-price" data-p="${t.id}">${t.price} €/kpl</span></div>
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
  tweenPrice(q.total);
  document.getElementById('cpNet').textContent = (q.total>0?Math.round(q.total*NET_FACTOR).toLocaleString('fi-FI'):'0')+' €';
  document.getElementById('cpCount').textContent = q.count;
  const hrs = q.minutes/60;
  document.getElementById('cpTime').textContent = q.total===0?'0 h':(hrs<1?Math.round(q.minutes)+' min':(Math.round(hrs*2)/2).toLocaleString('fi-FI')+' h');
  const btn=document.getElementById('cpBtn'), active = q.total>0;
  btn.style.pointerEvents=active?'auto':'none'; btn.style.opacity=active?'1':'.5';
  if('disabled' in btn) btn.disabled=!active;
}

/* ---------- FAQ ---------- */
const faqEl=document.getElementById('faq');
if(faqEl){
  FAQ.forEach(([q,a])=>{
    const d=document.createElement('div'); d.className='q';
    d.innerHTML=`<button type="button">${q}<svg class="cv" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button><div class="a"><p>${a}</p></div>`;
    faqEl.appendChild(d);
  });
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
  }catch(_){
    avail.state = 'error';
  }
  renderAreaNote();
  /* Valittu aika voi kadota päivityksessä (kesto muuttui tai joku ehti
     varata sen), joten valinta nollataan jos se ei enää ole tarjolla. */
  if(selDay && selSlot && !freeSlots(selDay).some(s=>s.time===selSlot)){ selSlot=null; }
  renderCal(); renderSlots(); syncBookingSummary();
  /* Alue voi tuoda matkalisän, joka muuttaa kortissa näkyvää summaa. */
  if(window.__renderGatePrice) window.__renderGatePrice();
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
        body:JSON.stringify({ name, phone, email, postal:avail.postal }),
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
/* Vaiheet luetaan DOM:ista, jolloin sama moottori ajaa etusivun täyden polun
   (laskuri → postinumero → aika → tiedot → valmis) ja ajanvaraus.html:n
   lyhyemmän polun ilman erillistä koodia. Kukin vaihe kertoo itse otsikkonsa,
   paluulinkkinsä ja tarvitseeko se leveän kortin. */
const stepNodes = stepCard ? [...stepCard.children].filter(n=>n.hasAttribute('data-step')) : [];
const stepIdx = name => stepNodes.findIndex(n=>n.dataset.step===name);
let curIdx = Math.max(0, stepNodes.findIndex(n=>!n.hidden));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if(stepCard){
  const dots=document.getElementById('stepDots');
  if(dots && !dots.children.length){
    stepNodes.forEach(()=>dots.appendChild(document.createElement('i')));
  }
}

function paintStepChrome(){
  if(!stepNodes.length) return;
  const cur=stepNodes[curIdx];
  const back=document.getElementById('stepBack'), tag=document.getElementById('stepTag');
  const dots=document.getElementById('stepDots');
  const head=stepCard.closest('section');
  const title=head && head.querySelector('h2.title');
  const sub=head && head.querySelector('.step-sub');
  const kicker=head && head.querySelector('.kicker');

  if(back){
    const label=cur.dataset.back;
    back.hidden=!label;
    const span=back.querySelector('span'); if(span && label) span.textContent=label;
  }
  if(tag) tag.textContent = cur.dataset.tag || '';
  if(dots) [...dots.children].forEach((d,i)=>{
    d.className = i===curIdx ? 'on' : (i<curIdx ? 'done' : '');
  });
  if(title && cur.dataset.title) title.textContent = cur.dataset.title;
  if(kicker && cur.dataset.kicker) kicker.textContent = cur.dataset.kicker;
  if(sub){
    if(cur.dataset.sub){ sub.textContent=cur.dataset.sub; sub.style.display=''; }
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
  if(!stepNodes.length || next<0 || next>=stepNodes.length || next===curIdx) return;
  const from=stepNodes[curIdx], to=stepNodes[next];
  const swap=()=>{
    from.hidden=true; to.hidden=false; curIdx=next; paintStepChrome();
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

/* Laskurin CTA vie postinumerovaiheeseen samalla kortilla. Vanhoilla sivuilla
   cpBtn on linkki varaa.html:ään, jolloin tätä ei ole. */
const cpBtnEl=document.getElementById('cpBtn');
if(cpBtnEl && cpBtnEl.tagName==='BUTTON'){
  cpBtnEl.addEventListener('click',()=>{
    if(!(booking.count>0 && booking.total>0)) return;
    if(window.__renderGatePrice) window.__renderGatePrice();
    goStep('postal');
  });
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

function syncBookingSummary(){
  syncToDetails(); syncRecap();
  const nameEl=document.getElementById('bServiceName'); if(!nameEl) return;
  nameEl.textContent = booking.serviceLabel;
  const priceEl = document.getElementById('bPrice');
  if(booking.total>0){
    /* Matkalisä tulee palvelualueesta, joten se voidaan näyttää vasta kun
       postinumero on tiedossa. Näytetty summa on sama jonka CRM veloittaa:
       työ + alueen lisä. */
    const fee = (avail.travelFeeCents||0)/100;
    const shown = booking.total + fee;
    const net = Math.round(shown*NET_FACTOR);
    priceEl.innerHTML = `${shown.toLocaleString('fi-FI')} € `
      + (fee>0 ? `<span style="font-size:13px;opacity:.75;font-weight:600">· sis. matkalisä ${fee.toLocaleString('fi-FI')} €</span> ` : '')
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
      note.innerHTML='Valitse ensin ovet ja ikkunat hintalaskurista — näet kiinteän hinnan ennen varausta. <a href="index.html#laskuri" style="color:var(--green);font-weight:700;text-decoration:underline">Siirry laskuriin</a>';
      form.parentNode.insertBefore(note, form);
    }
    note.style.display='block';
  } else if(note){ note.style.display='none'; }
}
const bFormEl=document.getElementById('bForm');
if(bFormEl) bFormEl.addEventListener('submit',async e=>{
  e.preventDefault(); const err=document.getElementById('bErr'); err.style.display='none';
  if(!(booking.count>0 && booking.total>0)){
    err.innerHTML='Valitse ensin ovet tai ikkunat hintalaskurista. <a href="index.html#laskuri" style="text-decoration:underline;font-weight:700">Siirry laskuriin</a>';
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
  };

  try{
    const r=await fetch('/api/create-booking',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload),
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok || !data.ok){
      if(data && data.error==='no_items'){
        err.innerHTML='Varaus vaatii vähintään yhden oven tai ikkunan. <a href="index.html#laskuri" style="text-decoration:underline;font-weight:700">Valitse kohteet laskurista</a>';
      } else if(data && data.error==='slot_taken'){
        /* Joku ehti varata saman ajan. Haetaan vapaat ajat uudelleen, jotta
           asiakas näkee heti mitä on jäljellä eikä yritä samaa aikaa toiste. */
        err.textContent='Valitettavasti tämä aika ehdittiin juuri varata. Valitse toinen aika kalenterista.';
        loadAvailability();
      } else if(data && data.error==='area_not_served'){
        err.textContent=`Emme vielä palvele postinumerossa ${data.postal||postal}. Jätä yhteystietosi kalenterin yläpuolelta.`;
        loadAvailability();
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
    const priceTxt = ` Kohde: ${booking.count} kohdetta · ${totalEur.toLocaleString('fi-FI')} €.`;
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
  tabKoti.addEventListener('click', ()=>pickPath(true));
  tabYhtio.addEventListener('click', ()=>pickPath(false));

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
      n.innerHTML='<a href="index.html#laskuri" style="color:var(--green);font-weight:700">Siirry hintalaskuriin</a>';
      m.textContent='Näet kiinteän hinnan ennen varausta';
      e.style.display='none';
      return;
    }
    const total=q.total+fee;
    p.textContent=`${total.toLocaleString('fi-FI')} €`;
    n.textContent=`~${Math.round(total*NET_FACTOR).toLocaleString('fi-FI')} € kotitalousväh. jälkeen`;
    const hrs=q.minutes/60;
    const kesto = hrs<1 ? Math.round(q.minutes)+' min' : (Math.round(hrs*2)/2).toLocaleString('fi-FI')+' h';
    m.textContent = `sis. ALV 25,5 % · ${kesto}` + (fee>0 ? ` · sis. matkalisä ${fee.toLocaleString('fi-FI')} €` : '');
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
      /* Etusivulla kalenteri on saman kortin seuraava vaihe. Vanhoilla
         sivuilla (varaa.html) se on erillinen sivu, jolloin postinumero
         kuljetetaan kyselyparametrina ettei sitä tarvitse syöttää uudelleen. */
      if(stepIdx('cal')>=0) goStep('cal');
      else location.href = `ajanvaraus.html?pn=${encodeURIComponent(avail.postal)}`;
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
if(document.getElementById('stepCard')) paintStepChrome();
