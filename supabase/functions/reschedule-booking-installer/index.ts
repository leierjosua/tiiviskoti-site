import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/fetch-retry.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const log = createLogger("reschedule-booking-installer");

/**
 * POST /functions/v1/reschedule-booking-installer
 *
 * Lets an installer move their OWN (primary) booking to a new date/time/calendar
 * within their own calendar. The booking's employee_id is NEVER changed here —
 * this is a self-service time move, not a reassignment.
 *
 * Authorization:
 *   - service_role / admin employee: allowed (employee_id still preserved)
 *   - installer: allowed only if employees.can_reschedule_own_bookings = true
 *     AND the caller is the booking's current primary (bookings.employee_id),
 *     AND the booking is not completed/cancelled. A provided calendar_id must
 *     belong to the caller.
 *
 * Input: {
 *   booking_id: string,
 *   booking_date: string,
 *   time_slot: string,
 *   calendar_id?: string,
 *   notify_customer?: boolean  (default true)
 * }
 */
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;

    const { booking_id, booking_date, time_slot, calendar_id, notify_customer } = await req.json();

    if (!booking_id || !booking_date || !time_slot) {
      return json({ error: "booking_id, booking_date, time_slot required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Load the booking we're moving (need current primary + status for authz).
    const { data: bookingRow } = await supabase
      .from("bookings")
      .select("employee_id, status")
      .eq("id", booking_id)
      .maybeSingle();
    if (!bookingRow) return json({ error: "Booking not found" }, 404);

    // ── Authorization ─────────────────────────────────────────────────────
    const isServiceRole = auth.user.id === "service_role";
    let actorEmpId: string | null = null;

    if (!isServiceRole) {
      const { data: callerEmp } = await supabase
        .from("employees")
        .select("id, roles, can_reschedule_own_bookings")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      const isAdmin = !!callerEmp && (callerEmp.roles || []).includes("admin");

      if (!isAdmin) {
        if (!callerEmp?.id) return json({ error: "Forbidden" }, 403);
        actorEmpId = callerEmp.id;

        if (callerEmp.can_reschedule_own_bookings !== true) {
          return json({ error: "Forbidden — rescheduling not allowed" }, 403);
        }
        if (bookingRow.employee_id !== callerEmp.id) {
          return json({ error: "Forbidden — not your booking" }, 403);
        }
        if (bookingRow.status === "completed" || bookingRow.status === "cancelled") {
          return json({ error: "Cannot reschedule a completed or cancelled booking" }, 400);
        }
        // A provided calendar must belong to the caller.
        if (calendar_id) {
          const { data: cal } = await supabase
            .from("installer_calendars")
            .select("id")
            .eq("id", calendar_id)
            .eq("employee_id", callerEmp.id)
            .maybeSingle();
          if (!cal) return json({ error: "Forbidden — calendar not yours" }, 403);
        }
      }
    }

    // ── Update (time/calendar only — employee_id is preserved) ─────────────
    const update: { booking_date: string; time_slot: string; calendar_id?: string } = {
      booking_date,
      time_slot,
    };
    if (calendar_id) update.calendar_id = calendar_id;

    const { error: updateErr } = await supabase
      .from("bookings")
      .update(update)
      .eq("id", booking_id);
    if (updateErr) {
      log.error("Booking update failed", { error: updateErr.message });
      return json({ error: "Failed to update booking" }, 500);
    }

    // Keep the primary booking_employees row's calendar in sync.
    if (calendar_id) {
      await supabase
        .from("booking_employees")
        .update({ calendar_id })
        .eq("booking_id", booking_id)
        .eq("role", "primary");
    }

    // ── Side effects ───────────────────────────────────────────────────────
    const fnUrl = (name: string) => `${supabaseUrl}/functions/v1/${name}`;
    const fnHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    };
    const sideEffects: Promise<unknown>[] = [];

    // Refresh the Google Calendar event.
    sideEffects.push(
      fetchWithRetry(fnUrl("create-booking-calendar-event"), {
        method: "POST", headers: fnHeaders,
        body: JSON.stringify({ booking_id }),
      })
    );

    // Notify other team members (not the actor) who opted into reschedule emails.
    const { data: beMembers } = await supabase
      .from("booking_employees")
      .select("employee_id")
      .eq("booking_id", booking_id);
    const teamEmpIds = (beMembers || []).map((m: { employee_id: string }) => m.employee_id);
    const notifyEmpIds = (teamEmpIds.length > 0 ? teamEmpIds : [bookingRow.employee_id])
      .filter((id: string | null): id is string => !!id && id !== actorEmpId);
    if (notifyEmpIds.length > 0) {
      const { data: prefs } = await supabase
        .from("employees")
        .select("id, notify_rescheduled")
        .in("id", notifyEmpIds);
      const optedIn = new Set(
        (prefs || []).filter((e: { notify_rescheduled: boolean | null }) => e.notify_rescheduled !== false)
          .map((e: { id: string }) => e.id)
      );
      for (const empId of notifyEmpIds.filter((id) => optedIn.has(id))) {
        sideEffects.push(
          supabase.from("email_outbox").insert({
            type: "booking",
            sender_email: "info@tiiviskoti.fi",
            payload: { booking_id, email_type: "installer_rescheduled", employee_id: empId },
            status: "pending",
            scheduled_at: new Date().toISOString(),
            reference_type: "booking",
            reference_id: booking_id,
          })
        );
      }
    }

    // Notify the customer (default: true).
    if (notify_customer !== false) {
      sideEffects.push(
        supabase.from("email_outbox").insert({
          type: "booking",
          sender_email: "info@tiiviskoti.fi",
          payload: { booking_id, email_type: "rescheduled" },
          status: "pending",
          scheduled_at: new Date().toISOString(),
          reference_type: "booking",
          reference_id: booking_id,
        })
      );
    }

    await Promise.allSettled(sideEffects);

    return json({ success: true });
  } catch (err) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return json({ error: "Internal server error" }, 500);
  }
});
