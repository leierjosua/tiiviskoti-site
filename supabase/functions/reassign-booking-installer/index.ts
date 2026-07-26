import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/fetch-retry.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const log = createLogger("reassign-booking-installer");

/**
 * POST /functions/v1/reassign-booking-installer
 *
 * Reassigns a booking to a different installer, or lets an installer self-join /
 * self-leave a teammate's booking as a secondary.
 *
 * Handles: DB update + calendar event update + new installer notification.
 * Customer is NOT notified — internal reassignment is silent customer-side.
 *
 * Authorization:
 *   - service_role: full access
 *   - admin employee: full access
 *   - non-admin employee (mode='self_join'): allowed if the booking's current
 *     primary is in the caller's team and the caller is not already on it
 *   - non-admin employee (mode='self_leave'): allowed if caller is on the booking
 *     as a 'secondary' (primary cannot self-leave — must be transferred first)
 *   - non-admin employee (no mode): only if the caller is currently on the
 *     booking AND all target employee_ids are in the caller's team
 *
 * Input: {
 *   booking_id: string,
 *   employee_id?: string,
 *   team?: BookingEmployee[],
 *   mode?: 'self_join' | 'self_leave'
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

    const { booking_id, employee_id, team, mode } = await req.json();

    const isSelfMode = mode === "self_join" || mode === "self_leave";

    if (!booking_id || (!isSelfMode && !employee_id && !team)) {
      return new Response(
        JSON.stringify({ error: "booking_id and employee_id required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Self-join / self-leave branch ────────────────────────────────────────
    // Handled before the generic non-admin authz check (which would 403 a caller
    // who isn't on the booking yet — exactly the case for self_join).
    if (isSelfMode) {
      const isServiceRoleSelf = auth.user.id === "service_role";
      const { data: callerEmp } = await supabase
        .from("employees")
        .select("id, roles")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      // Admins / pure admin users could just use the normal team branch; for
      // self-mode we always need an employee row.
      if (!isServiceRoleSelf && !callerEmp?.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const callerEmpId = callerEmp!.id;

      const { data: bookingRow } = await supabase
        .from("bookings")
        .select("employee_id, service_id, postal_code")
        .eq("id", booking_id)
        .maybeSingle();
      if (!bookingRow) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      if (mode === "self_join") {
        // Already on booking?
        const { data: already } = await supabase
          .from("booking_employees")
          .select("id")
          .eq("booking_id", booking_id)
          .eq("employee_id", callerEmpId)
          .maybeSingle();
        if (already) {
          return new Response(JSON.stringify({ success: true, already: true }), {
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        // Caller and primary must share a team (admins skip).
        const isAdmin = (callerEmp!.roles || []).includes("admin");
        if (!isAdmin) {
          if (!bookingRow.employee_id) {
            return new Response(JSON.stringify({ error: "Booking has no primary" }), {
              status: 400, headers: { ...cors, "Content-Type": "application/json" },
            });
          }
          const [{ data: callerTeam }, { data: primaryTeam }] = await Promise.all([
            supabase.from("employee_team_members").select("team_id").eq("employee_id", callerEmpId).maybeSingle(),
            supabase.from("employee_team_members").select("team_id").eq("employee_id", bookingRow.employee_id).maybeSingle(),
          ]);
          if (!callerTeam?.team_id || callerTeam.team_id !== primaryTeam?.team_id) {
            return new Response(JSON.stringify({ error: "Primary not in your team" }), {
              status: 403, headers: { ...cors, "Content-Type": "application/json" },
            });
          }
        }

        // Pick caller's best calendar (service + postal match), fallback oldest.
        let newCalendarId: string | null = null;
        if (bookingRow.service_id && bookingRow.postal_code) {
          const { data: candidateCals } = await supabase
            .from("installer_calendars")
            .select("id, created_at, calendar_services!inner(service_id), calendar_service_areas(service_areas(postal_codes))")
            .eq("employee_id", callerEmpId)
            .eq("active", true)
            .eq("calendar_services.service_id", bookingRow.service_id)
            .order("created_at", { ascending: true });
          for (const cal of candidateCals || []) {
            const areas = (cal as { calendar_service_areas?: { service_areas?: { postal_codes?: string[] } | null }[] }).calendar_service_areas || [];
            const covers = areas.some((csa) =>
              (csa.service_areas?.postal_codes || []).includes(bookingRow.postal_code!)
            );
            if (covers) {
              newCalendarId = (cal as { id: string }).id;
              break;
            }
          }
        }
        if (!newCalendarId) {
          const { data: calRow } = await supabase
            .from("installer_calendars")
            .select("id")
            .eq("employee_id", callerEmpId)
            .eq("active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          newCalendarId = calRow?.id ?? null;
        }

        // Next sort_order
        const { data: maxRow } = await supabase
          .from("booking_employees")
          .select("sort_order")
          .eq("booking_id", booking_id)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextSortOrder = (maxRow?.sort_order ?? 0) + 1;

        const { error: insErr } = await supabase.from("booking_employees").insert({
          booking_id,
          employee_id: callerEmpId,
          calendar_id: newCalendarId,
          role: "secondary",
          sort_order: nextSortOrder,
        });
        if (insErr) {
          log.error("self_join insert failed", { error: insErr.message });
          return new Response(JSON.stringify({ error: "Failed to join booking" }), {
            status: 500, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
      } else {
        // self_leave: must be on booking as secondary (primary cannot leave)
        const { data: existing } = await supabase
          .from("booking_employees")
          .select("role")
          .eq("booking_id", booking_id)
          .eq("employee_id", callerEmpId)
          .maybeSingle();
        if (!existing) {
          return new Response(JSON.stringify({ success: true, already: true }), {
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        if (existing.role === "primary") {
          return new Response(JSON.stringify({ error: "Primary cannot self-leave — transfer first" }), {
            status: 403, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const { error: delErr } = await supabase
          .from("booking_employees")
          .delete()
          .eq("booking_id", booking_id)
          .eq("employee_id", callerEmpId);
        if (delErr) {
          log.error("self_leave delete failed", { error: delErr.message });
          return new Response(JSON.stringify({ error: "Failed to leave booking" }), {
            status: 500, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
      }

      // Refresh the Google Calendar event so all members' calendars reflect the
      // new team composition. Skip email notifications for self-actions — the
      // person already knows what they did.
      const fnUrl = (name: string) => `${supabaseUrl}/functions/v1/${name}`;
      const fnHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      };
      await Promise.allSettled([
        fetchWithRetry(fnUrl("create-booking-calendar-event"), {
          method: "POST", headers: fnHeaders,
          body: JSON.stringify({ booking_id }),
        }),
      ]);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Authorization check for non-admin, non-service-role callers
    const isServiceRole = auth.user.id === "service_role";
    if (!isServiceRole) {
      const { data: callerEmp } = await supabase
        .from("employees")
        .select("id, roles")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      // Pure admin (no employee row) or employee with admin role → allowed
      const isAdmin = !callerEmp || (callerEmp.roles || []).includes("admin");

      if (!isAdmin) {
        const callerEmpId = callerEmp?.id;
        if (!callerEmpId) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        // Caller must currently be on the booking (primary or via booking_employees)
        const { data: existing } = await supabase
          .from("bookings")
          .select("employee_id")
          .eq("id", booking_id)
          .maybeSingle();

        let onBooking = existing?.employee_id === callerEmpId;
        if (!onBooking) {
          const { data: be } = await supabase
            .from("booking_employees")
            .select("employee_id")
            .eq("booking_id", booking_id)
            .eq("employee_id", callerEmpId)
            .maybeSingle();
          onBooking = !!be;
        }

        if (!onBooking) {
          return new Response(JSON.stringify({ error: "Forbidden — not on this booking" }), {
            status: 403, headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        // All target employee_ids must be in caller's team
        const targetIds: string[] = team && Array.isArray(team)
          ? team.map((m: any) => m.employee_id).filter(Boolean)
          : (employee_id ? [employee_id] : []);

        if (targetIds.length === 0) {
          return new Response(JSON.stringify({ error: "No target employee" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        const { data: callerTeamRow } = await supabase
          .from("employee_team_members")
          .select("team_id")
          .eq("employee_id", callerEmpId)
          .maybeSingle();

        if (!callerTeamRow?.team_id) {
          return new Response(JSON.stringify({ error: "Not in a team" }), {
            status: 403, headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        const { data: teammates } = await supabase
          .from("employee_team_members")
          .select("employee_id")
          .eq("team_id", callerTeamRow.team_id);

        const teammateIds = new Set((teammates || []).map((t: any) => t.employee_id));
        const allInTeam = targetIds.every((id) => teammateIds.has(id));

        if (!allInTeam) {
          return new Response(JSON.stringify({ error: "Target not in your team" }), {
            status: 403, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
      }
    }

    // 1. Update team or single employee
    if (team && Array.isArray(team) && team.length > 0) {
      // Replace entire team
      await supabase.from("booking_employees").delete().eq("booking_id", booking_id);
      const beRows = team.map((m: any, i: number) => ({
        booking_id,
        employee_id: m.employee_id,
        calendar_id: m.calendar_id || null,
        role: m.role || (i === 0 ? "primary" : "secondary"),
        commission_cents: m.commission_cents || 0,
        sort_order: i,
      }));
      await supabase.from("booking_employees").insert(beRows);
      // The trigger will sync bookings.employee_id from the primary
    } else {
      // Single employee update (backwards compatible).
      // Pick the new employee's calendar that matches the booking's service + postal code
      // (service area). An installer typically owns multiple calendars — one per area —
      // and routing to the wrong one makes admin views inconsistent with the address.
      const { data: bookingRow } = await supabase
        .from("bookings")
        .select("service_id, postal_code")
        .eq("id", booking_id)
        .single();

      let newCalendarId: string | null = null;

      if (bookingRow?.service_id && bookingRow?.postal_code) {
        const { data: candidateCals } = await supabase
          .from("installer_calendars")
          .select("id, created_at, calendar_services!inner(service_id), calendar_service_areas(service_areas(postal_codes))")
          .eq("employee_id", employee_id)
          .eq("active", true)
          .eq("calendar_services.service_id", bookingRow.service_id)
          .order("created_at", { ascending: true });

        for (const cal of candidateCals || []) {
          const areas = (cal as { calendar_service_areas?: { service_areas?: { postal_codes?: string[] } | null }[] }).calendar_service_areas || [];
          const covers = areas.some((csa) =>
            (csa.service_areas?.postal_codes || []).includes(bookingRow.postal_code)
          );
          if (covers) {
            newCalendarId = (cal as { id: string }).id;
            break;
          }
        }
      }

      // Fallback: oldest active calendar for this employee. Availability is still safe
      // because conflict detection now keys on employee_id, not calendar_id.
      if (!newCalendarId) {
        const { data: calRow } = await supabase
          .from("installer_calendars")
          .select("id")
          .eq("employee_id", employee_id)
          .eq("active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        newCalendarId = calRow?.id ?? null;
      }

      const { error } = await supabase
        .from("bookings")
        .update({ employee_id, calendar_id: newCalendarId })
        .eq("id", booking_id);

      if (error) {
        return new Response(
          JSON.stringify({ error: "Failed to update booking" }),
          { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      // Also update primary in booking_employees if it exists
      await supabase
        .from("booking_employees")
        .update({ employee_id, calendar_id: newCalendarId })
        .eq("booking_id", booking_id)
        .eq("role", "primary");
    }

    // 2. Side effects
    const fnUrl = (name: string) => `${supabaseUrl}/functions/v1/${name}`;
    const fnHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    };

    // Get all team members to notify
    const { data: beMembers } = await supabase
      .from("booking_employees")
      .select("employee_id")
      .eq("booking_id", booking_id);
    const notifyEmpIds = (beMembers || []).map((m: any) => m.employee_id);
    // Fallback: notify the single employee if no booking_employees
    const idsToNotify = notifyEmpIds.length > 0 ? notifyEmpIds : (employee_id ? [employee_id] : []);

    // Filter out employees who opted out of new-job notifications
    let emailEmpIds: string[] = [];
    if (idsToNotify.length > 0) {
      const { data: prefs } = await supabase
        .from("employees")
        .select("id, notify_new_job")
        .in("id", idsToNotify);
      const optedIn = new Set((prefs || []).filter((e: any) => e.notify_new_job !== false).map((e: any) => e.id));
      emailEmpIds = idsToNotify.filter((id: string) => optedIn.has(id));
    }

    // Insert email outbox entries for opted-in team members
    const emailInserts = emailEmpIds.map((empId: string) =>
      supabase.from("email_outbox").insert({
        type: "booking",
        sender_email: "info@tiiviskoti.fi",
        payload: { booking_id, email_type: "installer_new_job", employee_id: empId },
        status: "pending",
        scheduled_at: new Date().toISOString(),
        reference_type: "booking",
        reference_id: booking_id,
      })
    );

    await Promise.allSettled([
      // Update Google Calendar event with new team
      fetchWithRetry(fnUrl("create-booking-calendar-event"), {
        method: "POST", headers: fnHeaders,
        body: JSON.stringify({ booking_id }),
      }),
      // Notify all team members
      ...emailInserts,
    ]);

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
