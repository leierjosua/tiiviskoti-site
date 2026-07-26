"use client";

import Link from "next/link";
import { useState } from "react";
import V4Nav from "../components/V4Nav";
import V4Footer from "../components/V4Footer";
import SiteScripts from "../components/SiteScripts";

type Rating = "positive" | "neutral" | "negative";

export default function Arvostelu() {
  const [phase, setPhase] = useState<"rate" | "feedback" | "thanks">("rate");
  const [rating, setRating] = useState<Rating | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  function pick(r: Rating) {
    setRating(r);
    if (r === "positive") setPhase("thanks");
    else setPhase("feedback");
  }

  async function send() {
    if (!feedback.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, feedback }),
      });
    } catch { /* ignore */ }
    setBusy(false);
    setPhase("thanks");
  }

  const faces: { r: Rating; e: string; l: string }[] = [
    { r: "negative", e: "🙁", l: "Ei hyvä" },
    { r: "neutral", e: "😐", l: "Ok" },
    { r: "positive", e: "😀", l: "Hyvä!" },
  ];

  return (
    <div className="v4">
      <V4Nav />
      <section className="subhero"><div className="wrap">
        <div className="crumbs"><Link href="/">Etusivu</Link><span>/</span><span>Palaute</span></div>
        <h1>Miten meni?</h1>
        <p>Palautteesi auttaa meitä kehittymään. Kerro miten ikkunanpesu sujui.</p>
      </div></section>

      <section className="sec"><div className="wrap" style={{ maxWidth: 620 }}>
        <div className="formcard">
          {phase === "rate" && (
            <div style={{ textAlign: "center" }}>
              <div className="ct" style={{ justifyContent: "center", marginBottom: 24 }}>Kuinka tyytyväinen olit?</div>
              <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
                {faces.map((f) => (
                  <button key={f.r} onClick={() => pick(f.r)} className="btn btn-g" style={{ flexDirection: "column", height: "auto", padding: "18px 22px", borderRadius: "var(--r)" }}>
                    <span style={{ fontSize: 34 }}>{f.e}</span>
                    <span style={{ fontSize: 13 }}>{f.l}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {phase === "feedback" && (
            <div>
              <div className="ct" style={{ marginBottom: 14 }}>Kerro lisää — mitä olisimme voineet tehdä paremmin?</div>
              <textarea className="bk-input" rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Palautteesi…" style={{ resize: "vertical" }} autoFocus />
              <button className="btn btn-p btn-lg" style={{ width: "100%", marginTop: 14 }} disabled={busy || !feedback.trim()} onClick={send}>{busy ? "Lähetetään…" : "Lähetä palaute"}</button>
            </div>
          )}
          {phase === "thanks" && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 10 }}>💙</div>
              <div className="ct" style={{ justifyContent: "center" }}>Kiitos palautteestasi!</div>
              <p className="csub" style={{ marginTop: 8 }}>
                {rating === "positive"
                  ? "Mahtavaa! Arvostaisimme suuresti, jos jätät meille arvion myös Googleen."
                  : "Otamme palautteesi vakavasti ja kehitämme toimintaamme sen pohjalta."}
              </p>
              <Link href="/" className="btn btn-g" style={{ marginTop: 16 }}>Etusivulle</Link>
            </div>
          )}
        </div>
      </div></section>

      <V4Footer />
      <SiteScripts />
    </div>
  );
}
