import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useInstallerCalendars } from "@/hooks/useEmployees";
import { useAllAddonExclusions } from "@/hooks/useAddonServices";
import { supabase } from "@/lib/supabase";
import { MONTH_NAMES_FI } from "@/lib/utils";
import { postalDistanceKm } from "@/lib/postal-distances";
import type { Employee } from "@/lib/types";

export function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}


export function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
export function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export interface CalendarStepProps {
  path: "postal" | "free";
  postalCode: string;
  selectedServiceIds: string[];
  allServices: { id: string; name: string }[];
  allEmployees: Employee[];
  allAreas: { id: string; postal_codes: string[]; active: boolean; employee_id: string | null }[];
  selectedEmployeeId: string | null;
  setSelectedEmployeeId: (id: string | null) => void;
  selectedCalendarId: string | null;
  setSelectedCalendarId: (id: string | null) => void;
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  selectedTime: string | null;
  setSelectedTime: (t: string | null) => void;
  calMonth: { year: number; month: number };
  setCalMonth: (m: { year: number; month: number }) => void;
  totalDuration: number;
  /** Slot grid STEP in minutes (single-unit footprint). Defaults to totalDuration.
   *  Pass the single-device footprint for multi-device bookings so the grid stays
   *  on the single-wash grid (08:00, 10:00, 12:00) instead of a coarse multi grid. */
  slotStepMinutes?: number;
  minSchedulingNoticeHours?: number;
  onBack: () => void;
  onNext: () => void;
  canProceed: boolean;
  backLabel?: string;
  nextLabel?: string;
  isSubmitting?: boolean;
  /** Highlight this time slot (e.g. current booking time) with a subtle indicator */
  highlightTime?: string | null;
  /** Selected addon service IDs — used to filter out installers who have excluded these */
  selectedAddonIds?: string[];
  /** Hide employee filter & admin toggles (installer self-booking) */
  hideEmployeeFilter?: boolean;
  /** When rescheduling, exclude this booking from occupancy so it doesn't block its own move */
  excludeBookingId?: string | null;
}

interface SlotInfo {
  time: string;
  calendarId: string;
  employeeId: string;
}

