/**
 * Pure email-building functions extracted from send-email/index.ts.
 * NO sending, NO Deno.serve, NO outbox writes.
 * Accepts a supabase client as parameter.
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildRawEmail, buildRawEmailWithAttachment, buildRawEmailWithAttachments } from "./email-helpers.ts";
import { htmlToPdf } from "./html-to-pdf.ts";

// Chromium PDF APIs on Vercel
const VERCEL_SITE = "https://tiiviskoti.fi";

// ── Receipt HTML builder (mirrors site/src/app/api/receipt-pdf/route.ts) ──
const _BRAND = "#215A43";   // TiivisKoti-vihreä (nimi historiallinen: oli navy)
const _ACCENT = "#E0A44E";  // amber-tiiviste (nimi historiallinen: oli sininen)
const _ALV = 25.5;
const _LOGO = "https://tiiviskoti.fi/img/logo-email-white.png";

function _eur(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";
}
function _fDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  const fi = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
  return `${fi.getDate()}.${fi.getMonth() + 1}.${fi.getFullYear()}`;
}
function _city(pc: string): string {
  return postalCity(pc || "");
}

// deno-lint-ignore no-explicit-any
function buildReceiptHtml(b: Record<string, any>): string {
  const c = b.customers;
  const svc = b.services;
  const lineItems = b.booking_line_items || [];
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  const name = `${cap(c.first_name)} ${cap(c.last_name)}`;
  const addr = formatAddress(c.address || "", c.postal_code || "");

  // All items (including service) come from booking_line_items. price_cents is the cached total.
  const items: { n: string; q: number; u: number; t: number }[] = [];
  for (const x of lineItems) {
    const q = x.quantity || 1;
    items.push({ n: x.name, q, u: x.price_cents, t: x.price_cents * q });
  }

  const tot = b.price_cents; // cached total = SUM(items) - discount
  const ex = Math.round(tot / (1 + _ALV / 100));
  const vat = tot - ex;
  const work = workPortionCents(tot); // kiinteä 90 % kokonaishinnasta (sis. ALV)

  const rows = items.map((i, idx) => `
    <tr style="border-bottom:1px solid #e5e7eb;background:${idx % 2 === 0 ? "#f9fafb" : "white"} !important">
      <td style="padding:10px 14px;font-size:13px;font-weight:500">${i.n}</td>
      <td style="padding:10px 14px;font-size:13px;text-align:center;color:#4b5563">${i.q}</td>
      <td style="padding:10px 14px;font-size:13px;text-align:right;color:#4b5563">${_eur(i.u)}</td>
      <td style="padding:10px 14px;font-size:13px;text-align:right;font-weight:600">${_eur(i.t)}</td>
    </tr>`).join("");

  const discRow = (b.discount_amount_cents > 0 ? `
    <tr>
      <td colspan="3" style="padding:10px 12px;font-size:13px;color:#dc2626;border-bottom:1px solid #f3f4f6">Alennus</td>
      <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:700;color:#dc2626;border-bottom:1px solid #f3f4f6">-${_eur(b.discount_amount_cents)}</td>
    </tr>` : "") + (b.manual_discount_cents > 0 ? `
    <tr>
      <td colspan="3" style="padding:10px 12px;font-size:13px;color:#dc2626;border-bottom:1px solid #f3f4f6">${b.manual_discount_reason ? `Alennus (${b.manual_discount_reason})` : "Alennus"}</td>
      <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:700;color:#dc2626;border-bottom:1px solid #f3f4f6">-${_eur(b.manual_discount_cents)}</td>
    </tr>` : "");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:'Outfit',sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { width:794px; color:#1f2937; line-height:1.4; }
</style>
</head><body>
<div style="padding:40px;min-height:1122px;position:relative">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
    <img src="${_LOGO}" style="height:76px;width:auto" />
    <div style="text-align:right">
      <h1 style="color:${_BRAND};font-size:32px;font-weight:800;letter-spacing:-0.5px;margin:0 0 4px 0;line-height:1">KUITTI</h1>
      <p style="color:#6b7280;font-size:13px;margin:0">Kuitti #${b.booking_number}</p>
    </div>
  </div>
  <div style="height:3px;background:linear-gradient(to right,${_BRAND},${_ACCENT});border-radius:0;margin-bottom:24px"></div>
  <div style="display:flex;gap:16px;margin-bottom:32px">
    <div style="flex:1;background:#f8fafc !important;border-radius:0;padding:16px 20px;border-left:4px solid ${_BRAND}">
      <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Asiakas</p>
      <p style="font-size:15px;font-weight:700;color:${_BRAND};margin:0">${name}</p>
      ${addr ? `<p style="font-size:12px;color:#4b5563;margin:4px 0 0">${addr}</p>` : ""}
      ${c.email ? `<p style="font-size:12px;color:#4b5563;margin:4px 0 0">${c.email}</p>` : ""}
      ${c.phone ? `<p style="font-size:12px;color:#4b5563;margin:4px 0 0">${c.phone}</p>` : ""}
    </div>
    <div style="background:#f8fafc !important;border-radius:0;padding:16px 20px;border-left:4px solid ${_ACCENT};min-width:220px">
      <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Kuitin tiedot</p>
      <p style="font-size:12px;color:#4b5563;margin:0"><span style="color:#9ca3af">Kuitti:</span> #${b.booking_number}</p>
      <p style="font-size:12px;color:#4b5563;margin:4px 0 0"><span style="color:#9ca3af">Tilauspvm:</span> ${_fDate(b.created_at)}</p>
      <p style="font-size:12px;color:#4b5563;margin:4px 0 0"><span style="color:#9ca3af">Työn pvm:</span> ${_fDate(b.booking_date)}</p>
    </div>
  </div>
  <p style="font-size:11px;color:#9ca3af;text-align:right;margin-bottom:8px">Hinnat sis. ALV ${_ALV} %</p>
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr>
        <th style="background:${_BRAND} !important;padding:10px 14px;font-size:11px;font-weight:600;color:white;text-align:left;border-radius:0">Tuote/Palvelu</th>
        <th style="background:${_BRAND} !important;padding:10px 14px;font-size:11px;font-weight:600;color:white;text-align:center;width:70px">Määrä</th>
        <th style="background:${_BRAND} !important;padding:10px 14px;font-size:11px;font-weight:600;color:white;text-align:right;width:110px">Hinta</th>
        <th style="background:${_BRAND} !important;padding:10px 14px;font-size:11px;font-weight:600;color:white;text-align:right;width:110px;border-radius:0">Yhteensä</th>
      </tr>
    </thead>
    <tbody>${rows}${discRow}</tbody>
  </table>
  <div style="display:flex;justify-content:flex-end;margin-top:16px">
    <div style="width:320px">
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:#4b5563"><span>Työn osuus</span><span>${_eur(work)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:#4b5563"><span>Veroton hinta</span><span>${_eur(ex)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:#4b5563"><span>ALV ${_ALV} %</span><span>${_eur(vat)}</span></div>
      <div style="background:${_BRAND} !important;border-radius:0;padding:12px 16px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:20px;font-weight:800;color:white">
        <span>YHTEENSÄ</span><span>${_eur(tot)}</span>
      </div>
    </div>
  </div>
  <div style="position:absolute;bottom:40px;left:40px;right:40px">
  <div style="height:2px;background:linear-gradient(to right,${_BRAND},${_ACCENT}) !important;border-radius:0;margin-bottom:10px"></div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:#9ca3af">
    <div>TiivisKoti.fi</div>
    <div style="text-align:center">Puh: 045 875 5996<br>www.tiiviskoti.fi<br>info@tiiviskoti.fi</div>
    <div style="text-align:right"></div>
  </div>
  </div>
</div>
</body></html>`;
}

async function generateContractPdfViaChromium(contractId: string): Promise<Uint8Array> {
  const serviceRoleKey =
    Deno.env.get("SERVICE_ROLE_JWT") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resp = await fetch(`${VERCEL_SITE}/api/contract-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ contract_id: contractId }),
  });
  if (!resp.ok) throw new Error("Contract PDF API " + resp.status);
  return new Uint8Array(await resp.arrayBuffer());
}
import { COMPANY_EMAIL, MONTH_NAMES_SHORT, FREQ_LABELS, workPortionCents } from "./constants.ts";
import { formatDateFi, formatDateShort, formatCentsFi, formatAddress, slugify, postalCity } from "./formatting.ts";
import { EMAIL_FONT_FAMILY, COMPANY_NAME, generateDefaultSignatureHtml } from "./email-styles.ts";

// ═══════════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmailBuildResult {
  to: string | string[];
  subject: string;
  raw: string; // base64 MIME
  senderEmail: string;
  threadId?: string;
  // For sales_emails post-processing
  cc?: string[];
  bcc?: string[];
  bodyHtml?: string;
  senderName?: string;
  inReplyTo?: string;
  opportunityId?: string;
  employeeId?: string;
  hasAttachments?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BRAND CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const BRAND_NAVY = "#215A43"; // TiivisKoti-vihreä — EI navy. Nimi jätetty ~120 käyttökohdan vuoksi.
const BRAND_BLUE = "#E0A44E"; // amber-tiiviste — EI sininen. Nimi jätetty, ks. yllä.
const LOGO_URL = "https://tiiviskoti.fi/img/logo-email-white.png";

const SENDER_EMAIL = COMPANY_EMAIL;
const LOGO_EMAIL_URL = "https://tiiviskoti.fi/img/logo-email.png";

// ═══════════════════════════════════════════════════════════════════════════════
//  SIGNATURE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch a seller's email signature from the database.
 * Auto-generates and persists a default if none exists.
 */
