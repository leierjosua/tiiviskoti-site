"use client";

import { useState } from "react";
import { pushToDataLayer, trackMetaEvent, generateClientEventId, getMetaCookies } from "./Analytics";

/** Yhteydenottolomake (formcard) — käytössä etusivulla ja /ota-yhteytta-sivulla. */
export default function ContactForm() {
  const [f, setF] = useState({ name: "", email: "", phone: "", postalCode: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(false);
    try {
      const eventId = generateClientEventId();
      const res = await fetch("/api/form-submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formSlug: "yhteydenotto", ...f, pageUrl: window.location.href, eventId, ...getMetaCookies() }),
      });
      if (!res.ok) throw new Error();

      // Client-side Lead conversion — deduplicated with server CAPI via eventId
      pushToDataLayer("generate_lead", { form: "yhteydenotto" });
      trackMetaEvent("Lead", { content_name: "Yhteydenottolomake" }, eventId);

      setDone(true);
    } catch { setErr(true); } finally { setBusy(false); }
  }

  return (
    <div className="formcard">
      {done ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(9,104,200,.12)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#0968C8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div className="ct" style={{ justifyContent: "center" }}>Kiitos viestistäsi!</div>
          <p className="csub" style={{ marginTop: 8 }}>Otamme sinuun yhteyttä pian.</p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="bk-field"><label>Nimi</label><input className="bk-input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Matti Meikäläinen" /></div>
          <div className="bk-row">
            <div className="bk-field"><label>Sähköposti</label><input className="bk-input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="matti@esimerkki.fi" /></div>
            <div className="bk-field"><label>Puhelin</label><input className="bk-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="045 875 5996" /></div>
          </div>
          <div className="bk-field"><label>Postinumero</label><input className="bk-input" inputMode="numeric" value={f.postalCode} onChange={(e) => setF({ ...f, postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder="00100" /></div>
          <div className="bk-field"><label>Viesti</label><textarea className="bk-input" rows={5} required value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Kerro miten voimme auttaa…" style={{ resize: "vertical" }} /></div>
          {err && <div className="bk-err">Lähetys epäonnistui. Yritä uudelleen tai soita 045 875 5996.</div>}
          <button type="submit" className="btn btn-p btn-lg" style={{ width: "100%", marginTop: 4 }} disabled={busy}>{busy ? "Lähetetään…" : "Lähetä viesti"}</button>
        </form>
      )}
    </div>
  );
}
