/**
 * Server-side conversion tracking
 * - Meta Conversions API (CAPI)
 * - Google Ads Enhanced Conversions (via Google Ads API)
 * - GA4 Measurement Protocol
 *
 * All calls are fire-and-forget to not block the booking response.
 */

const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "");
const META_ACCESS_TOKEN = process.env.META_CONVERSIONS_API_TOKEN ?? "";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";
const GA_API_SECRET = process.env.GA4_API_SECRET ?? "";
const GADS_CUSTOMER_ID = process.env.GADS_CUSTOMER_ID ?? "";
const GADS_CONVERSION_ACTION_ID = process.env.GADS_CONVERSION_ACTION_ID ?? "";
const GADS_DEVELOPER_TOKEN = process.env.GADS_DEVELOPER_TOKEN ?? "";
const GADS_OAUTH_TOKEN = process.env.GADS_OAUTH_TOKEN ?? "";

// ─── Helpers ──────────────────────────────────────────

function sha256(value: string): string {
  const crypto = require("crypto");
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex");
}

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Types ────────────────────────────────────────────

export interface ConversionData {
  /** Unique event ID for deduplication between client & server */
  eventId: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  postalCode: string;
  /** Value in EUR (e.g. 149.00) */
  value: number;
  currency: string;
  /** Service name for content info */
  serviceName: string;
  /** Client IP (from request headers) */
  clientIp?: string;
  /** Client user agent */
  userAgent?: string;
  /** Facebook click ID (from _fbc cookie) */
  fbc?: string;
  /** Facebook browser ID (from _fbp cookie) */
  fbp?: string;
  /** Google click ID (from gclid param) */
  gclid?: string;
  /** Page URL where conversion happened */
  pageUrl?: string;
}

// ─── Meta Conversions API ─────────────────────────────

async function trackMetaConversion(data: ConversionData): Promise<void> {
  if (!META_PIXEL_ID || !META_ACCESS_TOKEN) return;

  const userData: Record<string, string> = {
    em: sha256(data.email),
    ph: sha256(data.phone.replace(/\s+/g, "").replace(/^0/, "+358")),
    fn: sha256(data.firstName),
    ln: sha256(data.lastName),
    zp: sha256(data.postalCode),
    country: sha256("fi"),
  };

  if (data.fbc) userData.fbc = data.fbc;
  if (data.fbp) userData.fbp = data.fbp;
  if (data.clientIp) userData.client_ip_address = data.clientIp;
  if (data.userAgent) userData.client_user_agent = data.userAgent;

  const eventData = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: data.eventId,
    event_source_url: data.pageUrl || "https://lasikiilto.fi",
    action_source: "website",
    user_data: userData,
    custom_data: {
      currency: data.currency,
      value: data.value,
      content_name: data.serviceName,
      content_type: "service",
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [eventData],
          access_token: META_ACCESS_TOKEN,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("[Meta CAPI] Error:", err);
    }
  } catch (err) {
    console.error("[Meta CAPI] Network error:", err);
  }
}

// ─── Google Ads Enhanced Conversions ──────────────────

