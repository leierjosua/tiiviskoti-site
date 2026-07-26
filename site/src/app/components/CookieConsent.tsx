"use client";

import { useEffect, useState } from "react";

interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

const STORAGE_KEY = "cookie-consent";

function getStoredConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConsent(consent: ConsentState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  window.dispatchEvent(new Event("cookie-consent-change"));
}

function CookieIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.4 13.1a1.9 1.9 0 0 1-2.6-2.3 1.9 1.9 0 0 1-2.3-2.6A1.9 1.9 0 0 1 14 5.6 1.9 1.9 0 0 1 11.4 3 9.2 9.2 0 1 0 21.4 13.1Z"
        stroke="#0968C8"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="8.6" cy="10" r="1.3" fill="#0968C8" />
      <circle cx="12.6" cy="15.6" r="1.3" fill="#0968C8" />
      <circle cx="7.6" cy="15.2" r="0.9" fill="#2489F0" />
    </svg>
  );
}

function ConsentRow({
  locked,
  on,
  title,
  desc,
  onToggle,
}: {
  locked?: boolean;
  on: boolean;
  title: string;
  desc: string;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      className={`cc-row${locked ? " lock" : on ? " on" : ""}`}
      onClick={onToggle}
      disabled={locked}
      role="switch"
      aria-checked={locked || on}
    >
      <span>
        <b>{title}</b>
        <span className="d">{desc}</span>
      </span>
      <span className="cc-sw" />
    </button>
  );
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(true);

  useEffect(() => {
    const stored = getStoredConsent();
    if (!stored) {
      // Delay so cookie modal doesn't become LCP element
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  function close(a: boolean, m: boolean) {
    saveConsent({ necessary: true, analytics: a, marketing: m, timestamp: new Date().toISOString() });
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="cc-wrap">
      <div className="cc-card" role="dialog" aria-label="Evästeasetukset">
        <div className="cc-head">
          <span className="cc-ico"><CookieIcon /></span>
          <div>
            <div className="cc-title">{showDetails ? "Evästeasetukset" : "Käytämme evästeitä"}</div>
            <div className="cc-site">lasikiilto.fi</div>
          </div>
        </div>

        {!showDetails ? (
          <>
            <p className="cc-text">
              Välttämättömien lisäksi käytämme evästeitä analytiikkaan ja markkinointiin.
              Voit sallia kaikki tai jatkaa vain välttämättömillä.{" "}
              <a href="/tietosuoja">Tietosuojaseloste</a>
            </p>
            <div className="cc-actions">
              <button onClick={() => close(false, false)} className="btn btn-g cc-btn">
                Vain välttämättömät
              </button>
              <button onClick={() => close(true, true)} className="btn btn-p cc-btn">
                Salli kaikki
              </button>
            </div>
            <button onClick={() => setShowDetails(true)} className="cc-link">
              Muokkaa valintoja
            </button>
          </>
        ) : (
          <>
            <div className="cc-rows">
              <ConsentRow
                locked
                on
                title="Välttämättömät"
                desc="Sivuston perustoimintaan tarvittavat. Aina käytössä."
              />
              <ConsentRow
                on={analytics}
                onToggle={() => setAnalytics((v) => !v)}
                title="Analytiikka"
                desc="Auttaa ymmärtämään miten sivustoa käytetään (Google Analytics)."
              />
              <ConsentRow
                on={marketing}
                onToggle={() => setMarketing((v) => !v)}
                title="Markkinointi"
                desc="Mainosten kohdentamiseen ja mittaamiseen (Google Ads, Meta)."
              />
            </div>
            <div className="cc-actions">
              <button onClick={() => close(analytics, marketing)} className="btn btn-g cc-btn">
                Tallenna valinnat
              </button>
              <button onClick={() => close(true, true)} className="btn btn-p cc-btn">
                Salli kaikki
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Re-open cookie settings (call from footer link) */
export function openCookieSettings() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
