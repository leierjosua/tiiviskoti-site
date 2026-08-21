import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { generateReceiptPdf } from "../_shared/generate-receipt-pdf.ts";

const SENDER_EMAIL = "info@tiiviskoti.fi";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EmailType =
  | "confirmation"
  | "cancellation"
  | "receipt"
  | "rescheduled"
  | "installer_new_job"
  | "installer_cancelled"
  | "installer_rescheduled";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { booking_id, email_type } = await req.json();

    if (!booking_id || !email_type) {
      return new Response(
        JSON.stringify({ error: "booking_id and email_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTypes: EmailType[] = [
      "confirmation",
      "cancellation",
      "receipt",
      "rescheduled",
      "installer_new_job",
      "installer_cancelled",
      "installer_rescheduled",
    ];

    if (!validTypes.includes(email_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid email_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch booking with relations
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        customers (*),
        services (*),
        employees!bookings_employee_id_fkey (*)
      `)
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine recipient
    const isInstallerEmail = email_type.startsWith("installer_");
    let recipientEmail: string;

    if (isInstallerEmail) {
      recipientEmail = booking.employees?.email;
      if (!recipientEmail) {
        return new Response(
          JSON.stringify({ error: "Installer email not found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      recipientEmail = booking.customers?.email;
      if (!recipientEmail) {
        return new Response(
          JSON.stringify({ error: "Customer email not found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Build email
    const { subject, html } = buildEmail(email_type as EmailType, booking);

    // Generate PDF attachment for receipt
    let pdfBytes: Uint8Array | null = null;
    if (email_type === "receipt") {
      pdfBytes = await generateReceiptPdf(booking);
    }

    // Get Gmail access token
    const accessToken = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/gmail.send",
      SENDER_EMAIL
    );

    // Build and send RFC 2822 email
    const raw = pdfBytes
      ? buildRawEmailWithAttachment(recipientEmail, subject, html, pdfBytes, `kuitti-${booking.booking_number}.pdf`)
      : buildRawEmail(recipientEmail, subject, html);

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
    console.error("send-booking-email error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// deno-lint-ignore no-explicit-any
function buildEmail(type: EmailType, booking: any): { subject: string; html: string } {
  const customer = booking.customers;
  const service = booking.services;
  const employee = booking.employees;
  const customerName = `${customer.first_name} ${customer.last_name}`;
  const serviceName = service?.name || "Palvelu";
  const installerName = employee
    ? `${employee.first_name} ${employee.last_name}`
    : "";
  const dateStr = formatDateFi(booking.booking_date);
  const timeStr = booking.time_slot?.slice(0, 5) || "";
  const priceFmt = formatCentsFi(booking.price_cents);
  const address = booking.address || "";
  const postalCode = booking.postal_code || "";

  switch (type) {
    // ─── CUSTOMER: Booking confirmed ───
    case "confirmation":
      return {
        subject: "Varauksesi on vahvistettu - TiivisKoti",
        html: emailWrapper(`
          <div style="text-align:center;margin-bottom:32px">
            <div style="display:inline-block;background:#f0fdf4;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px">
              &#10003;
            </div>
          </div>
          <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 8px;text-align:center">Varaus vahvistettu!</h1>
          <p style="color:#666;font-size:15px;margin:0 0 32px;text-align:center">Hei ${customerName}, kiitos varauksestasi.</p>

          <div style="background:#fafafa;border-radius:12px;padding:24px;margin-bottom:24px">
            ${infoRow("Palvelu", serviceName)}
            ${infoRow("Ajankohta", `${dateStr} klo ${timeStr}`)}
            ${address ? infoRow("Osoite", `${address}${postalCode ? `, ${postalCode}` : ""}`) : ""}
            ${installerName ? infoRow("Asentaja", installerName) : ""}
            <div style="padding:14px 0 0;margin-top:14px;border-top:2px solid #e5e7eb">
              <table style="width:100%"><tr>
                <td style="color:#888;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Hinta</td>
                <td style="text-align:right;font-weight:800;font-size:20px;color:#4d7c0f">${priceFmt}</td>
              </tr></table>
            </div>
          </div>

          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-bottom:24px;text-align:center">
            <p style="color:#92400e;font-size:14px;font-weight:600;margin:0">Maksu puhdistuksen jälkeen korttipäätteellä tai laskulla</p>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:24px">
            <table style="width:100%"><tr>
              <td style="color:#64748b;font-size:13px">Varausnumero</td>
              <td style="text-align:right;font-weight:700;font-size:14px;color:#1a1a1a">#${booking.booking_number}</td>
            </tr></table>
          </div>

          <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0">
            Kysyttävää? Ota yhteyttä <a href="mailto:info@tiiviskoti.fi" style="color:#217A4E;text-decoration:none;font-weight:600">info@tiiviskoti.fi</a>
          </p>
        `),
      };

    // ─── CUSTOMER: Booking rescheduled ───
    case "rescheduled":
      return {
        subject: "Varaustasi on siirretty - TiivisKoti",
        html: emailWrapper(`
          <div style="text-align:center;margin-bottom:32px">
            <div style="display:inline-block;background:#fef3c7;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px">
              &#128197;
            </div>
          </div>
          <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 8px;text-align:center">Varauksesi on siirretty</h1>
          <p style="color:#666;font-size:15px;margin:0 0 32px;text-align:center">Hei ${customerName}, varauksesi ajankohta on muuttunut.</p>

          <div style="background:#fffbeb;border:2px solid #fbbf24;border-radius:12px;padding:24px;margin-bottom:24px">
            <p style="color:#92400e;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin:0 0 12px">Uusi ajankohta</p>
            <p style="color:#1a1a1a;font-size:20px;font-weight:800;margin:0">${dateStr} klo ${timeStr}</p>
          </div>

          <div style="background:#fafafa;border-radius:12px;padding:24px;margin-bottom:24px">
            ${infoRow("Palvelu", serviceName)}
            ${address ? infoRow("Osoite", `${address}${postalCode ? `, ${postalCode}` : ""}`) : ""}
            ${installerName ? infoRow("Asentaja", installerName) : ""}
            ${infoRow("Varausnumero", `#${booking.booking_number}`)}
          </div>

          <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0">
            Eikö uusi aika sovi? Ota yhteyttä <a href="mailto:info@tiiviskoti.fi" style="color:#217A4E;text-decoration:none;font-weight:600">info@tiiviskoti.fi</a>
          </p>
        `),
      };

    // ─── CUSTOMER: Booking cancelled ───
    case "cancellation":
      return {
        subject: "Varauksesi on peruutettu - TiivisKoti",
        html: emailWrapper(`
          <div style="text-align:center;margin-bottom:32px">
            <div style="display:inline-block;background:#fef2f2;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:#dc2626">
              &#10005;
            </div>
          </div>
          <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 8px;text-align:center">Varaus peruutettu</h1>
          <p style="color:#666;font-size:15px;margin:0 0 32px;text-align:center">Hei ${customerName}, varauksesi on peruutettu.</p>

          <div style="background:#fafafa;border-radius:12px;padding:24px;margin-bottom:24px">
            ${infoRow("Varausnumero", `#${booking.booking_number}`)}
            ${infoRow("Palvelu", serviceName)}
            ${infoRow("Ajankohta", `${dateStr} klo ${timeStr}`)}
          </div>

          <div style="text-align:center;margin-bottom:24px">
            <a href="https://tiiviskoti.fi" style="display:inline-block;background:#1a1a1a;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:14px">
              Varaa uusi aika
            </a>
          </div>

          <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0">
            Kysyttävää? <a href="mailto:info@tiiviskoti.fi" style="color:#217A4E;text-decoration:none;font-weight:600">info@tiiviskoti.fi</a>
          </p>
        `),
      };

    // ─── CUSTOMER: Receipt ───
    case "receipt":
      return {
        subject: "Kuitti varauksestasi - TiivisKoti",
        html: emailWrapper(`
          <div style="text-align:center;margin-bottom:32px">
            <div style="display:inline-block;background:#f0fdf4;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px">
              &#128499;
            </div>
          </div>
          <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 8px;text-align:center">Kuitti</h1>
          <p style="color:#666;font-size:15px;margin:0 0 32px;text-align:center">Hei ${customerName}, tässä kuitti varauksestasi.</p>

          <div style="background:#fafafa;border-radius:12px;padding:24px;margin-bottom:24px">
            ${receiptRow(serviceName, formatCentsFi(service?.base_price_cents || booking.price_cents))}
            ${(booking.extra_items || []).map((item: { name: string; price_cents: number }) =>
              receiptRow(item.name, formatCentsFi(item.price_cents))
            ).join("")}
            ${booking.discount_amount_cents > 0
              ? receiptRow("Alennus", `-${formatCentsFi(booking.discount_amount_cents)}`, "#dc2626")
              : ""}
            <div style="padding:16px 0 0;margin-top:16px;border-top:2px solid #e5e7eb">
              <table style="width:100%"><tr>
                <td style="font-weight:700;font-size:15px;color:#1a1a1a">Yhteensa</td>
                <td style="text-align:right;font-weight:800;font-size:22px;color:#4d7c0f">${priceFmt}</td>
              </tr></table>
            </div>
          </div>

          <div style="text-align:center;margin-bottom:24px">
            <span style="display:inline-block;background:#f0fdf4;color:#16a34a;padding:8px 20px;border-radius:8px;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">
              &#10003; Maksettu
            </span>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:24px">
            <table style="width:100%">
              <tr>
                <td style="color:#64748b;font-size:13px">Varausnumero</td>
                <td style="text-align:right;font-weight:600;font-size:13px;color:#1a1a1a">#${booking.booking_number}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-size:13px;padding-top:8px">Ajankohta</td>
                <td style="text-align:right;font-weight:600;font-size:13px;color:#1a1a1a;padding-top:8px">${dateStr} klo ${timeStr}</td>
              </tr>
            </table>
          </div>

          <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0">Kiitos asiakkuudestasi!</p>
        `),
      };

    // ─── INSTALLER: New job assigned ───
    case "installer_new_job":
      return {
        subject: `Uusi keikka: ${serviceName} - ${dateStr}`,
        html: emailWrapper(`
          <div style="text-align:center;margin-bottom:32px">
            <div style="display:inline-block;background:#eff6ff;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px">
              &#128736;
            </div>
          </div>
          <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 8px;text-align:center">Uusi keikka!</h1>
          <p style="color:#666;font-size:15px;margin:0 0 32px;text-align:center">Hei ${installerName}, sinulle on uusi asennus.</p>

          <div style="background:#1a1a1a;border-radius:12px;padding:24px;margin-bottom:24px">
            <p style="color:#E0A44E;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin:0 0 8px">Ajankohta</p>
            <p style="color:white;font-size:22px;font-weight:800;margin:0">${dateStr}</p>
            <p style="color:#d1d5db;font-size:16px;font-weight:600;margin:4px 0 0">klo ${timeStr}</p>
          </div>

          <div style="background:#fafafa;border-radius:12px;padding:24px;margin-bottom:24px">
            ${infoRow("Palvelu", serviceName)}
            ${infoRow("Asiakas", customerName)}
            ${address ? infoRow("Osoite", `${address}${postalCode ? `, ${postalCode}` : ""}`) : ""}
            ${customer.phone ? infoRow("Puhelin", customer.phone) : ""}
            ${infoRow("Varausnumero", `#${booking.booking_number}`)}
          </div>

          ${booking.notes ? `
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px;margin-bottom:24px">
            <p style="color:#92400e;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin:0 0 6px">Lisätiedot</p>
            <p style="color:#78350f;font-size:14px;margin:0">${booking.notes}</p>
          </div>
          ` : ""}
        `),
      };

    // ─── INSTALLER: Job cancelled ───
    case "installer_cancelled":
      return {
        subject: `Keikka peruutettu: ${serviceName} - ${dateStr}`,
        html: emailWrapper(`
          <div style="text-align:center;margin-bottom:32px">
            <div style="display:inline-block;background:#fef2f2;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:#dc2626">
              &#10005;
            </div>
          </div>
          <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 8px;text-align:center">Keikka peruutettu</h1>
          <p style="color:#666;font-size:15px;margin:0 0 32px;text-align:center">Hei ${installerName}, seuraava keikka on peruutettu.</p>

          <div style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;padding:24px;margin-bottom:24px">
            ${infoRow("Palvelu", serviceName, "#991b1b")}
            ${infoRow("Ajankohta", `${dateStr} klo ${timeStr}`, "#991b1b")}
            ${infoRow("Asiakas", customerName, "#991b1b")}
            ${address ? infoRow("Osoite", `${address}${postalCode ? `, ${postalCode}` : ""}`, "#991b1b") : ""}
            ${infoRow("Varausnumero", `#${booking.booking_number}`, "#991b1b")}
          </div>

          <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0">Tämä aika on nyt vapaa kalenterissasi.</p>
        `),
      };

    // ─── INSTALLER: Job rescheduled ───
    case "installer_rescheduled":
      return {
        subject: `Keikka siirretty: ${serviceName} - ${dateStr}`,
        html: emailWrapper(`
          <div style="text-align:center;margin-bottom:32px">
            <div style="display:inline-block;background:#fef3c7;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px">
              &#128197;
            </div>
          </div>
          <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 8px;text-align:center">Keikka siirretty</h1>
          <p style="color:#666;font-size:15px;margin:0 0 32px;text-align:center">Hei ${installerName}, seuraavan keikan ajankohta on muuttunut.</p>

          <div style="background:#1a1a1a;border-radius:12px;padding:24px;margin-bottom:24px">
            <p style="color:#E0A44E;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin:0 0 8px">Uusi ajankohta</p>
            <p style="color:white;font-size:22px;font-weight:800;margin:0">${dateStr}</p>
            <p style="color:#d1d5db;font-size:16px;font-weight:600;margin:4px 0 0">klo ${timeStr}</p>
          </div>

          <div style="background:#fafafa;border-radius:12px;padding:24px;margin-bottom:24px">
            ${infoRow("Palvelu", serviceName)}
            ${infoRow("Asiakas", customerName)}
            ${address ? infoRow("Osoite", `${address}${postalCode ? `, ${postalCode}` : ""}`) : ""}
            ${customer.phone ? infoRow("Puhelin", customer.phone) : ""}
            ${infoRow("Varausnumero", `#${booking.booking_number}`)}
          </div>

          ${booking.notes ? `
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px;margin-bottom:24px">
            <p style="color:#92400e;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin:0 0 6px">Lisätiedot</p>
            <p style="color:#78350f;font-size:14px;margin:0">${booking.notes}</p>
          </div>
          ` : ""}
        `),
      };

    default:
      return { subject: "TiivisKoti", html: "" };
  }
}

function infoRow(label: string, value: string, valueColor = "#1a1a1a"): string {
  return `
    <table style="width:100%;margin-bottom:12px"><tr>
      <td style="color:#888;font-size:13px;padding:0;vertical-align:top;white-space:nowrap;width:120px">${label}</td>
      <td style="font-weight:600;font-size:14px;color:${valueColor};padding:0;vertical-align:top">${value}</td>
    </tr></table>`;
}

function receiptRow(label: string, amount: string, amountColor = "#1a1a1a"): string {
  return `
    <table style="width:100%;margin-bottom:10px"><tr>
      <td style="font-size:14px;color:#374151;padding:10px 0;border-bottom:1px solid #f3f4f6">${label}</td>
      <td style="text-align:right;font-weight:600;font-size:14px;color:${amountColor};padding:10px 0;border-bottom:1px solid #f3f4f6">${amount}</td>
    </tr></table>`;
}

// Otsikkopalkki on VAALEA (#f1f5f9) → käytä vihreää logoa (ei valkoista, joka
// olisi näkymätön). ?v=2 pakottaa Gmailin hakemaan uuden logon (Gmail
// välimuistittaa kuvat URLin mukaan; ilman versiota vanha logo jäisi näkyviin).
const LOGO_URL = "https://tiiviskoti.fi/img/logo-email.png?v=2";

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
  const subjectB64 = btoa(
    String.fromCharCode(...encoder.encode(subject))
  );
  const headers = [
    `From: TiivisKoti <${SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${subjectB64}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
  ].join("\r\n");

  const bodyB64 = btoa(
    String.fromCharCode(...encoder.encode(html))
  );

  const raw = btoa(`${headers}\r\n\r\n${bodyB64}`);
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmailWithAttachment(
  to: string,
  subject: string,
  html: string,
  pdfBytes: Uint8Array,
  filename: string
): string {
  const encoder = new TextEncoder();
  const boundary = "boundary_" + crypto.randomUUID().replace(/-/g, "");
  const subjectB64 = btoa(String.fromCharCode(...encoder.encode(subject)));

  const headers = [
    `From: TiivisKoti <${SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${subjectB64}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join("\r\n");

  const htmlB64 = btoa(String.fromCharCode(...encoder.encode(html)));
  const pdfB64 = btoa(String.fromCharCode(...pdfBytes));

  // Encode filename for Content-Disposition
  const filenameB64 = btoa(String.fromCharCode(...encoder.encode(filename)));

  const body = [
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlB64,
    `--${boundary}`,
    `Content-Type: application/pdf`,
    `Content-Disposition: attachment; filename="=?UTF-8?B?${filenameB64}?="`,
    `Content-Transfer-Encoding: base64`,
    ``,
    pdfB64,
    `--${boundary}--`,
  ].join("\r\n");

  const raw = btoa(`${headers}\r\n\r\n${body}`);
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function formatDateFi(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["su", "ma", "ti", "ke", "to", "pe", "la"];
  const months = [
    "tammikuuta", "helmikuuta", "maaliskuuta", "huhtikuuta", "toukokuuta", "kesakuuta",
    "heinakuuta", "elokuuta", "syyskuuta", "lokakuuta", "marraskuuta", "joulukuuta",
  ];
  return `${days[d.getDay()]} ${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatCentsFi(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " \u20ac";
}
