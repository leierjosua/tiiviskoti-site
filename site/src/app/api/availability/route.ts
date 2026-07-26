import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { timeToMinutes } from "@/lib/find-installer";
import { buildChainedSlotTimes, minutesToTime, subtractRange } from "@/lib/slot-chain";
import { cacheGet, cacheSet } from "@/lib/cache";
import { apiError, handleApiError } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const ParamsSchema = z.object({
  service_id: z.string().uuid(),
  postal_code: z.string().regex(/^\d{5}$/),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  variant_id: z.string().uuid().optional(),
  device_count: z.coerce.number().int().min(1).optional(),
  preferred_employee_id: z.string().uuid().optional(),
  addon_ids: z.string().optional(), // comma-separated UUIDs
});

/**
 * GET /api/availability?service_id=X&postal_code=Y&from=Z&to=W
 *
 * Returns available time slots per date, computed from installer calendars.
 * A slot is available if ANY installer can serve it.
 */
export async function GET(request: NextRequest) {
  try {
    const rl = rateLimit(request, 20, 60_000);
    if (rl) return rl;

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const parsed = ParamsSchema.safeParse(params);

    if (!parsed.success) {
      return apiError("service_id (uuid), postal_code (5 digits), from (YYYY-MM-DD), to (YYYY-MM-DD) required", 400);
    }

    const { service_id: serviceId, postal_code: postalCode, from, to, variant_id: variantId, device_count: deviceCount, preferred_employee_id: preferredEmployeeId, addon_ids: addonIdsRaw } = parsed.data;
    const addonIds = addonIdsRaw ? addonIdsRaw.split(",").filter(Boolean) : [];

    // Check in-memory cache (30s TTL)
    const qty = deviceCount ?? 1;
    const addonSuffix = addonIds.length > 0 ? `:a${addonIds.sort().join(",")}` : "";
    const cacheKey = `avail:${serviceId}:${postalCode}:${from}:${to}${variantId ? `:v${variantId}` : ""}${qty > 1 ? `:q${qty}` : ""}${preferredEmployeeId ? `:pe${preferredEmployeeId}` : ""}${addonSuffix}`;
    const cached = cacheGet<Record<string, string[]>>(cacheKey);
    if (cached) {
      return NextResponse.json({ availableSlots: cached }, {
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
      });
    }

    const supabase = createServiceClient();

    // 1+2. Fetch service, calendars, and company settings in parallel
    const [serviceRes, calendarsRes, settingsRes] = await Promise.all([
      supabase
        .from("services")
        .select("id, duration_minutes, transition_minutes, min_scheduling_notice_hours, max_advance_days, required_employees, extra_duration_per_unit_minutes")
        .eq("id", serviceId)
        .eq("active", true)
        .single(),
      supabase
        .from("installer_calendars")
        .select("id, employee_id, calendar_service_areas(service_area_id), calendar_services!inner(service_id)")
        .eq("calendar_services.service_id", serviceId)
        .eq("active", true),
      supabase
        .from("company_settings")
        .select("default_transition_minutes")
        .limit(1)
        .single(),
    ]);

    const service = serviceRes.data;
    if (serviceRes.error && serviceRes.error.code !== "PGRST116") {
      throw new Error(`Service query failed: ${serviceRes.error.message}`);
    }
    if (calendarsRes.error) {
      throw new Error(`Calendars query failed: ${calendarsRes.error.message}`);
    }
    const calendars = calendarsRes.data;

    if (!service) {
      return apiError("Service not found", 404);
    }

    if (!calendars || calendars.length === 0) {
      return NextResponse.json({ availableSlots: {} });
    }

    // 3+4. Fetch service areas and active employees in parallel
    type CalendarRow = (typeof calendars)[number];
    type CalendarServiceArea = { service_area_id: string };
    const areaIds = [...new Set(calendars.flatMap((c: CalendarRow) => ((c.calendar_service_areas || []) as CalendarServiceArea[]).map((csa) => csa.service_area_id)))];
    const employeeIds = [...new Set(calendars.map((c) => c.employee_id))];

    const [areasRes, employeesRes] = await Promise.all([
      supabase
        .from("service_areas")
        .select("id, postal_codes")
        .in("id", areaIds)
        .eq("active", true),
      supabase
        .from("employees")
        .select("id")
        .in("id", employeeIds)
        .eq("active", true),
    ]);

    if (areasRes.error) {
      throw new Error(`Service areas query failed: ${areasRes.error.message}`);
    }
    if (employeesRes.error) {
      throw new Error(`Employees query failed: ${employeesRes.error.message}`);
    }

    const matchingAreaIds = new Set(
      (areasRes.data || [])
        .filter((a) => a.postal_codes?.includes(postalCode))
        .map((a) => a.id)
    );

    const activeEmployeeIds = new Set((employeesRes.data || []).map((e) => e.id));

    // Filter calendars: at least one matching area + active employee
    let matchingCalendars = calendars.filter(
      (c: CalendarRow) =>
        ((c.calendar_service_areas || []) as CalendarServiceArea[]).some((csa) => matchingAreaIds.has(csa.service_area_id)) &&
        activeEmployeeIds.has(c.employee_id)
    );

    // Filter by addon capability: exclude employees who have opted out of selected addons
    if (addonIds.length > 0) {
      const { data: exclusionRows } = await supabase
        .from("employee_addon_exclusions")
        .select("employee_id, addon_service_id")
        .in("addon_service_id", addonIds);
      if (exclusionRows && exclusionRows.length > 0) {
        // Build map: employee_id -> set of excluded addon IDs
        const exclMap = new Map<string, Set<string>>();
        for (const r of exclusionRows) {
          if (!exclMap.has(r.employee_id)) exclMap.set(r.employee_id, new Set());
          exclMap.get(r.employee_id)!.add(r.addon_service_id);
        }
        matchingCalendars = matchingCalendars.filter((c: CalendarRow) => {
          const excl = exclMap.get(c.employee_id);
          if (!excl) return true;
          return addonIds.every((aid) => !excl.has(aid));
        });
      }
    }

    // If preferred employee specified, show only their calendars
    if (preferredEmployeeId) {
      const preferred = matchingCalendars.filter((c: CalendarRow) => c.employee_id === preferredEmployeeId);
      if (preferred.length > 0) matchingCalendars = preferred;
      // If preferred employee has no matching calendar, fall back to all (graceful degradation)
    }

    if (matchingCalendars.length === 0) {
      return NextResponse.json({ availableSlots: {} });
    }

    const calendarIds = matchingCalendars.map((c) => c.id);
    // Occupancy is keyed on employee_id, not calendar_id: one installer may own multiple
    // calendars (per service area), and a booking on any of them must block the others.
    const matchingEmployeeIds = [...new Set(matchingCalendars.map((c) => c.employee_id))];

    // 5. Fetch weekly slots, overrides, existing bookings, and temp reservations in parallel
    const [weeklyRes, overridesRes, bookingsRes, tempRes] = await Promise.all([
      supabase
        .from("calendar_weekly_slots")
        .select("calendar_id, day_of_week, start_time, end_time")
        .in("calendar_id", calendarIds),
      supabase
        .from("calendar_overrides")
        .select("calendar_id, date, start_time, end_time, override_type")
        .in("calendar_id", calendarIds)
        .gte("date", from)
        .lte("date", to),
      supabase
        .from("bookings")
        .select("booking_date, time_slot, employee_id, duration_minutes, services(duration_minutes, transition_minutes)")
        .in("employee_id", matchingEmployeeIds)
        .gte("booking_date", from)
        .lte("booking_date", to)
        .neq("status", "cancelled")
        .is("deleted_at", null),
      supabase
        .from("temp_reservations")
        .select("booking_date, time_slot, employee_id, services(duration_minutes, transition_minutes)")
        .in("employee_id", matchingEmployeeIds)
        .gte("booking_date", from)
        .lte("booking_date", to)
        .gt("expires_at", new Date().toISOString()),
    ]);

    if (weeklyRes.error) {
      throw new Error(`Weekly slots query failed: ${weeklyRes.error.message}`);
    }
    if (overridesRes.error) {
      throw new Error(`Overrides query failed: ${overridesRes.error.message}`);
    }
    if (bookingsRes.error) {
      throw new Error(`Bookings query failed: ${bookingsRes.error.message}`);
    }
    // temp_reservations table may not exist yet — ignore errors
    const weeklySlots = weeklyRes.data || [];
    const overrides = overridesRes.data || [];
    const existingBookings = bookingsRes.data || [];
    const tempReservations = tempRes.data || []; // empty if table doesn't exist yet

    // 6. Compute availability per date
    const defaultTransition = settingsRes.data?.default_transition_minutes ?? 0;

    // If a variant is specified, use its duration instead of the service default
    let baseDuration = service.duration_minutes || 60;
    if (variantId) {
      const { data: variant } = await supabase
        .from("service_variants")
        .select("duration_minutes")
        .eq("id", variantId)
        .eq("active", true)
        .single();
      if (variant) baseDuration = variant.duration_minutes;
    }
    // Scale duration for multiple devices
    let duration = baseDuration;
    if (qty > 1) {
      const extraPerUnit = (service as Record<string, unknown>).extra_duration_per_unit_minutes as number | null;
      if (extraPerUnit != null) {
        duration = baseDuration + (qty - 1) * extraPerUnit;
      } else {
        duration = baseDuration * qty;
      }
    }
    // Selected addons extend the footprint (grid step stays on the base duration,
    // same as /api/bookings → findAvailableTeam)
    if (addonIds.length > 0) {
      const { data: addonRows } = await supabase
        .from("addon_services")
        .select("id, duration_minutes")
        .in("id", addonIds)
        .eq("active", true);
      for (const a of addonRows || []) duration += a.duration_minutes || 0;
    }

    const requiredEmployees = service.required_employees ?? 1;
    const transition = service.transition_minutes ?? defaultTransition;
    // Slot grid steps by the SINGLE-unit footprint (one wash + transition), even
    // for multi-unit bookings, so a 2× booking is offered on the single-wash grid
    // (08:00, 10:00, 12:00) instead of a coarse double grid (08:00, 11:30) that
    // fragments the calendar. Each candidate still reserves the full `duration`.
    const slotStep = baseDuration + transition;
    // Per-calendar chaining: walking around existing bookings
    const availableSlots: Record<string, string[]> = {};

    const startDate = new Date(from + "T00:00:00");
    const endDate = new Date(to + "T00:00:00");
    const noticeHours = service.min_scheduling_notice_hours ?? 18;

    // All time calculations in Finnish timezone (slots in DB are Finnish local time)
    const finnishNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
    const earliestFI = new Date(finnishNow.getTime() + noticeHours * 60 * 60 * 1000);
    const earliestDateKey = `${earliestFI.getFullYear()}-${String(earliestFI.getMonth() + 1).padStart(2, "0")}-${String(earliestFI.getDate()).padStart(2, "0")}`;
    const earliestMinuteOfDay = earliestFI.getHours() * 60 + earliestFI.getMinutes();

    // Max advance days limit (website only)
    const maxAdvanceDays = service.max_advance_days ?? null;
    let latestDateKey: string | null = null;
    if (maxAdvanceDays != null) {
      const latestFI = new Date(finnishNow.getTime() + maxAdvanceDays * 24 * 60 * 60 * 1000);
      latestDateKey = `${latestFI.getFullYear()}-${String(latestFI.getMonth() + 1).padStart(2, "0")}-${String(latestFI.getDate()).padStart(2, "0")}`;
    }

    type BookingRow = (typeof existingBookings)[number];
    type TempRow = (typeof tempReservations)[number];
    type ServiceRelation = { duration_minutes: number; transition_minutes: number | null };

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      // Skip dates before the earliest allowed date
      if (dateKey < earliestDateKey) continue;
      // Skip dates beyond the max advance days limit
      if (latestDateKey && dateKey > latestDateKey) continue;

      // day_of_week: 1=Mon...7=Sun (matching our DB convention)
      let dow = d.getDay();
      if (dow === 0) dow = 7;

      const slotsForDate = new Set<string>();

      // Pre-compute ranges and occupied time per calendar for this date
      const calendarData: { ranges: { start: number; end: number }[]; occupied: { start: number; end: number }[] }[] = [];
      let globalStart = Infinity;
      let globalEnd = 0;

      for (const cal of matchingCalendars) {
        const calOverrides = overrides.filter(
          (o) => o.calendar_id === cal.id && o.date === dateKey
        );
        const blockedOverrides = calOverrides.filter((o) => o.override_type === "blocked");
        const availableOverride = calOverrides.find((o) => o.override_type === "available");

        let ranges: { start: number; end: number }[] = [];

        const weeklyForDay = weeklySlots.filter(
          (ws) => ws.calendar_id === cal.id && ws.day_of_week === dow
        );
        for (const ws of weeklyForDay) {
          ranges.push({
            start: timeToMinutes(ws.start_time),
            end: timeToMinutes(ws.end_time),
          });
        }

        if (availableOverride) {
          if (availableOverride.start_time && availableOverride.end_time) {
            ranges.push({
              start: timeToMinutes(availableOverride.start_time),
              end: timeToMinutes(availableOverride.end_time),
            });
          } else {
            // Timeless override = "normal working day": use the calendar's own
            // weekly hours (earliest start – latest end across the week) so the
            // grid matches the employee's real schedule, not an arbitrary window.
            const calWeekly = weeklySlots.filter((ws) => ws.calendar_id === cal.id);
            if (calWeekly.length > 0) {
              ranges.push({
                start: Math.min(...calWeekly.map((ws) => timeToMinutes(ws.start_time))),
                end: Math.max(...calWeekly.map((ws) => timeToMinutes(ws.end_time))),
              });
            } else {
              ranges.push({ start: 8 * 60, end: 16 * 60 });
            }
          }
        }

        for (const blockedOverride of blockedOverrides) {
          if (!blockedOverride.start_time) {
            ranges = [];
            break;
          } else {
            const blockStart = timeToMinutes(blockedOverride.start_time);
            const blockEnd = blockedOverride.end_time
              ? timeToMinutes(blockedOverride.end_time)
              : 24 * 60;
            ranges = ranges.flatMap((r) => subtractRange(r, blockStart, blockEnd));
          }
        }

        if (ranges.length === 0) continue;

        // Build occupied time ranges (bookings + temp reservations).
        // Filter by employee_id so cross-calendar conflicts for the same installer block this slot.
        const occupied: { start: number; end: number }[] = [];
        for (const b of existingBookings.filter((b: BookingRow) => b.employee_id === cal.employee_id && b.booking_date === dateKey)) {
          const bStart = timeToMinutes(b.time_slot);
          const svc = b.services as unknown as ServiceRelation | null;
          // Use stored duration (includes device_count scaling), fall back to service base
          const bDuration = (b as Record<string, unknown>).duration_minutes as number || svc?.duration_minutes || 60;
          const bTransition = svc?.transition_minutes ?? defaultTransition;
          occupied.push({ start: bStart, end: bStart + bDuration + bTransition });
        }
        for (const tr of tempReservations.filter((t: TempRow) => t.employee_id === cal.employee_id && t.booking_date === dateKey)) {
          const tStart = timeToMinutes(tr.time_slot);
          const svc = tr.services as unknown as ServiceRelation | null;
          const tDuration = svc?.duration_minutes || 60;
          const tTransition = svc?.transition_minutes ?? defaultTransition;
          occupied.push({ start: tStart, end: tStart + tDuration + tTransition });
        }

        calendarData.push({ ranges, occupied });
        for (const r of ranges) {
          globalStart = Math.min(globalStart, r.start);
          globalEnd = Math.max(globalEnd, r.end);
        }
      }

      if (calendarData.length === 0) continue;

      // On the earliest allowed date, skip slots before the cutoff time
      const earliestMinute = dateKey === earliestDateKey ? earliestMinuteOfDay : 0;

      // Per-calendar slot generation via shared helper (see lib/slot-chain.ts).
      // Each calendar generates its own chain (e.g. 08:00, 10:00, 12:00, 14:00).
      // The same helper is used at booking time to validate the picked installer.
      const slotEndOffset = duration + transition;

      for (const cal of calendarData) {
        const chainTimes = buildChainedSlotTimes(
          cal.ranges,
          cal.occupied,
          duration,
          transition,
          earliestMinute,
          slotStep
        );

        for (const cursor of chainTimes) {
          if (requiredEmployees <= 1) {
            slotsForDate.add(minutesToTime(cursor));
            continue;
          }
          // Multi-employee: enough OTHER calendars must also be free at this exact time
          const slotEnd = cursor + slotEndOffset;
          const othersAvailable = calendarData.filter((otherCal) => {
            if (otherCal === cal) return true;
            const inRange = otherCal.ranges.some((r) => cursor >= r.start && cursor + duration <= r.end);
            if (!inRange) return false;
            return !otherCal.occupied.some((occ) => cursor < occ.end && occ.start < slotEnd);
          }).length;
          if (othersAvailable >= requiredEmployees) {
            slotsForDate.add(minutesToTime(cursor));
          }
        }
      }

      if (slotsForDate.size > 0) {
        availableSlots[dateKey] = [...slotsForDate].sort();
      }
    }

    // Store in cache
    cacheSet(cacheKey, availableSlots, 30_000);

    return NextResponse.json({ availableSlots }, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

