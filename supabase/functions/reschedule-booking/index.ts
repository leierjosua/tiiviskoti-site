import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/fetch-retry.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const log = createLogger("reschedule-booking");

/**
 * POST /functions/v1/reschedule-booking
 *
 * Reschedules a booking to a new date/time/installer.
 * Handles: DB update + calendar event update + email notifications.
 *
 * Input: {
 *   booking_id: string,
 *   booking_date: string,
 *   time_slot: string,
 *   employee_id: string,
 *   calendar_id?: string,
 *   notify_customer?: boolean  (default true)
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

    const { booking_id, booking_date, time_slot, employee_id, calendar_id, notify_customer, team } = await req.json();

    if (!booking_id || !booking_date || !time_slot || !employee_id) {
      return new Response(
        JSON.stringify({ error: "booking_id, booking_date, time_slot, employee_id required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Update booking
    const { error: updateErr } = await supabase
      .from("bookings")
      .update({
        booking_date,
        time_slot,
        employee_id,
        calendar_id: calendar_id || null,
      })
      .eq("id", booking_id);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Failed to update booking" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 1b. Update team if provided, otherwise sync primary in booking_employees
    if (team && Array.isArray(team) && team.length > 0) {
      // Delete existing booking_employees
      await supabase.from("booking_employees").delete().eq("booking_id", booking_id);
      // Insert new team
      const beRows = team.map((m: any, i: number) => ({
        booking_id,
        employee_id: m.employee_id,
        calendar_id: m.calendar_id || null,
        role: m.role || (i === 0 ? "primary" : "secondary"),
        commission_cents: m.commission_cents || 0,
        sort_order: i,
      }));
      await supabase.from("booking_employees").insert(beRows);
    } else {
      // Single employee: also update primary in booking_employees if it exists
      await supabase
        .from("booking_employees")
        .update({ employee_id, calendar_id: calendar_id || null })
        .eq("booking_id", booking_id)
        .eq("role", "primary");
    }

    // 2. Side effects
    const fnUrl = (name: string) => `${supabaseUrl}/functions/v1/${name}`;
    const fnHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    };
    const sideEffects: Promise<unknown>[] = [];

    // Update Google Calendar event
    sideEffects.push(
      fetchWithRetry(fnUrl("create-booking-calendar-event"), {
        method: "POST", headers: fnHeaders,
        body: JSON.stringify({ booking_id }),
      })
    );

    // Notify all team members (fetch from booking_employees)
    const { data: beMembers } = await supabase
      .from("booking_employees")
      .select("employee_id")
      .eq("booking_id", booking_id);
    const teamEmpIds = (beMembers || []).map((m: any) => m.employee_id);
    // Fallback to single employee_id if no booking_employees found
    const notifyEmpIds = teamEmpIds.length > 0 ? teamEmpIds : [employee_id];
    // Filter out employees who opted out of reschedule notifications
    let emailEmpIds: string[] = [];
    if (notifyEmpIds.length > 0) {
      const { data: prefs } = await supabase
        .from("employees")
        .select("id, notify_rescheduled")
        .in("id", notifyEmpIds);
      const optedIn = new Set((prefs || []).filter((e: any) => e.notify_rescheduled !== false).map((e: any) => e.id));
      emailEmpIds = notifyEmpIds.filter((id: string) => optedIn.has(id));
    }
    for (const empId of emailEmpIds) {
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

    // Optionally notify customer (default: true)
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

    return new Response(
      JSON.stringify({ success: true }),
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
