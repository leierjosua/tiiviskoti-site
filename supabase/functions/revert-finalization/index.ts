import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { requireAuth } from "../_shared/auth.ts";

const log = createLogger("revert-finalization");

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Verify caller is authenticated
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;

    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: "booking_id required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch booking to check for pre-finalize snapshot
    const { data: bookingData } = await supabase
      .from("bookings")
      .select("pre_finalize_line_items, pre_finalize_price_cents")
      .eq("id", booking_id)
      .single();

    const updates: Record<string, unknown> = {
      status: "confirmed",
      payment_status: "unpaid",
      customer_satisfaction: null,
      installer_satisfaction: null,
      finalized_at: null,
      pre_finalize_line_items: null,
      pre_finalize_price_cents: null,
    };

    // Restore original price if snapshot exists
    if (bookingData?.pre_finalize_price_cents != null) {
      updates.price_cents = bookingData.pre_finalize_price_cents;
    }

    const { error } = await supabase
      .from("bookings")
      .update(updates)
      .eq("id", booking_id);

    if (error) throw error;

    // Restore original line items if snapshot exists
    if (bookingData?.pre_finalize_line_items?.length > 0) {
      await supabase.from("booking_line_items").delete().eq("booking_id", booking_id);

      const rows = bookingData.pre_finalize_line_items.map((item: any) => ({
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
        sort_order: item.sort_order ?? 0,
      }));

      await supabase.from("booking_line_items").insert(rows);
    }

    // Remove receipt emails from outbox so a new finalization can send a fresh one
    await supabase
      .from("email_outbox")
      .delete()
      .eq("reference_type", "booking")
      .eq("reference_id", booking_id)
      .contains("payload", { email_type: "receipt" });

    // Remove review SMS log so customer can get a new review request
    const { data: booking } = await supabase
      .from("bookings")
      .select("customer_id")
      .eq("id", booking_id)
      .single();

    if (booking?.customer_id) {
      await supabase
        .from("review_sms_log")
        .delete()
        .eq("customer_id", booking.customer_id)
        .eq("booking_id", booking_id);
    }

    log.info("Finalization reverted", { booking_id });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    log.error("revert-finalization failed", { error: String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
