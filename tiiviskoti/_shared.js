/* =========================================================
   TiivisKoti — shared functionality for all visions.
   Kiinteät hinnat (Uudenmaan alue, tutkittu 7/2026).
   Design-agnostic: only touches DOM by id/class, no colors.
   Kaikki lohkot on suojattu: laskuri, kalenteri, FAQ ja lomake
   ajetaan vain jos niiden DOM-elementit ovat sivulla.
   ========================================================= */
const ico = {
  ulko:'<svg viewBox="0 0 24 24" fill="none"><rect x="6" y="3" width="12" height="18" rx="1.5" stroke="currentColor" stroke-width="1.8"/><circle cx="14.5" cy="12" r="1.2" fill="currentColor"/></svg>',
  parveke:'<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="18" rx="1" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="3" width="8" height="18" rx="1" stroke="currentColor" stroke-width="1.8"/></svg>',
  terassi:'<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 4v16" stroke="currentColor" stroke-width="1.6"/><path d="M6 20l3-3M18 4l-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  vali:'<svg viewBox="0 0 24 24" fill="none"><rect x="7" y="3" width="10" height="18" rx="1.2" stroke="currentColor" stroke-width="1.8"/><circle cx="14" cy="12" r="1" fill="currentColor"/></svg>',
  ikkuna:'<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v18M4 12h16" stroke="currentColor" stroke-width="1.6"/></svg>',
  kynnys:'<svg viewBox="0 0 24 24" fill="none"><path d="M3 18h18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="6" y="6" width="12" height="8" rx="1.2" stroke="currentColor" stroke-width="1.7"/></svg>'
};
const TYPES = [
  {id:'ulko',    name:'Ulko-ovi',            desc:'Sivutiivisteet + kynnyskumi, käynnin säätö', price:89, min:40, ic:ico.ulko},
  {id:'parveke', name:'Parvekeovi',          desc:'Puu-/alumiiniparvekeovi, koko kehä',         price:79, min:35, ic:ico.parveke},
  {id:'terassi', name:'Terassi- / liukuovi', desc:'Iso lasiovi tai liukuovi, kiskon huolto',    price:109,min:45, ic:ico.terassi},
  {id:'vali',    name:'Väli- / huoneovi',    desc:'Sisäoven ääni- ja vetotiiviste',             price:49, min:25, ic:ico.vali},
  {id:'ikkuna',  name:'Ikkuna',              desc:'Karmi- ja puitetiivisteet, per ikkuna',      price:39, min:20, ic:ico.ikkuna},
  {id:'kynnys',  name:'Pelkkä kynnyskumi',   desc:'Alaslistan / kynnyksen tiivisteen vaihto',   price:45, min:20, ic:ico.kynnys}
];
const EXTRAS = [
  {id:'poisto',  name:'Vanhan liiman poisto', price:15}
];
const FAQ = [
  ['Paljonko tiivistys maksaa?','Varauksen aloitusmaksu on 99 €, ja sen päälle lisätään valitsemasi kohteet kiinteillä hinnoilla: ulko-ovi 89 €, parvekeovi 79 €, ikkuna 39 € (sis. tiivisteet, työn ja oven säädön). Esimerkiksi kolme ulko-ovea on 99 € + 3 × 89 € = 366 €. Näet kokonaishinnan heti laskurista, ja kotitalousvähennys pienentää työn osuutta jopa 40 %.'],
  ['Mitä tiivisteiden vaihtoon sisältyy?','Vanhojen tiivisteiden poisto, pintojen puhdistus, uudet laadukkaat EPDM- tai silikonitiivisteet sekä oven käynnin säätö niin, että ovi painuu tasaisesti tiivisteitä vasten. Ulko-oviin kuuluu myös kynnyskumi.'],
  ['Kannattaako vetävä ovi tiivistää vai vaihtaa?','Jos ovilehti ja karmi ovat suorassa ja ovi toimii, pelkkä tiivisteiden uusiminen riittää lähes aina — se maksaa murto-osan uuden oven (2 200–4 900 €) hinnasta ja poistaa vedon. Arvioimme kunnon paikan päällä ja kerromme rehellisesti.'],
  ['Kuinka paljon säästän lämmityksessä?','Yksi vetävä ulko-ovi voi nostaa lämmityskuluja 10–15 %. Kun veto loppuu, lämpö pysyy sisällä ja lämmitystarve pienenee — tiivistys maksaa itsensä usein takaisin jo yhden lämmityskauden aikana.'],
  ['Millä alueella toimitte?','Koko Uudenmaan alueella — Helsinki, Espoo, Vantaa ja kehyskunnat. Kerro postinumerosi varauksen yhteydessä, niin vahvistamme, että palvelemme alueellasi.'],
  ['Miten ajanvaraus toimii?','Valitset laskurista ovet, näet kiinteän hinnan ja siirryt varaamaan vapaan ajan kalenterista. Saat vahvistuksen sähköpostiin. Hinta on kiinteä jo ennen varausta — tarkistamme sen vielä paikan päällä ennen työn aloitusta.'],
  ['Miten kotitalousvähennys toimii?','Ovien ja ikkunoiden tiivistys on kotitaloustyötä. Saat meiltä laskun, jossa työn osuus on valmiiksi eritelty — ilmoitat sen OmaVerossa ja vähennät jopa 40 % työn osuudesta (enintään 2 250 € / henkilö vuonna 2026).']
];

