/**
 * Centralized email styling constants and helpers.
 *
 * ALL outbound email HTML should flow through `formatEmailHtml()` so that
 * font, size, line-height and paragraph spacing are consistent everywhere
 * (compose, reply, automations, system emails).
 */

// ─── Typography ──────────────────────────────────────────────────────────────

export const EMAIL_FONT_FAMILY = "Arial, Helvetica, sans-serif";
export const EMAIL_FONT_SIZE = "small";
export const EMAIL_LINE_HEIGHT = "normal";
export const EMAIL_PARAGRAPH_MARGIN = "0";

// ─── Company ─────────────────────────────────────────────────────────────────

export const COMPANY_NAME = "TiivisKoti Oy";
export const COMPANY_SHORT = "TiivisKoti";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formats Tiptap / template HTML for email delivery.
 *
 * Strategy (mirrors Gmail native compose):
 *  - Content paragraphs → `<p>` with explicit inline margin
 *  - Blank lines (empty paragraphs from Enter) → `<br>` tags
 *  - `<br>` is the most universally supported spacing element across
 *    Gmail, Outlook, Yahoo Mail and Apple Mail — never stripped.
 */
export function formatEmailHtml(html: string): string {
  const P_STYLE = `style="margin:${EMAIL_PARAGRAPH_MARGIN};line-height:${EMAIL_LINE_HEIGHT};mso-line-height-rule:exactly;"`;

  // 1) Legacy: convert double <br><br> (old Enter=br templates) to <p> breaks
  let h = html.replace(/(<br\s*\/?\s*>)\s*(<br\s*\/?\s*>)/gi, "</p><p>");

  // 2) Convert empty <p></p> tags into <br> (Gmail-native blank line).
  //    Each empty paragraph becomes one <br> so multiple blank lines
  //    produce proportional spacing — exactly like Gmail compose.
  //    Tiptap renders empty lines as <p><br></p> or <p><br class="..."></p>.
  h = h.replace(/<p[^>]*>\s*(?:<br[^>]*\/?\s*>\s*)*<\/p>/gi, "<br>");

  // 3) Style all remaining (content) <p> tags with consistent inline CSS.
  h = h.replace(/<p(\s[^>]*)?\s*>/gi, (_m, attrs: string | undefined) => {
    if (!attrs?.trim()) return `<p ${P_STYLE}>`;
    // Preserve non-margin attributes, override margin
    if (/style\s*=/i.test(attrs)) {
      const cleaned = attrs
        .replace(/margin\s*:[^;"']*/gi, "")
        .replace(/line-height\s*:[^;"']*/gi, "")
        .replace(/mso-line-height-rule\s*:[^;"']*/gi, "")
        .replace(
          /style\s*=\s*["']\s*;?\s*/i,
          `style="margin:${EMAIL_PARAGRAPH_MARGIN};line-height:${EMAIL_LINE_HEIGHT};mso-line-height-rule:exactly;`,
        );
      return `<p${cleaned}>`;
    }
    return `<p ${P_STYLE}${attrs}>`;
  });

  return `<div style="font-family:${EMAIL_FONT_FAMILY};font-size:${EMAIL_FONT_SIZE};line-height:${EMAIL_LINE_HEIGHT};">${h}</div>`;
}

/**
 * Generates a default email signature for an employee.
 * Used both as the initial persisted signature and as the runtime fallback.
 */
export function generateDefaultSignatureHtml(
  employee: { first_name: string; last_name: string; email: string; phone?: string | null },
  logoUrl: string,
): string {
  const name = `${employee.first_name} ${employee.last_name}`;
  const lines = [
    "Ystävällisin terveisin,",
    `<strong>${name}</strong>`,
    COMPANY_NAME,
  ];
  if (employee.phone) lines.push(employee.phone);
  lines.push(employee.email);
  return `<p>${lines.join("<br>")}</p><p><img src="${logoUrl}" alt="${COMPANY_SHORT}" width="120" style="margin-top:4px;" /></p>`;
}