export async function fetchSellerSignature(supabase: SupabaseClient, senderEmail: string): Promise<string> {
  try {
    const { data: employee } = await supabase
      .from("employees")
      .select("id, first_name, last_name, email, phone")
      .eq("email", senderEmail)
      .maybeSingle();

    if (!employee) return "";

    const { data: sig } = await supabase
      .from("sales_email_signatures")
      .select("signature_html")
      .eq("employee_id", employee.id)
      .maybeSingle();

    if (sig?.signature_html) return sig.signature_html;

    // Generate default and persist
    const defaultHtml = generateDefaultSignatureHtml(employee, LOGO_EMAIL_URL);
    await supabase.from("sales_email_signatures").upsert(
      { employee_id: employee.id, signature_html: defaultHtml, updated_at: new Date().toISOString() },
      { onConflict: "employee_id" },
    );
    return defaultHtml;
  } catch (e) {
    console.error("Failed to fetch seller signature:", e);
    return "";
  }
}

/**
 * Fetch the company-wide email signature from company_settings.
 * Falls back to a default TiivisKoti signature if not set.
 */
async function fetchCompanySignature(supabase: SupabaseClient): Promise<string> {
  try {
    const { data } = await supabase
      .from("company_settings")
      .select("company_signature_html")
      .limit(1)
      .single();

    if (data?.company_signature_html) return data.company_signature_html;

    // Default company signature
    return generateDefaultSignatureHtml(
      { first_name: "TiivisKoti", last_name: "", email: COMPANY_EMAIL, phone: "045 875 5996" },
      LOGO_EMAIL_URL,
    );
  } catch {
    return "";
  }
}

/**
 * Append the appropriate signature to email HTML based on type.
 * - "seller": personal signature from sales_email_signatures
 * - "company": company-wide signature from company_settings
 * - "none": no signature
 */
