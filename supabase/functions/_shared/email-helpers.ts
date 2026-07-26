/**
 * Shared email building and sending utilities.
 * Used by all functions that send email via Gmail API.
 */

import { getGoogleAccessToken } from "./google-auth.ts";
import { fetchWithRetry } from "./fetch-retry.ts";
import { GMAIL_SCOPE } from "./constants.ts";
import { EMAIL_FONT_FAMILY } from "./email-styles.ts";

const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

// ─── Encoding helpers ────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function encodeUtf8B64(s: string): string {
  return btoa(String.fromCharCode(...encoder.encode(s)));
}

function urlSafeB64(raw: string): string {
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── Build raw RFC 2822 message ──────────────────────────────────────────────

export interface EmailOptions {
  senderName?: string;
  senderEmail: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string;
}

export function buildRawEmail(opts: EmailOptions): string {
  const toStr = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  const subjectB64 = encodeUtf8B64(opts.subject);

  const fromHeader = opts.senderName
    ? `=?UTF-8?B?${encodeUtf8B64(opts.senderName)}?= <${opts.senderEmail}>`
    : opts.senderEmail;

  const lines = [
    `From: ${fromHeader}`,
    `To: ${toStr}`,
  ];

  if (opts.cc) {
    const ccStr = Array.isArray(opts.cc) ? opts.cc.join(", ") : opts.cc;
    lines.push(`Cc: ${ccStr}`);
  }
  if (opts.bcc) {
    const bccStr = Array.isArray(opts.bcc) ? opts.bcc.join(", ") : opts.bcc;
    lines.push(`Bcc: ${bccStr}`);
  }

  lines.push(`Subject: =?UTF-8?B?${subjectB64}?=`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: text/html; charset=utf-8`);
  lines.push(`Content-Transfer-Encoding: base64`);

  // In-Reply-To must use the RFC 2822 Message-ID (not Gmail message ID)
  // for proper threading across email clients
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${opts.references || opts.inReplyTo}`);
  }

  const bodyB64 = encodeUtf8B64(opts.html);
  const rawStr = `${lines.join("\r\n")}\r\n\r\n${bodyB64}`;
  return urlSafeB64(rawStr);
}

export interface EmailAttachment {
  data?: Uint8Array;
  base64?: string;
  filename: string;
  mimeType?: string;
}

export interface EmailWithAttachmentOptions extends EmailOptions {
  attachment: EmailAttachment;
}

export interface EmailWithAttachmentsOptions extends EmailOptions {
  attachments: EmailAttachment[];
}

export function buildRawEmailWithAttachment(
  opts: EmailWithAttachmentOptions
): string {
  return buildRawEmailWithAttachments({ ...opts, attachments: [opts.attachment] });
}

export function buildRawEmailWithAttachments(
  opts: EmailWithAttachmentsOptions
): string {
  const toStr = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  const subjectB64 = encodeUtf8B64(opts.subject);
  const boundary = "boundary_" + crypto.randomUUID().replace(/-/g, "");

  const fromHeader = opts.senderName
    ? `=?UTF-8?B?${encodeUtf8B64(opts.senderName)}?= <${opts.senderEmail}>`
    : opts.senderEmail;

  const headerLines = [
    `From: ${fromHeader}`,
    `To: ${toStr}`,
  ];

  if (opts.cc) {
    const ccStr = Array.isArray(opts.cc) ? opts.cc.join(", ") : opts.cc;
    headerLines.push(`Cc: ${ccStr}`);
  }
  if (opts.bcc) {
    const bccStr = Array.isArray(opts.bcc) ? opts.bcc.join(", ") : opts.bcc;
    headerLines.push(`Bcc: ${bccStr}`);
  }

  headerLines.push(`Subject: =?UTF-8?B?${subjectB64}?=`);
  headerLines.push(`MIME-Version: 1.0`);
  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  if (opts.inReplyTo) {
    headerLines.push(`In-Reply-To: ${opts.inReplyTo}`);
    headerLines.push(`References: ${opts.references || opts.inReplyTo}`);
  }

  const htmlB64 = encodeUtf8B64(opts.html);
  const parts = [
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlB64,
  ];

  for (const att of opts.attachments) {
    let attB64 = att.base64 || "";
    if (!attB64 && att.data) {
      // Chunked conversion to avoid stack overflow with large Uint8Arrays
      const chunks: string[] = [];
      const d = att.data;
      for (let i = 0; i < d.length; i += 8192) {
        chunks.push(String.fromCharCode(...d.subarray(i, Math.min(i + 8192, d.length))));
      }
      attB64 = btoa(chunks.join(""));
    }
    const filenameB64 = encodeUtf8B64(att.filename);
    const mimeType = att.mimeType || "application/octet-stream";
    parts.push(
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      `Content-Disposition: attachment; filename="=?UTF-8?B?${filenameB64}?="`,
      `Content-Transfer-Encoding: base64`,
      ``,
      attB64,
    );
  }

  parts.push(`--${boundary}--`);

  return urlSafeB64(`${headerLines.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`);
}

// ─── Send via Gmail API ──────────────────────────────────────────────────────

export interface SendResult {
  ok: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

/**
 * Sends an email via Gmail API using the service account.
 *
 * @param raw - URL-safe base64 encoded RFC 2822 message (from buildRawEmail)
 * @param senderEmail - Which account to send from (impersonation)
 * @param threadId - Optional Gmail thread ID for reply threading
 */
export async function sendViaGmail(
  raw: string,
  senderEmail: string,
  threadId?: string
): Promise<SendResult> {
  const accessToken = await getGoogleAccessToken(GMAIL_SCOPE, senderEmail);

  const body: Record<string, string> = { raw };
  if (threadId) body.threadId = threadId;

  const res = await fetchWithRetry(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Gmail send failed: ${res.status} ${text}` };
  }

  const data = await res.json();
  return { ok: true, messageId: data.id, threadId: data.threadId };
}

// ─── HTML helpers ────────────────────────────────────────────────────────────

/**
 * Simple info row for email tables (label → value).
 */
export function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;">${label}</td>
      <td style="padding:6px 12px;font-size:13px;font-weight:500;">${value}</td>
    </tr>`;
}

/**
 * Wraps email body in a styled HTML shell.
 */
export function emailWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;font-family:${EMAIL_FONT_FAMILY};background:#f3f4f6;">
  <div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    ${bodyHtml}
  </div>
</body>
</html>`;
}
