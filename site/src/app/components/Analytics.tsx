"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

// Lasikiilto-omat tunnukset — julkiset ID:t kovakoodattu (KouruX-malli),
// salaisuudet ja loput tunnukset ympäristömuuttujina. Tyhjinä seurantaa ei ladata.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-N64H7SL2";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";
const GADS_ID = process.env.NEXT_PUBLIC_GADS_ID ?? "AW-18303632759";
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

function getConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("cookie-consent");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function Analytics() {
  const [consent, setConsent] = useState<ConsentState | null>(null);

  useEffect(() => {
    setConsent(getConsent());

    const handler = () => setConsent(getConsent());
    window.addEventListener("cookie-consent-change", handler);
    return () => window.removeEventListener("cookie-consent-change", handler);
  }, []);

  // Capture ad-click attribution (gclid/fbclid/UTM) so it survives navigation
  // within the session — the booking can happen on a different page than the landing.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const gclid = params.get("gclid");
      const fbclid = params.get("fbclid");
      if (gclid) sessionStorage.setItem("ls_gclid", gclid);
      if (fbclid) sessionStorage.setItem("ls_fbclid", fbclid);
      if (!sessionStorage.getItem("ls_attribution")) {
        sessionStorage.setItem(
          "ls_attribution",
          JSON.stringify({
            utmSource: params.get("utm_source") || undefined,
            utmMedium: params.get("utm_medium") || undefined,
            utmCampaign: params.get("utm_campaign") || undefined,
            utmTerm: params.get("utm_term") || undefined,
            utmContent: params.get("utm_content") || undefined,
            referrer: document.referrer || undefined,
            landingPage: window.location.href,
          })
        );
      }
    } catch {
      // sessionStorage unavailable (private mode) — attribution is best-effort
    }
  }, []);

  // Phone-click conversion — all tel: links sitewide
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const link = target?.closest?.('a[href^="tel:"]');
      if (!link) return;
      const phone = link.getAttribute("href")?.replace("tel:", "") ?? "";
      pushToDataLayer("phone_click", { phone_number: phone });
      trackMetaEvent("Contact", { content_name: "Puhelinsoitto" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Update consent mode when consent changes
  useEffect(() => {
    if (!consent || typeof window === "undefined") return;
    if (!window.gtag) return;

    window.gtag("consent", "update", {
      ad_storage: consent.marketing ? "granted" : "denied",
      ad_user_data: consent.marketing ? "granted" : "denied",
      ad_personalization: consent.marketing ? "granted" : "denied",
      analytics_storage: consent.analytics ? "granted" : "denied",
    });
  }, [consent]);

  return (
    <>
      {/* Google Consent Mode v2 — must load before GTM/gtag */}
      <Script id="consent-defaults" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied',
            'wait_for_update': 500
          });

          // Block automatic form_start/form_submit from Google Ads tag (known bug)
          // Override dataLayer.push to filter these events before GTM processes them
          (function() {
            var _push = Array.prototype.push;
            Object.defineProperty(window.dataLayer, 'push', {
              configurable: true,
              enumerable: false,
              writable: true,
              value: function() {
                var args = [];
                for (var i = 0; i < arguments.length; i++) {
                  var arg = arguments[i];
                  if (arg && typeof arg === 'object' && (arg.event === 'form_start' || arg.event === 'form_submit')) {
                    continue;
                  }
                  args.push(arg);
                }
                if (args.length > 0) {
                  return _push.apply(this, args);
                }
                return this.length;
              }
            });
          })();
        `}
      </Script>

      {/* GTM — primary tag manager (loads GA4, Google Ads tags, configured in GTM UI) */}
      {GTM_ID && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
      )}

      {/* Google tag (gtag.js) — Adsin perustagi: asennuksen tunnistus, remarketing,
          Enhanced Conversions. Ladataan aina; Consent Mode v2 säätelee evästeet.
          Konversiot ammutaan GTM-tageilla, joten tämä ei aiheuta tuplalaskentaa. */}
      {(GADS_ID || GA_ID) && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GADS_ID || GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              ${GADS_ID ? `gtag('config', '${GADS_ID}');` : ""}
              ${GA_ID ? `gtag('config', '${GA_ID}');` : ""}
            `}
          </Script>
        </>
      )}

      {/* Meta Pixel — client-side for pageviews + remarketing */}
      {consent?.marketing && META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
    </>
  );
}

