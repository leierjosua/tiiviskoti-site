import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";

// Columns a scanned code may match, in priority order: a learned box barcode
// (EAN/GTIN), our internal SKU, then the manufacturer model identifier — Toshiba
// box labels carry a Code39 of the model (e.g. RAS-B13S4KVG-E), not the EAN.
const MATCH_COLUMNS = ["barcode", "sku", "model"] as const;

/**
 * Look up a product by a scanned code. Matching is case-insensitive (Code39 is
 * uppercase-only, DB values may be mixed case). Separate queries per column so a
 * code containing reserved characters can't break a combined filter.
 */
export async function lookupProductByCode(code: string): Promise<Product | null> {
  const c = code.trim();
  if (!c) return null;
  // Escape LIKE wildcards so a stray % / _ in a code can't match loosely.
  const escaped = c.replace(/([%_\\])/g, "\\$1");

  for (const col of MATCH_COLUMNS) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .ilike(col, escaped)
      .limit(1);
    if (error) throw error;
    if (data?.length) return data[0] as Product;
  }
  return null;
}