export async function appendSignature(
  supabase: SupabaseClient,
  html: string,
  signatureType: "seller" | "company" | "none",
  senderEmail?: string,
): Promise<string> {
  if (signatureType === "none") return html;

  let sig = "";
  if (signatureType === "seller" && senderEmail) {
    sig = await fetchSellerSignature(supabase, senderEmail);
  } else if (signatureType === "company") {
    sig = await fetchCompanySignature(supabase);
  }

  return sig ? `${html}<p></p>${sig}` : html;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HTML HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Escape HTML special characters to prevent XSS in email content */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replace {{variable}} placeholders with values */
export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([\w:]+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function emailWrapper(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:${EMAIL_FONT_FAMILY};">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<!-- Header -->
<div style="background:${BRAND_NAVY};border-radius:0;padding:28px 32px;text-align:center">
  <img src="${LOGO_URL}" alt="TiivisKoti" width="120" style="display:inline-block" />
</div>
<!-- Accent line -->
<div style="height:6px;background:${BRAND_BLUE}"></div>
<!-- Body -->
<div style="background:#ffffff;padding:40px 32px">${content}</div>
<!-- Footer -->
<div style="background:${BRAND_NAVY};border-radius:0;padding:24px 32px;text-align:center">
  <p style="color:rgba(255,255,255,0.7);font-size:12px;margin:0 0 4px">${COMPANY_NAME}</p>
  <p style="color:rgba(255,255,255,0.5);font-size:11px;margin:0"><a href="mailto:${COMPANY_EMAIL}" style="color:rgba(255,255,255,0.5);text-decoration:none">${COMPANY_EMAIL}</a> &middot; <a href="https://tiiviskoti.fi" style="color:rgba(255,255,255,0.5);text-decoration:none">tiiviskoti.fi</a></p>
</div>
</div></body></html>`;
}

export function infoRow(label: string, value: string, valueColor = "#1a1a1a"): string {
  return `<table style="width:100%;border-collapse:collapse"><tr>
    <td style="color:#6b7280;font-size:13px;padding:10px 0;vertical-align:top;white-space:nowrap;width:120px;border-bottom:1px solid #f3f4f6">${label}</td>
    <td style="font-weight:600;font-size:14px;color:${valueColor};padding:10px 0;vertical-align:top;border-bottom:1px solid #f3f4f6">${value}</td>
  </tr></table>`;
}

export function receiptRow(label: string, amount: string, amountColor = "#1a1a1a"): string {
  return `<table style="width:100%;border-collapse:collapse"><tr>
    <td style="font-size:14px;color:#374151;padding:12px 0;border-bottom:1px solid #f3f4f6">${label}</td>
    <td style="text-align:right;font-weight:600;font-size:14px;color:${amountColor};padding:12px 0;border-bottom:1px solid #f3f4f6">${amount}</td>
  </tr></table>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEMPLATE FETCHING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch a template from email_templates by slug.
 * Returns null if not found or inactive.
 */
async function fetchTemplate(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ subject_template: string; body_template: string } | null> {
  const { data } = await supabase
    .from("email_templates")
    .select("subject_template, body_template")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  return data || null;
}

/**
 * Render a template with variable substitution and email wrapper.
 * Falls back to the provided hardcoded default if template not found in DB.
 */
async function renderTemplate(
  supabase: SupabaseClient,
  slug: string,
  vars: Record<string, string>,
  fallback: { subject: string; html: string },
): Promise<{ subject: string; html: string }> {
  const tpl = await fetchTemplate(supabase, slug);
  if (!tpl) return fallback;

  const subject = substituteVars(tpl.subject_template, vars);
  const body = substituteVars(tpl.body_template, vars);
  return { subject, html: emailWrapper(body) };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build an email (or multiple) based on type, without sending.
 * Returns structured result(s) ready for sending via Gmail.
 */
export async function buildEmail(
  supabase: SupabaseClient,
  type: string,
  payload: Record<string, unknown>,
): Promise<EmailBuildResult | EmailBuildResult[]> {
  switch (type) {
    case "booking":
      return buildBookingEmailResult(supabase, payload);
    case "contact":
      return buildContactEmailResult(supabase, payload);
    case "contract":
      return buildContractEmailResult(supabase, payload);
    case "sales":
      return buildSalesEmailResult(supabase, payload);
    case "order":
      return buildOrderEmailResult(payload);
    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BOOKING EMAILS
// ═══════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function buildBookingEmailResult(supabase: SupabaseClient, payload: any): Promise<EmailBuildResult> {
  const { booking_id, email_type, employee_id: overrideEmployeeId } = payload;
  if (!booking_id || !email_type) throw new Error("booking_id and email_type required");

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*, customers(*), services(*), service_variants(*), employees!bookings_employee_id_fkey(*), booking_line_items(*), booking_employees(*, employees(*))")
    .eq("id", booking_id)
    .single();
  if (error || !booking) throw new Error("Booking not found");

  const customer = booking.customers;
  const employee = booking.employees;
  const isInstallerEmail = email_type.startsWith("installer_");
  let recipientEmail: string;

  if (isInstallerEmail) {
    if (overrideEmployeeId) {
      const { data: emp, error: empErr } = await supabase.from("employees").select("email").eq("id", overrideEmployeeId).single();
      if (empErr || !emp?.email) throw new Error(`Employee ${overrideEmployeeId} not found or has no email`);
      recipientEmail = emp.email;
    } else {
      recipientEmail = employee?.email;
    }
  } else {
    recipientEmail = customer?.email;
  }
  if (!recipientEmail) throw new Error(`No recipient email for ${email_type} (booking ${booking_id})`);

  const { subject, html } = await buildBookingEmail(supabase, email_type, booking, payload);

  let pdfBytes: Uint8Array | null = null;
  let pdfFilename = "";

  if (email_type === "protocol") {
    // Fetch protocol PDF from storage
    const protocolId = payload.protocol_id as string;
    if (protocolId) {
      const { data: protocol } = await supabase
        .from("work_protocols")
        .select("pdf_storage_path")
        .eq("id", protocolId)
        .single();

      if (protocol?.pdf_storage_path) {
        const { data: fileData } = await supabase.storage
          .from("protocol-files")
          .download(protocol.pdf_storage_path);
        if (fileData) {
          pdfBytes = new Uint8Array(await fileData.arrayBuffer());
          pdfFilename = `poytakirja-${booking.booking_number}.pdf`;
        }
      }

      // If no stored PDF, try generating via Chromium API
      if (!pdfBytes) {
        try {
          const siteUrl = VERCEL_SITE;
          const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const res = await fetch(`${siteUrl}/api/protocol-pdf`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ protocol_id: protocolId }),
          });
          if (res.ok) {
            pdfBytes = new Uint8Array(await res.arrayBuffer());
            pdfFilename = `poytakirja-${booking.booking_number}.pdf`;
          }
        } catch {
          console.error("Protocol PDF generation failed for email");
        }
      }
    }
  } else if (email_type === "receipt") {
    if (payload.pdf_base64) {
      // Use pre-generated PDF from admin (Chromium-rendered)
      const b64 = payload.pdf_base64 as string;
      const chunks: string[] = [];
      // Decode base64 in chunks to avoid stack overflow
      for (let i = 0; i < b64.length; i += 8192) {
        chunks.push(b64.slice(i, i + 8192));
      }
      const binary = atob(chunks.join(""));
      pdfBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) pdfBytes[i] = binary.charCodeAt(i);
    } else {
      const receiptHtml = buildReceiptHtml(booking);
      pdfBytes = await htmlToPdf(receiptHtml);
    }
  }

  const raw = pdfBytes
    ? buildRawEmailWithAttachment({
        senderName: "TiivisKoti",
        senderEmail: SENDER_EMAIL,
        to: recipientEmail,
        subject,
        html,
        attachment: { data: pdfBytes, filename: pdfFilename || `kuitti-${booking.booking_number}.pdf`, mimeType: "application/pdf" },
      })
    : buildRawEmail({ senderName: "TiivisKoti", senderEmail: SENDER_EMAIL, to: recipientEmail, subject, html });

  return { to: recipientEmail, subject, raw, senderEmail: SENDER_EMAIL };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTACT FORM EMAILS
// ═══════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function buildContactEmailResult(supabase: SupabaseClient, payload: any): Promise<EmailBuildResult | EmailBuildResult[]> {
  const { formSlug, notificationEmails, cv_attachment } = payload;
  if (!formSlug) throw new Error("formSlug required");

  // Resolve form label from DB or fallback
  const { data: formDef } = await supabase
    .from("contact_forms")
    .select("name")
    .eq("slug", formSlug)
    .single();

  const formLabel = formDef?.name || formSlug;
  const { subject, html } = await buildContactEmail(supabase, formLabel, payload);

  // Fetch CV attachment from storage if present
  let attachments: { filename: string; mimeType: string; data: Uint8Array }[] | undefined;
  if (cv_attachment?.bucket && cv_attachment?.path) {
    const { data: fileData, error: dlError } = await supabase.storage
      .from(cv_attachment.bucket)
      .download(cv_attachment.path);
    if (!dlError && fileData) {
      attachments = [{
        filename: cv_attachment.filename || cv_attachment.path.split("/").pop() || "cv.pdf",
        mimeType: cv_attachment.mimeType || "application/pdf",
        data: new Uint8Array(await fileData.arrayBuffer()),
      }];
    }
  }

  // Build for each configured recipient (default: info@tiiviskoti.fi)
  const recipients: string[] = notificationEmails?.length ? notificationEmails : [SENDER_EMAIL];
  const results: EmailBuildResult[] = [];

  for (const to of recipients) {
    const raw = attachments?.length
      ? buildRawEmailWithAttachments({ senderName: "TiivisKoti", senderEmail: SENDER_EMAIL, to, subject, html, attachments })
      : buildRawEmail({ senderName: "TiivisKoti", senderEmail: SENDER_EMAIL, to, subject, html });
    results.push({ to, subject, raw, senderEmail: SENDER_EMAIL });
  }

  return results.length === 1 ? results[0] : results;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTRACT EMAILS
// ═══════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function buildContractEmailResult(supabase: SupabaseClient, payload: any): Promise<EmailBuildResult> {
  const { contract_id, email_type, signing_token, test_email } = payload;
  if (!contract_id || !email_type) throw new Error("contract_id and email_type required");

  const { data: contract, error } = await supabase
    .from("contracts")
    .select("*, customers(*), services(*), employees!contracts_created_by_employee_id_fkey(*), contract_templates(*)")
    .eq("id", contract_id)
    .single();
  if (error || !contract) throw new Error("Contract not found: " + (error?.message || "unknown"));

  const customer = contract.customers;
  const template = contract.contract_templates;
  const recipientEmail = test_email || customer?.email;
  if (!recipientEmail) throw new Error("No recipient email");

  let subject = "";
  let html = "";
  let pdfBytes: Uint8Array | null = null;
  let pdfFilename = "";

  const customerName = `${customer.first_name} ${customer.last_name}`;
  const serviceName = contract.services?.name || "Palvelu";
  const priceFmt = (contract.contract_price_cents / 100).toFixed(0) + " \u20ac";
  const bim = contract.billing_interval_months || 12;
  const billingPeriod = bim === 12 ? "vuosi" : bim % 12 === 0 ? `${bim / 12} v` : `${bim} kk`;

  if (email_type === "contract_signed") {
    pdfBytes = await generateContractPdfViaChromium(contract.id);
    pdfFilename = `${slugify(template?.name || "sopimus")}-${slugify(customerName)}.pdf`;

    const storagePath = `${contract.id}/sopimus-${contract.contract_number}.pdf`;
    await supabase.storage.from("contracts").upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    await supabase.from("contracts").update({ pdf_storage_path: storagePath }).eq("id", contract.id);

    const visitMonths = (contract.visit_months || []).map((m: number) => MONTH_NAMES_SHORT[m - 1]).join(", ");
    const vim = contract.visit_interval_months || 12;
    const frequency = vim === 12 ? "Kerran vuodessa" : vim === 24 ? "2 vuoden välein" : vim % 12 === 0 ? `${vim / 12} vuoden välein` : `${vim} kk välein`;

    // Build compound variable: contract_details table
    const contractDetails = `<table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.1)">Palvelu</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;color:white;border-bottom:1px solid rgba(255,255,255,0.1)">${serviceName}</td></tr>
      <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.1)">Käyntiväli</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;color:white;border-bottom:1px solid rgba(255,255,255,0.1)">${frequency}</td></tr>
      <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px">Sopimuskausi</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;color:white">${formatDateShort(contract.start_date)} — ${formatDateShort(contract.end_date)}</td></tr>
    </table>`;

    const vars: Record<string, string> = {
      customer_name: customerName,
      contract_number: String(contract.contract_number),
      service_name: serviceName,
      price: priceFmt,
      frequency,
      visit_months: visitMonths,
      start_date: formatDateShort(contract.start_date),
      end_date: formatDateShort(contract.end_date),
      contract_details: contractDetails,
      billing_period: billingPeriod,
    };

    const fallback = { subject: `Sopimus #${contract.contract_number} — Allekirjoitettu`, html: contractSignedHtml(vars) };
    ({ subject, html } = await renderTemplate(supabase, "contract_signed", vars, fallback));

  } else if (email_type === "contract_proposal") {
    // Resolve tier-specific TOTAL regular price by matching contract.duration_months
    // against template.duration_tiers, including volume_pricing steps for device_count.
    // contract.contract_price_cents is already the total (per-device \u00d7 device_count).
    type VolumeStep = { min_qty: number; regular_price_cents: number };
    type DurationTier = { months: number; regular_price_cents: number; volume_pricing?: VolumeStep[] };
    const tiers: DurationTier[] = Array.isArray(template?.duration_tiers) ? template.duration_tiers : [];
    const qty = Math.max(1, contract.device_count || 1);
    const matchedTier = tiers.find((t) => t.months === contract.duration_months);
    let perDeviceRegular: number;
    if (matchedTier) {
      const steps = (matchedTier.volume_pricing || [])
        .filter((s) => qty >= s.min_qty)
        .sort((a, b) => b.min_qty - a.min_qty);
      perDeviceRegular = steps.length > 0 ? steps[0].regular_price_cents : matchedTier.regular_price_cents;
    } else {
      perDeviceRegular = template?.regular_price_cents ?? contract.contract_price_cents;
    }
    const regularPriceCents = perDeviceRegular * qty;
    const regularPriceFmt = (regularPriceCents / 100).toFixed(0) + " \u20ac";
    const savings = regularPriceCents - contract.contract_price_cents;
    const savingsFmt = savings > 0 ? (savings / 100).toFixed(0) + " \u20ac" : "";
    const signingUrl = signing_token ? `https://tiiviskoti.fi/sopimus/allekirjoita?token=${signing_token}` : "";

    const infoRows = infoRow("Palvelu", serviceName) + infoRow("Sopimus #", String(contract.contract_number));
    const savingsSection = savingsFmt ? `<p style="color:#6b7280;font-size:13px;margin:8px 0 0"><span style="text-decoration:line-through">${regularPriceFmt}</span> — <span style="color:${BRAND_NAVY};font-weight:700">Säästät ${savingsFmt}!</span></p>` : "";
    const signingButton = signingUrl ? `<div style="text-align:center;margin-bottom:20px"><a href="${signingUrl}" style="display:inline-block;background:${BRAND_NAVY};color:white;text-decoration:none;padding:14px 36px;border-radius:0;font-weight:700;font-size:14px">Allekirjoita sopimus</a></div>` : "";

    const vars: Record<string, string> = {
      customer_name: customerName,
      contract_number: String(contract.contract_number),
      service_name: serviceName,
      price: priceFmt,
      regular_price: regularPriceFmt,
      savings: savingsFmt,
      template_name: template?.name || "Sopimus",
      signing_url: signingUrl,
      info_rows: infoRows,
      savings_section: savingsSection,
      signing_button: signingButton,
      billing_period: billingPeriod,
    };

    const fallback = { subject: `Sopimus — ${template?.name || "TiivisKoti"}`, html: contractProposalHtml(vars) };
    ({ subject, html } = await renderTemplate(supabase, "contract_proposal", vars, fallback));

  } else {
    throw new Error(`Unknown contract email type: ${email_type}`);
  }

  // Append company signature to contract emails
  html = await appendSignature(supabase, html, "company");

  const raw = pdfBytes
    ? buildRawEmailWithAttachment({ senderName: "TiivisKoti", senderEmail: SENDER_EMAIL, to: recipientEmail, subject, html, attachment: { data: pdfBytes, filename: pdfFilename, mimeType: "application/pdf" } })
    : buildRawEmail({ senderName: "TiivisKoti", senderEmail: SENDER_EMAIL, to: recipientEmail, subject, html });

  return { to: recipientEmail, subject, raw, senderEmail: SENDER_EMAIL };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SALES / SELLER EMAILS (free-form with threading)
// ═══════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function buildSalesEmailResult(supabase: SupabaseClient, payload: any): Promise<EmailBuildResult> {
  const { to, cc, bcc, subject, body_html, sender_name, sender_email: payloadSenderEmail, in_reply_to, thread_id, opportunity_id, employee_id, attachments } = payload;
  // Use sender_email from payload (set by submitOffer from outbox row's sender_email),
  // falling back to company email only if not provided.
  const sender_email = payloadSenderEmail || SENDER_EMAIL;
  if (!to?.length || !subject || !body_html) throw new Error("to, subject, body_html required");

  // Validate all email addresses
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const allEmails = [...to, ...(cc || []), ...(bcc || [])];
  const invalid = allEmails.filter((e: string) => !emailRegex.test(e));
  if (invalid.length > 0) throw new Error(`Invalid email address: ${invalid[0]}`);

  // Look up the RFC Message-ID for proper threading
  let rfcMessageId: string | undefined;
  if (in_reply_to) {
    const { data: origMsg } = await supabase
      .from("sales_emails")
      .select("rfc_message_id")
      .eq("gmail_message_id", in_reply_to)
      .single();
    rfcMessageId = origMsg?.rfc_message_id || undefined;
  }

  const emailOpts = {
    senderName: sender_name,
    senderEmail: sender_email,
    to,
    cc,
    bcc,
    subject,
    html: body_html,
    inReplyTo: rfcMessageId,
    references: rfcMessageId,
  };

  const raw = attachments?.length
    ? buildRawEmailWithAttachments({
        ...emailOpts,
        attachments: attachments.map((a: { filename: string; base64: string; mimeType?: string }) => ({
          base64: a.base64,
          filename: a.filename,
          mimeType: a.mimeType,
        })),
      })
    : buildRawEmail(emailOpts);

  return {
    to,
    subject,
    raw,
    senderEmail: sender_email,
    threadId: thread_id || undefined,
    cc: cc || undefined,
    bcc: bcc || undefined,
    bodyHtml: body_html,
    senderName: sender_name || undefined,
    inReplyTo: in_reply_to || undefined,
    opportunityId: opportunity_id || undefined,
    employeeId: employee_id || undefined,
    hasAttachments: !!attachments?.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ORDER EMAILS (automatic brand-based supplier orders)
// ═══════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
function buildOrderEmailResult(payload: any): EmailBuildResult {
  const { to, subject, body_html, sender_name } = payload;
  const senderEmail = payload.sender_email || SENDER_EMAIL;
  if (!to?.length || !subject || !body_html) throw new Error("to, subject, body_html required for order email");

  const raw = buildRawEmail({
    senderName: sender_name || "TiivisKoti",
    senderEmail,
    to,
    subject,
    html: body_html,
  });

  return { to, subject, raw, senderEmail, bodyHtml: body_html, senderName: sender_name };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BOOKING TEMPLATE BUILDER (DB-backed with hardcoded fallback)
// ═══════════════════════════════════════════════════════════════════════════════

/** Automatic payment note based on price. Returns null for free bookings (hide payment section). */
function autoPaymentNote(priceCents: number): string | null {
  if (priceCents <= 0) return null;
  if (priceCents < 50000) return "Maksu työn jälkeen korttipäätteellä";
  if (priceCents < 100000) return "Maksu työn jälkeen korttipäätteellä tai laskulla";
  return "Maksu työn jälkeen laskulla";
}

// deno-lint-ignore no-explicit-any
async function buildBookingEmail(supabase: SupabaseClient, type: string, booking: any, payload?: any): Promise<{ subject: string; html: string }> {
  const customer = booking.customers;
  const service = booking.services;
  const variant = booking.service_variants;
  const employee = booking.employees;
  const qty = booking.device_count || 1;
  const customerName = `${customer.first_name} ${customer.last_name}`;

  // ── Read stored values from booking (single source of truth) ──
  // Fall back to computed values for old bookings that predate the migration.
  const serviceName = booking.service_label || (() => {
    const base = variant?.label ? `${service?.name || "Palvelu"} — ${variant.label}` : (service?.name || "Palvelu");
    return qty > 1 ? `${base} × ${qty}` : base;
  })();

  const durationMin = booking.duration_minutes ?? (() => {
    const base = variant?.duration_minutes || service?.duration_minutes || 0;
    const extra = service?.extra_duration_per_unit_minutes;
    return qty > 1 ? (extra != null ? base + (qty - 1) * extra : base * qty) : base;
  })();

  const servicePriceCents: number = booking.unit_price_cents ?? (() => {
    if (variant?.price_cents) return variant.price_cents;
    // deno-lint-ignore no-explicit-any
    const vp = service?.volume_pricing as any[] | null;
    if (qty > 1 && Array.isArray(vp) && vp.length > 0) {
      const sorted = [...vp].sort((a: { min_qty: number }, b: { min_qty: number }) => b.min_qty - a.min_qty);
      const tier = sorted.find((t: { min_qty: number }) => qty >= t.min_qty);
      if (tier) return (tier as { price_cents: number }).price_cents;
    }
    return service?.base_price_cents || booking.price_cents;
  })();

  // ── End stored values ──

  const installerName = employee ? `${employee.first_name} ${employee.last_name}` : "";
  const dateStr = formatDateFi(booking.booking_date);
  const timeStr = booking.time_slot?.slice(0, 5) || "";
  // price_cents is the cached total (SUM of line items - discount). Single source of truth.
  const totalCents = booking.price_cents;
  const priceFmt = totalCents <= 0 ? "Maksuton" : formatCentsFi(totalCents);
  const paymentNote = totalCents <= 0 ? null : (booking.payment_note || service?.payment_note || autoPaymentNote(totalCents));
  const fullAddress = formatAddress(booking.address || "", booking.postal_code || "");
  const durationStr = durationMin > 0
    ? durationMin >= 60
      ? `${Math.floor(durationMin / 60)} h${durationMin % 60 ? ` ${durationMin % 60} min` : ""}`
      : `${durationMin} min`
    : "";

  // For line items display: service name without quantity suffix (qty shown separately)
  const baseServiceName = booking.service_label
    ? booking.service_label.replace(/ × \d+$/, "")
    : (variant?.label ? `${service?.name || "Palvelu"} — ${variant.label}` : (service?.name || "Palvelu"));

  // Protocol-type aware labels (derived from work_protocols → protocol_templates.slug)
  let protocolTitle = "Asennuspöytäkirja";
  let protocolIntro = "liitteenä asennuksen pöytäkirja.";
  if (type === "protocol" && payload?.protocol_id) {
    try {
      const { data: proto } = await supabase
        .from("work_protocols")
        .select("protocol_templates(slug)")
        .eq("id", payload.protocol_id)
        .single();
      // deno-lint-ignore no-explicit-any
      const slug = (proto as any)?.protocol_templates?.slug as string | undefined;
      if (slug === "vianhaku") {
        protocolTitle = "Vianhakuraportti";
        protocolIntro = "liitteenä vianhaun raportti.";
      } else if (slug === "huoltopesu") {
        protocolTitle = "Huoltoraportti";
        protocolIntro = "liitteenä huoltopesun raportti.";
      }
    } catch {
      // keep defaults
    }
  }
  if (payload) {
    payload.protocol_title = protocolTitle;
    payload.protocol_intro = protocolIntro;
  }

  // Build compound variables that the template can reference
  const baseVars: Record<string, string> = {
    protocol_title: protocolTitle,
    protocol_intro: protocolIntro,
    customer_name: customerName,
    service_name: serviceName,
    installer_name: installerName,
    booking_date: dateStr,
    time_slot: timeStr,
    price: priceFmt,
    address: fullAddress,
    postal_code: booking.postal_code || "",
    duration: durationStr,
    booking_number: String(booking.booking_number),
    notes: booking.notes || "",
    phone: customer.phone || "",
    payment_note: paymentNote || "",
    payment_section: paymentNote ? `<div style="background:#f8fafb;border-radius:0;padding:12px 16px;margin-bottom:20px;text-align:center"><p style="color:#6b7280;font-size:13px;margin:0">${paymentNote}</p></div>` : "",
    feedback_link: payload?.feedback_token ? `https://tiiviskoti.fi/palaute/${payload.feedback_token}` : "",
  };

  // Build info_rows compound variable based on email type
  let infoRows = "";
  const notesSection = booking.notes
    ? `<div style="background:#f8fafb;border-left:4px solid ${BRAND_NAVY};border-radius:0;padding:16px;margin-bottom:20px"><p style="color:${BRAND_NAVY};font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin:0 0 6px">Lisätiedot</p><p style="color:#374151;font-size:14px;margin:0;line-height:1.5">${booking.notes}</p></div>`
    : "";

  // Slug mapping: email_type -> template slug
  const slugMap: Record<string, string> = {
    confirmation: "booking_confirmation",
    rescheduled: "booking_rescheduled",
    cancellation: "booking_cancellation",
    receipt: "booking_receipt",
    installer_new_job: "installer_new_job",
    installer_cancelled: "installer_cancelled",
    installer_rescheduled: "installer_rescheduled",
    feedback_request: "feedback_request",
    protocol: "booking_protocol",
  };

  const slug = slugMap[type];

  switch (type) {
    case "confirmation":
      infoRows = infoRow("Palvelu", serviceName) + infoRow("Ajankohta", `${dateStr} klo ${timeStr}`);
      if (durationStr) infoRows += infoRow("Arvioitu kesto", durationStr);
      if (fullAddress) infoRows += infoRow("Osoite", fullAddress);
      if (installerName) infoRows += infoRow("Asentaja", installerName);
      break;

    case "rescheduled":
      infoRows = infoRow("Palvelu", serviceName);
      infoRows += infoRow("Ajankohta", `${dateStr} klo ${timeStr}`);
      if (durationStr) infoRows += infoRow("Arvioitu kesto", durationStr);
      if (fullAddress) infoRows += infoRow("Osoite", fullAddress);
      if (installerName) infoRows += infoRow("Asentaja", installerName);
      infoRows += infoRow("Varausnumero", `#${booking.booking_number}`);
      break;

    case "cancellation":
      infoRows = infoRow("Varausnumero", `#${booking.booking_number}`) + infoRow("Palvelu", serviceName) + infoRow("Ajankohta", `${dateStr} klo ${timeStr}`);
      break;

    case "receipt": {
      // All items (including service) come from booking_line_items
      let receiptRows = "";
      const rItems = booking.booking_line_items || [];
      for (const item of rItems) {
        const iq = item.quantity || 1;
        const itemLabel = iq > 1 ? `${item.name} × ${iq}` : item.name;
        receiptRows += receiptRow(itemLabel, formatCentsFi(item.price_cents * iq));
      }
      if (booking.discount_amount_cents > 0) {
        receiptRows += receiptRow("Alennus", `-${formatCentsFi(booking.discount_amount_cents)}`, "#dc2626");
      }
      if (booking.manual_discount_cents > 0) {
        const discLabel = booking.manual_discount_reason ? `Alennus (${booking.manual_discount_reason})` : "Alennus";
        receiptRows += receiptRow(discLabel, `-${formatCentsFi(booking.manual_discount_cents)}`, "#dc2626");
      }
      // Työn osuus: kiinteä 90 % kokonaishinnasta (sis. ALV), kotitalousvähennystä varten
      const rWork = workPortionCents(totalCents);
      if (rWork > 0) {
        receiptRows += receiptRow("Työn osuus", formatCentsFi(rWork), "#6b7280");
      }
      baseVars.receipt_rows = receiptRows;
      break;
    }

    case "installer_new_job":
    case "installer_rescheduled":
      infoRows = infoRow("Palvelu", serviceName) + infoRow("Asiakas", customerName);
      if (fullAddress) infoRows += infoRow("Osoite", fullAddress);
      if (durationStr) infoRows += infoRow("Arvioitu kesto", durationStr);
      if (customer.phone) infoRows += infoRow("Puhelin", customer.phone);
      infoRows += infoRow("Hinta yhteensä", priceFmt, BRAND_NAVY);
      infoRows += infoRow("Varausnumero", `#${booking.booking_number}`);
      break;

    case "installer_cancelled":
      infoRows = infoRow("Palvelu", serviceName, "#991b1b") + infoRow("Ajankohta", `${dateStr} klo ${timeStr}`, "#991b1b") + infoRow("Asiakas", customerName, "#991b1b");
      if (fullAddress) infoRows += infoRow("Osoite", fullAddress, "#991b1b");
      infoRows += infoRow("Varausnumero", `#${booking.booking_number}`, "#991b1b");
      break;

    case "feedback_request":
      // No info_rows needed - feedback email is simple with just a link
      break;

    case "protocol":
      infoRows = infoRow("Varausnumero", `#${booking.booking_number}`) + infoRow("Palvelu", serviceName) + infoRow("Ajankohta", `${dateStr} klo ${timeStr}`);
      if (fullAddress) infoRows += infoRow("Osoite", fullAddress);
      if (installerName) infoRows += infoRow("Asentaja", installerName);
      break;
  }

  baseVars.info_rows = infoRows;
  baseVars.notes_section = notesSection;

  // Line items section -- all items (including service) come from booking_line_items
  const allItems: { name: string; price_cents: number; quantity: number }[] = booking.booking_line_items || [];

  const discountRow = (booking.discount_amount_cents > 0
    ? `<table style="width:100%;border-collapse:collapse"><tr><td style="color:#dc2626;font-size:14px;padding:8px 0;border-bottom:1px solid #f3f4f6">Alennus</td><td style="text-align:right;font-weight:600;font-size:14px;color:#dc2626;padding:8px 0;white-space:nowrap;border-bottom:1px solid #f3f4f6">-${formatCentsFi(booking.discount_amount_cents)}</td></tr></table>`
    : "") + (booking.manual_discount_cents > 0
    ? `<table style="width:100%;border-collapse:collapse"><tr><td style="color:#dc2626;font-size:14px;padding:8px 0;border-bottom:1px solid #f3f4f6">${booking.manual_discount_reason ? `Alennus (${booking.manual_discount_reason})` : "Alennus"}</td><td style="text-align:right;font-weight:600;font-size:14px;color:#dc2626;padding:8px 0;white-space:nowrap;border-bottom:1px solid #f3f4f6">-${formatCentsFi(booking.manual_discount_cents)}</td></tr></table>`
    : "");
  const totalRow = allItems.length > 1 || booking.discount_amount_cents > 0 || booking.manual_discount_cents > 0
    ? `<table style="width:100%;border-collapse:collapse;margin-top:4px"><tr><td style="font-weight:700;font-size:15px;padding:10px 0;color:${BRAND_NAVY}">Yhteensä</td><td style="text-align:right;font-weight:800;font-size:15px;color:${BRAND_NAVY};padding:10px 0;white-space:nowrap">${formatCentsFi(totalCents)}</td></tr></table>`
    : "";

  baseVars.line_items_section = allItems.length > 0
    ? `<div style="background:#f8fafb;border-radius:0;padding:16px 20px;margin-bottom:20px"><p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin:0 0 12px">Palvelut ja tuotteet</p>${allItems.map((item: { name: string; price_cents: number; quantity: number }) => `<table style="width:100%;border-collapse:collapse"><tr><td style="color:#374151;font-size:14px;padding:8px 0;border-bottom:1px solid #f3f4f6">${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}</td><td style="text-align:right;font-weight:600;font-size:14px;color:#1a1a1a;padding:8px 0;white-space:nowrap;border-bottom:1px solid #f3f4f6">${formatCentsFi(item.price_cents * (item.quantity || 1))}</td></tr></table>`).join("")}${discountRow}${totalRow}</div>`
    : "";

  // Try DB template first, fall back to hardcoded
  if (slug) {
    const result = await renderTemplate(supabase, slug, baseVars, buildBookingEmailFallback(type, booking, payload));
    return result;
  }

  return buildBookingEmailFallback(type, booking, payload);
}

// --- Hardcoded fallback (kept for safety) ---

// deno-lint-ignore no-explicit-any
function buildBookingEmailFallback(type: string, booking: any, _payload?: any): { subject: string; html: string } {
  const customer = booking.customers;
  const service = booking.services;
  const variant = booking.service_variants;
  const employee = booking.employees;
  const qty = booking.device_count || 1;
  const customerName = `${customer.first_name} ${customer.last_name}`;

  // ── Read stored values (same pattern as buildBookingEmail) ──
  const serviceName = booking.service_label || (() => {
    const base = variant?.label ? `${service?.name || "Palvelu"} — ${variant.label}` : (service?.name || "Palvelu");
    return qty > 1 ? `${base} × ${qty}` : base;
  })();
  const baseServiceName = booking.service_label
    ? booking.service_label.replace(/ × \d+$/, "")
    : (variant?.label ? `${service?.name || "Palvelu"} — ${variant.label}` : (service?.name || "Palvelu"));
  const durationMin = booking.duration_minutes ?? (() => {
    const base = variant?.duration_minutes || service?.duration_minutes || 0;
    const extra = service?.extra_duration_per_unit_minutes;
    return qty > 1 ? (extra != null ? base + (qty - 1) * extra : base * qty) : base;
  })();
  const servicePriceCents: number = booking.unit_price_cents ?? (() => {
    if (variant?.price_cents) return variant.price_cents;
    return service?.base_price_cents || booking.price_cents;
  })();
  // ── End stored values ──

  const installerName = employee ? `${employee.first_name} ${employee.last_name}` : "";
  const dateStr = formatDateFi(booking.booking_date);
  const timeStr = booking.time_slot?.slice(0, 5) || "";
  // price_cents is the cached total. Single source of truth.
  const fbTotalCents = booking.price_cents;
  const priceFmt = fbTotalCents <= 0 ? "Maksuton" : formatCentsFi(fbTotalCents);
  const paymentNote = fbTotalCents <= 0 ? null : (booking.payment_note || service?.payment_note || autoPaymentNote(fbTotalCents));
  const fullAddr = formatAddress(booking.address || "", booking.postal_code || "");
  const durStr = durationMin > 0
    ? durationMin >= 60
      ? `${Math.floor(durationMin / 60)} h${durationMin % 60 ? ` ${durationMin % 60} min` : ""}`
      : `${durationMin} min`
    : "";

  // All items (including service) come from booking_line_items
  const allFallbackItems: { name: string; price_cents: number; quantity: number; material_cost_cents?: number }[] = booking.booking_line_items || [];
  const fbDiscountRow = (booking.discount_amount_cents > 0
    ? `<table style="width:100%;border-collapse:collapse"><tr><td style="color:#dc2626;font-size:14px;padding:8px 0;border-bottom:1px solid #f3f4f6">Alennus</td><td style="text-align:right;font-weight:600;font-size:14px;color:#dc2626;padding:8px 0;white-space:nowrap;border-bottom:1px solid #f3f4f6">-${formatCentsFi(booking.discount_amount_cents)}</td></tr></table>`
    : "") + (booking.manual_discount_cents > 0
    ? `<table style="width:100%;border-collapse:collapse"><tr><td style="color:#dc2626;font-size:14px;padding:8px 0;border-bottom:1px solid #f3f4f6">${booking.manual_discount_reason ? `Alennus (${booking.manual_discount_reason})` : "Alennus"}</td><td style="text-align:right;font-weight:600;font-size:14px;color:#dc2626;padding:8px 0;white-space:nowrap;border-bottom:1px solid #f3f4f6">-${formatCentsFi(booking.manual_discount_cents)}</td></tr></table>`
    : "");
  const fbTotalRow = (allFallbackItems.length > 1 || booking.discount_amount_cents > 0 || booking.manual_discount_cents > 0)
    ? `<table style="width:100%;border-collapse:collapse;margin-top:4px"><tr><td style="font-weight:700;font-size:15px;padding:10px 0;color:${BRAND_NAVY}">Yhteensä</td><td style="text-align:right;font-weight:800;font-size:15px;color:${BRAND_NAVY};padding:10px 0;white-space:nowrap">${formatCentsFi(fbTotalCents)}</td></tr></table>`
    : "";
  const lineItemsHtml = allFallbackItems.length > 0
    ? `<div style="background:#f8fafb;border-radius:0;padding:16px 20px;margin-bottom:20px"><p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin:0 0 12px">Palvelut ja tuotteet</p>${allFallbackItems.map(item => `<table style="width:100%;border-collapse:collapse"><tr><td style="color:#374151;font-size:14px;padding:8px 0;border-bottom:1px solid #f3f4f6">${item.name}${(item.quantity || 1) > 1 ? ` ×${item.quantity}` : ""}</td><td style="text-align:right;font-weight:600;font-size:14px;color:#1a1a1a;padding:8px 0;white-space:nowrap;border-bottom:1px solid #f3f4f6">${formatCentsFi(item.price_cents * (item.quantity || 1))}</td></tr></table>`).join("")}${fbDiscountRow}${fbTotalRow}</div>`
    : "";

  // Notes section -- only shown when notes exist
  const notesHtml = booking.notes
    ? `<div style="background:#f8fafb;border-left:4px solid ${BRAND_NAVY};border-radius:0;padding:16px;margin-bottom:20px"><p style="color:${BRAND_NAVY};font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin:0 0 6px">Lisätiedot</p><p style="color:#374151;font-size:14px;margin:0;line-height:1.5">${booking.notes}</p></div>`
    : "";

  switch (type) {
    case "confirmation":
      return { subject: "Varauksesi on vahvistettu - TiivisKoti", html: emailWrapper(`
        <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:${BRAND_BLUE}22;border:2px solid ${BRAND_BLUE};border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:${BRAND_NAVY}">&#10003;</div></div>
        <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Varaus vahvistettu</h1>
        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;text-align:center">Hei ${customerName}, kiitos varauksestasi.</p>
        <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:20px">
          ${infoRow("Palvelu", serviceName)}${infoRow("Ajankohta", `${dateStr} klo ${timeStr}`)}
          ${durStr ? infoRow("Arvioitu kesto", durStr) : ""}
          ${fullAddr ? infoRow("Osoite", fullAddr) : ""}
          ${installerName ? infoRow("Asentaja", installerName) : ""}
        </div>
        ${lineItemsHtml}
        ${fbTotalCents <= 0
          ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:0;padding:20px;margin-bottom:20px;text-align:center"><p style="font-weight:800;font-size:28px;color:#059669;margin:0">Maksuton</p></div>`
          : `<div style="background:${BRAND_BLUE}12;border:1px solid ${BRAND_BLUE}44;border-radius:0;padding:20px;margin-bottom:20px;text-align:center"><p style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px">Hinta</p><p style="font-weight:800;font-size:28px;color:${BRAND_NAVY};margin:0">${priceFmt}</p></div>`}
        ${paymentNote ? `<div style="background:#f8fafb;border-radius:0;padding:12px 16px;margin-bottom:20px;text-align:center"><p style="color:#6b7280;font-size:13px;margin:0">${paymentNote}</p></div>` : ""}
        ${notesHtml}
        <div style="text-align:center;margin-bottom:20px"><span style="display:inline-block;background:${BRAND_NAVY}0a;color:${BRAND_NAVY};padding:6px 16px;border-radius:0;font-size:13px;font-weight:600">Varausnumero #${booking.booking_number}</span></div>
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Kysyttävää? <a href="mailto:info@tiiviskoti.fi" style="color:${BRAND_NAVY};text-decoration:none;font-weight:600">info@tiiviskoti.fi</a></p>`) };

    case "rescheduled":
      return { subject: "Varaustasi on siirretty - TiivisKoti", html: emailWrapper(`
        <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:${BRAND_NAVY}12;border:2px solid ${BRAND_NAVY}40;border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:${BRAND_NAVY}">&#128197;</div></div>
        <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Varauksesi on siirretty</h1>
        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;text-align:center">Hei ${customerName}, varauksesi ajankohta on muuttunut.</p>
        <div style="background:${BRAND_NAVY};border-radius:0;padding:20px 24px;margin-bottom:20px;text-align:center"><p style="color:${BRAND_BLUE};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:0 0 8px">Uusi ajankohta</p><p style="color:#ffffff;font-size:20px;font-weight:800;margin:0">${dateStr}</p><p style="color:rgba(255,255,255,0.6);font-size:15px;font-weight:600;margin:4px 0 0">klo ${timeStr}</p></div>
        <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:20px">${infoRow("Palvelu", serviceName)}${durStr ? infoRow("Arvioitu kesto", durStr) : ""}${fullAddr ? infoRow("Osoite", fullAddr) : ""}${installerName ? infoRow("Asentaja", installerName) : ""}${infoRow("Varausnumero", `#${booking.booking_number}`)}</div>
        ${lineItemsHtml}${notesHtml}
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Eikö uusi aika sovi? <a href="mailto:info@tiiviskoti.fi" style="color:${BRAND_NAVY};text-decoration:none;font-weight:600">info@tiiviskoti.fi</a></p>`) };

    case "cancellation":
      return { subject: "Varauksesi on peruutettu - TiivisKoti", html: emailWrapper(`
        <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:#fef2f2;border:2px solid #fecaca;border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:#dc2626">&#10005;</div></div>
        <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Varaus peruutettu</h1>
        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;text-align:center">Hei ${customerName}, varauksesi on peruutettu.</p>
        <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:24px">${infoRow("Varausnumero", `#${booking.booking_number}`)}${infoRow("Palvelu", serviceName)}${infoRow("Ajankohta", `${dateStr} klo ${timeStr}`)}</div>
        <div style="text-align:center;margin-bottom:20px"><a href="https://tiiviskoti.fi" style="display:inline-block;background:${BRAND_NAVY};color:white;text-decoration:none;padding:14px 36px;border-radius:0;font-weight:700;font-size:14px">Varaa uusi aika</a></div>`) };

    case "receipt":
      return { subject: "Kuitti varauksestasi - TiivisKoti", html: emailWrapper(`
        <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:${BRAND_BLUE}22;border:2px solid ${BRAND_BLUE};border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:${BRAND_NAVY}">&#128499;</div></div>
        <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Kuitti</h1>
        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;text-align:center">Hei ${customerName}, liitteenä kuitti varauksestasi.</p>
        <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:20px">
          ${allFallbackItems.map(item => receiptRow(`${item.name}${(item.quantity || 1) > 1 ? ` ×${item.quantity}` : ""}`, formatCentsFi(item.price_cents * (item.quantity || 1)))).join("")}
          ${booking.discount_amount_cents > 0 ? receiptRow("Alennus", `-${formatCentsFi(booking.discount_amount_cents)}`, "#dc2626") : ""}
          ${booking.manual_discount_cents > 0 ? receiptRow(booking.manual_discount_reason ? `Alennus (${booking.manual_discount_reason})` : "Alennus", `-${formatCentsFi(booking.manual_discount_cents)}`, "#dc2626") : ""}
          ${(() => { const w = workPortionCents(fbTotalCents); return w > 0 ? receiptRow("Työn osuus", formatCentsFi(w), "#6b7280") : ""; })()}
          <table style="width:100%;margin-top:16px;border-top:2px solid ${BRAND_NAVY}15"><tr><td style="font-weight:700;font-size:15px;padding:14px 0 0;color:${BRAND_NAVY}">Yhteensä</td><td style="text-align:right;font-weight:800;font-size:22px;color:${BRAND_NAVY};padding:14px 0 0">${priceFmt}</td></tr></table>
        </div>
        <div style="text-align:center;margin-bottom:20px"><span style="display:inline-block;background:${BRAND_BLUE}22;color:${BRAND_NAVY};padding:8px 24px;border-radius:0;font-weight:700;font-size:13px;text-transform:uppercase;border:1px solid ${BRAND_BLUE}44">&#10003; Maksettu</span></div>`) };

    case "installer_new_job":
      return { subject: `Uusi keikka: ${serviceName} - ${dateStr}`, html: emailWrapper(`
        <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:${BRAND_NAVY}12;border:2px solid ${BRAND_NAVY}40;border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:${BRAND_NAVY}">&#128736;</div></div>
        <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Uusi keikka!</h1>
        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;text-align:center">Hei ${installerName}, sinulle on uusi asennus.</p>
        <div style="background:${BRAND_NAVY};border-radius:0;padding:20px 24px;margin-bottom:20px;text-align:center"><p style="color:${BRAND_BLUE};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:0 0 8px">Ajankohta</p><p style="color:#ffffff;font-size:20px;font-weight:800;margin:0">${dateStr}</p><p style="color:rgba(255,255,255,0.6);font-size:15px;font-weight:600;margin:4px 0 0">klo ${timeStr}</p></div>
        <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:20px">${infoRow("Palvelu", serviceName)}${infoRow("Asiakas", customerName)}${fullAddr ? infoRow("Osoite", fullAddr) : ""}${durStr ? infoRow("Arvioitu kesto", durStr) : ""}${customer.phone ? infoRow("Puhelin", customer.phone) : ""}${infoRow("Hinta yhteensä", priceFmt, BRAND_NAVY)}${infoRow("Varausnumero", `#${booking.booking_number}`)}</div>
        ${lineItemsHtml}${notesHtml}`) };

    case "installer_cancelled":
      return { subject: `Keikka peruutettu: ${serviceName} - ${dateStr}`, html: emailWrapper(`
        <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:#fef2f2;border:2px solid #fecaca;border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:#dc2626">&#10005;</div></div>
        <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Keikka peruutettu</h1>
        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;text-align:center">Hei ${installerName}, seuraava keikka on peruutettu.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:0;padding:20px 24px;margin-bottom:20px">${infoRow("Palvelu", serviceName, "#991b1b")}${infoRow("Ajankohta", `${dateStr} klo ${timeStr}`, "#991b1b")}${infoRow("Asiakas", customerName, "#991b1b")}${fullAddr ? infoRow("Osoite", fullAddr, "#991b1b") : ""}${infoRow("Varausnumero", `#${booking.booking_number}`, "#991b1b")}</div>`) };

    case "installer_rescheduled":
      return { subject: `Keikka siirretty: ${serviceName} - ${dateStr}`, html: emailWrapper(`
        <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:${BRAND_NAVY}12;border:2px solid ${BRAND_NAVY}40;border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:${BRAND_NAVY}">&#128197;</div></div>
        <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Keikka siirretty</h1>
        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;text-align:center">Hei ${installerName}, seuraavan keikan ajankohta on muuttunut.</p>
        <div style="background:${BRAND_NAVY};border-radius:0;padding:20px 24px;margin-bottom:20px;text-align:center"><p style="color:${BRAND_BLUE};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:0 0 8px">Uusi ajankohta</p><p style="color:#ffffff;font-size:20px;font-weight:800;margin:0">${dateStr}</p><p style="color:rgba(255,255,255,0.6);font-size:15px;font-weight:600;margin:4px 0 0">klo ${timeStr}</p></div>
        <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:20px">${infoRow("Palvelu", serviceName)}${infoRow("Asiakas", customerName)}${fullAddr ? infoRow("Osoite", fullAddr) : ""}${durStr ? infoRow("Arvioitu kesto", durStr) : ""}${customer.phone ? infoRow("Puhelin", customer.phone) : ""}${infoRow("Hinta yhteensä", priceFmt, BRAND_NAVY)}${infoRow("Varausnumero", `#${booking.booking_number}`)}</div>
        ${lineItemsHtml}${notesHtml}`) };

    case "feedback_request": {
      const feedbackLink = `https://tiiviskoti.fi/palaute/${payload?.feedback_token || ""}`;
      return { subject: "Miten meni? \u2014 TiivisKoti", html: emailWrapper(`
        <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:${BRAND_BLUE}22;border:2px solid ${BRAND_BLUE};border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:${BRAND_NAVY}">\u2B50</div></div>
        <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Miten meni?</h1>
        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;text-align:center">Hei ${customerName}, haluaisimme kuulla miten asennus sujui.</p>
        <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:20px">
          ${infoRow("Palvelu", serviceName)}${infoRow("Ajankohta", `${dateStr} klo ${timeStr}`)}${installerName ? infoRow("Asentaja", installerName) : ""}
        </div>
        <div style="text-align:center;margin-bottom:20px"><a href="${feedbackLink}" style="display:inline-block;background:${BRAND_NAVY};color:white;text-decoration:none;padding:14px 36px;border-radius:0;font-weight:700;font-size:14px">Anna palautetta</a></div>
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Palautteesi auttaa meit\u00E4 kehitt\u00E4m\u00E4\u00E4n palveluamme.</p>`) };
    }

    case "protocol": {
      const protocolTitle = (_payload?.protocol_title as string) || "Asennuspöytäkirja";
      const protocolIntro = (_payload?.protocol_intro as string) || "liitteenä asennuksen pöytäkirja.";
      return { subject: `${protocolTitle} - Varaus #${booking.booking_number} - TiivisKoti`, html: emailWrapper(`
        <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:${BRAND_BLUE}22;border:2px solid ${BRAND_BLUE};border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:${BRAND_NAVY}">&#128203;</div></div>
        <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">${protocolTitle}</h1>
        <p style="color:#6b7280;font-size:14px;margin:0 0 28px;text-align:center">Hei ${customerName}, ${protocolIntro}</p>
        <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:24px">
          ${infoRow("Varausnumero", `#${booking.booking_number}`)}
          ${infoRow("Palvelu", serviceName)}
          ${infoRow("Ajankohta", `${dateStr} klo ${timeStr}`)}
          ${fullAddr ? infoRow("Osoite", fullAddr) : ""}
          ${installerName ? infoRow("Asentaja", installerName) : ""}
        </div>
        <p style="color:#6b7280;font-size:13px;text-align:center;margin:0 0 20px">Pöytäkirja löytyy liitteenä PDF-tiedostona.</p>`) };
    }

    default:
      return { subject: "TiivisKoti", html: "" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTACT TEMPLATE BUILDER (DB-backed with hardcoded fallback)
// ═══════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function buildContactEmail(supabase: SupabaseClient, formLabel: string, p: any): Promise<{ subject: string; html: string }> {
  const now = new Date();
  const fi = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
  const timestamp = `${fi.getDate()}.${fi.getMonth() + 1}.${fi.getFullYear()} klo ${String(fi.getHours()).padStart(2, "0")}:${String(fi.getMinutes()).padStart(2, "0")}`;

  // Build fields_html compound variable
  let fieldsHtml = "";
  const isReview = p.formSlug === "arvostelu";

  if (isReview) {
    const ratingLabel = p.rating === "positive" ? "Positiivinen" : p.rating === "neutral" ? "Neutraali" : p.rating === "negative" ? "Negatiivinen" : (p.rating || "-");
    const ratingColor = p.rating === "positive" ? "#16a34a" : p.rating === "negative" ? "#dc2626" : "#d97706";
    fieldsHtml += infoRow("Arvosana", `<span style="color:${ratingColor};font-weight:800">${ratingLabel}</span>`);
    if (p.feedback) fieldsHtml += `<div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb"><p style="color:#888;font-size:12px;text-transform:uppercase;font-weight:700;margin:0 0 8px">Viesti</p><p style="color:#1a1a1a;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap">${escapeHtml(p.feedback)}</p></div>`;
  } else {
    if (p.name) fieldsHtml += infoRow("Nimi", escapeHtml(p.name));
    if (p.email) fieldsHtml += infoRow("Sähköposti", `<a href="mailto:${encodeURIComponent(p.email)}" style="color:#217A4E;text-decoration:none;font-weight:600">${escapeHtml(p.email)}</a>`);
    if (p.phone) fieldsHtml += infoRow("Puhelin", `<a href="tel:${encodeURIComponent(p.phone)}" style="color:#217A4E;text-decoration:none;font-weight:600">${escapeHtml(p.phone)}</a>`);
    if (p.postalCode) fieldsHtml += infoRow("Postinumero", escapeHtml(p.postalCode));
    if (p.role) fieldsHtml += infoRow("Rooli", escapeHtml(p.role));
    if (p.association) fieldsHtml += infoRow("Taloyhtiö", escapeHtml(p.association));
    if (p.buildings) fieldsHtml += infoRow("Rakennuksia", escapeHtml(p.buildings));
    if (p.message) fieldsHtml += `<div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb"><p style="color:#888;font-size:12px;text-transform:uppercase;font-weight:700;margin:0 0 8px">Viesti</p><p style="color:#1a1a1a;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap">${escapeHtml(p.message)}</p></div>`;
  }

  const replyButton = p.email && !isReview
    ? `<div style="text-align:center"><a href="mailto:${encodeURIComponent(p.email)}" style="display:inline-block;background:${BRAND_NAVY};color:white;text-decoration:none;padding:14px 36px;border-radius:0;font-weight:700;font-size:14px">Vastaa asiakkaalle</a></div>`
    : "";

  const pageUrlDisplay = p.pageUrl
    ? ` &middot; <a href="${escapeHtml(p.pageUrl)}" style="color:#94a3b8;text-decoration:none">${escapeHtml(new URL(p.pageUrl).pathname)}</a>`
    : "";

  const slug = isReview ? "contact_review_notification" : "contact_notification";
  const vars: Record<string, string> = {
    form_name: formLabel.toLowerCase(),
    timestamp,
    fields_html: fieldsHtml,
    reply_button: replyButton,
    page_url_display: pageUrlDisplay,
  };

  // Hardcoded fallback
  const fallback = {
    subject: `Uusi ${formLabel.toLowerCase()} — TiivisKoti`,
    html: emailWrapper(`
      <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Uusi ${formLabel.toLowerCase()}</h1>
      <p style="color:#6b7280;font-size:13px;margin:0 0 28px;text-align:center">${timestamp}${pageUrlDisplay}</p>
      <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:24px">${fieldsHtml}</div>
      ${replyButton}
    `),
  };

  return renderTemplate(supabase, slug, vars, fallback);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTRACT FALLBACK TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

function contractSignedHtml(vars: Record<string, string>): string {
  return emailWrapper(`
    <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:${BRAND_BLUE}22;border:2px solid ${BRAND_BLUE};border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:${BRAND_NAVY}">&#9989;</div></div>
    <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Sopimus allekirjoitettu!</h1>
    <p style="color:#6b7280;font-size:14px;text-align:center;margin:0 0 28px">Kiitos ${vars.customer_name}! Vuosisopimuksesi on nyt voimassa.</p>
    <div style="background:${BRAND_NAVY};border-radius:0;padding:24px;margin-bottom:20px">
      <p style="color:${BRAND_BLUE};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:0 0 8px">Sopimus #${vars.contract_number}</p>
      ${vars.contract_details}
    </div>
    <div style="background:${BRAND_BLUE}12;border:1px solid ${BRAND_BLUE}44;border-radius:0;padding:20px;margin-bottom:20px;text-align:center">
      <p style="color:#6b7280;font-size:12px;margin:0 0 4px">Sopimushinta</p>
      <p style="color:${BRAND_NAVY};font-size:28px;font-weight:800;margin:0">${vars.price}<span style="font-size:14px;color:#6b7280;font-weight:400"> / ${vars.billing_period || "vuosi"}</span></p>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Kysyttävää? <a href="mailto:info@tiiviskoti.fi" style="color:${BRAND_NAVY};text-decoration:none;font-weight:600">info@tiiviskoti.fi</a></p>
  `);
}

function contractProposalHtml(vars: Record<string, string>): string {
  return emailWrapper(`
    <div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;background:${BRAND_NAVY}12;border:2px solid ${BRAND_NAVY}40;border-radius:0;width:56px;height:56px;line-height:56px;font-size:24px;color:${BRAND_NAVY}">&#128221;</div></div>
    <h1 style="color:${BRAND_NAVY};font-size:22px;font-weight:800;margin:0 0 6px;text-align:center">Sopimus</h1>
    <p style="color:#6b7280;font-size:14px;text-align:center;margin:0 0 28px">Hei ${vars.customer_name}! Olemme valmistelleet sinulle vuosisopimuksen.</p>
    <div style="background:#f8fafb;border-radius:0;padding:20px 24px;margin-bottom:20px">
      ${vars.info_rows}
    </div>
    <div style="background:${BRAND_BLUE}12;border:1px solid ${BRAND_BLUE}44;border-radius:0;padding:20px;margin-bottom:20px;text-align:center">
      <p style="color:#6b7280;font-size:12px;margin:0 0 4px">Sopimushinta</p>
      <p style="color:${BRAND_NAVY};font-size:28px;font-weight:800;margin:0">${vars.price}<span style="font-size:14px;color:#6b7280;font-weight:400"> / ${vars.billing_period || "vuosi"}</span></p>
      ${vars.savings_section}
    </div>
    ${vars.signing_button}
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Kysyttävää? <a href="mailto:info@tiiviskoti.fi" style="color:${BRAND_NAVY};text-decoration:none;font-weight:600">info@tiiviskoti.fi</a></p>
  `);
}
