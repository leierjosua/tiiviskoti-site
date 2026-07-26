/**
 * Email styling constants and formatter (site mirror).
 *
 * Values MUST stay in sync with:
 *   - supabase/functions/_shared/email-styles.ts
 *   - admin/src/lib/email-styles.ts
 */

const EMAIL_FONT_FAMILY = "Arial, Helvetica, sans-serif";
const EMAIL_FONT_SIZE = "small";
const EMAIL_LINE_HEIGHT = "normal";
const EMAIL_PARAGRAPH_MARGIN = "0";

export function formatEmailHtml(html: string): string {
  const P_STYLE = `style="margin:${EMAIL_PARAGRAPH_MARGIN};line-height:${EMAIL_LINE_HEIGHT};mso-line-height-rule:exactly;"`;

  let h = html.replace(/(<br\s*\/?\s*>)\s*(<br\s*\/?\s*>)/gi, "</p><p>");
  h = h.replace(/<p[^>]*>\s*<\/p>/gi, "<br>");
  h = h.replace(/<p(\s[^>]*)?\s*>/gi, (_m: string, attrs: string | undefined) => {
    if (!attrs?.trim()) return `<p ${P_STYLE}>`;
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