async function trackGoogleAdsConversion(
  data: ConversionData
): Promise<void> {
  // Enhanced Conversions via Google Ads API
  if (!GADS_CUSTOMER_ID || !GADS_CONVERSION_ACTION_ID || !GADS_DEVELOPER_TOKEN || !GADS_OAUTH_TOKEN) return;

  const customerId = GADS_CUSTOMER_ID.replace(/-/g, "");

  const conversionPayload = {
    conversions: [
      {
        conversionAction: `customers/${customerId}/conversionActions/${GADS_CONVERSION_ACTION_ID}`,
        conversionDateTime: new Date()
          .toLocaleString("en-US", { timeZone: "Europe/Helsinki" })
          .replace(",", ""),
        conversionValue: data.value,
        currencyCode: data.currency,
        orderId: data.eventId,
        userIdentifiers: [
          { hashedEmail: sha256(data.email) },
          {
            hashedPhoneNumber: sha256(
              data.phone.replace(/\s+/g, "").replace(/^0/, "+358")
            ),
          },
          {
            addressInfo: {
              hashedFirstName: sha256(data.firstName),
              hashedLastName: sha256(data.lastName),
              countryCode: "FI",
              postalCode: data.postalCode,
            },
          },
        ],
        ...(data.gclid && { gclid: data.gclid }),
      },
    ],
    partialFailure: true,
  };

  try {
    const res = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}:uploadClickConversions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GADS_OAUTH_TOKEN}`,
          "developer-token": GADS_DEVELOPER_TOKEN,
        },
        body: JSON.stringify(conversionPayload),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("[Google Ads Enhanced] Error:", err);
    }
  } catch (err) {
    console.error("[Google Ads Enhanced] Network error:", err);
  }
}

// ─── GA4 Measurement Protocol ─────────────────────────

async function trackGA4ServerEvent(data: ConversionData): Promise<void> {
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) return;

  const payload = {
    client_id: data.eventId, // fallback client ID
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: data.eventId,
          value: data.value,
          currency: data.currency,
          items: [
            {
              item_name: data.serviceName,
              price: data.value,
              quantity: 1,
            },
          ],
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      console.error("[GA4 MP] Error:", res.status);
    }
  } catch (err) {
    console.error("[GA4 MP] Network error:", err);
  }
}

// ─── Main Export ──────────────────────────────────────

/**
 * Fire all server-side conversion events.
 * Call this after a successful booking insert.
 * All calls run in parallel and are non-blocking.
 */
export function trackServerConversions(data: ConversionData): void {
  // Fire-and-forget: don't await, don't block response
  Promise.allSettled([
    trackMetaConversion(data),
    trackGoogleAdsConversion(data),
    trackGA4ServerEvent(data),
  ]).catch(console.error);
}

// ─── Lead Event (Meta CAPI only) ─────────────────────

export interface LeadData {
  eventId: string;
  email: string;
  phone?: string;
  firstName?: string;
  formName: string;
  clientIp?: string;
  userAgent?: string;
  fbc?: string;
  fbp?: string;
  pageUrl?: string;
}

export function trackServerLead(data: LeadData): void {
  if (!META_PIXEL_ID || !META_ACCESS_TOKEN) return;

  const userData: Record<string, string> = {
    em: sha256(data.email),
    country: sha256("fi"),
  };

  if (data.phone) userData.ph = sha256(data.phone.replace(/\s+/g, "").replace(/^0/, "+358"));
  if (data.firstName) userData.fn = sha256(data.firstName);
  if (data.fbc) userData.fbc = data.fbc;
  if (data.fbp) userData.fbp = data.fbp;
  if (data.clientIp) userData.client_ip_address = data.clientIp;
  if (data.userAgent) userData.client_user_agent = data.userAgent;

  const eventData = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: data.eventId,
    event_source_url: data.pageUrl || "https://lasikiilto.fi",
    action_source: "website",
    user_data: userData,
    custom_data: {
      content_name: data.formName,
    },
  };

  fetch(
    `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [eventData],
        access_token: META_ACCESS_TOKEN,
      }),
    }
  ).catch((err) => console.error("[Meta CAPI Lead] Error:", err));
}

// ─── Schedule Event (Meta CAPI — for free appointments / surveys) ───

export function trackServerSchedule(data: ConversionData): void {
  if (!META_PIXEL_ID || !META_ACCESS_TOKEN) return;

  const userData: Record<string, string> = {
    em: sha256(data.email),
    country: sha256("fi"),
  };

  if (data.phone) userData.ph = sha256(data.phone.replace(/\s+/g, "").replace(/^0/, "+358"));
  if (data.firstName) userData.fn = sha256(data.firstName);
  if (data.lastName) userData.ln = sha256(data.lastName);
  if (data.postalCode) userData.zp = sha256(data.postalCode);
  if (data.fbc) userData.fbc = data.fbc;
  if (data.fbp) userData.fbp = data.fbp;
  if (data.clientIp) userData.client_ip_address = data.clientIp;
  if (data.userAgent) userData.client_user_agent = data.userAgent;

  const eventData = {
    event_name: "Schedule",
    event_time: Math.floor(Date.now() / 1000),
    event_id: data.eventId,
    event_source_url: data.pageUrl || "https://lasikiilto.fi",
    action_source: "website",
    user_data: userData,
    custom_data: {
      content_name: data.serviceName,
      currency: data.currency,
      value: data.value,
    },
  };

  fetch(
    `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [eventData],
        access_token: META_ACCESS_TOKEN,
      }),
    }
  ).catch((err) => console.error("[Meta CAPI Schedule] Error:", err));
}

export { generateEventId };
