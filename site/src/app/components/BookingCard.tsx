"use client";

import { useState, useEffect, useMemo } from "react";
import {
  pushToDataLayer,
  trackMetaEvent,
  generateClientEventId,
  getMetaCookies,
  getGclid,
  getFbclid,
  getAttribution,
} from "./Analytics";

interface ServiceItem { id: string; name: string }
interface VariantItem { id: string; label: string; price_cents: number; metadata: { max_m2?: number } | null }
interface AddonItem { id: string; name: string; price_cents: number; duration_minutes: number }

// Kotitalousvähennys 40 % kohdistuu työn osuuteen, joka on siivouksessa n. 95 % hinnasta.
const NET_FACTOR = 1 - 0.40 * 0.95; // ≈ 0.62
const QUICK = [{ l: "Yksiö", m: 30 }, { l: "Kaksio", m: 55 }, { l: "Kolmio", m: 75 }, { l: "Iso", m: 100 }];
const MONTHS = ["Tammikuu","Helmikuu","Maaliskuu","Huhtikuu","Toukokuu","Kesäkuu","Heinäkuu","Elokuu","Syyskuu","Lokakuu","Marraskuu","Joulukuu"];
const WD = ["Ma","Ti","Ke","To","Pe","La","Su"];

function calDays(y: number, m: number) {
  let start = new Date(y, m, 1).getDay() - 1; if (start < 0) start = 6;
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return cells;
}
const dateLabel = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${WD[(d.getDay() + 6) % 7]} ${d.getDate()}.${d.getMonth() + 1}.`;
};

export default function BookingCard({ services = [], variants = [], addons = [] }: { services?: ServiceItem[]; variants?: VariantItem[]; addons?: AddonItem[] }) {
  const service = services[0];
  const sorted = useMemo(() => [...variants].sort((a, b) => (a.metadata?.max_m2 ?? 9999) - (b.metadata?.max_m2 ?? 9999)), [variants]);

  const [step, setStep] = useState(0); // 0 calc,1 postal,2 date,3 contact,4 done
  const [m2, setM2] = useState(60);
  const [postal, setPostal] = useState("");
  const [postalState, setPostalState] = useState<"" | "checking" | "ok" | "no">("");
  const [cal, setCal] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [slots, setSlots] = useState<Record<string, string[]>>({});
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [selAddons, setSelAddons] = useState<string[]>([]);
  const [c, setC] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingNumber, setBookingNumber] = useState<number | null>(null);

  const variant = useMemo(() => {
    for (const v of sorted) if (m2 < (v.metadata?.max_m2 ?? Infinity)) return v;
    return null;
  }, [sorted, m2]);
  const isQuote = m2 > 190;
  const price = variant ? variant.price_cents / 100 : 0;
  const net = Math.round(price * NET_FACTOR);
  const chosenAddons = useMemo(() => addons.filter((a) => selAddons.includes(a.id)), [addons, selAddons]);
  const addonTotal = chosenAddons.reduce((s, a) => s + a.price_cents, 0) / 100;
  const total = price + addonTotal;
  const addonKey = useMemo(() => [...selAddons].sort().join(","), [selAddons]);

  // postal check
  useEffect(() => {
    if (step !== 1 || !/^\d{5}$/.test(postal) || !service) return;
    let off = false; setPostalState("checking");
    fetch(`/api/check-postal?service_id=${service.id}&postal_code=${postal}`)
      .then((r) => r.json()).then((d) => { if (!off) setPostalState(d.served ? "ok" : "no"); })
      .catch(() => { if (!off) setPostalState("no"); });
    return () => { off = true; };
  }, [postal, step, service]);

  // availability — addon selection affects duration, so it invalidates fetched slots
  useEffect(() => {
    setSlots({}); setDate(null); setTime(null);
  }, [addonKey, variant?.id]);
  useEffect(() => {
    if (step !== 2 || !service || !variant) return;
    const from = `${cal.y}-${String(cal.m + 1).padStart(2, "0")}-01`;
    const last = new Date(cal.y, cal.m + 1, 0).getDate();
    const to = `${cal.y}-${String(cal.m + 1).padStart(2, "0")}-${last}`;
    const addonParam = addonKey ? `&addon_ids=${addonKey}` : "";
    setLoadingSlots(true);
    fetch(`/api/availability?service_id=${service.id}&postal_code=${postal}&from=${from}&to=${to}&variant_id=${variant.id}${addonParam}`)
      .then((r) => r.json()).then((d) => setSlots((p) => ({ ...p, ...(d.availableSlots || {}) })))
      .catch(() => {})
      .finally(() => setLoadingSlots(false));
  }, [step, cal, service, variant, postal, addonKey]);

  function goToContact() {
    setStep(3);
    pushToDataLayer("begin_checkout", { value: total, currency: "EUR", service_name: service?.name ?? "" });
    trackMetaEvent("InitiateCheckout", { value: total, currency: "EUR", content_name: service?.name ?? "" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const eventId = generateClientEventId();
      const res = await fetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id, variantId: variant?.id, postalCode: postal, date, timeSlot: time, ...c,
          addons: chosenAddons.map((a) => ({ id: a.id, name: a.name, priceCents: a.price_cents, durationMinutes: a.duration_minutes })),
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
          eventId, ...getMetaCookies(), gclid: getGclid(), fbclid: getFbclid(), ...getAttribution(),
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Varaus epäonnistui. Yritä uudelleen."); return; }

      // Client-side conversion — deduplicated with server (CAPI/Enhanced Conversions) via eventId
      const value = (d.finalPriceCents ?? Math.round(total * 100)) / 100;
      pushToDataLayer("booking_completed", {
        transaction_id: eventId,
        value,
        currency: "EUR",
        service_name: service.name,
        booking_number: d.bookingNumber,
        // Enhanced Conversions — plaintext, Google hashes automatically
        user_email: c.email.trim().toLowerCase(),
        user_phone: c.phone.trim().replace(/\s+/g, "").replace(/^0/, "+358"),
        user_first_name: c.firstName.trim(),
        user_last_name: c.lastName.trim(),
        user_street: c.address.trim(),
        user_region: "Uusimaa",
        user_postal_code: postal,
        user_country: "FI",
      });
      trackMetaEvent("Purchase", { value, currency: "EUR", content_name: service.name }, eventId);

      setBookingNumber(d.bookingNumber ?? null);
      setStep(4);
    } catch { setErr("Yhteysvirhe. Yritä uudelleen."); }
    finally { setBusy(false); }
  }

  if (!service) {
    return <div className="calc"><div className="ct">Laske muuttosiivouksesi hinta</div><p className="csub">Palvelut päivitetään pian.</p></div>;
  }

  const dots = (
    <div className="bk-steps">{[1, 2, 3].map((s) => <div key={s} className={`s${step >= s ? " on" : ""}`} />)}</div>
  );

  const mini = (
    <div className="bk-mini">
      <span><b>{variant?.label}</b>{chosenAddons.length > 0 ? ` + ${chosenAddons.length} lisäpalvelu${chosenAddons.length > 1 ? "a" : ""}` : ""} · sis. alv</span>
      <span className="bk-mini-price">{total} €</span>
    </div>
  );

  return (
    <div className="calc" id="varaa">
      <div className="bk-step" key={step}>
      {/* STEP 0 — calculator */}
      {step === 0 && (
        <>
          <div className="ct"><span className="pin"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3c2 5 6 8 6 12a6 6 0 11-12 0c0-4 4-7 6-12z" stroke="#0968C8" strokeWidth="1.8" strokeLinejoin="round" /></svg></span> Laske muuttosiivouksesi hinta</div>
          <div className="csub">Hinta määräytyy asunnon koon mukaan — näet sen heti.</div>
          <div className="quick">
            {QUICK.map((q) => <button key={q.l} className={m2 === q.m ? "on" : ""} onClick={() => setM2(q.m)}>{q.l}</button>)}
          </div>
          <div className="top"><span className="lbl">Asunnon koko</span><span className="m2">{m2 >= 195 ? "195+ " : m2 + " "}m²</span></div>
          <input type="range" min={25} max={195} step={5} value={m2} onChange={(e) => setM2(+e.target.value)} />
          <div className="ticks"><span>25 m²</span><span>110 m²</span><span>195+ m²</span></div>
          <div className="price">
            <div className="pt">Kiinteä hinta (sis. alv)</div>
            <div className="pv">{isQuote ? "Tarjous" : <>{price}<small>€</small></>}</div>
            <div className="net">{isQuote ? "Yli 190 m² — annamme kiinteän tarjouksen." : <>Kotitalousvähennyksen jälkeen <b>n. {net} €</b></>}</div>
          </div>
          {isQuote ? (
            <a href="/ota-yhteytta" className="btn btn-p btn-lg cbtn">Pyydä tarjous</a>
          ) : (
            <button className="btn btn-p btn-lg cbtn" onClick={() => setStep(1)}>Varaa tämä hinta
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          <div className="cnote">Ilmainen, ei sitoumusta · vahvistus sähköpostiin</div>
        </>
      )}

      {/* STEP 1 — postal */}
      {step === 1 && (
        <>
          {dots}
          <div className="ct" style={{ marginBottom: 14 }}>Tarkista palvelualue</div>
          {mini}
          <div className="bk-field">
            <label>Asunnon postinumero</label>
            <input className="bk-input" inputMode="numeric" placeholder="00100" value={postal}
              onChange={(e) => { setPostal(e.target.value.replace(/\D/g, "").slice(0, 5)); setPostalState(""); }} autoFocus />
            {postalState === "checking" && <div className="csub" style={{ marginTop: 8 }}>Tarkistetaan…</div>}
            {postalState === "ok" && <div className="bk-ok">Toimimme alueellasi! ✓</div>}
            {postalState === "no" && <div className="bk-err">Emme valitettavasti toimi vielä tällä alueella. <a href="/ota-yhteytta" style={{ color: "var(--blue)", fontWeight: 700 }}>Ota yhteyttä →</a></div>}
          </div>
          {addons.length > 0 && (
            <div className="bk-field" style={{ marginTop: 4 }}>
              <label>Lisäpalvelut (valinnainen)</label>
              <div className="bk-addons">
                {addons.map((a) => {
                  const on = selAddons.includes(a.id);
                  return (
                    <button type="button" key={a.id} className={`bk-addon${on ? " on" : ""}`} aria-pressed={on}
                      onClick={() => setSelAddons((p) => on ? p.filter((id) => id !== a.id) : [...p, a.id])}>
                      <span className="bk-addon-chk">{on ? "✓" : "+"}</span>
                      <span className="bk-addon-name">{a.name}</span>
                      <span className="bk-addon-price">{a.price_cents / 100} €</span>
                    </button>
                  );
                })}
              </div>
              {addonTotal > 0 && <div className="csub" style={{ marginTop: 8 }}>Lisäpalvelut yhteensä <b>+{addonTotal} €</b> — kokonaishinta <b>{total} €</b></div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="bk-back" onClick={() => setStep(0)}>← Takaisin</button>
            <button className="btn btn-p" style={{ marginLeft: "auto" }} disabled={postalState !== "ok"} onClick={() => setStep(2)}>Jatka</button>
          </div>
        </>
      )}

      {/* STEP 2 — date & time */}
      {step === 2 && (
        <>
          {dots}
          <div className="ct" style={{ marginBottom: 14 }}>Valitse ajankohta</div>
          {mini}
          <div className="bk-cal">
            <div className="bk-calhead">
              <button onClick={() => setCal((p) => { const d = new Date(p.y, p.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>‹</button>
              <span>{MONTHS[cal.m]} {cal.y}</span>
              <button onClick={() => setCal((p) => { const d = new Date(p.y, p.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>›</button>
            </div>
            <div className="bk-dow">{WD.map((d) => <span key={d}>{d}</span>)}</div>
            <div className="bk-days">
              {calDays(cal.y, cal.m).map((d, i) => {
                if (d === null) return <span key={`e${i}`} />;
                const key = `${cal.y}-${String(cal.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const has = (slots[key]?.length ?? 0) > 0;
                const now = new Date();
                const isToday = now.getFullYear() === cal.y && now.getMonth() === cal.m && now.getDate() === d;
                return <button key={key} className={`bk-day${date === key ? " sel" : ""}${isToday ? " today" : ""}`} disabled={!has} onClick={() => { setDate(key); setTime(null); }}>{d}</button>;
              })}
            </div>
          </div>
          {loadingSlots && Object.keys(slots).length === 0 && <div className="bk-loading">Haetaan vapaita aikoja…</div>}
          {!date && !loadingSlots && Object.keys(slots).length > 0 && <div className="csub" style={{ marginTop: 12, marginBottom: 0, textAlign: "center" }}>Valitse päivä kalenterista.</div>}
          {date && (
            <>
              <div className="bk-field" style={{ marginTop: 14, marginBottom: 0 }}><label>Vapaat ajat · {dateLabel(date)}</label></div>
              <div className="bk-times" style={{ marginTop: 8 }}>
                {(slots[date] || []).map((t) => <button key={t} className={`bk-time${time === t ? " sel" : ""}`} onClick={() => setTime(t)}>{t}</button>)}
                {(slots[date] || []).length === 0 && <div className="csub" style={{ gridColumn: "1/-1" }}>Ei vapaita aikoja.</div>}
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="bk-back" onClick={() => setStep(1)}>← Takaisin</button>
            <button className="btn btn-p" style={{ marginLeft: "auto" }} disabled={!date || !time} onClick={goToContact}>Jatka</button>
          </div>
        </>
      )}

      {/* STEP 3 — contact */}
      {step === 3 && (
        <form onSubmit={submit}>
          {dots}
          <div className="ct" style={{ marginBottom: 14 }}>Yhteystiedot ja vahvistus</div>
          <div className="bk-summary">
            <b>{variant?.label}</b> · {price} € &nbsp;·&nbsp; {date && dateLabel(date)} klo {time}
            {chosenAddons.length > 0 && <div style={{ marginTop: 4, fontWeight: 400 }}>{chosenAddons.map((a) => a.name).join(", ")} · yhteensä <b>{total} €</b></div>}
          </div>
          <div className="bk-row">
            <div className="bk-field"><label>Etunimi</label><input className="bk-input" required value={c.firstName} onChange={(e) => setC({ ...c, firstName: e.target.value })} /></div>
            <div className="bk-field"><label>Sukunimi</label><input className="bk-input" required value={c.lastName} onChange={(e) => setC({ ...c, lastName: e.target.value })} /></div>
          </div>
          <div className="bk-row">
            <div className="bk-field"><label>Sähköposti</label><input className="bk-input" type="email" required value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></div>
            <div className="bk-field"><label>Puhelin</label><input className="bk-input" required value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></div>
          </div>
          <div className="bk-field"><label>Osoite ({postal})</label><input className="bk-input" required value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} placeholder="Katuosoite" /></div>
          <div className="bk-field"><label>Lisätiedot (valinnainen)</label><input className="bk-input" value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} placeholder="Esim. avainten luovutus" /></div>
          {err && <div className="bk-err">{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button type="button" className="bk-back" onClick={() => setStep(2)}>← Takaisin</button>
            <button type="submit" className="btn btn-p" style={{ marginLeft: "auto" }} disabled={busy}>{busy ? "Lähetetään…" : `Vahvista — ${total} €`}</button>
          </div>
          <div className="bk-trust">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8"/><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8"/></svg>
            Ei maksua nyt · ei sitoumusta ennen vahvistusta · tietosi ovat turvassa
          </div>
        </form>
      )}

      {/* STEP 4 — done */}
      {step === 4 && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(9,104,200,.12)", display: "grid", placeItems: "center", margin: "0 auto 18px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#0968C8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div className="ct" style={{ justifyContent: "center" }}>Varaus vastaanotettu!</div>
          {bookingNumber && <div style={{ fontFamily: "Gabarito", fontWeight: 800, color: "var(--blue)", marginTop: 4 }}>Varausnumero #{bookingNumber}</div>}
          <p className="csub" style={{ marginTop: 8 }}>Lähetämme vahvistuksen sähköpostiisi. {variant?.label}{chosenAddons.length > 0 ? ` + ${chosenAddons.map((a) => a.name).join(", ")}` : ""} · {total} € · {date && dateLabel(date)} klo {time}.</p>
          <button className="btn btn-g" style={{ marginTop: 16 }} onClick={() => { setStep(0); setDate(null); setTime(null); setPostal(""); setPostalState(""); setSelAddons([]); setBookingNumber(null); setC({ firstName: "", lastName: "", email: "", phone: "", address: "", notes: "" }); }}>Tee uusi varaus</button>
        </div>
      )}
      </div>
    </div>
  );
}