/* ---------- laskuri ---------- */
const state = {}; TYPES.forEach(t=>state[t.id]=0);
const extraState = {}; EXTRAS.forEach(e=>extraState[e.id]=false);
const BASE_PRICE = 99; /* aloitusmaksu — kaikki tilattu tulee tämän päälle */
const NET_FACTOR = 1 - 0.40 * 0.70;

const typesEl = document.getElementById('calcTypes');
const extrasEl = document.getElementById('calcExtras');
if(typesEl && extrasEl){
  TYPES.forEach(t=>{
    const c = document.createElement('div');
    c.className='wtype'; c.dataset.id=t.id;
    c.innerHTML =
      `<div class="wtype-ic">${t.ic}</div>
       <div class="wtype-top"><div class="wtype-name">${t.name}</div><div class="wtype-desc">${t.desc}</div><span class="wtype-price">${t.price} €/kpl</span></div>
       <div class="stepper"><div class="stepper-btns"><button class="stp minus" aria-label="Vähennä" data-a="-1" disabled>−</button><span class="qty" data-q="${t.id}">0</span><button class="stp plus" aria-label="Lisää" data-a="1">+</button></div></div>`;
    typesEl.appendChild(c);
  });
  EXTRAS.forEach(e=>{
    const b = document.createElement('button');
    b.type='button'; b.className='extra'; b.dataset.id=e.id;
    b.innerHTML = `<span class="extra-chk">✓</span><span class="extra-nm">${e.name}</span><span class="extra-pr">+${e.price} €</span>`;
    b.addEventListener('click',()=>{ extraState[e.id]=!extraState[e.id]; b.classList.toggle('on',extraState[e.id]); render(); });
    extrasEl.appendChild(b);
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
  if(!document.getElementById('cpLines')) return;
  const lines=[]; let subtotal=0, count=0, minutes=0; const lineLabels=[];
  TYPES.forEach(t=>{ const n=state[t.id]; if(n>0){ const sum=n*t.price; subtotal+=sum; count+=n; minutes+=n*t.min;
    lines.push(`<div class="cp-line"><span><span class="cnt">${n}×</span> ${t.name}</span><b>${sum} €</b></div>`); lineLabels.push(`${n}× ${t.name}`); } });
  EXTRAS.forEach(e=>{ if(extraState[e.id]){ subtotal+=e.price; minutes+=10; lines.push(`<div class="cp-line"><span>${e.name}</span><b>${e.price} €</b></div>`); lineLabels.push(e.name);} });
  /* Aloitusmaksu 99 € on kiinteä pohja, jonka päälle valitut kohteet lasketaan.
     Näytetään omana rivinään, jotta asiakas näkee mistä summa muodostuu.
     Pidä sama kuin BASE_PRICE_CENTS api/create-booking.mjs:ssä. */
  const total = subtotal>0 ? BASE_PRICE + subtotal : 0;
  const linesEl=document.getElementById('cpLines');
  linesEl.innerHTML = subtotal===0 ? '<div class="rc-empty">Lisää ovia tai ikkunoita nähdäksesi hinnan.</div>'
    : `<div class="cp-line"><span>Aloitusmaksu</span><b>${BASE_PRICE} €</b></div>` + lines.join('');
  tweenPrice(total);
  document.getElementById('cpNet').textContent = (total>0?Math.round(total*NET_FACTOR).toLocaleString('fi-FI'):'0')+' €';
  document.getElementById('cpCount').textContent = count;
  const hrs = minutes/60;
  document.getElementById('cpTime').textContent = total===0?'0 h':(hrs<1?Math.round(minutes)+' min':(Math.round(hrs*2)/2).toLocaleString('fi-FI')+' h');
  const btn=document.getElementById('cpBtn'), active = subtotal>0;
  btn.style.pointerEvents=active?'auto':'none'; btn.style.opacity=active?'1':'.5';
  booking.total = total; booking.count = count; booking.lines = lineLabels;
  booking.serviceLabel = count>0 ? `Tiivistys: ${lineLabels.join(', ')}` : 'Valitse kohteet laskurista';
  /* Säilytä laskurin valinta varaus-sivulle.
     KRIITTINEN: mukana on oltava ovikohtainen erittely (items/extraIds), ei vain
     summa. Varaussivulla ei ole laskurin DOMia, joten `state` on siellä nollilla —
     ilman tätä lomake lähettäisi items:[] ja jokainen varaus tallentuisi 0 €:na. */
  try{ sessionStorage.setItem('tk_booking', JSON.stringify({
    total: booking.total, count: booking.count, serviceLabel: booking.serviceLabel,
    items: TYPES.map(t=>({id:t.id, qty:state[t.id]||0})).filter(i=>i.qty>0),
    extraIds: EXTRAS.filter(x=>extraState[x.id]).map(x=>x.id),
  })); }catch(_){}
  syncBookingSummary();
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

/* ---------- kalenterivaraus ---------- */
const WORK_SLOTS = ['08:00','10:00','12:00','14:00'];
const booked = {};
const MONTHS = ['tammikuu','helmikuu','maaliskuu','huhtikuu','toukokuu','kesäkuu','heinäkuu','elokuu','syyskuu','lokakuu','marraskuu','joulukuu'];
function seededTaken(key){ let h=0; for(let i=0;i<key.length;i++){ h=(h*31 + key.charCodeAt(i))>>>0; }
  const set=new Set(); WORK_SLOTS.forEach((s,i)=>{ if(((h>>(i*3)) & 7) < 4) set.add(s); }); return set; }
function takenFor(key){ if(!booked[key]) booked[key]=seededTaken(key); return booked[key]; }
function pad(n){return String(n).padStart(2,'0');}
function keyOf(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
const today = new Date(); today.setHours(0,0,0,0);
const minBook = new Date(today); minBook.setDate(minBook.getDate()+1);
const maxBook = new Date(today); maxBook.setDate(maxBook.getDate()+70);
let viewY = today.getFullYear(), viewM = today.getMonth(), selDay = null, selSlot = null;
function freeSlots(d){ const dow=d.getDay(); if(dow===0) return []; if(d<minBook||d>maxBook) return [];
  const set=takenFor(keyOf(d)); let slots=WORK_SLOTS.filter(s=>!set.has(s)); if(dow===6) slots=slots.slice(0,2); return slots; }
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
    if(d<minBook||d>maxBook||d.getDay()===0){ el.className='day off'+(isToday?' today':''); el.disabled=true; grid.appendChild(el); continue; }
    const free = freeSlots(d);
    if(free.length===0){ el.className='day full'+(isToday?' today':''); el.disabled=true; }
    else { el.className='day free'+(isToday?' today':''); const dot=document.createElement('span'); dot.className='dot'; el.appendChild(dot);
      if(selDay && keyOf(selDay)===keyOf(d)) el.classList.add('sel');
      el.addEventListener('click',()=>{ selDay=d; selSlot=null; renderCal(); renderSlots(); }); }
    grid.appendChild(el);
  }
  document.getElementById('mPrev').disabled = (viewY===today.getFullYear() && viewM===today.getMonth());
}
function renderSlots(){
  const wrap=document.getElementById('slots'); if(!wrap) return;
  const title=document.getElementById('slotsTitle'); wrap.innerHTML='';
  if(!selDay){ title.textContent='Valitse päivä nähdäksesi vapaat ajat'; return; }
  const free=freeSlots(selDay);
  const wd=['sunnuntai','maanantai','tiistai','keskiviikko','torstai','perjantai','lauantai'][selDay.getDay()];
  title.textContent = `Vapaat ajat — ${wd} ${selDay.getDate()}.${selDay.getMonth()+1}.`;
  if(free.length===0){ wrap.innerHTML='<div class="slots-empty">Ei vapaita aikoja tänä päivänä. Valitse toinen päivä.</div>'; return; }
  free.forEach(s=>{ const b=document.createElement('button'); b.type='button'; b.className='slot'+(selSlot===s?' sel':''); b.textContent=s;
    b.addEventListener('click',()=>{ selSlot=s; renderSlots(); syncBookingSummary(); }); wrap.appendChild(b); });
}
const mPrevBtn=document.getElementById('mPrev'), mNextBtn=document.getElementById('mNext');
if(mPrevBtn) mPrevBtn.addEventListener('click',()=>{ if(viewM===0){viewM=11;viewY--;}else viewM--; renderCal(); });
if(mNextBtn) mNextBtn.addEventListener('click',()=>{ if(viewM===11){viewM=0;viewY++;}else viewM++; renderCal(); });
function syncBookingSummary(){
  const nameEl=document.getElementById('bServiceName'); if(!nameEl) return;
  nameEl.textContent = booking.serviceLabel;
  const priceEl = document.getElementById('bPrice');
  if(booking.total>0){ const net = Math.round(booking.total*NET_FACTOR);
    priceEl.innerHTML = `${booking.total.toLocaleString('fi-FI')} € <span style="font-size:13px;opacity:.75;font-weight:600">· vähennyksen jälk. n. ${net.toLocaleString('fi-FI')} €</span>`;
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
  if(!selDay || !selSlot){ err.textContent='Valitse ensin vapaa päivä ja aika kalenterista.'; err.style.display='block'; return; }
  const postal=document.getElementById('fPostal').value.replace(/\D/g,'');
  if(postal.length!==5){ err.textContent='Tarkista postinumero (5 numeroa).'; err.style.display='block'; return; }

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
    date: keyOf(selDay),
    slot: selSlot,
    items: TYPES.map(t=>({name:t.name, qty:state[t.id]||0})).filter(i=>i.qty>0),
    extras: EXTRAS.filter(x=>extraState[x.id]).map(x=>x.name),
  };

  try{
    const r=await fetch('/api/create-booking',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload),
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok || !data.ok){
      if(data && data.error==='no_items'){
        err.innerHTML='Varaus vaatii vähintään yhden oven tai ikkunan. <a href="index.html#laskuri" style="text-decoration:underline;font-weight:700">Valitse kohteet laskurista</a>';
      } else {
        err.textContent = data && data.error==='validation'
          ? 'Tarkista lomakkeen tiedot ja yritä uudelleen.'
          : 'Varauksen tallennus ei onnistunut. Yritä hetken kuluttua uudelleen tai soita 045 875 5996.';
      }
      err.style.display='block';
      submitBtn.disabled=false; submitBtn.textContent=btnLabel;
      return;
    }

    // onnistui: merkitse slotti varatuksi, näytä kuittaus
    takenFor(keyOf(selDay)).add(selSlot);
    const name = payload.name.split(' ')[0] || 'hei';
    const wd=['su','ma','ti','ke','to','pe','la'][selDay.getDay()];
    const when = `${wd} ${selDay.getDate()}.${selDay.getMonth()+1}. klo ${selSlot}`;
    document.getElementById('bookForm').style.display='none';
    document.getElementById('bookDone').style.display='block';
    document.getElementById('bRef').textContent=data.ref;
    const totalEur=(data.total_cents||0)/100;
    const priceTxt = ` Kohde: ${booking.count} kohdetta · ${totalEur.toLocaleString('fi-FI')} €.`;
    document.getElementById('bDoneText').textContent = `Kiitos, ${name}! Olemme sinuun yhteydessä ja vahvistamme ajan osoitteeseen ${payload.email}. Aika: ${when}.${priceTxt}`;
    try{ sessionStorage.removeItem('tk_booking'); }catch(_){}
    selSlot=null; renderCal(); renderSlots();
    submitBtn.disabled=false; submitBtn.textContent=btnLabel;
  }catch(ex){
    err.textContent='Yhteysvirhe. Tarkista verkkoyhteys ja yritä uudelleen, tai soita 045 875 5996.';
    err.style.display='block';
    submitBtn.disabled=false; submitBtn.textContent=btnLabel;
  }
});
const bResetEl=document.getElementById('bReset');
if(bResetEl) bResetEl.addEventListener('click',()=>{
  document.getElementById('bookDone').style.display='none';
  document.getElementById('bookForm').style.display='block';
  document.getElementById('bForm').reset();
  selDay=null; selSlot=null; renderCal(); renderSlots(); syncBookingSummary();
});
const fPostalEl=document.getElementById('fPostal');
if(fPostalEl) fPostalEl.addEventListener('input',e=>{ e.target.value=e.target.value.replace(/\D/g,'').slice(0,5); });

/* nouda laskurin valinta varaus-sivulla (jos tullaan laskurista) */
if(document.getElementById('bServiceName') && !document.getElementById('cpLines')){
  try{ const saved=JSON.parse(sessionStorage.getItem('tk_booking')||'null');
    if(saved && saved.total>0){
      booking.total=saved.total; booking.count=saved.count; booking.serviceLabel=saved.serviceLabel;
      /* Palauta ovikohtainen valinta state/extraStateen — payload.items luetaan niistä.
         Ilman tätä varaus lähtisi tyhjänä ja tallentuisi 0 €:na. */
      (saved.items||[]).forEach(i=>{ if(Object.prototype.hasOwnProperty.call(state,i.id)) state[i.id]=i.qty; });
      (saved.extraIds||[]).forEach(id=>{ if(Object.prototype.hasOwnProperty.call(extraState,id)) extraState[id]=true; });
    }
  }catch(_){}
  gateBookingOnCalculator();
}

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