// ─── Helper functions for client-side tracking ────────

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: Record<string, unknown>[];
  }
}

/** Push event to GTM dataLayer */
export function pushToDataLayer(event: string, data?: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.dataLayer) {
    window.dataLayer.push({ event, ...data });
  }
}

/** Google Ads conversion (client-side, deduplicated with server via event_id) */
export function trackGoogleConversion(
  conversionLabel: string,
  value?: number,
  transactionId?: string
) {
  if (typeof window !== "undefined" && window.gtag && GADS_ID) {
    window.gtag("event", "conversion", {
      send_to: `${GADS_ID}/${conversionLabel}`,
      ...(value !== undefined && { value, currency: "EUR" }),
      ...(transactionId && { transaction_id: transactionId }),
    });
  }
}

/** Meta conversion (client-side, deduplicated with server via eventID) */
export function trackMetaEvent(
  event: string,
  data?: Record<string, unknown>,
  eventId?: string
) {
  if (typeof window !== "undefined" && window.fbq) {
    if (eventId) {
      window.fbq("track", event, data, { eventID: eventId });
    } else {
      window.fbq("track", event, data);
    }
  }
}

/** Custom GA4 event */
export function trackEvent(
  eventName: string,
  params?: Record<string, unknown>
) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, params);
  }
}

/** Generate event ID for client/server deduplication */
export function generateClientEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Get Meta click/browser IDs from cookies for server-side deduplication.
 * These are read from _fbc and _fbp cookies set by Meta Pixel.
 */
export function getMetaCookies(): { fbc?: string; fbp?: string } {
  if (typeof document === "undefined") return {};
  const cookies = document.cookie.split("; ").reduce(
    (acc, c) => {
      const [k, v] = c.split("=");
      acc[k] = v;
      return acc;
    },
    {} as Record<string, string>
  );
  return {
    fbc: cookies["_fbc"],
    fbp: cookies["_fbp"],
  };
}

/**
 * Get Google click ID from URL or sessionStorage (captured on landing)
 */
export function getGclid(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  try {
    return params.get("gclid") || sessionStorage.getItem("ls_gclid") || undefined;
  } catch {
    return params.get("gclid") || undefined;
  }
}

/**
 * Get Meta click ID from URL or sessionStorage (captured on landing)
 */
export function getFbclid(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  try {
    return params.get("fbclid") || sessionStorage.getItem("ls_fbclid") || undefined;
  } catch {
    return params.get("fbclid") || undefined;
  }
}

/**
 * Sticky UTM/referrer attribution captured on the session's landing page.
 */
export function getAttribution(): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  landingPage?: string;
} {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem("ls_attribution");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * SHA-256 hash for Enhanced Conversions.
 * Uses Web Crypto API (available in all modern browsers).
 */
async function sha256Browser(value: string): Promise<string> {
  const normalized = value.trim().toLowerCase();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash user data for Enhanced Conversions (Google Ads).
 * All values are normalized (trimmed, lowercased) and SHA-256 hashed.
 */
export async function hashUserData(data: {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  address: string;
  postalCode: string;
}): Promise<{
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  address: string;
  postalCode: string;
}> {
  const phone = data.phone.replace(/\s+/g, "").replace(/^0/, "+358");
  const [email, ph, firstName, lastName, address] = await Promise.all([
    sha256Browser(data.email),
    sha256Browser(phone),
    sha256Browser(data.firstName),
    sha256Browser(data.lastName),
    sha256Browser(data.address),
  ]);
  return {
    email,
    phone: ph,
    firstName,
    lastName,
    address,
    postalCode: data.postalCode,
  };
}
