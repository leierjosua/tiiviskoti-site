import { getFreshToken } from "@/lib/supabase";

const PDF_API = "https://loppusiivous-site-new.vercel.app/api/generate-pdf";
const OFFER_PDF_API = "https://loppusiivous-site-new.vercel.app/api/offer-pdf";

const CONTRACT_PDF_API = "https://loppusiivous-site-new.vercel.app/api/contract-pdf";
const INVENTORY_LABEL_API = "https://loppusiivous-site-new.vercel.app/api/inventory-label";
const SITE_ORIGIN = "https://loppusiivous-site-new.vercel.app";

/**
 * Replace relative src/href paths with absolute URLs so Chromium can resolve them.
 */
function absolutifyPaths(html: string): string {
  return html.replace(/(src|href)="\/(?!\/)/g, `$1="${SITE_ORIGIN}/`);
}

/**
 * Wrap raw body HTML in a full document with Outfit font loaded.
 */
function wrapHtml(bodyHtml: string): string {
  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8">',
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">',
    "<style>",
    "  * { margin: 0; padding: 0; box-sizing: border-box; }",
    "  body { font-family: 'Outfit', 'Inter', 'Helvetica Neue', Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
    "  @page { margin: 0; size: A4; }",
    "</style>",
    "</head><body>",
    absolutifyPaths(bodyHtml),
    "</body></html>",
  ].join("\n");
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getFreshToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Capture a DOM element as PDF via Chromium (Vercel API).
 * Serialises the element's HTML, wraps it, and sends to /api/generate-pdf.
 * Forces A4 width (794px @ 96dpi) regardless of the element's display size.
 */
export async function downloadPdfFromElement(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const html = wrapHtml(el.innerHTML);

  const headers = await getAuthHeaders();

  const resp = await fetch(PDF_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ html }),
  });

  if (!resp.ok) throw new Error(`PDF API ${resp.status}`);

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate PDF from a DOM element and return as base64 string.
 * Used for install plan PDF generation during offer submission.
 */
export async function generatePdfFromElement(el: HTMLElement): Promise<string> {
  const html = wrapHtml(el.innerHTML);
  const headers = await getAuthHeaders();

  const resp = await fetch(PDF_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ html }),
  });

  if (!resp.ok) throw new Error(`PDF API ${resp.status}`);

  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

/**
 * Download an offer PDF by offer_id via Chromium (Vercel /api/offer-pdf).
 */
export async function downloadOfferPdfById(
  offerId: string,
  filename: string,
): Promise<void> {
  const headers = await getAuthHeaders();

  const resp = await fetch(OFFER_PDF_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ offer_id: offerId }),
  });

  if (!resp.ok) throw new Error(`Offer PDF API ${resp.status}`);

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open an inventory label PDF in a new tab for printing.
 * Pass either pair_id (split set) or unit_id (single unit), or neither for all units assigned to the booking.
 */
export async function openInventoryLabelPdf(
  bookingId: string,
  options: { pair_id?: string; unit_id?: string } = {},
): Promise<void> {
  const headers = await getAuthHeaders();
  const resp = await fetch(INVENTORY_LABEL_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ booking_id: bookingId, ...options }),
  });
  if (!resp.ok) throw new Error(`Inventory label API ${resp.status}`);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Open a single combined label PDF for several bookings (batch print).
 * One PDF, 4 labels per page across all listed bookings.
 */
export async function openInventoryLabelsPdf(bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  const headers = await getAuthHeaders();
  const resp = await fetch(INVENTORY_LABEL_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ booking_ids: bookingIds }),
  });
  if (!resp.ok) throw new Error(`Inventory label API ${resp.status}`);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Download a contract PDF by contract_id via Chromium (Vercel /api/contract-pdf).
 */
export async function downloadContractPdfById(
  contractId: string,
  filename: string,
): Promise<void> {
  const headers = await getAuthHeaders();
  const resp = await fetch(CONTRACT_PDF_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ contract_id: contractId }),
  });
  if (!resp.ok) throw new Error(`Contract PDF API ${resp.status}`);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Preview a contract PDF from template + customer data (no storage).
 * Returns a blob URL for display in iframe or new tab.
 */
export async function previewContractPdf(
  template: object,
  customer: object,
  booking: object | null,
  signature: { name: string; data: string } | null,
): Promise<string> {
  const headers = await getAuthHeaders();
  const resp = await fetch(CONTRACT_PDF_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ preview: true, template, customer, booking, signature }),
  });
  if (!resp.ok) throw new Error(`Contract PDF preview ${resp.status}`);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}
