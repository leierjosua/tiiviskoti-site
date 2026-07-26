import type { SupabaseClient } from "@supabase/supabase-js";
import { formatEmailHtml } from "./email-styles";

/**
 * After offer acceptance, queue order emails to brand suppliers.
 *
 * For each product line item in the offer, resolves the brand via the products
 * table, groups items by brand, and queues one email per brand to the
 * configured recipient in brand_order_rules.
 */
export async function queueBrandOrderEmails(
  supabase: SupabaseClient,
  offerId: string,
  customerSelections?: { selectedGroup: string | null; selectedUpsellIds: string[] },
): Promise<void> {
  // 1. Fetch offer with customer info + salesperson
  const { data: offer, error: offerErr } = await supabase
    .from("sales_offers")
    .select("id, customer_name, customer_address, customer_postcode, customer_city, created_by_salesperson_id, sales_offer_line_items(*)")
    .eq("id", offerId)
    .single();

  if (offerErr || !offer) return;

  // 2. Fetch salesperson info for sender email & signature
  let senderEmail = "info@lasikiilto.fi";
  let senderName = "Lasikiilto";
  let signatureHtml = "";

  if (offer.created_by_salesperson_id) {
    const { data: seller } = await supabase
      .from("employees")
      .select("id, email, first_name, last_name")
      .eq("id", offer.created_by_salesperson_id)
      .single();

    if (seller?.email) {
      senderEmail = seller.email;
      senderName = [seller.first_name, seller.last_name].filter(Boolean).join(" ") || "Lasikiilto";

      // Fetch seller's email signature
      const { data: sig } = await supabase
        .from("sales_email_signatures")
        .select("signature_html")
        .eq("employee_id", seller.id)
        .maybeSingle();

      if (sig?.signature_html) {
        signatureHtml = sig.signature_html;
      }
    }
  }

  // 3. If no customerSelections passed, try to read from token
  let selections = customerSelections;
  if (!selections) {
    const { data: tokenRow } = await supabase
      .from("sales_offer_tokens")
      .select("customer_selections")
      .eq("offer_id", offerId)
      .not("consumed_at", "is", null)
      .order("consumed_at", { ascending: false })
      .limit(1)
      .single();

    if (tokenRow?.customer_selections) {
      selections = tokenRow.customer_selections as typeof customerSelections;
    }
  }

  // 4. Filter line items based on customer selections (same logic as accept-offer)
  type LineItem = {
    id: string;
    line_type: string;
    item_id: string | null;
    name: string;
    quantity: number;
    option_group: string | null;
    is_upsell: boolean;
  };

  let items = (offer.sales_offer_line_items || []) as LineItem[];

  if (selections) {
    items = items.filter((li) => {
      if (li.option_group) return li.option_group === selections!.selectedGroup;
      if (li.is_upsell) return selections!.selectedUpsellIds.includes(li.id);
      return true;
    });
  } else {
    items = items.filter((li) => !li.is_upsell);
  }

  // 5. Keep only product line items with item_id
  const productItems = items.filter(
    (li) => li.line_type === "product" && li.item_id,
  );
  if (productItems.length === 0) return;

  // 6. Fetch brands for all product item_ids
  const itemIds = productItems.map((li) => li.item_id!);
  const { data: products } = await supabase
    .from("products")
    .select("id, brand")
    .in("id", itemIds);

  if (!products || products.length === 0) return;

  const brandByProductId = new Map<string, string>();
  for (const p of products) {
    if (p.brand) brandByProductId.set(p.id, p.brand);
  }

  // 7. Group line items by brand
  const itemsByBrand = new Map<string, LineItem[]>();
  for (const li of productItems) {
    const brand = brandByProductId.get(li.item_id!);
    if (!brand) continue;
    const arr = itemsByBrand.get(brand) || [];
    arr.push(li);
    itemsByBrand.set(brand, arr);
  }

  if (itemsByBrand.size === 0) return;

  // 8. Fetch active brand_order_rules for the brands we found
  const brands = [...itemsByBrand.keys()];
  const { data: rules } = await supabase
    .from("brand_order_rules")
    .select("*")
    .in("brand", brands)
    .eq("is_active", true);

  if (!rules || rules.length === 0) return;

  // 9. For each rule, render template and queue email
  const now = new Date().toISOString();
  for (const rule of rules) {
    const brandItems = itemsByBrand.get(rule.brand);
    if (!brandItems || brandItems.length === 0) continue;

    // Build product_lines HTML table (for email body)
    const productRows = brandItems
      .map((li) => `<tr><td style="padding:4px 12px 4px 0;">${li.name}</td><td style="padding:4px 0;">${li.quantity} kpl</td></tr>`)
      .join("");
    const productLines = `<table style="border-collapse:collapse;margin:8px 0 16px;"><tr style="border-bottom:1px solid #e5e7eb;"><th style="text-align:left;padding:4px 12px 4px 0;font-weight:600;">Tuote</th><th style="text-align:left;padding:4px 0;font-weight:600;">Määrä</th></tr>${productRows}</table>`;

    // Plain-text product summary for subject line: "Toshiba Seiya 13+ 1kpl, Product B 2kpl"
    const productSummary = brandItems
      .map((li) => `${li.name} ${li.quantity}kpl`)
      .join(", ");

    // Template variables
    const vars: Record<string, string> = {
      brand: rule.brand,
      recipient_name: rule.recipient_name || "",
      customer_name: offer.customer_name || "",
      customer_address: offer.customer_address || "",
      customer_city: [offer.customer_postcode, offer.customer_city].filter(Boolean).join(" "),
      offer_number: offer.id,
      product_lines: productLines,
      product_summary: productSummary,
    };

    // Render templates from the rule
    const substitute = (text: string) =>
      text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");

    const subject = substitute(rule.subject_template);
    const bodyHtml = formatEmailHtml(substitute(rule.body_template) + (signatureHtml ? `<br/>${signatureHtml}` : ""));

    // Insert into email_outbox
    const { data: outboxRow } = await supabase
      .from("email_outbox")
      .insert({
        type: "order",
        sender_email: senderEmail,
        payload: {
          to: [rule.recipient_email],
          subject,
          body_html: bodyHtml,
          sender_name: senderName,
          sender_email: senderEmail,
        },
        status: "pending",
        scheduled_at: now,
        reference_type: "offer",
        reference_id: offer.id,
      })
      .select("id")
      .single();

    // Track in offer_order_emails (legacy)
    await supabase.from("offer_order_emails").insert({
      offer_id: offer.id,
      brand: rule.brand,
      outbox_id: outboxRow?.id || null,
      status: "pending",
    });

    // Create manufacturer_orders record for logistics tracking
    const { data: moRow } = await supabase
      .from("manufacturer_orders")
      .insert({
        brand: rule.brand,
        order_type: "single",
        status: "placed",
        offer_id: offer.id,
        outbox_id: outboxRow?.id || null,
        placed_at: now,
      })
      .select("id")
      .single();

    if (moRow) {
      // Create manufacturer_order_lines for each product in this brand group
      const orderLines = brandItems
        .filter((li) => li.item_id)
        .map((li) => ({
          manufacturer_order_id: moRow.id,
          product_id: li.item_id!,
          quantity_ordered: li.quantity,
          cost_cents: null,
        }));
      if (orderLines.length > 0) {
        await supabase.from("manufacturer_order_lines").insert(orderLines);
      }
    }
  }
}
