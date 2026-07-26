/**
 * Shared HTML-to-PDF utility.
 * Calls the Vercel Chromium API to render HTML into a PDF.
 * Reusable for receipts, contracts, and any future documents.
 */

const PDF_API = "https://loppusiivous-site-new.vercel.app/api/generate-pdf";

/**
 * Convert an HTML string to a PDF via server-side Chromium rendering.
 * Returns the PDF as a Uint8Array.
 */
export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resp = await fetch(PDF_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ html }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error("htmlToPdf failed: " + resp.status + " " + errText);
  }

  return new Uint8Array(await resp.arrayBuffer());
}

/** Wrap body content in a full HTML document with Outfit font loaded. */
export function wrapHtmlDocument(bodyContent: string): string {
  const parts: string[] = [];
  parts.push('<!DOCTYPE html><html><head><meta charset="utf-8">');
  parts.push('<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">');
  parts.push("<style>");
  parts.push("*{margin:0;padding:0;box-sizing:border-box;font-family:'Outfit',sans-serif;");
  parts.push("-webkit-print-color-adjust:exact;print-color-adjust:exact;}");
  parts.push("body{width:794px;color:#1f2937;line-height:1.4;}");
  parts.push("</style></head><body>");
  parts.push(bodyContent);
  parts.push("</body></html>");
  return parts.join("");
}
