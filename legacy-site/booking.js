/* Loppusiivous.fi — ajanvaraus. Kiinteä hinta kohteen koon (m²) mukaan. Backend (Supabase) myöhemmin. */
(function () {
  const RATE = 70; // €/h (sisäinen peruste; asiakkaalle näytetään kiinteä hinta)
  const DEDUCT = 0.35; // kotitalousvähennys työn osuudesta (työkorvaus, arvio)
  // m²-rajat (yläraja, ei sisälly) → kesto (h). >190 m² = tarjouksella.
  const BANDS = [[40,3],[50,3.5],[60,4],[70,5],[85,5.5],[100,6],[115,6.5],[130,7.5],[145,8],[160,9],[175,9.5],[191,10]];
  function hoursForM2(m2){ for (const [lim,h] of BANDS) if (m2 < lim) return h; return null; } // null = tarjous
  function priceForM2(m2){ const h = hoursForM2(m2); return h == null ? null : Math.round(h * RATE); }

  const ADDONS = [
    { id:'jaakaappi', name:'Jääkaappi & pakastin', eur:70 },
    { id:'uuni',      name:'Uuni',                 eur:70 },
    { id:'sauna',     name:'Sauna',                eur:70 },
    { id:'silitys',   name:'Silitys',              eur:35 },
    { id:'roska',     name:'Roskakaappi',          eur:18 },
  ];
  const QUICK = [['Yksiö',30],['Kaksio',52],['Kolmio',72],['Iso',95]];
  const CITY = { '00':'Helsinki','01':'Vantaa','02':'Espoo','03':'Nurmijärvi','04':'Kerava / Järvenpää','05':'Porvoo','06':'Porvoo','07':'Hyvinkää','08':'Lohja','09':'Lohja' };
  const SERVED = new Set(['00','01','02','03','04','05','06','07','08','09']); // Uusimaa / PK-seutu
  const isServed = () => SERVED.has(S.postal.slice(0,2));
  const SLOTS = ['08:00','10:00','12:00','14:00','16:00'];
  const STEPS = ['Sijainti','Kohde','Ajankohta','Vahvistus'];
  const MONTHS = ['Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu','Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu'];
  const WD = ['Ma','Ti','Ke','To','Pe','La','Su'];

  const S = { step:0, m2:null, addons:new Set(), postal:'', city:'', address:'',
    calY:new Date().getFullYear(), calM:new Date().getMonth(), date:null, time:null,
    name:'', phone:'', email:'', done:false, ref:null };

  const $ = id => document.getElementById(id);
  const stepsEl=$('bk-steps'), stepperEl=$('stepper'), sumEl=$('bk-summary'), priceEl=$('bk-price'), noteEl=$('bk-note'), actEl=$('bk-actions');
  const CHK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const isQuote = () => S.m2 != null && S.m2 > 190;
  const addonsTotal = () => [...S.addons].reduce((a,id)=>a+(ADDONS.find(x=>x.id===id)?.eur||0),0);
  const basePrice = () => S.m2 ? priceForM2(S.m2) : null;
  const totalPrice = () => { const b = basePrice(); return b == null ? null : b + addonsTotal(); };
  const netPrice = () => { const t = totalPrice(); return t == null ? null : Math.round(t * (1 - DEDUCT)); };

  function renderStepper(){
    stepperEl.style.display='flex';
    stepperEl.innerHTML = STEPS.map((lbl,i)=>{
      const cls = i<S.step?'done':i===S.step?'active':''; const inner = i<S.step?CHK:(i+1);
      const bar = i<STEPS.length-1?'<div class="bar"></div>':'';
      return `<div class="st ${cls}"><div class="dot">${inner}</div><div class="lbl">${lbl}</div></div>${bar}`;
    }).join('');
  }

  function renderStep(){
    if (S.done) return renderSuccess();
    let h='';
    if (S.step===1){
      h = `<div class="bk-step show">
        <div class="bk-h">Kohteen koko</div>
        <div class="bk-sub">Syötä asunnon pinta-ala — saat heti kiinteän hinnan, ei arviota.</div>
        <div class="f"><label>Asunnon koko (m²)</label>
          <input id="i-m2" inputmode="numeric" placeholder="esim. 65" value="${S.m2??''}" style="font-family:'Gabarito';font-weight:700;font-size:20px">
          <div class="hint" id="h-m2"></div>
        </div>
        <div class="addon-list" style="grid-template-columns:repeat(4,1fr);margin-bottom:6px">${QUICK.map(([n,m])=>`<button class="addon-chk ${S.m2===m?'sel':''}" data-quick="${m}" style="justify-content:center"><span class="ac-name">${n}<br><small style="color:var(--muted);font-weight:500">~${m} m²</small></span></button>`).join('')}</div>
        <div class="bk-label">Lisäpalvelut (valinnainen)</div>
        <div class="addon-list">${ADDONS.map(a=>addonChk(a)).join('')}</div>
      </div>`;
    } else if (S.step===0){
      h = `<div class="bk-step show">
        <div class="bk-h">Aloita postinumerolla</div>
        <div class="bk-sub">Näet heti, palvelemmeko alueellasi — ei muuta vielä tarvita.</div>
        <div class="f"><label>Postinumero</label>
          <input id="i-postal" inputmode="numeric" maxlength="5" placeholder="esim. 02150" value="${S.postal}" style="font-family:'Gabarito';font-weight:700;font-size:20px;letter-spacing:2px">
          <div class="hint" id="h-postal"></div>
        </div>`;
    } else if (S.step===2){
      h = `<div class="bk-step show">
        <div class="bk-h">Valitse ajankohta</div>
        <div class="bk-sub">Vapaat ajat — vahvistamme lopullisen ajan erikseen.</div>
        ${calendar()}
        ${S.date?`<div class="bk-label">Aloitusaika ${fmt(S.date)}</div><div class="slots">${SLOTS.map(t=>slotBtn(t)).join('')}</div>`:''}
      </div>`;
    } else if (S.step===3){
      h = `<div class="bk-step show">
        <div class="bk-h">Yhteystiedot</div>
        <div class="bk-sub">Lähetämme vahvistuksen ja tarkennetun ajan.</div>
        <div class="f2">
          <div class="f"><label>Osoite *</label><input id="i-addr" value="${S.address}" placeholder="Katuosoite"></div>
          <div class="f"><label>Kaupunki</label><input id="i-city" value="${S.city}" readonly style="background:#F1F6FB"></div>
        </div>
        <div class="f2">
          <div class="f"><label>Nimi *</label><input id="i-name" value="${S.name}" placeholder="Etu- ja sukunimi"></div>
          <div class="f"><label>Puhelin *</label><input id="i-phone" value="${S.phone}" placeholder="040 123 4567"></div>
        </div>
        <div class="f"><label>Sähköposti *</label><input id="i-email" type="email" value="${S.email}" placeholder="sinun@email.fi"></div>
        <p style="font-size:13px;color:var(--muted);margin-top:4px">Lähettämällä hyväksyt yhteydenoton varauksen vahvistamiseksi.</p>
      </div>`;
    }
    stepsEl.innerHTML = h; bind();
  }

  const addonChk = a => `<button class="addon-chk ${S.addons.has(a.id)?'sel':''}" data-addon="${a.id}">
    <span class="box">${CHK}</span><span class="ac-name">${a.name}</span><span class="ac-price">+${a.eur} €</span></button>`;
  const slotBtn = t => { const taken = isTaken(S.date,t); return `<button class="slot ${S.time===t?'sel':''}" data-slot="${t}" ${taken?'disabled':''}>${t}</button>`; };

  function calendar(){
    const today=new Date(); today.setHours(0,0,0,0); const min=new Date(today); min.setDate(min.getDate()+1);
    const first=new Date(S.calY,S.calM,1); let start=(first.getDay()+6)%7; const days=new Date(S.calY,S.calM+1,0).getDate();
    const prevDisabled=(S.calY<today.getFullYear()||(S.calY===today.getFullYear()&&S.calM<=today.getMonth()));
    let cells=''; for(let i=0;i<start;i++) cells+='<div></div>';
    for(let d=1;d<=days;d++){ const dt=new Date(S.calY,S.calM,d); dt.setHours(0,0,0,0); const iso=isoDate(dt);
      const dis=dt<min||dt.getDay()===0; const sel=S.date===iso; const isToday=+dt===+today;
      cells+=`<button class="cal-day ${sel?'sel':''} ${isToday?'today':''}" data-day="${iso}" ${dis?'disabled':''}>${d}</button>`; }
    return `<div class="cal"><div class="cal-head"><div class="m">${MONTHS[S.calM]} ${S.calY}</div>
      <div class="cal-nav"><button data-cal="prev" ${prevDisabled?'disabled':''}><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button data-cal="next"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>
      <div class="cal-grid">${WD.map(w=>`<div class="wd">${w}</div>`).join('')}${cells}</div></div>`;
  }

  function renderSummary(){
    if (S.done){ sumEl.innerHTML=''; priceEl.textContent=''; actEl.innerHTML=''; noteEl.textContent=''; return; }
    let rows='';
    if (S.m2) rows += sumRow('Kohde', `${S.m2} m²` + (isQuote()?' · tarjous':''));
    if (S.addons.size) rows += sumRow('Lisäpalvelut', [...S.addons].map(id=>ADDONS.find(a=>a.id===id).name).join(', '));
    if (S.city||S.postal) rows += sumRow('Sijainti', [S.city,S.postal].filter(Boolean).join(' '));
    if (S.date) rows += sumRow('Päivä', fmt(S.date)+(S.time?` klo ${S.time}`:''));
    sumEl.innerHTML = rows || '<div class="sum-empty">Syötä asunnon koko aloittaaksesi.</div>';
    if (!S.m2){ priceEl.textContent='—'; noteEl.textContent='Syötä asunnon koko (m²) nähdäksesi kiinteän hinnan.'; }
    else if (isQuote()){ priceEl.innerHTML='Tarjous'; noteEl.textContent='Yli 190 m² — annamme kiinteän tarjouksen. Jätä varaus, niin otamme yhteyttä.'; }
    else { priceEl.innerHTML=`${totalPrice()}€`; noteEl.innerHTML=`<b style="color:#fff">Kiinteä hinta</b> (sis. alv). Kotitalousvähennyksen jälkeen <b style="color:#7fd0ff">n. ${netPrice()} €</b>. Ei yllätyksiä.`; }
    renderActions();
  }

  function renderActions(){
    const back = S.step>0?`<button class="bk-back" data-act="back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Takaisin</button>`:'';
    const last=S.step===3; const label=last?'Vahvista varaus':'Jatka'; const ok=canProceed();
    actEl.innerHTML = `${back}<button class="btn btn-primary btn-block" data-act="next" ${ok?'':'disabled style="opacity:.45;cursor:not-allowed"'}>${label}${last?'':' <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'}</button>`;
    actEl.querySelector('[data-act="next"]').onclick = next;
    if (back) actEl.querySelector('[data-act="back"]').onclick = () => { S.step--; renderAll(); scrollTop(); };
  }

  function canProceed(){
    if (S.step===0) return /^\d{5}$/.test(S.postal) && isServed();
    if (S.step===1) return !!S.m2 && S.m2>0;
    if (S.step===2) return !!(S.date && S.time);
    if (S.step===3) return S.address.trim() && S.name.trim() && S.phone.trim() && /\S+@\S+\.\S+/.test(S.email);
    return false;
  }
  async function next(){ if(!canProceed())return; if(S.step===3)return submit(); S.step++; renderAll(); scrollTop(); }

  function bind(){
    const im=$('i-m2');
    if (im) im.oninput = () => { const v=parseInt(im.value.replace(/\D/g,''))||null; S.m2=v; const hint=$('h-m2');
      if (!v) hint.textContent='';
      else if (isQuote()) hint.className='hint', hint.textContent='Yli 190 m² — annamme kiinteän tarjouksen.';
      else hint.className='hint ok', hint.textContent=`Kiinteä hinta tälle koolle: ${priceForM2(v)} €`;
      stepsEl.querySelectorAll('[data-quick]').forEach(b=>b.classList.toggle('sel', +b.dataset.quick===v));
      renderSummary(); };
    stepsEl.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{ S.m2=+b.dataset.quick; if($('i-m2'))$('i-m2').value=S.m2; bind(); $('i-m2').dispatchEvent(new Event('input')); });
    stepsEl.querySelectorAll('[data-addon]').forEach(b=>b.onclick=()=>{ const id=b.dataset.addon; S.addons.has(id)?S.addons.delete(id):S.addons.add(id); renderStep(); renderSummary(); });
    const ip=$('i-postal');
    if (ip) ip.oninput=()=>{ S.postal=ip.value.replace(/\D/g,'').slice(0,5); ip.value=S.postal; const pre=S.postal.slice(0,2);
      S.city=(S.postal.length>=2&&CITY[pre])?CITY[pre]:''; const ci=$('i-city'); if(ci)ci.value=S.city; const hint=$('h-postal');
      if(S.postal.length===5){ if(isServed()){hint.className='hint ok';hint.textContent='✓ Palvelemme tällä alueella'+(S.city?` · ${S.city}`:'');} else {hint.className='hint err';hint.textContent='Emme valitettavasti palvele vielä tällä alueella.';} }
      else hint.textContent=''; renderSummary(); };
    const ia=$('i-addr'); if(ia) ia.oninput=()=>{ S.address=ia.value; renderActions(); };
    stepsEl.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{ S.date=b.dataset.day; S.time=null; renderStep(); renderSummary(); });
    stepsEl.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{ if(b.disabled)return; S.time=b.dataset.slot; renderStep(); renderSummary(); });
    stepsEl.querySelectorAll('[data-cal]').forEach(b=>b.onclick=()=>{ if(b.dataset.cal==='prev'){if(--S.calM<0){S.calM=11;S.calY--;}}else{if(++S.calM>11){S.calM=0;S.calY++;}} renderStep(); });
    ['name','phone','email'].forEach(k=>{ const el=$('i-'+k); if(el) el.oninput=()=>{ S[k]=el.value; renderActions(); }; });
  }

  async function submit(){
    const btn=actEl.querySelector('[data-act="next"]'); if(btn){btn.disabled=true;btn.textContent='Lähetetään…';}
    S.ref='LS-'+Math.floor(100000+Math.random()*899999);
    const priceTxt = isQuote()?'Tarjouspyyntö (yli 190 m²)':`${totalPrice()} € (kiinteä)`;
    const payload={ name:S.name, phone:S.phone, email:S.email, address:[S.address,S.city,S.postal].filter(Boolean).join(', '),
      size:`${S.m2} m²`, addons:[...S.addons].map(id=>ADDONS.find(a=>a.id===id).name).join(', '), date:S.date, time:S.time,
      message:`Ajanvaraus ${S.ref} · ${priceTxt}` };
    try { await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); } catch(e){}
    S.done=true; renderAll(); scrollTop();
  }

  function renderSuccess(){
    stepperEl.style.display='none';
    const priceLine = isQuote() ? 'Annamme sinulle kiinteän tarjouksen pian.' : `Kiinteä hinta: <b>${totalPrice()} €</b>.`;
    stepsEl.innerHTML = `<div class="bk-success">
      <div class="ok-ic"><svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h3>Varauspyyntö vastaanotettu!</h3>
      <p>Kiitos, ${esc(S.name.split(' ')[0]||'')}! Vahvistamme ajan ${fmt(S.date)} klo ${S.time}. ${priceLine}</p>
      <p>Lähetämme vahvistuksen osoitteeseen <b>${esc(S.email)}</b>.</p>
      <div class="bk-ref">Viite ${S.ref}</div></div>`;
    sumEl.innerHTML=''; priceEl.textContent=''; noteEl.textContent=''; actEl.innerHTML='';
  }

  function renderAll(){ renderStepper(); renderStep(); renderSummary(); }
  function sumRow(k,v){ return `<div class="sum-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`; }
  function isoDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function fmt(iso){ if(!iso)return''; const [y,m,d]=iso.split('-').map(Number); const dt=new Date(y,m-1,d); return `${WD[(dt.getDay()+6)%7]} ${d}.${m}.`; }
  function isTaken(iso,t){ if(!iso)return false; const seed=iso.split('-').reduce((a,b)=>a+ +b,0)+SLOTS.indexOf(t); return seed%7===0; }
  function esc(s=''){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function scrollTop(){ const el=document.getElementById('bk'); if(el&&el.getBoundingClientRect().top<0) el.scrollIntoView({behavior:'smooth',block:'start'}); }

  renderAll();
})();
