import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const log = createLogger("finalize-booking");

interface LineItem {
  name: string;
  price_cents: number;
  quantity?: number;
  duration_minutes?: number;
  material_cost_cents?: number;
  line_type?: string;
  addon_service_id?: string;
  product_id?: string;
  service_id?: string;
  variant_id?: string;
}

interface ContractInput {
  template_id: string;
  service_id: string;
  frequency: string;
  visit_months: number[];
  visit_interval_months?: number;
  billing_interval_months?: number;
  contract_price_cents: number;
  duration_months: number;
  device_count?: number;
  auto_renew: boolean;
  cancellation_notice_days: number;
  signature_data: string;
  signed_by_name: string;
  signature_method: string;
}

/**
 * POST /functions/v1/finalize-booking
 *
 * Centralized booking finalization. Handles:
 *   1. Update booking: status → completed, payment, satisfaction, finalized_at
 *   2. Insert new line items
 *   3. Send receipt email (if paid + opted in)
 *   4. Create contract + visits (if template selected + signed)
 *   5. Send contract email
 *   6. Create feedback request token
 *   7. Review SMS (if happy + enabled)
 *
 * Input: {
 *   booking_id: string,
 *   payment_status: "paid" | "unpaid",
 *   price_cents: number,
 *   customer_satisfaction?: "happy" | "neutral" | "unhappy",
 *   send_receipt?: boolean,
 *   new_line_items?: LineItem[],
 *   contract?: ContractInput
 * }
 */
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Verify caller is authenticated
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json();
    const {
      booking_id,
      payment_status,
      price_cents,
      customer_satisfaction,
      send_receipt,
      send_protocol,
      new_line_items,
      replace_line_items,
      contract,
      manual_discount_cents,
      manual_discount_reason,
    } = body;

    if (!booking_id || !payment_status) {
      return new Response(
        JSON.stringify({ error: "booking_id and payment_status required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch booking
    const { data: booking, error: fetchErr } = await supabase
      .from("bookings")
      .select("*, customers(*), employees!bookings_employee_id_fkey(*)")
      .eq("id", booking_id)
      .single();

    if (fetchErr || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    log.info("Finalizing booking", { booking_id, payment_status, has_contract: !!contract });

    // 2. Update booking
    const { error: updateErr } = await supabase
      .from("bookings")
      .update({
        status: "completed",
        payment_status,
        installer_satisfaction: customer_satisfaction || null,
        customer_satisfaction: customer_satisfaction || null,
        send_receipt: payment_status === "paid" ? (send_receipt ?? false) : false,
        finalized_at: new Date().toISOString(),
        manual_discount_cents: manual_discount_cents || 0,
        manual_discount_reason: manual_discount_reason || null,
        ...(price_cents != null ? { price_cents } : {}),
      })
      .eq("id", booking_id);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Failed to update booking" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 3. Handle line items — delete all + insert new with proper error handling
    const incomingItems = replace_line_items?.length > 0
      ? replace_line_items
      : new_line_items?.length > 0
        ? new_line_items
        : null;

    if (incomingItems) {
      const isFullReplace = replace_line_items?.length > 0;
      log.info("Replacing line items", {
        booking_id,
        source: isFullReplace ? "replace_line_items" : "new_line_items",
        count: incomingItems.length,
      });

      // Snapshot original line items and price for revert
      const { data: origItems } = await supabase
        .from("booking_line_items")
        .select("line_type, addon_service_id, product_id, service_id, variant_id, name, price_cents, quantity, duration_minutes, material_cost_cents, sort_order")
        .eq("booking_id", booking_id)
        .order("sort_order");

      await supabase.from("bookings").update({
        pre_finalize_line_items: origItems || [],
        pre_finalize_price_cents: booking.price_cents,
      }).eq("id", booking_id);

      // Clear discount BEFORE deleting line items to prevent CHECK constraint violation.
      // The recalculate trigger sets price_cents = SUM(items) - discount.
      // If all items are deleted and discount > 0, price goes negative → violates CHECK (price_cents >= 0).
      if (isFullReplace && booking.discount_amount_cents > 0) {
        await supabase.from("bookings").update({
          discount_amount_cents: 0,
          discount_code_id: null,
        }).eq("id", booking_id);
      }

      // Delete all existing line items
      const { error: delErr } = await supabase
        .from("booking_line_items")
        .delete()
        .eq("booking_id", booking_id);

      if (delErr) {
        log.error("Failed to delete line items", { booking_id, error: delErr.message });
      }

      // Insert new set
      const rows = incomingItems.map((item: LineItem, i: number) => ({
        booking_id,
        line_type: item.line_type || "custom",
        addon_service_id: item.addon_service_id || null,
        product_id: item.product_id || null,
        service_id: item.line_type === "service" ? (item.service_id || null) : null,
        variant_id: item.line_type === "service" ? (item.variant_id || null) : null,
        name: item.name,
        price_cents: item.price_cents,
        quantity: item.quantity ?? 1,
        duration_minutes: item.duration_minutes ?? 0,
        material_cost_cents: item.material_cost_cents ?? 0,
        sort_order: i,
      }));

      const { error: insErr } = await supabase.from("booking_line_items").insert(rows);
      if (insErr) {
        log.error("Failed to insert line items", { booking_id, error: insErr.message });
      }

      // Update booking price to match
      if (price_cents != null) {
        await supabase.from("bookings").update({ price_cents }).eq("id", booking_id);
      }
    }

    // Side effects (fire-and-forget)
    const sideEffects: Promise<unknown>[] = [];

    // 4. Receipt email (skip only if one is currently pending/processing)
    if (payment_status === "paid" && send_receipt) {
      const { data: pendingReceipt } = await supabase
        .from("email_outbox")
        .select("id")
        .eq("reference_type", "booking")
        .eq("reference_id", booking_id)
        .contains("payload", { email_type: "receipt" })
        .in("status", ["pending", "processing"])
        .limit(1)
        .maybeSingle();

      if (!pendingReceipt) {
        sideEffects.push(
          supabase.from("email_outbox").insert({
            type: "booking",
            sender_email: "info@tiiviskoti.fi",
            payload: { booking_id, email_type: "receipt" },
            status: "pending",
            scheduled_at: new Date().toISOString(),
            reference_type: "booking",
            reference_id: booking_id,
          })
        );
      } else {
        log.info("Receipt email skipped — already queued", { booking_id });
      }
    }

    // 4b. Protocol emails (send regardless of payment status)
    if (send_protocol) {
      const { data: completedProtocols } = await supabase
        .from("work_protocols")
        .select("id, status, pdf_storage_path")
        .eq("booking_id", booking_id)
        .is("deleted_at", null)
        .eq("status", "completed");

      for (const protocol of completedProtocols || []) {
        const { data: pendingProtocolEmail } = await supabase
          .from("email_outbox")
          .select("id")
          .eq("reference_type", "booking")
          .eq("reference_id", booking_id)
          .contains("payload", { email_type: "protocol", protocol_id: protocol.id })
          .in("status", ["pending", "processing"])
          .limit(1)
          .maybeSingle();

        if (!pendingProtocolEmail) {
          sideEffects.push(
            supabase.from("email_outbox").insert({
              type: "booking",
              sender_email: "info@tiiviskoti.fi",
              payload: { booking_id, protocol_id: protocol.id, email_type: "protocol" },
              status: "pending",
              scheduled_at: new Date().toISOString(),
              reference_type: "booking",
              reference_id: booking_id,
            })
          );
        } else {
          log.info("Protocol email skipped — already queued", { booking_id, protocol_id: protocol.id });
        }
      }
    }

    // 5. Contract creation
    let contractId: string | null = null;
    if (contract) {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + contract.duration_months);

      const { data: newContract, error: contractErr } = await supabase
        .from("contracts")
        .insert({
          template_id: contract.template_id,
          customer_id: booking.customer_id,
          service_id: contract.service_id,
          frequency: contract.frequency,
          visit_months: contract.visit_months,
          visit_interval_months: contract.visit_interval_months || 12,
          billing_interval_months: contract.billing_interval_months || 12,
          duration_months: contract.duration_months,
          device_count: contract.device_count || 1,
          contract_price_cents: contract.contract_price_cents,
          service_address: booking.address || "",
          service_postal_code: booking.postal_code || "",
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
          auto_renew: contract.auto_renew,
          cancellation_notice_days: contract.cancellation_notice_days,
          status: "active",
          signature_data: contract.signature_data,
          signed_by_name: contract.signed_by_name,
          signature_method: contract.signature_method,
          created_by_employee_id: booking.employee_id || null,
          sold_by_employee_id: booking.employee_id || null,
        })
        .select("id")
        .single();

      if (contractErr) {
        console.error("Contract creation failed:", contractErr);
      } else if (newContract) {
        contractId = newContract.id;

        // Generate visits based on frequency
        const sy = startDate.getFullYear();
        const sm = startDate.getMonth() + 1;
        const ey = endDate.getFullYear();
        const em = endDate.getMonth() + 1;
        const visits: { contract_id: string; scheduled_month: number; scheduled_year: number }[] = [];

        if (contract.frequency === "custom") {
          // Custom: visits distributed once across the full contract period
          const midTime = startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2;
          const midYear = new Date(midTime).getFullYear();
          for (const month of contract.visit_months) {
            let bestYear = midYear;
            if (bestYear === sy && month < sm) bestYear++;
            if (bestYear === ey && month > em) bestYear--;
            if (bestYear >= sy && bestYear <= ey) {
              visits.push({ contract_id: newContract.id, scheduled_month: month, scheduled_year: bestYear });
            }
          }
        } else {
          for (let year = sy; year <= ey; year++) {
            for (const month of contract.visit_months) {
              if (year === sy && month < sm) continue;
              if (year === ey && month > em) continue;
              visits.push({ contract_id: newContract.id, scheduled_month: month, scheduled_year: year });
            }
          }
        }
        if (visits.length > 0) {
          await supabase.from("contract_visits").insert(visits);
        }

        // Record sales commission for installer who sold the contract
        if (booking.employee_id) {
          const { data: tplData } = await supabase
            .from("contract_templates")
            .select("sales_commission_cents")
            .eq("id", contract.template_id)
            .single();
          if (tplData?.sales_commission_cents > 0) {
            sideEffects.push(
              supabase.from("contract_sales_commissions").insert({
                contract_id: newContract.id,
                employee_id: booking.employee_id,
                commission_cents: tplData.sales_commission_cents,
              })
            );
          }
        }

        // Send contract email
        sideEffects.push(
          supabase.from("email_outbox").insert({
            type: "contract",
            sender_email: "info@tiiviskoti.fi",
            payload: { contract_id: newContract.id, email_type: "contract_signed" },
            status: "pending",
            scheduled_at: new Date().toISOString(),
            reference_type: "contract",
            reference_id: newContract.id,
          })
        );
      }
    }

    const sideResults = await Promise.allSettled(sideEffects);
    const failedEffects = sideResults
      .map((r, i) => r.status === "rejected" ? `Effect ${i}: ${r.reason}` : null)
      .filter(Boolean);
    if (failedEffects.length > 0) {
      console.error("Side effects partially failed for booking", booking_id, failedEffects);
    }

    // 6. Create feedback request token (only when customer was happy — token is used for review SMS)
    if (customer_satisfaction === "happy") {
      try {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let attempt = 0; attempt < 5; attempt++) {
          const token = chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
          const { error: fbErr } = await supabase.from("booking_feedback").insert({
            booking_id,
            token,
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          });
          if (!fbErr) break;
          if (attempt === 4) console.error("Failed to generate unique feedback token after 5 attempts");
        }
      } catch (e) {
        console.error("Failed to create feedback request:", e);
      }
    }

    // 7. Review SMS — send if happy + enabled + service matches + customer not already contacted + not do_not_contact
    // Must run after feedback token creation (step 6) so we can use the token URL.
    // Gating uses booking_effective_service_id() — the DELIVERED primary service
    // (from line items), not bookings.service_id (the originally booked service),
    // so installer swaps at finalize are honoured by the whitelist.
    const customerDoNotContact = booking.customers?.do_not_contact ?? false;
    if (customer_satisfaction === "happy" && booking.customers?.phone && booking.customer_id && !customerDoNotContact) {
      try {
        const { data: smsSettings } = await supabase
          .from("company_settings")
          .select("review_sms_enabled, review_sms_template, review_sms_delay_minutes, review_sms_service_ids")
          .limit(1)
          .single();

        if (smsSettings?.review_sms_enabled) {
          const { data: effectiveServiceId } = await supabase
            .rpc("booking_effective_service_id", { p_booking_id: booking_id });
          const effectiveSvcId = (effectiveServiceId as string | null) ?? null;

          // Check if service is in the allowed list (empty array = all services)
          const serviceIds: string[] = smsSettings.review_sms_service_ids || [];
          const serviceMatch = serviceIds.length === 0
            || (effectiveSvcId !== null && serviceIds.includes(effectiveSvcId));

          if (serviceMatch) {
            // Check dedup — max 1 review SMS per customer, ever.
            const { data: existing } = await supabase
              .from("review_sms_log")
              .select("id")
              .eq("customer_id", booking.customer_id)
              .limit(1)
              .maybeSingle();

            if (!existing) {
              // Build SMS body from template
              const phoneE164 = booking.customers.phone.startsWith("+")
                ? booking.customers.phone
                : booking.customers.phone.startsWith("0")
                  ? "+358" + booking.customers.phone.slice(1)
                  : "+358" + booking.customers.phone;

              // Get feedback token for review URL
              const { data: feedbackRow } = await supabase
                .from("booking_feedback")
                .select("token")
                .eq("booking_id", booking_id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              const reviewUrl = feedbackRow?.token
                ? `https://TiivisKoti.fi/palaute/${feedbackRow.token}`
                : "https://TiivisKoti.fi/arvostelu";

              // Use service-specific template if available, otherwise company default
              let template = smsSettings.review_sms_template || "";
              if (effectiveSvcId) {
                const { data: svc } = await supabase
                  .from("services")
                  .select("review_sms_template")
                  .eq("id", effectiveSvcId)
                  .single();
                if (svc?.review_sms_template) {
                  template = svc.review_sms_template;
                }
              }

              const smsBody = template
                .replace(/\{\{first_name\}\}/g, booking.customers.first_name || "")
                .replace(/\{\{last_name\}\}/g, booking.customers.last_name || "")
                .replace(/\{\{review_url\}\}/g, reviewUrl)
                .replace(/\{\{installer_name\}\}/g, booking.employees?.first_name || "");

              // Send SMS via the send-sms function
              const fnUrl = `${supabaseUrl}/functions/v1/send-sms`;
              const smsPayload = {
                to: phoneE164,
                body: smsBody,
                reference_type: "review_request",
                reference_id: booking_id,
                customer_id: booking.customer_id,
                employee_id: booking.employee_id,
                booking_id,
              };

              const delayMinutes = smsSettings.review_sms_delay_minutes || 30;
              const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

              // Queue for delayed sending — processed by cron
              await supabase.from("review_sms_log").insert({
                customer_id: booking.customer_id,
                booking_id,
                phone_e164: phoneE164,
                sms_body: smsBody,
                status: "pending",
                scheduled_at: scheduledAt,
                reference_payload: smsPayload,
              });

              log.info("Review SMS queued", { booking_id, phone: phoneE164, scheduled_at: scheduledAt, delay_minutes: delayMinutes });
            } else {
              log.info("Review SMS skipped — unanswered SMS already exists", { customer_id: booking.customer_id });
            }
          }
        }
      } catch (e) {
        log.error("Review SMS error", { error: String(e) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, contractId }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
