import { getGoogleAccessToken } from "../_shared/google-auth.ts";

const SENDER_EMAIL = "info@tiiviskoti.fi";
const NOTIFY_EMAIL = "info@tiiviskoti.fi";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ContactPayload {
  formSlug: string;
  name: string;
  email: string;
  phone?: string;
  postalCode?: string;
  message?: string;
  pageUrl?: string;
  // Taloyhtio-specific
  role?: string;
  association?: string;
  buildings?: string;
  // Feedback-specific
  rating?: string;
  feedback?: string;
}

const FORM_LABELS: Record<string, string> = {
  yhteydenotto: "Yhteydenotto",
  taloyhtio: "Taloyhtiö-yhteydenotto",
  "chatbot-yhteydenotto": "Chatbot-yhteydenotto",
  arvostelu: "Palaute",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: ContactPayload = await req.json();
    const { formSlug } = payload;

    if (!formSlug) {
      return new Response(
        JSON.stringify({ error: "formSlug required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formLabel = FORM_LABELS[formSlug] || formSlug;
    const { subject, html } = buildNotificationEmail(formLabel, payload);

    const accessToken = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/gmail.send",
      SENDER_EMAIL
    );

    const raw = buildRawEmail(NOTIFY_EMAIL, subject, html);

    const gmailRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }
    );

    if (!gmailRes.ok) {
      const errText = await gmailRes.text();
      console.error("Gmail API error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gmailData = await gmailRes.json();
    return new Response(
      JSON.stringify({ success: true, messageId: gmailData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-contact-email error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildNotificationEmail(
  formLabel: string,
  p: ContactPayload
): { subject: string; html: string } {
  const now = new Date();
  const timestamp = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()} klo ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Build info rows based on form type
  let rows = "";

  if (p.formSlug === "arvostelu") {
    const ratingLabel =
      p.rating === "positive" ? "Positiivinen" :
      p.rating === "neutral" ? "Neutraali" :
      p.rating === "negative" ? "Negatiivinen" : (p.rating || "-");
    const ratingColor =
      p.rating === "positive" ? "#16a34a" :
      p.rating === "negative" ? "#dc2626" : "#d97706";
    rows += infoRow("Arvosana", `<span style="color:${ratingColor};font-weight:800">${ratingLabel}</span>`);
    if (p.feedback) rows += messageBlock(p.feedback);
  } else {
    if (p.name) rows += infoRow("Nimi", p.name);
    if (p.email) rows += infoRow("Sähköposti", `<a href="mailto:${p.email}" style="color:#217A4E;text-decoration:none;font-weight:600">${p.email}</a>`);
    if (p.phone) rows += infoRow("Puhelin", `<a href="tel:${p.phone}" style="color:#217A4E;text-decoration:none;font-weight:600">${p.phone}</a>`);
    if (p.postalCode) rows += infoRow("Postinumero", p.postalCode);

    // Taloyhtio extras
    if (p.role) rows += infoRow("Rooli", p.role);
    if (p.association) rows += infoRow("Taloyhtiö", p.association);
    if (p.buildings) rows += infoRow("Rakennuksia", p.buildings);

    if (p.message) rows += messageBlock(p.message);
  }

  const subject = `Uusi ${formLabel.toLowerCase()} — TiivisKoti`;

  const html = emailWrapper(`
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-block;background:#f0fdf4;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px">
        &#9993;
      </div>
    </div>
    <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 8px;text-align:center">Uusi ${formLabel.toLowerCase()}</h1>
    <p style="color:#666;font-size:14px;margin:0 0 32px;text-align:center">${timestamp}${p.pageUrl ? ` &middot; <a href="${p.pageUrl}" style="color:#94a3b8;text-decoration:none">${new URL(p.pageUrl).pathname}</a>` : ""}</p>

    <div style="background:#fafafa;border-radius:12px;padding:24px;margin-bottom:24px">
      ${rows}
    </div>

    ${p.email && p.formSlug !== "arvostelu" ? `
    <div style="text-align:center">
      <a href="mailto:${p.email}" style="display:inline-block;background:#1a1a1a;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:14px">
        Vastaa asiakkaalle
      </a>
    </div>
    ` : ""}
  `);

  return { subject, html };
}

function infoRow(label: string, value: string): string {
  return `
    <table style="width:100%;margin-bottom:12px"><tr>
      <td style="color:#888;font-size:13px;padding:0;vertical-align:top;white-space:nowrap;width:120px">${label}</td>
      <td style="font-weight:600;font-size:14px;color:#1a1a1a;padding:0;vertical-align:top">${value}</td>
    </tr></table>`;
}

function messageBlock(text: string): string {
  return `
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb">
      <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin:0 0 8px">Viesti</p>
      <p style="color:#1a1a1a;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap">${text}</p>
    </div>`;
}

const LOGO_URL = "https://tiiviskoti.fi/img/logo-email-badge.png";

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Outfit',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased">
  <div style="max-width:560px;margin:0 auto;padding:48px 16px">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px">
      <img src="${LOGO_URL}" alt="TiivisKoti" width="200" style="display:inline-block;height:auto;max-width:200px" />
    </div>
    <!-- Card -->
    <div style="background:white;border-radius:20px;padding:40px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 4px 12px rgba(0,0,0,0.04)">
      ${content}
    </div>
    <!-- Footer -->
    <div style="text-align:center;padding:24px 0">
      <p style="color:#94a3b8;font-size:12px;margin:0 0 4px">TiivisKoti | info@tiiviskoti.fi</p>
      <p style="color:#cbd5e1;font-size:11px;margin:0">Rakennamme parempaa kotiasi</p>
    </div>
  </div>
</body>
</html>`;
}

function buildRawEmail(to: string, subject: string, html: string): string {
  const encoder = new TextEncoder();
  const subjectB64 = btoa(String.fromCharCode(...encoder.encode(subject)));
  const headers = [
    `From: TiivisKoti <${SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${subjectB64}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
  ].join("\r\n");

  const bodyB64 = btoa(String.fromCharCode(...encoder.encode(html)));
  const raw = btoa(`${headers}\r\n\r\n${bodyB64}`);
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