export function CalendarStep({
  path, postalCode, selectedServiceIds, allServices, allEmployees, allAreas,
  selectedEmployeeId, setSelectedEmployeeId, selectedCalendarId, setSelectedCalendarId,
  selectedDate, setSelectedDate, selectedTime, setSelectedTime,
  calMonth, setCalMonth, totalDuration, slotStepMinutes, minSchedulingNoticeHours, onBack, onNext, canProceed,
  backLabel = "Takaisin", nextLabel = "Seuraava", isSubmitting = false, highlightTime = null,
  selectedAddonIds = [],
  hideEmployeeFilter = false,
  excludeBookingId = null,
}: CalendarStepProps) {
  void allServices; void selectedEmployeeId;
  const { data: allCalendars } = useInstallerCalendars();
  const { data: addonExclusionMap } = useAllAddonExclusions();
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(hideEmployeeFilter ? selectedEmployeeId : null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [use30MinIntervals, setUse30MinIntervals] = useState(false);

  // Check if an employee can do all selected addons (no exclusions for any of them)
  function employeeCanDoAddons(employeeId: string): boolean {
    if (selectedAddonIds.length === 0 || !addonExclusionMap) return true;
    const exclusions = addonExclusionMap.get(employeeId);
    if (!exclusions) return true; // no exclusions = can do everything
    return selectedAddonIds.every((aid) => !exclusions.has(aid));
  }

  // All eligible calendars based on path + addon capability
  const eligibleCalendars = useMemo(() => {
    if (!allCalendars) return [];
    if (path === "postal" && postalCode.length === 5) {
      const matchingAreaIds = new Set(
        (allAreas || []).filter((a) => a.active && a.postal_codes.includes(postalCode)).map((a) => a.id)
      );
      const activeEmpIds = new Set(allEmployees.filter((e) => e.active).map((e) => e.id));
      return allCalendars.filter((c) =>
        c.active &&
        activeEmpIds.has(c.employee_id) &&
        selectedServiceIds.some((sid) => (c.calendar_services || []).some((cs) => cs.service_id === sid)) &&
        (c.calendar_service_areas || []).some((csa) => matchingAreaIds.has(csa.service_area_id)) &&
        employeeCanDoAddons(c.employee_id)
      );
    }
    // Free path: all active calendars, filtered by addon capability
    const activeEmpIds = new Set(allEmployees.filter((e) => e.active).map((e) => e.id));
    return allCalendars.filter((c) => c.active && activeEmpIds.has(c.employee_id) && employeeCanDoAddons(c.employee_id));
  }, [path, postalCode, selectedServiceIds, allCalendars, allEmployees, allAreas, selectedAddonIds, addonExclusionMap]);

  // Unique eligible employees for filter buttons
  const eligibleEmployees = useMemo(() => {
    const empIds = new Set(eligibleCalendars.map((c) => c.employee_id));
    return allEmployees.filter((e) => empIds.has(e.id));
  }, [eligibleCalendars, allEmployees]);

  // Calendars to show (filtered or all)
  const visibleCalendars = useMemo(() => {
    if (filterEmployeeId) return eligibleCalendars.filter((c) => c.employee_id === filterEmployeeId);
    return eligibleCalendars;
  }, [eligibleCalendars, filterEmployeeId]);

  // Fetch weekly slots + overrides for ALL visible calendars
  const calendarIds = useMemo(() => visibleCalendars.map((c) => c.id), [visibleCalendars]);

  const [allWeeklySlots, setAllWeeklySlots] = useState<Record<string, { day_of_week: number; start_time: string; end_time: string }[]>>({});
  const [allOverrides, setAllOverrides] = useState<Record<string, { date: string; start_time: string | null; end_time: string | null; override_type: string }[]>>({});
  const [existingBookings, setExistingBookings] = useState<Record<string, { start: number; end: number }[]>>({});
  const [slotsLoaded, setSlotsLoaded] = useState(false);

  useEffect(() => {
    if (calendarIds.length === 0) { setSlotsLoaded(true); return; }
    setSlotsLoaded(false);
    const bookingsQuery = supabase.from("bookings").select("calendar_id, booking_date, time_slot, duration_minutes, services(duration_minutes, transition_minutes)").in("calendar_id", calendarIds).is("deleted_at", null).neq("status", "cancelled");
    if (excludeBookingId) bookingsQuery.neq("id", excludeBookingId);
    Promise.all([
      supabase.from("calendar_weekly_slots").select("calendar_id, day_of_week, start_time, end_time").in("calendar_id", calendarIds),
      supabase.from("calendar_overrides").select("calendar_id, date, start_time, end_time, override_type").in("calendar_id", calendarIds),
      bookingsQuery,
      supabase.from("company_settings").select("default_transition_minutes").limit(1).single(),
    ]).then(([wsRes, ovRes, bookRes, settingsRes]) => {
      const wsMap: Record<string, typeof allWeeklySlots[string]> = {};
      for (const row of wsRes.data || []) {
        (wsMap[row.calendar_id] ||= []).push(row);
      }
      setAllWeeklySlots(wsMap);
      const ovMap: Record<string, typeof allOverrides[string]> = {};
      for (const row of ovRes.data || []) {
        (ovMap[row.calendar_id] ||= []).push(row);
      }
      setAllOverrides(ovMap);
      // Build a map of calendar_id -> occupied time ranges (with duration + transition)
      const defaultTrans = (settingsRes as any).data?.default_transition_minutes ?? 0;
      const bookMap: Record<string, { start: number; end: number }[]> = {};
      for (const row of bookRes.data || []) {
        const bStart = timeToMinutes(row.time_slot);
        // Use stored duration_minutes (includes device count scaling), fall back to service default
        const bDuration = (row as any).duration_minutes || (row as any).services?.duration_minutes || 60;
        const bTransition = (row as any).services?.transition_minutes ?? defaultTrans;
        const entry = { start: bStart, end: bStart + bDuration + bTransition, date: row.booking_date };
        const key = `${row.calendar_id}|${row.booking_date}`;
        (bookMap[key] ||= []).push(entry);
      }
      setExistingBookings(bookMap);
      setSlotsLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarIds.join(","), excludeBookingId]);

  // Reset selections when filter changes
  useEffect(() => {
    setSelectedDate(null);
    setSelectedTime(null);
    setSelectedEmployeeId(null);
    setSelectedCalendarId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEmployeeId]);

  // When override or interval toggles, clear time selection
  useEffect(() => {
    setSelectedTime(null);
    setSelectedEmployeeId(null);
    setSelectedCalendarId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrideMode, use30MinIntervals]);

  const { year, month } = calMonth;
  const cells = getCalendarDays(year, month);

  // Scheduling notice: compute earliest allowed time in Finnish timezone.
  // Override mode bypasses notice hours entirely — admin can pick any date from today.
  const noticeHours = minSchedulingNoticeHours ?? 0;
  const finnishNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
  const earliestFI = overrideMode
    ? (() => { const t = new Date(finnishNow); t.setHours(0, 0, 0, 0); return t; })()
    : noticeHours > 0
      ? new Date(finnishNow.getTime() + noticeHours * 60 * 60 * 1000)
      : (() => { const t = new Date(finnishNow); t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0); return t; })();
  const earliestDateKey = `${earliestFI.getFullYear()}-${String(earliestFI.getMonth() + 1).padStart(2, "0")}-${String(earliestFI.getDate()).padStart(2, "0")}`;
  const earliestMinuteOfDay = earliestFI.getHours() * 60 + earliestFI.getMinutes();

  // Step forward by the single-unit footprint (so multi-device bookings stay on
  // the single-wash grid), or the full duration if no step was provided, or 30min
  // if the admin toggled fine intervals. Fit/collision still uses slotDuration.
  const slotDuration = totalDuration || 60;
  const slotStep = use30MinIntervals ? 30 : (slotStepMinutes || slotDuration);

  /** Compute available ranges and occupied ranges for a single calendar on a date */
  function getCalendarRanges(calId: string, dateKey: string): { ranges: { start: number; end: number }[]; occupied: { start: number; end: number }[] } | null {
    if (dateKey < earliestDateKey) return null;
    const d = new Date(dateKey + "T00:00:00");
    let dow = d.getDay();
    if (dow === 0) dow = 7;

    // Override mode: full day range 06:00-22:00, ignore other bookings entirely
    if (overrideMode) {
      return { ranges: [{ start: 6 * 60, end: 22 * 60 }], occupied: [] };
    }

    const ws = allWeeklySlots[calId] || [];
    const ov = allOverrides[calId] || [];
    const dayOv = ov.filter((o) => o.date === dateKey);
    const blockedOvs = dayOv.filter((o) => o.override_type === "blocked");
    const available = dayOv.find((o) => o.override_type === "available");

    let ranges: { start: number; end: number }[] = [];
    for (const w of ws.filter((w) => w.day_of_week === dow)) {
      ranges.push({ start: timeToMinutes(w.start_time), end: timeToMinutes(w.end_time) });
    }
    if (available) {
      if (available.start_time && available.end_time) {
        ranges.push({ start: timeToMinutes(available.start_time), end: timeToMinutes(available.end_time) });
      } else {
        ranges.push({ start: 6 * 60, end: 22 * 60 });
      }
    }
    for (const blocked of blockedOvs) {
      if (!blocked.start_time) {
        ranges = [];
        break;
      } else {
        const bs = timeToMinutes(blocked.start_time);
        const be = blocked.end_time ? timeToMinutes(blocked.end_time) : 24 * 60;
        ranges = ranges.flatMap((r) => {
          if (bs >= r.end || be <= r.start) return [r];
          if (bs <= r.start && be >= r.end) return [];
          const res: typeof ranges = [];
          if (bs > r.start) res.push({ start: r.start, end: bs });
          if (be < r.end) res.push({ start: be, end: r.end });
          return res;
        });
      }
    }

    if (ranges.length === 0) return null;
    const occupied = existingBookings[`${calId}|${dateKey}`] || [];
    return { ranges, occupied };
  }

  // Calendars to use: in override mode show ALL active employees' calendars
  const effectiveCalendars = useMemo(() => {
    if (!overrideMode) return visibleCalendars;
    if (!allCalendars) return [];
    const activeEmpIds = new Set(allEmployees.filter((e) => e.active).map((e) => e.id));
    const cals = allCalendars.filter((c) => c.active && activeEmpIds.has(c.employee_id));
    if (filterEmployeeId) return cals.filter((c) => c.employee_id === filterEmployeeId);
    return cals;
  }, [overrideMode, visibleCalendars, allCalendars, allEmployees, filterEmployeeId]);

  // Optimization weights from company settings
  const [weights, setWeights] = useState({ distance: 40, workload: 30, route: 30 });
  useEffect(() => {
    supabase
      .from("company_settings")
      .select("optimization_weight_distance, optimization_weight_workload, optimization_weight_route")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setWeights({
            distance: data.optimization_weight_distance ?? 40,
            workload: data.optimization_weight_workload ?? 30,
            route: data.optimization_weight_route ?? 30,
          });
        }
      });
  }, []);

  // Compute distance scores for postal path ranking
  const employeeDistances = useMemo(() => {
    if (path !== "postal" || !postalCode) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const emp of allEmployees) {
      if (emp.postal_code) {
        const dist = postalDistanceKm(postalCode, emp.postal_code);
        if (dist !== null) map.set(emp.id, dist);
      }
    }
    return map;
  }, [path, postalCode, allEmployees]);

  // Week booking counts for workload scoring
  const weekBookingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [key, ranges] of Object.entries(existingBookings)) {
      const calId = key.split("|")[0];
      const cal = effectiveCalendars.find((c) => c.id === calId);
      if (!cal) continue;
      const current = counts.get(cal.employee_id) || 0;
      counts.set(cal.employee_id, current + ranges.length);
    }
    return counts;
  }, [existingBookings, effectiveCalendars]);

  // Same-day booking postal codes per employee (for route scoring)
  // Note: postal codes are fetched separately via sameDayRouteData below
  // sameDayPostalCodes replaced by sameDayRouteData below

  // Fetch same-day bookings with postal codes for route scoring
  const [sameDayRouteData, setSameDayRouteData] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    if (!selectedDate || path !== "postal") { setSameDayRouteData((prev) => prev.size === 0 ? prev : new Map()); return; }
    const empIds = effectiveCalendars.map((c) => c.employee_id);
    if (empIds.length === 0) return;
    supabase
      .from("bookings")
      .select("employee_id, postal_code")
      .in("employee_id", empIds)
      .eq("booking_date", selectedDate)
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .then(({ data }) => {
        const map = new Map<string, string[]>();
        for (const b of data || []) {
          if (b.postal_code) {
            const arr = map.get(b.employee_id) || [];
            arr.push(b.postal_code);
            map.set(b.employee_id, arr);
          }
        }
        setSameDayRouteData(map);
      });
  }, [selectedDate, path, effectiveCalendars]);

  // Find best employee for a set of slots (used for "Suositeltu" badge)
  function getBestEmployeeId(slots: SlotInfo[]): string | null {
    if (path !== "postal" || slots.length <= 1) return null;

    const totalWeight = (weights.distance + weights.workload + weights.route) || 1;
    const wD = weights.distance / totalWeight;
    const wW = weights.workload / totalWeight;
    const wR = weights.route / totalWeight;

    const maxDist = Math.max(...slots.map((s) => employeeDistances.get(s.employeeId) ?? 150), 1);
    const maxWork = Math.max(...slots.map((s) => weekBookingCounts.get(s.employeeId) ?? 0), 1);

    let bestId: string | null = null;
    let bestScore = -Infinity;

    for (const slot of slots) {
      // Distance score
      const dist = employeeDistances.get(slot.employeeId) ?? 150;
      const distScore = 1 - dist / maxDist;

      // Workload score
      const work = weekBookingCounts.get(slot.employeeId) ?? 0;
      const workScore = 1 - work / maxWork;

      // Route score — avg distance from customer to installer's same-day bookings
      let routeScore = 0.5; // neutral if no same-day bookings
      const sameDayCodes = sameDayRouteData.get(slot.employeeId);
      if (sameDayCodes && sameDayCodes.length > 0 && postalCode) {
        let sum = 0;
        let count = 0;
        for (const code of sameDayCodes) {
          const d = postalDistanceKm(postalCode, code);
          if (d !== null) { sum += d; count++; }
        }
        if (count > 0) {
          const avgDist = Math.min(sum / count, 150);
          routeScore = 1 - avgDist / 150;
        }
      }

      const score = wD * distScore + wW * workScore + wR * routeScore;
      if (score > bestScore) { bestScore = score; bestId = slot.employeeId; }
    }
    return bestId;
  }

  // Merge slots from all effective calendars using per-range cursor (matches public site logic)
  function getSlotsForDate(dk: string): SlotInfo[] {
    const calData: { cal: typeof effectiveCalendars[0]; ranges: { start: number; end: number }[]; occupied: { start: number; end: number }[] }[] = [];

    for (const cal of effectiveCalendars) {
      const data = getCalendarRanges(cal.id, dk);
      if (!data) continue;
      calData.push({ cal, ...data });
    }

    if (calData.length === 0) return [];

    const slots: SlotInfo[] = [];
    const earliestMinute = dk === earliestDateKey ? earliestMinuteOfDay : 0;
    const seen = new Set<string>();

    for (const { cal, ranges, occupied } of calData) {
      const sortedOccupied = [...occupied].sort((a, b) => a.start - b.start);

      for (const range of ranges) {
        let cursor = range.start;

        while (cursor + slotDuration <= range.end) {
          if (cursor < earliestMinute) {
            cursor += slotStep;
            continue;
          }

          const slotEnd = cursor + slotDuration;
          const blocker = sortedOccupied.find((occ) => cursor < occ.end && occ.start < slotEnd);

          if (!blocker) {
            const key = `${minutesToTime(cursor)}|${cal.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              slots.push({ time: minutesToTime(cursor), calendarId: cal.id, employeeId: cal.employee_id });
            }
            cursor += slotStep;
          } else {
            // Jump past the blocker
            cursor = blocker.end;
          }
        }
      }
    }

    return slots.sort((a, b) => a.time.localeCompare(b.time) || a.employeeId.localeCompare(b.employeeId));
  }

  // Group slots by time for the UI
  function groupSlotsByTime(slots: SlotInfo[]): Map<string, SlotInfo[]> {
    const map = new Map<string, SlotInfo[]>();
    for (const s of slots) {
      const arr = map.get(s.time);
      if (arr) arr.push(s);
      else map.set(s.time, [s]);
    }
    return map;
  }

  function makeDateKey(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Auto-navigate to first month with available slots
  useEffect(() => {
    if (selectedDate || !slotsLoaded || effectiveCalendars.length === 0) return;
    // Check if current month has any slots
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      if (getSlotsForDate(makeDateKey(day)).length > 0) return;
    }
    // Scan forward up to 6 months
    let y = year, m = month;
    for (let i = 0; i < 6; i++) {
      m++;
      if (m > 11) { m = 0; y++; }
      const dim = new Date(y, m + 1, 0).getDate();
      for (let day = 1; day <= dim; day++) {
        const dk = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (getSlotsForDate(dk).length > 0) {
          setCalMonth({ year: y, month: m });
          return;
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsLoaded, effectiveCalendars.length, year, month, overrideMode]);

  // Auto-select first available date on desktop
  useEffect(() => {
    if (selectedDate || !slotsLoaded || effectiveCalendars.length === 0) return;
    const isMobile = window.innerWidth < 640;
    if (isMobile) return;
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const dk = makeDateKey(day);
      if (getSlotsForDate(dk).length > 0) {
        setSelectedDate(dk);
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsLoaded, effectiveCalendars.length, year, month, overrideMode]);

  const selectedDateSlots = selectedDate ? getSlotsForDate(selectedDate) : [];
  const selectedDateGrouped = useMemo(() => groupSlotsByTime(selectedDateSlots), [selectedDateSlots]);

  function selectSlot(slot: SlotInfo) {
    setSelectedTime(slot.time);
    setSelectedEmployeeId(slot.employeeId);
    setSelectedCalendarId(slot.calendarId);
  }

  if (!slotsLoaded && calendarIds.length > 0) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-border rounded-xl w-48" />
          <div className="h-64 bg-surface rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Employee filter */}
      {!hideEmployeeFilter && (<div>
        <h3 className="font-semibold text-text-primary mb-3">Asentaja</h3>
        {!overrideMode && eligibleEmployees.length === 0 ? (
          <p className="text-sm text-text-muted">Ei sopivia asentajia{path === "postal" ? " tälle alueelle ja palveluille" : ""}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterEmployeeId(null)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all min-h-[44px] ${
                !filterEmployeeId
                  ? "bg-accent-muted text-accent-dark border-accent/30"
                  : "bg-surface text-text-secondary border-border hover:border-border-strong"
              }`}
            >
              Kuka tahansa
            </button>
            {(overrideMode ? allEmployees.filter((e) => e.active) : eligibleEmployees).map((emp) => (
              <button
                key={emp.id}
                onClick={() => setFilterEmployeeId(emp.id)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all min-h-[44px] ${
                  filterEmployeeId === emp.id
                    ? "bg-accent-muted text-accent-dark border-accent/30"
                    : "bg-surface text-text-secondary border-border hover:border-border-strong"
                }`}
              >
                {emp.first_name} {emp.last_name}
              </button>
            ))}
          </div>
        )}
      </div>)}

      {/* Admin toggles */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setOverrideMode(!overrideMode)}
          className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
            overrideMode
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-surface text-text-muted border-border hover:border-border-strong"
          }`}
        >
          {overrideMode ? "Ohitus päällä" : "Ohita saatavuus"}
        </button>
        <button
          onClick={() => setUse30MinIntervals(!use30MinIntervals)}
          className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
            use30MinIntervals
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "bg-surface text-text-muted border-border hover:border-border-strong"
          }`}
        >
          {use30MinIntervals ? "30 min välein" : "30 min välein"}
        </button>
      </div>

      {/* Calendar + Time slots */}
      {effectiveCalendars.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border p-5">
          <div className="flex flex-col sm:flex-row gap-5">
            {/* Calendar grid */}
            <div className="sm:w-[280px] flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => {
                  setCalMonth(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
                }} className="p-2 rounded-lg hover:bg-surface-hover transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-text-primary">{MONTH_NAMES_FI[month]} {year}</span>
                <button onClick={() => {
                  setCalMonth(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
                }} className="p-2 rounded-lg hover:bg-surface-hover transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-text-muted py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const dk = makeDateKey(day);
                  const slots = getSlotsForDate(dk);
                  const hasSlots = slots.length > 0;
                  const isSelected = dk === selectedDate;
                  return (
                    <button
                      key={i}
                      disabled={!hasSlots}
                      onClick={() => { setSelectedDate(dk); setSelectedTime(null); }}
                      className={`py-2.5 sm:py-2 rounded-lg text-xs font-medium transition-all min-w-[36px] min-h-[36px] ${
                        isSelected
                          ? "bg-accent text-white"
                          : hasSlots
                            ? "hover:bg-surface-hover text-text-primary"
                            : "text-text-muted/40 cursor-not-allowed"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div className="flex-1 sm:border-l sm:border-border sm:pl-5 border-t sm:border-t-0 pt-4 sm:pt-0">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                  {(() => {
                    const d = new Date(selectedDate + "T00:00:00");
                    const weekdays = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];
                    return `${weekdays[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
                  })()}
                </p>
                {selectedDateGrouped.size === 0 ? (
                  <p className="text-sm text-text-muted">Ei vapaita aikoja</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...selectedDateGrouped.entries()].map(([time, slots]) => {
                      const isTimeSelected = selectedTime === time;
                      const hasMultiple = slots.length > 1;

                      // If only one installer or employee filter active, show simple button
                      const isHighlighted = highlightTime === time;
                      if (!hasMultiple || filterEmployeeId) {
                        const slot = slots[0];
                        const emp = allEmployees.find((e) => e.id === slot.employeeId);
                        const isSlotSelected = selectedTime === slot.time && selectedCalendarId === slot.calendarId;
                        return (
                          <button
                            key={`${slot.calendarId}-${time}`}
                            onClick={() => selectSlot(slot)}
                            className={`px-4 py-2.5 sm:py-2 rounded-xl text-sm font-medium border transition-all min-h-[44px] ${
                              isSlotSelected
                                ? "bg-accent-muted text-accent-dark border-accent/30"
                                : isHighlighted
                                  ? "bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-200"
                                  : "bg-surface text-text-secondary border-border hover:border-border-strong"
                            }`}
                          >
                            <span>{time}</span>
                            {isHighlighted && !isSlotSelected && <span className="text-[10px] ml-1 opacity-60">nyk.</span>}
                            {!filterEmployeeId && emp && (
                              <span className="text-xs text-text-muted ml-1.5">({emp.first_name})</span>
                            )}
                          </button>
                        );
                      }

                      // Multiple installers available — show time with expandable installer list
                      const bestEmpId = getBestEmployeeId(slots);
                      // Sort: recommended first
                      const sortedSlots = bestEmpId
                        ? [...slots].sort((a, b) => (a.employeeId === bestEmpId ? -1 : b.employeeId === bestEmpId ? 1 : 0))
                        : slots;
                      return (
                        <div key={time} className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-3 py-2 rounded-xl text-sm font-semibold ${
                            isTimeSelected ? "text-accent-dark" : isHighlighted ? "text-blue-700" : "text-text-primary"
                          }`}>
                            {time}
                            {isHighlighted && !isTimeSelected && <span className="text-[10px] ml-1 opacity-60 font-normal">nyk.</span>}
                          </span>
                          {sortedSlots.map((slot) => {
                            const emp = allEmployees.find((e) => e.id === slot.employeeId);
                            const isSlotSelected = selectedTime === slot.time && selectedCalendarId === slot.calendarId;
                            const isBest = slot.employeeId === bestEmpId;
                            return (
                              <button
                                key={`${slot.calendarId}-${time}`}
                                onClick={() => selectSlot(slot)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all inline-flex items-center gap-1 ${
                                  isSlotSelected
                                    ? "bg-accent-muted text-accent-dark border-accent/30"
                                    : isBest
                                      ? "bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-300"
                                      : "bg-surface-alt text-text-secondary border-border hover:border-border-strong"
                                }`}
                              >
                                {isBest && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                                {emp ? `${emp.first_name} ${emp.last_name}` : "Asentaja"}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center gap-3 pt-4">
        <button onClick={onBack} className="px-6 py-3 sm:py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors min-h-[44px]">
          {backLabel}
        </button>
        <button disabled={!canProceed || isSubmitting} onClick={onNext}
          className="px-6 py-3 sm:py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 flex items-center gap-2 min-h-[44px]">
          {isSubmitting && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
