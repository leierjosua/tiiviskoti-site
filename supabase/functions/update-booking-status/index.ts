import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/fetch-retry.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const log = createLogger("update-booking-status");

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

/**
 * POST /functions/v1/update-booking-status
 *
 * Centralized booking status transition handler.
 * Updates the status and triggers all side effects:
 *   - Email notifications (customer + installer)
 *   - Google Calendar event creation/deletion
 *
 * Input: { booking_id: string, status: BookingStatus }
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

    const { booking_id, status, notify_customer = true } = await req.json();

    if (!booking_id || !status) {
      return new Response(
        JSON.stringify({ error: "booking_id and status required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const validStatuses: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({ error: `Invalid status: ${status}` }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch current booking to validate transition
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, status, employee_id, service_id, opportunity_id")
      .eq("id", booking_id)
      .single();

    if (fetchError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (booking.status === status) {
      return new Response(
        JSON.stringify({ success: true, message: "Status already set" }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    log.info("Status transition", { booking_id, from: booking.status, to: status });

    // 2. Update status (trigger logs it automatically)
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", booking_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update status" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 3. Side effects (fire-and-forget, don't block response)
    const sideEffects: Promise<unknown>[] = [];
    const fnUrl = (name: string) => `${supabaseUrl}/functions/v1/${name}`;
    const fnHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    };

    // Look up assigned employee's notification preferences (used for installer emails below)
    let empPrefs: { notify_new_job?: boolean; notify_cancelled?: boolean } | null = null;
    if (booking.employee_id) {
      const { data } = await supabase
        .from("employees")
        .select("notify_new_job, notify_cancelled")
        .eq("id", booking.employee_id)
        .maybeSingle();
      empPrefs = data;
    }

    if (status === "confirmed") {
      // Email: customer confirmation (only if notify_customer is true)
      if (notify_customer) {
        sideEffects.push(
          supabase.from("email_outbox").insert({
            type: "booking",
            sender_email: "info@tiiviskoti.fi",
            payload: { booking_id, email_type: "confirmation" },
            status: "pending",
            scheduled_at: new Date().toISOString(),
            reference_type: "booking",
            reference_id: booking_id,
          })
        );
      }
      // Email: installer new job (skip if employee opted out)
      if (booking.employee_id && empPrefs?.notify_new_job !== false) {
        sideEffects.push(
          supabase.from("email_outbox").insert({
            type: "booking",
            sender_email: "info@tiiviskoti.fi",
            payload: { booking_id, email_type: "installer_new_job" },
            status: "pending",
            scheduled_at: new Date().toISOString(),
            reference_type: "booking",
            reference_id: booking_id,
          })
        );
      }
      // Google Calendar: create event
      sideEffects.push(
        fetchWithRetry(fnUrl("create-booking-calendar-event"), {
          method: "POST", headers: fnHeaders,
          body: JSON.stringify({ booking_id, send_notifications: notify_customer }),
        })
      );
    }

    if (status === "cancelled") {
      // Email: customer cancellation (only if notify_customer is true)
      if (notify_customer) {
        sideEffects.push(
          supabase.from("email_outbox").insert({
            type: "booking",
            sender_email: "info@tiiviskoti.fi",
            payload: { booking_id, email_type: "cancellation" },
            status: "pending",
            scheduled_at: new Date().toISOString(),
            reference_type: "booking",
            reference_id: booking_id,
          })
        );
      }
      // Email: installer cancelled (skip if employee opted out)
      if (booking.employee_id && empPrefs?.notify_cancelled !== false) {
        sideEffects.push(
          supabase.from("email_outbox").insert({
            type: "booking",
            sender_email: "info@tiiviskoti.fi",
            payload: { booking_id, email_type: "installer_cancelled" },
            status: "pending",
            scheduled_at: new Date().toISOString(),
            reference_type: "booking",
            reference_id: booking_id,
          })
        );
      }
      // Google Calendar: delete event (silent = remove customer from attendees first if no notification)
      sideEffects.push(
        fetchWithRetry(fnUrl("delete-booking-calendar-event"), {
          method: "POST", headers: fnHeaders,
          body: JSON.stringify({ booking_id, silent: !notify_customer }),
        })
      );
    }

    // Wait for side effects but don't fail the request if they fail
    const results = await Promise.allSettled(sideEffects);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      log.warn("Side effects partially failed", {
        booking_id, status,
        total: results.length,
        failed: failed.length,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        previousStatus: booking.status,
        newStatus: status,
        sideEffects: results.length,
        sideEffectsFailed: failed.length,
      }),
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
