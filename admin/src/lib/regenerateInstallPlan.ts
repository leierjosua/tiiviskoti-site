import { supabase } from "@/lib/supabase";
import { generatePdfFromElement } from "@/lib/chromiumPdf";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface RegenerateOpts {
  opportunityId: string;
  /** Optional — when the plan is created before any offer exists, leave null */
  offerId?: string | null;
  customerName: string;
  filename?: string;
  /** Existing installation_plan_pdf row to replace; if absent a new row is inserted */
  existingFile?: { id: string; path: string } | null;
  /** DOM element id whose innerHTML is sent to Chromium for rendering */
  previewElementId: string;
}

/**
 * Generate a fresh install plan PDF from the given DOM preview element,
 * upload to storage, and either replace the existing installation_plan_pdf
 * file row or insert a new one.
 */
export async function regenerateInstallPlanPdf({
  opportunityId,
  offerId,
  customerName,
  filename,
  existingFile,
  previewElementId,
}: RegenerateOpts): Promise<void> {
  const el = document.getElementById(previewElementId);
  if (!el) throw new Error(`Preview element #${previewElementId} not found`);

  const base64 = await generatePdfFromElement(el);
  const newPath = `${opportunityId}/${crypto.randomUUID()}_asennussuunnitelma.pdf`;

  const { error: upErr } = await supabase.storage
    .from("sales-opportunity-files")
    .upload(newPath, base64ToBytes(base64), { contentType: "application/pdf" });
  if (upErr) throw new Error(`PDF-tallennus epäonnistui: ${upErr.message}`);

  const fname = filename || `Asennussuunnitelma - ${customerName || "asiakas"}.pdf`;

  if (existingFile) {
    const { error: updErr } = await supabase
      .from("sales_opportunity_files")
      .update({ path: newPath, filename: fname })
      .eq("id", existingFile.id);
    if (updErr) throw new Error(`Tiedostorivin päivitys epäonnistui: ${updErr.message}`);
    await supabase.storage.from("sales-opportunity-files").remove([existingFile.path]);
  } else {
    const { error: insErr } = await supabase.from("sales_opportunity_files").insert({
      opportunity_id: opportunityId,
      offer_id: offerId ?? null,
      filename: fname,
      bucket: "sales-opportunity-files",
      path: newPath,
      file_type: "installation_plan_pdf",
    });
    if (insErr) throw new Error(`Tiedostorivin lisäys epäonnistui: ${insErr.message}`);
  }
}
