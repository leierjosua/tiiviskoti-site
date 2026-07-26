"use client";

import { useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------
   Ikkunalaskuri + varaus — Lasikiilto
   Asiakas valitsee ikkunatyypit ja määrät (+/- stepperit), näkee hinnan,
   keston ja kotitalousvähennyksen reaaliajassa, ja tekee varauksen.
   ------------------------------------------------------------------ */

type IconKey = "standard" | "balcony" | "large" | "wall" | "skylight" | "shop";

const ICONS: Record<IconKey, React.ReactNode> = {
  standard: <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><path d="M12 3v18M4 12h16" stroke="currentColor" strokeWidth="1.8" /></svg>,
  large: <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><path d="M9 3v18M15 3v18M3 12h18" stroke="currentColor" strokeWidth="1.6" /></svg>,
  balcony: <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="7" height="20" rx="1" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="2" width="7" height="20" rx="1" stroke="currentColor" strokeWidth="1.8" /></svg>,
  wall: <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><path d="M8 4v16M14 4v16M2 12h20" stroke="currentColor" strokeWidth="1.4" /></svg>,
  skylight: <svg viewBox="0 0 24 24" fill="none"><path d="M4 8l8-4 8 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M12 4.5V20M4 12h16" stroke="currentColor" strokeWidth="1.6" /></svg>,
  shop: <svg viewBox="0 0 24 24" fill="none"><path d="M3 8l1.5-4h15L21 8M4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M9 20v-7h6v7" stroke="currentColor" strokeWidth="1.7" /></svg>,
};

type WType = { id: string; name: string; desc: string; price: number; min: number; ic: IconKey };
const TYPES: WType[] = [
  { id: "standard", name: "Vakioikkuna", desc: "2-lasinen ikkuna, molemmat puolet", price: 8, min: 12, ic: "standard" },
  { id: "balcony", name: "Parvekelasit", desc: "Liukulasit, per elementti", price: 11, min: 15, ic: "balcony" },
  { id: "large", name: "Iso ikkuna", desc: "Yli 2 m² tai kolmiruutuinen", price: 14, min: 16, ic: "large" },
  { id: "wall", name: "Lasiseinä / -ovi", desc: "Terassin lasiseinä tai lasiovi", price: 18, min: 22, ic: "wall" },
  { id: "skylight", name: "Kattoikkunat", desc: "Velux-tyyppinen kattoikkuna", price: 16, min: 20, ic: "skylight" },
  { id: "shop", name: "Näyteikkuna", desc: "Liiketilan näyteikkuna, per ruutu", price: 15, min: 18, ic: "shop" },
];
const EXTRAS = [
  { id: "blinds", name: "Sälekaihtimet", price: 35 },
  { id: "frames", name: "Syväpuhdistus karmit", price: 25 },
  { id: "screens", name: "Hyönteisverkot", price: 20 },
  { id: "gutters", name: "Kattoränni-tarkistus", price: 45 },
  { id: "solar", name: "Aurinkopaneelit", price: 60 },
  { id: "balconyfloor", name: "Parvekelattia", price: 30 },
];
const MIN_CHARGE = 65;
const NET_FACTOR = 1 - 0.40 * 0.90; // kotitalousvähennys 40 % työn osuudesta (~90 % hinnasta)

const euro = (n: number) => n.toLocaleString("fi-FI");

export default function WindowBookingCard() {
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(TYPES.map((t) => [t.id, 0])));
  const [extras, setExtras] = useState<Record<string, boolean>>(() => Object.fromEntries(EXTRAS.map((e) => [e.id, false])));
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [popId, setPopId] = useState<string | null>(null);
  const [c, setC] = useState({ name: "", email: "", phone: "", address: "", postal: "", date: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const bump = (id: string, d: number) => {
    setCounts((p) => ({ ...p, [id]: Math.max(0, Math.min(99, (p[id] || 0) + d)) }));
    setPopId(id);
    setTimeout(() => setPopId((cur) => (cur === id ? null : cur)), 300);
  };

  const { subtotal, total, count, minutes, minApplied, lines } = useMemo(() => {
    let subtotal = 0, count = 0, minutes = 0;
    const lines: { label: string; sum: number; qty?: number }[] = [];
    for (const t of TYPES) {
      const n = counts[t.id] || 0;
      if (n > 0) { const sum = n * t.price; subtotal += sum; count += n; minutes += n * t.min; lines.push({ label: t.name, sum, qty: n }); }
    }
    for (const e of EXTRAS) if (extras[e.id]) { subtotal += e.price; minutes += 15; lines.push({ label: e.name, sum: e.price }); }
    let total = subtotal;
    const minApplied = subtotal > 0 && subtotal < MIN_CHARGE;
    if (minApplied) total = MIN_CHARGE;
    return { subtotal, total, count, minutes, minApplied, lines };
  }, [counts, extras]);

  const net = Math.round(total * NET_FACTOR);
  const timeLabel = total === 0 ? "0 h" : minutes < 60 ? `${Math.round(minutes)} min` : `${(Math.round((minutes / 60) * 2) / 2).toLocaleString("fi-FI")} h`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/window-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...c,
          items: lines,
          priceTotal: total,
          netEstimate: net,
          windowCount: count,
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Varaus epäonnistui. Yritä uudelleen."); return; }
      setRef(d.reference || null);
      setStep(2);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch { setErr("Yhteysvirhe. Yritä uudelleen tai soita 045 875 5996."); }
    finally { setBusy(false); }
  }

  return (
    <div className="wbc" id="varaa" ref={topRef}>
      {step === 0 && (
        <>
          <div className="wbc-head">
            <span className="pin"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="1.5" stroke="#0968C8" strokeWidth="1.8" /><path d="M12 3v18M4 12h16" stroke="#0968C8" strokeWidth="1.8" /></svg></span>
            <span className="ct">Laske ikkunoidesi hinta</span>
          </div>
          <div className="wbc-sub">Valitse ikkunatyypit ja määrät — hinta, kesto ja kotitalousvähennys päivittyvät heti.</div>

          <div className="wbc-grid">
            {TYPES.map((t) => {
              const n = counts[t.id] || 0;
              return (
                <div key={t.id} className={`wtype${n > 0 ? " has" : ""}`}>
                  <div className="wtype-top">
                    <div className="wtype-ic">{ICONS[t.ic]}</div>
                    <div>
                      <div className="wtype-name">{t.name}</div>
                      <div className="wtype-desc">{t.desc}</div>
                      <span className="wtype-price">{t.price} €/kpl</span>
                    </div>
                  </div>
                  <div className="wstep">
                    <span className="unit">kpl</span>
                    <div className="wstep-btns">
                      <button type="button" className="stp minus" aria-label={`Vähennä ${t.name}`} disabled={n === 0} onClick={() => bump(t.id, -1)}>−</button>
                      <span className={`qty${popId === t.id ? " pop" : ""}`}>{n}</span>
                      <button type="button" className="stp plus" aria-label={`Lisää ${t.name}`} onClick={() => bump(t.id, 1)}>+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="wbc-extras">
            <div className="eh">Lisää tarvittaessa</div>
            <div className="wbc-exgrid">
              {EXTRAS.map((e) => (
                <button type="button" key={e.id} className={`wextra${extras[e.id] ? " on" : ""}`} aria-pressed={extras[e.id]} onClick={() => setExtras((p) => ({ ...p, [e.id]: !p[e.id] }))}>
                  <span className="wextra-chk">✓</span>
                  <span className="wextra-nm">{e.name}</span>
                  <span className="wextra-pr">+{e.price} €</span>
                </button>
              ))}
            </div>
          </div>

          <div className="wbc-sum">
            <div>
              <div className="pt">HINTA-ARVIO (SIS. ALV 25,5 %)</div>
              <div className="pv">{euro(total)}<small>€</small></div>
              <div className="net">Kotitalousvähennyksen jälkeen n. <b>{euro(total > 0 ? net : 0)} €</b></div>
            </div>
            <div className="meta">
              <div><b>{count}</b><span>ikkunaa</span></div>
              <div><b>{timeLabel}</b><span>arvioitu kesto</span></div>
            </div>
          </div>

          <button className="btn btn-p btn-lg wbc-cta" disabled={subtotal === 0} onClick={() => { setStep(1); topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            {subtotal === 0 ? "Valitse ikkunoita jatkaaksesi" : `Jatka varaukseen — ${euro(total)} €`}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="wbc-note">Minimiveloitus {MIN_CHARGE} € · ilmainen, ei sitoumusta · lopullinen hinta vahvistetaan tilauksessa{minApplied ? " · minimiveloitus sovellettu" : ""}</div>
        </>
      )}

      {step === 1 && (
        <form onSubmit={submit}>
          <div className="wbc-head">
            <span className="pin"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#0968C8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <span className="ct">Yhteystiedot ja varaus</span>
          </div>
          <div className="bk-summary">
            <b>{euro(total)} €</b> · {count} ikkunaa · arvioitu kesto {timeLabel}
            <div style={{ marginTop: 4, fontWeight: 400 }}>{lines.map((l) => `${l.qty ? l.qty + "× " : ""}${l.label}`).join(", ")}</div>
          </div>
          <div className="bk-field"><label>Nimi</label><input className="bk-input" required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Matti Meikäläinen" /></div>
          <div className="bk-row">
            <div className="bk-field"><label>Sähköposti</label><input className="bk-input" type="email" required value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} placeholder="matti@esimerkki.fi" /></div>
            <div className="bk-field"><label>Puhelin</label><input className="bk-input" required value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="045 875 5996" /></div>
          </div>
          <div className="bk-row">
            <div className="bk-field"><label>Osoite</label><input className="bk-input" required value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} placeholder="Katuosoite" /></div>
            <div className="bk-field"><label>Postinumero</label><input className="bk-input" inputMode="numeric" required value={c.postal} onChange={(e) => setC({ ...c, postal: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder="00100" /></div>
          </div>
          <div className="bk-field"><label>Toivottu ajankohta</label><input className="bk-input" type="date" required value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} min={new Date().toISOString().slice(0, 10)} /></div>
          <div className="bk-field"><label>Lisätiedot (valinnainen)</label><input className="bk-input" value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} placeholder="Esim. kerros, kulkuohjeet, avaimet" /></div>
          {err && <div className="bk-err">{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button type="button" className="bk-back" onClick={() => setStep(0)}>← Takaisin laskuriin</button>
            <button type="submit" className="btn btn-p" style={{ marginLeft: "auto" }} disabled={busy}>{busy ? "Lähetetään…" : `Vahvista varaus — ${euro(total)} €`}</button>
          </div>
          <div className="bk-trust">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" /></svg>
            Ei maksua nyt · vahvistamme varauksen sähköpostitse · tietosi ovat turvassa
          </div>
        </form>
      )}

      {step === 2 && (
        <div style={{ textAlign: "center", padding: "18px 0" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(9,104,200,.12)", display: "grid", placeItems: "center", margin: "0 auto 18px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#0968C8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div className="wbc-head" style={{ justifyContent: "center" }}><span className="ct">Varaus vastaanotettu!</span></div>
          {ref && <div style={{ fontFamily: "Gabarito", fontWeight: 800, color: "var(--blue-d)", marginTop: 4 }}>Varausnumero {ref}</div>}
          <p className="wbc-sub" style={{ marginTop: 10, marginBottom: 0 }}>Kiitos, {c.name.split(" ")[0] || "hei"}! Lähetämme vahvistuksen osoitteeseen {c.email}. Kohde: {count} ikkunaa · {euro(total)} € · toivottu {c.date}.</p>
          <button className="btn btn-g" style={{ marginTop: 18 }} onClick={() => {
            setStep(0); setRef(null); setCounts(Object.fromEntries(TYPES.map((t) => [t.id, 0]))); setExtras(Object.fromEntries(EXTRAS.map((e) => [e.id, false])));
            setC({ name: "", email: "", phone: "", address: "", postal: "", date: "", notes: "" });
          }}>Tee uusi laskelma</button>
        </div>
      )}
    </div>
  );
}
