import {
  rankInstallers,
  getWeekBounds,
  type InstallerCandidate,
  type ScoringWeights,
} from "./installer-scoring";
import { buildChainedSlotTimes, subtractRange } from "./slot-chain";

/**
 * Find the best available installer calendar for a given service/postal/date/time.
 * Uses weighted scoring (distance, workload, route clustering) within priority tiers.
 *
 * Shared between /api/bookings and /api/temp-reservation to avoid logic duplication.
 */
export async function findAvailableInstaller(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  serviceId: string,
  postalCode: string,
  date: string,
  timeSlot: string,
  opts?: { duration?: number; sessionToken?: string; preferredEmployeeId?: string }
): Promise<{ calendarId: string; employeeId: string } | null> {
  const team = await findAvailableTeam(supabase, serviceId, postalCode, date, timeSlot, {
    duration: opts?.duration,
    requiredCount: 1,
    sessionToken: opts?.sessionToken,
    preferredEmployeeId: opts?.preferredEmployeeId,
  });
  return team ? team[0] : null;
}

/**
 * Find N available installer calendars for a given service/postal/date/time.
 * Returns an array of { calendarId, employeeId } sorted by role (primary first).
 * Returns null if fewer than requiredCount installers are available.
 */
export async function findAvailableTeam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  serviceId: string,
  postalCode: string,
  date: string,
  timeSlot: string,
  opts?: { duration?: number; requiredCount?: number; sessionToken?: string; preferredEmployeeId?: string; slotBaseDuration?: number; addonIds?: string[] }
): Promise<{ calendarId: string; employeeId: string }[] | null> {
  // Resolve duration
  let duration = opts?.duration;
  let requiredCount = opts?.requiredCount;
  let serviceTransition: number | null = null;
  const sessionToken = opts?.sessionToken;
  const preferredEmployeeId = opts?.preferredEmployeeId;

  // Always fetch transition_minutes — needed for chain validation below
  const { data: svc } = await supabase
    .from("services")
    .select("duration_minutes, required_employees, transition_minutes")
    .eq("id", serviceId)
    .single();
  if (!duration) duration = svc?.duration_minutes || 60;
  if (requiredCount === undefined) requiredCount = svc?.required_employees || 1;
  serviceTransition = svc?.transition_minutes ?? null;

  // 1. Find calendars that include this service
  const { data: calendars } = await supabase
    .from("installer_calendars")
    .select("id, employee_id, calendar_services!inner(service_id), calendar_service_areas(service_area_id)")
    .eq("calendar_services.service_id", serviceId)
    .eq("active", true);

  if (!calendars || calendars.length === 0) return null;

  // 2. Parallel fetch: service areas, employees, scoring data, service priorities
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const areaIds = [...new Set(calendars.flatMap((c: any) => (c.calendar_service_areas || []).map((csa: any) => csa.service_area_id)))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employeeIds = [...new Set(calendars.map((c: any) => c.employee_id))];
  const { monday, sunday } = getWeekBounds(date);

  const [areasRes, employeesRes, weekBookingsRes, sameDayBookingsRes, settingsRes, prioritiesRes] =
    await Promise.all([
      supabase
        .from("service_areas")
        .select("id, postal_codes")
        .in("id", areaIds)
        .eq("active", true),
      supabase
        .from("employees")
        .select("id, postal_code")
        .in("id", employeeIds)
        .eq("active", true),
      supabase
        .from("bookings")
        .select("employee_id")
        .in("employee_id", employeeIds)
        .gte("booking_date", monday)
        .lte("booking_date", sunday)
        .neq("status", "cancelled")
        .is("deleted_at", null),
      supabase
        .from("bookings")
        .select("employee_id, postal_code")
        .in("employee_id", employeeIds)
        .eq("booking_date", date)
        .neq("status", "cancelled")
        .is("deleted_at", null),
      supabase
        .from("company_settings")
        .select("optimization_weight_distance, optimization_weight_workload, optimization_weight_route, default_transition_minutes")
        .limit(1)
        .single(),
      supabase
        .from("employee_service_priorities")
        .select("employee_id, priority")
        .in("employee_id", employeeIds)
        .eq("service_id", serviceId),
    ]);

  // Build (employee_id -> priority) map for this service. Missing row = "medium".
  const priorityByEmployee = new Map<string, InstallerCandidate["servicePriority"]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (prioritiesRes.data || []) as any[]) {
    priorityByEmployee.set(row.employee_id, row.priority);
  }

  // Filter by postal code match
  const matchingAreaIds = new Set(
    (areasRes.data || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((a: any) => a.postal_codes?.includes(postalCode))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((a: any) => a.id)
  );

  const activeEmployees = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (employeesRes.data || []).map((e: any) => [e.id, e.postal_code as string | null])
  );

  let matching = calendars.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c.calendar_service_areas || []).some((csa: any) => matchingAreaIds.has(csa.service_area_id)) &&
      activeEmployees.has(c.employee_id)
  );

  // Exclude employees who have opted out of any selected addon
  // (mirrors the addon_ids filter in /api/availability)
  if (opts?.addonIds && opts.addonIds.length > 0) {
    const { data: exclusionRows } = await supabase
      .from("employee_addon_exclusions")
      .select("employee_id, addon_service_id")
      .in("addon_service_id", opts.addonIds);
    if (exclusionRows && exclusionRows.length > 0) {
      const exclMap = new Map<string, Set<string>>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of exclusionRows as any[]) {
        if (!exclMap.has(r.employee_id)) exclMap.set(r.employee_id, new Set());
        exclMap.get(r.employee_id)!.add(r.addon_service_id);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      matching = matching.filter((c: any) => {
        const excl = exclMap.get(c.employee_id);
        if (!excl) return true;
        return opts.addonIds!.every((aid) => !excl.has(aid));
      });
    }
  }

  if (matching.length === 0) return null;

  // 3. Build scoring context
  const weekBookingCounts: Record<string, number> = {};
  for (const b of weekBookingsRes.data || []) {
    weekBookingCounts[b.employee_id] = (weekBookingCounts[b.employee_id] || 0) + 1;
  }

  const sameDayPostalCodes: Record<string, string[]> = {};
  for (const b of sameDayBookingsRes.data || []) {
    if (b.postal_code) {
      if (!sameDayPostalCodes[b.employee_id]) sameDayPostalCodes[b.employee_id] = [];
      sameDayPostalCodes[b.employee_id].push(b.postal_code);
    }
  }

  const weights: ScoringWeights = {
    distance: settingsRes.data?.optimization_weight_distance ?? 40,
    workload: settingsRes.data?.optimization_weight_workload ?? 30,
    route: settingsRes.data?.optimization_weight_route ?? 30,
  };

  // 4. Rank candidates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates: InstallerCandidate[] = matching.map((c: any) => ({
    calendarId: c.id,
    employeeId: c.employee_id,
    employeePostalCode: activeEmployees.get(c.employee_id) ?? null,
    servicePriority: priorityByEmployee.get(c.employee_id) || "medium",
  }));

  let ranked = rankInstallers(candidates, {
    customerPostalCode: postalCode,
    weekBookingCounts,
    sameDayPostalCodes,
    weights,
  });

  // 4b. If preferred employee, move them to front of ranked list
  if (preferredEmployeeId) {
    const prefIdx = ranked.findIndex((r) => r.employeeId === preferredEmployeeId);
    if (prefIdx > 0) {
      const [pref] = ranked.splice(prefIdx, 1);
      ranked = [pref, ...ranked];
    }
  }

  // 5. Check slot availability for each ranked installer, collect up to requiredCount
  const d = new Date(date + "T00:00:00");
  let dow = d.getDay();
  if (dow === 0) dow = 7;
  const slotMinutes = timeToMinutes(timeSlot);

  const team: { calendarId: string; employeeId: string }[] = [];
  const usedEmployeeIds = new Set<string>();

  const defaultTransition = settingsRes.data?.default_transition_minutes ?? 0;
  const transition = serviceTransition ?? defaultTransition;

  for (const installer of ranked) {
    // Skip if this employee is already in the team
    if (usedEmployeeIds.has(installer.employeeId)) continue;

    // Fetch everything needed to reconstruct this calendar's slot chain in parallel
    const [overridesRes, weeklyRes, existingRes, tempRes] = await Promise.all([
      supabase
        .from("calendar_overrides")
        .select("start_time, end_time, override_type")
        .eq("calendar_id", installer.calendarId)
        .eq("date", date),
      supabase
        .from("calendar_weekly_slots")
        .select("day_of_week, start_time, end_time")
        .eq("calendar_id", installer.calendarId),
      supabase
        .from("bookings")
        .select("time_slot, duration_minutes, services(duration_minutes, transition_minutes)")
        .eq("employee_id", installer.employeeId)
        .eq("booking_date", date)
        .neq("status", "cancelled")
        .is("deleted_at", null),
      (() => {
        let q = supabase
          .from("temp_reservations")
          .select("time_slot, services(duration_minutes, transition_minutes)")
          .eq("employee_id", installer.employeeId)
          .eq("booking_date", date)
          .gt("expires_at", new Date().toISOString());
        if (sessionToken) q = q.neq("session_token", sessionToken);
        return q;
      })(),
    ]);

    // Build working ranges: weekly slots + available overrides, then subtract blocked overrides.
    // Mirrors the logic in /api/availability so generator and validator stay in sync.
    let ranges: { start: number; end: number }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allWeekly = (weeklyRes.data || []) as any[];
    for (const ws of allWeekly.filter((w) => w.day_of_week === dow)) {
      ranges.push({ start: timeToMinutes(ws.start_time), end: timeToMinutes(ws.end_time) });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const availableOverride = (overridesRes.data || []).find((o: any) => o.override_type === "available");
    if (availableOverride) {
      if (availableOverride.start_time && availableOverride.end_time) {
        ranges.push({
          start: timeToMinutes(availableOverride.start_time),
          end: timeToMinutes(availableOverride.end_time),
        });
      } else if (allWeekly.length > 0) {
        // Timeless override = "normal working day": mirror /api/availability by
        // using the calendar's own weekly hours instead of an arbitrary window.
        ranges.push({
          start: Math.min(...allWeekly.map((w) => timeToMinutes(w.start_time))),
          end: Math.max(...allWeekly.map((w) => timeToMinutes(w.end_time))),
        });
      } else {
        ranges.push({ start: 8 * 60, end: 16 * 60 });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blockedList = (overridesRes.data || []).filter((o: any) => o.override_type === "blocked");
    let dayBlocked = false;
    for (const blocked of blockedList) {
      if (!blocked.start_time) { dayBlocked = true; break; }
      const blockStart = timeToMinutes(blocked.start_time);
      const blockEnd = blocked.end_time ? timeToMinutes(blocked.end_time) : 24 * 60;
      ranges = ranges.flatMap((r) => subtractRange(r, blockStart, blockEnd));
    }
    if (dayBlocked || ranges.length === 0) continue;

    // Build occupied periods (existing bookings + active temp reservations from other sessions)
    const occupied: { start: number; end: number }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of (existingRes.data || []) as any[]) {
      const bStart = timeToMinutes(b.time_slot);
      const bDuration = (b.duration_minutes as number) || b.services?.duration_minutes || 60;
      const bTransition = b.services?.transition_minutes ?? defaultTransition;
      occupied.push({ start: bStart, end: bStart + bDuration + bTransition });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (tempRes.data || []) as any[]) {
      const tStart = timeToMinutes(t.time_slot);
      const tDuration = t.services?.duration_minutes || 60;
      const tTransition = t.services?.transition_minutes ?? defaultTransition;
      occupied.push({ start: tStart, end: tStart + tDuration + tTransition });
    }

    // The decisive check: slot must be on this installer's own natural chain.
    // Without this, the optimizer could assign the picked time to an installer
    // for whom that time is off-grid (e.g. they start at 09:00 and the time
    // came from another installer whose chain landed there), leaving every
    // subsequent slot for that installer misaligned.
    // Step by the single-unit footprint so this matches the grid /api/availability
    // showed the customer. baseDuration = the variant's (or service's) single-unit
    // duration; duration! is the full footprint (multi-unit + addons) used for the
    // fit/collision check. slotBaseDuration MUST match what /api/availability used
    // as its grid step — otherwise every slot after the day's first gets rejected.
    const baseDuration = opts?.slotBaseDuration ?? (svc?.duration_minutes || 60);
    const slotStep = baseDuration + transition;
    const chain = buildChainedSlotTimes(ranges, occupied, duration!, transition, 0, slotStep);
    if (!chain.has(slotMinutes)) continue;

    team.push({ calendarId: installer.calendarId, employeeId: installer.employeeId });
    usedEmployeeIds.add(installer.employeeId);

    if (team.length >= requiredCount!) break;
  }

  if (team.length < requiredCount!) return null;
  return team;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
