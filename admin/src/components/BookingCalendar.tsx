import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  CalendarDays,
  LayoutGrid,
  List,
  Ban,
  X,
  UserPlus,
} from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, MONTH_NAMES_FI, finnishNow, finnishToday, formatCents } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { useInstallerCalendars, useCreateOverride } from "@/hooks/useEmployees";
import { useMyTeam } from "@/hooks/useTeams";
import { useJoinBooking, fetchEmployeeConflicts } from "@/hooks/useBookingTeam";
import { useConfirm } from "@/context/ConfirmContext";
import { supabase } from "@/lib/supabase";
import type { Booking, Employee, Service, BookingStatus, CalendarOverride } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type ViewMode = "week" | "month" | "list";

const EMPLOYEE_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" },
  { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" },
  { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-200", dot: "bg-cyan-500" },
  { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" },
  { bg: "bg-lime-100", text: "text-lime-700", border: "border-lime-200", dot: "bg-lime-600" },
  { bg: "bg-pink-100", text: "text-pink-700", border: "border-pink-200", dot: "bg-pink-500" },
  { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200", dot: "bg-teal-500" },
  { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-500" },
];

const WEEK_DAY_LABELS = ["MAAN.", "TIIS.", "KESK.", "TORST.", "PERJ.", "LA", "SUNN."];
const MONTH_DAY_LABELS = ["MA", "TI", "KE", "TO", "PE", "LA", "SU"];


const STATUS_TABS: { key: BookingStatus | "all"; label: string }[] = [
  { key: "all", label: "Kaikki" },
  { key: "pending", label: "Odottaa" },
  { key: "confirmed", label: "Vahvistettu" },
  { key: "completed", label: "Valmis" },
  { key: "cancelled", label: "Peruutettu" },
];

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 7;
const END_HOUR = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  return finnishToday();
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Get Monday of the week containing `date`. */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fmtDay = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}.–${sunday.getDate()}.${sunday.getMonth() + 1}.${sunday.getFullYear()}`;
  }
  return `${fmtDay(monday)} – ${fmtDay(sunday)}${sunday.getFullYear()}`;
}

function formatListDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ["sunnuntai", "maanantai", "tiistai", "keskiviikko", "torstai", "perjantai", "lauantai"];
  return `${weekdays[dt.getDay()]} ${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BookingCalendarProps {
  bookings: Booking[];
  employees?: Employee[];
  services?: Service[];
  isLoading?: boolean;
  linkPrefix: string;
  /** When set, swaps the "Liikevaihto" KPI for the current employee's "Provisio". */
  currentEmployeeId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BookingCalendar({
  bookings,
  employees,
  services,
  isLoading,
  linkPrefix,
  currentEmployeeId,
}: BookingCalendarProps) {
  const confirm = useConfirm();
  const [view, setView] = useState<ViewMode>("week");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showOverrides, setShowOverrides] = useState(true);

  // Block form state
  const [blockEmployeeId, setBlockEmployeeId] = useState("");
  const [blockCalendarId, setBlockCalendarId] = useState("");
  const [blockDate, setBlockDate] = useState("");
  const [blockFullDay, setBlockFullDay] = useState(true);
  const [blockStartTime, setBlockStartTime] = useState("08:00");
  const [blockEndTime, setBlockEndTime] = useState("16:00");
  const [blockReason, setBlockReason] = useState("");
  const [blockGeneral, setBlockGeneral] = useState(false);
  const [blockError, setBlockError] = useState("");

  // Hooks for block form (only used when employees prop exists = admin view)
  const { data: allCalendars } = useInstallerCalendars();
  const createOverride = useCreateOverride();

  // Fetch all calendar overrides for display
  // Raw overrides (one per calendar_id row); render records are computed below
  // as the time-range intersection across each employee's active calendars,
  // so a block on a single calendar (e.g. Päijät-Häme) doesn't visually cover
  // an employee whose other calendar (e.g. PK-Seutu) is still open.
  const [rawOverrides, setRawOverrides] = useState<(CalendarOverride & { employee_id: string })[]>([]);

  // Week / month navigation anchor
  const [anchor, setAnchor] = useState(() => new Date());

  const today = todayStr();
  const gridRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(finnishNow());

  // Update clock every minute for the red line
  useEffect(() => {
    const id = setInterval(() => setNow(finnishNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Employee color map
  const employeeColorMap = useMemo(() => {
    const map = new Map<string, (typeof EMPLOYEE_COLORS)[0]>();
    if (employees) {
      employees.forEach((e, i) => {
        map.set(e.id, EMPLOYEE_COLORS[i % EMPLOYEE_COLORS.length]);
      });
    }
    return map;
  }, [employees]);

  function getEmployeeColor(employeeId: string | null) {
    if (!employeeId) return EMPLOYEE_COLORS[0];
    return employeeColorMap.get(employeeId) ?? EMPLOYEE_COLORS[0];
  }

  // ---------- Fetch overrides ----------

  // Build a calendar→employee lookup
  const calendarEmployeeMap = useMemo(() => {
    const map = new Map<string, string>();
    if (allCalendars) {
      for (const c of allCalendars) map.set(c.id, c.employee_id);
    }
    return map;
  }, [allCalendars]);

  useEffect(() => {
    if (!employees || !allCalendars || allCalendars.length === 0) return;
    const calIds = allCalendars.filter((c) => c.active).map((c) => c.id);
    if (calIds.length === 0) return;

    supabase
      .from("calendar_overrides")
      .select("*")
      .in("calendar_id", calIds)
      .eq("override_type", "blocked")
      .then(({ data }) => {
        if (!data) return;
        const enriched = (data as CalendarOverride[]).map((ov) => ({
          ...ov,
          employee_id: calendarEmployeeMap.get(ov.calendar_id) ?? "",
        }));
        setRawOverrides(enriched);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCalendars, employees, createOverride.isSuccess]);

  // Build a set of "date|employee_id|start_time" keys for existing bookings
  // so we can hide google_calendar_sync overrides that exactly mirror our own bookings
  const bookingTimeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const b of bookings) {
      if (b.employee_id && b.status !== "cancelled") {
        keys.add(`${b.booking_date}|${b.employee_id}|${b.time_slot}`);
      }
    }
    return keys;
  }, [bookings]);

  // Per-employee list of active calendar ids
  const employeeCalendarIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of allCalendars || []) {
      if (!c.active) continue;
      const list = map.get(c.employee_id) ?? [];
      list.push(c.id);
      map.set(c.employee_id, list);
    }
    return map;
  }, [allCalendars]);

  // Group overrides by date — a block is rendered for an employee only on
  // the time ranges where ALL of that employee's active calendars are
  // blocked. A calendar with no block contributes "open everywhere" and
  // therefore empties the intersection — so a single Päijät-Häme block
  // doesn't visually cover PK-Seutu when that calendar is still open.
  const overridesByDate = useMemo(() => {
    type Range = { start: number; end: number; ids: string[]; reasons: (string | null)[]; allFullDay: boolean };

    function toRange(ov: CalendarOverride): Range {
      const isFullDay = !ov.start_time || !ov.end_time;
      return {
        start: isFullDay ? 0 : timeToMinutes(ov.start_time!),
        end: isFullDay ? 24 * 60 : timeToMinutes(ov.end_time!),
        ids: [ov.id],
        reasons: [ov.reason],
        allFullDay: isFullDay,
      };
    }

    function mergeRanges(rs: Range[]): Range[] {
      if (rs.length === 0) return [];
      const sorted = [...rs].sort((a, b) => a.start - b.start);
      const out: Range[] = [{ ...sorted[0], ids: [...sorted[0].ids], reasons: [...sorted[0].reasons] }];
      for (let i = 1; i < sorted.length; i++) {
        const last = out[out.length - 1];
        const cur = sorted[i];
        if (cur.start <= last.end) {
          last.end = Math.max(last.end, cur.end);
          for (const id of cur.ids) if (!last.ids.includes(id)) last.ids.push(id);
          last.reasons.push(...cur.reasons);
          last.allFullDay = last.allFullDay && cur.allFullDay;
        } else {
          out.push({ ...cur, ids: [...cur.ids], reasons: [...cur.reasons] });
        }
      }
      return out;
    }

    function intersect(a: Range[], b: Range[]): Range[] {
      const out: Range[] = [];
      for (const r1 of a) {
        for (const r2 of b) {
          const s = Math.max(r1.start, r2.start);
          const e = Math.min(r1.end, r2.end);
          if (e > s) {
            const ids: string[] = [];
            for (const id of [...r1.ids, ...r2.ids]) if (!ids.includes(id)) ids.push(id);
            out.push({
              start: s,
              end: e,
              ids,
              reasons: [...r1.reasons, ...r2.reasons],
              allFullDay: r1.allFullDay && r2.allFullDay,
            });
          }
        }
      }
      return out;
    }

    // Group raw overrides by date → employee → calendar
    const byDateEmpCal = new Map<string, Map<string, Map<string, Range[]>>>();
    for (const ov of rawOverrides) {
      if (selectedEmployees.size > 0 && !selectedEmployees.has(ov.employee_id)) continue;
      // Hide google_calendar_sync overrides that exactly match a booking's start time
      if (
        ov.reason === "google_calendar_sync" &&
        ov.start_time &&
        bookingTimeKeys.has(`${ov.date}|${ov.employee_id}|${ov.start_time.slice(0, 5)}`)
      ) {
        continue;
      }
      let byEmp = byDateEmpCal.get(ov.date);
      if (!byEmp) { byEmp = new Map(); byDateEmpCal.set(ov.date, byEmp); }
      let byCal = byEmp.get(ov.employee_id);
      if (!byCal) { byCal = new Map(); byEmp.set(ov.employee_id, byCal); }
      const list = byCal.get(ov.calendar_id) ?? [];
      list.push(toRange(ov));
      byCal.set(ov.calendar_id, list);
    }

    const result: Record<string, (CalendarOverride & { employee_id: string; underlying_ids: string[] })[]> = {};

    for (const [date, byEmp] of byDateEmpCal) {
      for (const [empId, byCal] of byEmp) {
        const empCals = employeeCalendarIds.get(empId) ?? [];
        if (empCals.length === 0) continue;

        // Every active calendar must contribute a block for the intersection to be non-empty
        let intersection: Range[] | null = null;
        let allHaveBlock = true;
        for (const calId of empCals) {
          const calRanges = byCal.get(calId);
          if (!calRanges || calRanges.length === 0) { allHaveBlock = false; break; }
          const merged = mergeRanges(calRanges);
          intersection = intersection === null ? merged : intersect(intersection, merged);
          if (intersection.length === 0) break;
        }
        if (!allHaveBlock || !intersection || intersection.length === 0) continue;

        for (const r of intersection) {
          const isFullDay = r.allFullDay && r.start <= 0 && r.end >= 24 * 60;
          const toTimeStr = (m: number) =>
            `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
          const reasons = r.reasons.filter((x): x is string => !!x);
          const uniqueReasons: string[] = [];
          for (const x of reasons) if (!uniqueReasons.includes(x)) uniqueReasons.push(x);
          const synth: CalendarOverride & { employee_id: string; underlying_ids: string[] } = {
            id: `${date}|${empId}|${r.start}|${r.end}`,
            calendar_id: "",
            date,
            start_time: isFullDay ? null : toTimeStr(r.start),
            end_time: isFullDay ? null : toTimeStr(r.end),
            override_type: "blocked",
            reason: uniqueReasons.length > 0 ? uniqueReasons.join(", ") : null,
            created_at: "",
            employee_id: empId,
            underlying_ids: r.ids,
          };
          (result[date] ||= []).push(synth);
        }
      }
    }
    return result;
  }, [rawOverrides, selectedEmployees, bookingTimeKeys, employeeCalendarIds]);

  // ---------- Filtering ----------

  const filteredBookings = useMemo(() => {
    let list = bookings;
    if (statusFilter === "all") {
      list = list.filter((b) => b.status !== "cancelled");
    } else {
      list = list.filter((b) => b.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((b) => {
        const name = `${b.customers?.first_name ?? ""} ${b.customers?.last_name ?? ""}`.toLowerCase();
        return name.includes(q);
      });
    }
    if (selectedEmployees.size > 0) {
      list = list.filter((b) => {
        if (b.employee_id && selectedEmployees.has(b.employee_id)) return true;
        const team = (b.booking_employees || []) as Array<{ employee_id: string }>;
        return team.some((be) => selectedEmployees.has(be.employee_id));
      });
    }
    if (selectedServices.size > 0) {
      list = list.filter((b) => b.service_id && selectedServices.has(b.service_id));
    }
    return list;
  }, [bookings, statusFilter, search, selectedEmployees, selectedServices]);

  // ---------- Week helpers ----------

  const monday = useMemo(() => getMonday(anchor), [anchor]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  const weekBookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of filteredBookings) {
      (map[b.booking_date] ||= []).push(b);
    }
    return map;
  }, [filteredBookings]);

  // ---------- Month helpers ----------

  const monthYear = anchor.getFullYear();
  const monthMonth = anchor.getMonth();

  const monthGrid = useMemo(() => {
    const firstDay = new Date(monthYear, monthMonth, 1);
    const startDay = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(monthYear, monthMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [monthYear, monthMonth]);

  // ---------- List helpers ----------

  const listBookings = useMemo(() => {
    const sorted = [...filteredBookings].sort((a, b) => {
      const dc = a.booking_date.localeCompare(b.booking_date);
      return dc !== 0 ? dc : a.time_slot.localeCompare(b.time_slot);
    });
    // Filter to visible period
    if (view === "week") {
      const from = fmtDateKey(monday);
      const to = fmtDateKey(addDays(monday, 6));
      return sorted.filter((b) => b.booking_date >= from && b.booking_date <= to);
    }
    if (view === "month") {
      const from = dateKey(monthYear, monthMonth, 1);
      const to = dateKey(monthYear, monthMonth, new Date(monthYear, monthMonth + 1, 0).getDate());
      return sorted.filter((b) => b.booking_date >= from && b.booking_date <= to);
    }
    // list view: show current month range
    const from = dateKey(monthYear, monthMonth, 1);
    const to = dateKey(monthYear, monthMonth, new Date(monthYear, monthMonth + 1, 0).getDate());
    return sorted.filter((b) => b.booking_date >= from && b.booking_date <= to);
  }, [filteredBookings, view, monday, monthYear, monthMonth]);

  const listGrouped = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of listBookings) {
      (map[b.booking_date] ||= []).push(b);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [listBookings]);

  // ---------- KPIs (visible period + active filters) ----------

  const kpis = useMemo(() => {
    let pending = 0, confirmed = 0, completed = 0;
    let revenueCents = 0;
    let completedRevenueCents = 0;
    let unpaidCount = 0;
    let unpaidCents = 0;
    let commissionCents = 0;
    let completedCommissionCents = 0;
    for (const b of listBookings) {
      if (b.status === "cancelled") continue;
      if (b.status === "pending") pending++;
      else if (b.status === "confirmed") confirmed++;
      else if (b.status === "completed") completed++;
      const price = b.price_cents || 0;
      revenueCents += price;
      if (currentEmployeeId) {
        const be = (b.booking_employees || []).find((x) => x.employee_id === currentEmployeeId);
        const myComm = be ? (be.commission_override_cents ?? be.commission_cents ?? 0) : 0;
        commissionCents += myComm;
        if (b.status === "completed") completedCommissionCents += myComm;
      }
      if (b.status === "completed") {
        completedRevenueCents += price;
        if (b.payment_status === "unpaid") {
          unpaidCount++;
          unpaidCents += price;
        }
      }
    }
    const total = pending + confirmed + completed;
    const avgCents = total > 0 ? Math.round(revenueCents / total) : 0;
    return { total, pending, confirmed, completed, revenueCents, completedRevenueCents, unpaidCount, unpaidCents, avgCents, commissionCents, completedCommissionCents };
  }, [listBookings, currentEmployeeId]);

  // ---------- Per-employee revenue for visible period ----------
  // Ignores employee/service chip filters so chip ordering stays stable when
  // toggling them, but respects the current view (week/month) and status filter.
  const employeeRevenueMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!employees || employees.length === 0) return map;
    let from: string, to: string;
    if (view === "week") {
      from = fmtDateKey(monday);
      to = fmtDateKey(addDays(monday, 6));
    } else {
      from = dateKey(monthYear, monthMonth, 1);
      to = dateKey(monthYear, monthMonth, new Date(monthYear, monthMonth + 1, 0).getDate());
    }
    for (const b of bookings) {
      if (!b.employee_id) continue;
      if (b.booking_date < from || b.booking_date > to) continue;
      if (statusFilter === "all") {
        if (b.status === "cancelled") continue;
      } else if (b.status !== statusFilter) continue;
      map.set(b.employee_id, (map.get(b.employee_id) ?? 0) + (b.price_cents || 0));
    }
    return map;
  }, [bookings, employees, view, monday, monthYear, monthMonth, statusFilter]);

  const sortedEmployees = useMemo(() => {
    if (!employees) return [] as Employee[];
    return [...employees].sort((a, b) => {
      const ra = employeeRevenueMap.get(a.id) ?? 0;
      const rb = employeeRevenueMap.get(b.id) ?? 0;
      if (rb !== ra) return rb - ra;
      return (a.first_name || "").localeCompare(b.first_name || "");
    });
  }, [employees, employeeRevenueMap]);

  // ---------- Navigation ----------

  function goToday() {
    setAnchor(new Date());
  }

  function goPrev() {
    if (view === "week") {
      setAnchor((a) => addDays(a, -7));
    } else {
      setAnchor((a) => {
        const d = new Date(a);
        d.setMonth(d.getMonth() - 1);
        return d;
      });
    }
  }

  function goNext() {
    if (view === "week") {
      setAnchor((a) => addDays(a, 7));
    } else {
      setAnchor((a) => {
        const d = new Date(a);
        d.setMonth(d.getMonth() + 1);
        return d;
      });
    }
  }

  function toggleEmployee(id: string) {
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleService(id: string) {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goToDayInWeek(d: Date) {
    setAnchor(d);
    setView("week");
  }

  // Block form helpers
  const blockEmployeeCalendars = useMemo(() => {
    if (!allCalendars || !blockEmployeeId) return [];
    return allCalendars.filter((c) => c.employee_id === blockEmployeeId && c.active);
  }, [allCalendars, blockEmployeeId]);

  function resetBlockForm() {
    setBlockEmployeeId("");
    setBlockCalendarId("");
    setBlockDate("");
    setBlockFullDay(true);
    setBlockStartTime("08:00");
    setBlockEndTime("16:00");
    setBlockReason("");
    setBlockGeneral(false);
    setBlockError("");
    setShowBlockForm(false);
  }

  async function handleCreateBlock(ev: React.FormEvent) {
    ev.preventDefault();
    setBlockError("");
    if (!blockDate || !blockEmployeeId) return;

    const overrideData = {
      date: blockDate,
      start_time: blockFullDay ? null : blockStartTime,
      end_time: blockFullDay ? null : blockEndTime,
      override_type: "blocked" as const,
      reason: blockReason || undefined,
    };

    try {
      if (blockGeneral) {
        // General block: create overrides for ALL active calendars of this employee
        const empCalendars = (allCalendars || []).filter(
          (c) => c.employee_id === blockEmployeeId && c.active
        );
        for (const cal of empCalendars) {
          await createOverride.mutateAsync({ calendar_id: cal.id, ...overrideData });
        }

        // Also create Google Calendar event
        const emp = employees?.find((e) => e.id === blockEmployeeId);
        if (emp?.google_calendar_id) {
          const { error: fnError } = await supabase.functions.invoke(
            "create-block-calendar-event",
            {
              body: {
                employee_id: blockEmployeeId,
                date: blockDate,
                start_time: blockFullDay ? null : blockStartTime,
                end_time: blockFullDay ? null : blockEndTime,
                reason: blockReason || null,
              },
            }
          );
          if (fnError) {
            console.error("Google Calendar block error:", fnError);
            setBlockError("Blokkaus luotu, mutta Google-kalenteritapahtuman luonti epäonnistui");
            return;
          }
        }
      } else {
        // Calendar-specific block
        if (!blockCalendarId) return;
        await createOverride.mutateAsync({ calendar_id: blockCalendarId, ...overrideData });
      }
      resetBlockForm();
    } catch (err) {
      setBlockError(err instanceof Error ? err.message : "Blokkaus epäonnistui");
    }
  }

  // Delete override — removes every raw row that contributes to the rendered block.
  // The render record carries `underlying_ids` (collected during intersection)
  // so general blocks (one row per calendar) clean up in one shot.
  async function handleDeleteOverride(ov: CalendarOverride & { employee_id: string; underlying_ids?: string[] }) {
    if (!await confirm({ message: "Poistetaanko blokkaus?", confirmLabel: "Poista", variant: "danger" })) return;

    const matchingIds = new Set(
      ov.underlying_ids && ov.underlying_ids.length > 0
        ? ov.underlying_ids
        : rawOverrides
            .filter((r) => r.date === ov.date && r.employee_id === ov.employee_id && r.start_time === ov.start_time && r.end_time === ov.end_time)
            .map((m) => m.id)
    );

    // Optimistically remove from state so UI updates immediately
    setRawOverrides((prev) => prev.filter((o) => !matchingIds.has(o.id)));

    // Delete from DB directly (bypass hook to avoid re-fetch race)
    for (const id of matchingIds) {
      await supabase.from("calendar_overrides").delete().eq("id", id);
    }

    // Also delete the Google Calendar event if employee has a calendar
    const emp = employees?.find((e) => e.id === ov.employee_id);
    if (emp?.google_calendar_id) {
      supabase.functions.invoke("delete-block-calendar-event", {
        body: {
          employee_id: ov.employee_id,
          date: ov.date,
          start_time: ov.start_time || null,
          end_time: ov.end_time || null,
        },
      }).catch((err) => console.error("Google Calendar delete error:", err));
    }
  }

  // ---------- Period label ----------

  const periodLabel =
    view === "week"
      ? formatWeekRange(monday)
      : `${MONTH_NAMES_FI[monthMonth]} ${monthYear}`;

  // ---------- Current time line position ----------

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowOffset = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const showTimeLine = view === "week" && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60;
  const nowDayIndex = (() => {
    const dow = now.getDay();
    return dow === 0 ? 6 : dow - 1;
  })();
  const nowInCurrentWeek =
    view === "week" &&
    fmtDateKey(now) >= fmtDateKey(monday) &&
    fmtDateKey(now) <= fmtDateKey(addDays(monday, 6));

  // ---------- Render ----------

  return (
    <div className="space-y-4">
      {/* ===== Top row: search + status tabs ===== */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Hae asiakkaalla..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>

        {/* Status tabs */}
        <div className="flex flex-nowrap gap-1 overflow-x-auto w-full sm:w-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === tab.key
                  ? "bg-brand text-white"
                  : "bg-surface-alt text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Second row: view toggle + nav + employee chips ===== */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode toggle */}
          <div className="flex bg-surface-alt rounded-xl p-0.5">
            {([
              { key: "week" as ViewMode, label: "Viikko", icon: CalendarDays },
              { key: "month" as ViewMode, label: "Kuukausi", icon: LayoutGrid },
              { key: "list" as ViewMode, label: "Lista", icon: List },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  view === key
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              className="p-2 rounded-xl hover:bg-surface-hover transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-text-secondary" />
            </button>
            <button
              onClick={goNext}
              className="p-2 rounded-xl hover:bg-surface-hover transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-text-secondary" />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowMonthPicker(!showMonthPicker)}
              className="text-sm font-semibold text-text-primary whitespace-nowrap hover:text-accent-dark transition-colors cursor-pointer"
            >
              {periodLabel}
            </button>

            {showMonthPicker && (
              <div className="absolute left-0 top-full mt-2 bg-surface border border-border rounded-2xl shadow-lg p-4 z-30 min-w-[280px]">
                {/* Year row */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setAnchor(new Date(anchor.getFullYear() - 1, anchor.getMonth(), 1))}
                    className="p-1 rounded-lg hover:bg-surface-hover transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-text-muted" />
                  </button>
                  <span className="text-sm font-bold text-text-primary">{anchor.getFullYear()}</span>
                  <button
                    onClick={() => setAnchor(new Date(anchor.getFullYear() + 1, anchor.getMonth(), 1))}
                    className="p-1 rounded-lg hover:bg-surface-hover transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  </button>
                </div>
                {/* Month grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTH_NAMES_FI.map((name, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setAnchor(new Date(anchor.getFullYear(), i, 1));
                        setShowMonthPicker(false);
                      }}
                      className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                        i === anchor.getMonth()
                          ? "bg-brand text-white"
                          : "text-text-secondary hover:bg-surface-hover"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-alt text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            Tänään
          </button>

          {employees && employees.length > 0 && (<>
            <button
              onClick={() => setShowBlockForm(!showBlockForm)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                showBlockForm
                  ? "bg-red-50 text-red-600 border border-red-200"
                  : "bg-surface-alt text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <Ban className="w-3.5 h-3.5" />
              Blokkaa
            </button>
            <button
              onClick={() => setShowOverrides((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                showOverrides
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-surface-alt text-text-secondary hover:bg-surface-hover"
              }`}
              title={showOverrides ? "Piilota estot" : "Näytä estot"}
            >
              <Ban className="w-3.5 h-3.5" />
              Estot
            </button>
          </>)}
        </div>

      </div>

      {/* ===== Employee chips (sorted by period revenue, wraps to all visible) ===== */}
      {employees && employees.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sortedEmployees.map((emp) => {
            const color = getEmployeeColor(emp.id);
            const active = selectedEmployees.size === 0 || selectedEmployees.has(emp.id);
            const revenue = employeeRevenueMap.get(emp.id) ?? 0;
            return (
              <button
                key={emp.id}
                onClick={() => toggleEmployee(emp.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                  active
                    ? `${color.bg} ${color.text} ${color.border}`
                    : "bg-surface-alt text-text-muted border-border opacity-50"
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? color.dot : "bg-gray-300"}`} />
                {emp.first_name}
                {revenue > 0 && (
                  <span className="text-[10px] font-semibold opacity-70 tabular-nums">
                    {formatCents(revenue)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ===== Service filter chips ===== */}
      {services && services.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {services.filter((s) => s.active).map((svc) => {
            const active = selectedServices.size === 0 || selectedServices.has(svc.id);
            return (
              <button
                key={svc.id}
                onClick={() => toggleService(svc.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                  active
                    ? "bg-accent/10 text-accent border-accent/30"
                    : "bg-surface-alt text-text-muted border-border opacity-50"
                }`}
              >
                {svc.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ===== KPIs (visible period) ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-surface rounded-xl border border-border p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">Keikat</div>
          <div className="text-lg font-bold text-text-primary leading-tight">{kpis.total}</div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {kpis.confirmed} vahv. · {kpis.completed} valm. · {kpis.pending} odot.
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
            {currentEmployeeId ? "Provisio" : "Liikevaihto"}
          </div>
          <div className="text-lg font-bold text-text-primary leading-tight">
            {formatCents(currentEmployeeId ? kpis.commissionCents : kpis.revenueCents)}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            Valmiit: {formatCents(currentEmployeeId ? kpis.completedCommissionCents : kpis.completedRevenueCents)}
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">Keskihinta</div>
          <div className="text-lg font-bold text-text-primary leading-tight">
            {kpis.avgCents > 0 ? formatCents(kpis.avgCents) : "—"}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">/ keikka</div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">Maksamatta</div>
          <div className={`text-lg font-bold leading-tight ${kpis.unpaidCents > 0 ? "text-amber-700" : "text-text-primary"}`}>
            {formatCents(kpis.unpaidCents)}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">{kpis.unpaidCount} valmista keikkaa</div>
        </div>
      </div>

      {/* ===== Block form ===== */}
      {showBlockForm && employees && (
        <form onSubmit={handleCreateBlock} className="bg-surface rounded-2xl border border-red-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Blokkaa kalenteriaika</h3>
            <button type="button" onClick={resetBlockForm} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {blockError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{blockError}</div>
          )}

          {/* Block type toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setBlockGeneral(false); setBlockCalendarId(""); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                !blockGeneral
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-surface text-text-secondary border-border hover:border-border-strong"
              }`}
            >
              Kalenterikohtainen
            </button>
            <button
              type="button"
              onClick={() => { setBlockGeneral(true); setBlockCalendarId(""); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                blockGeneral
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-surface text-text-secondary border-border hover:border-border-strong"
              }`}
            >
              Yleinen esto
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Employee */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Asentaja *</label>
              <select
                required
                value={blockEmployeeId}
                onChange={(e) => { setBlockEmployeeId(e.target.value); setBlockCalendarId(""); }}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300"
              >
                <option value="">Valitse...</option>
                {employees.filter((e) => e.active).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                    {blockGeneral && !emp.google_calendar_id ? " (ei Google-kalenteria)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Calendar (only for calendar-specific block) */}
            {!blockGeneral && (
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Kalenteri *</label>
                <select
                  required
                  value={blockCalendarId}
                  onChange={(e) => setBlockCalendarId(e.target.value)}
                  disabled={!blockEmployeeId}
                  className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 disabled:opacity-50"
                >
                  <option value="">Valitse...</option>
                  {blockEmployeeCalendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>{cal.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Päivä *</label>
              <DatePicker
                value={blockDate}
                onChange={setBlockDate}
                placeholder="Valitse päivä"
                className="w-full"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Syy</label>
              <input
                type="text"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Vapaaehtoinen"
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300"
              />
            </div>
          </div>

          {/* General block info */}
          {blockGeneral && blockEmployeeId && (
            <p className="text-xs text-text-muted">
              Estää kaikki asentajan kalenterit ({blockEmployeeCalendars.length} kpl)
              {employees.find((e) => e.id === blockEmployeeId)?.google_calendar_id
                ? " ja luo tapahtuman Google-kalenteriin"
                : ""}
            </p>
          )}

          {/* Full day vs time range */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={blockFullDay}
                onChange={(e) => setBlockFullDay(e.target.checked)}
                className="rounded border-border text-red-500 focus:ring-red-200"
              />
              <span className="text-text-secondary">Koko päivä</span>
            </label>
            {!blockFullDay && (
              <div className="flex items-center gap-2">
                <TimePicker value={blockStartTime} onChange={setBlockStartTime} placeholder="Alku" />
                <span className="text-text-muted">–</span>
                <TimePicker value={blockEndTime} onChange={setBlockEndTime} placeholder="Loppu" />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createOverride.isPending || (!blockGeneral && !blockCalendarId) || !blockDate || !blockEmployeeId}
              className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {createOverride.isPending ? "Tallennetaan..." : "Blokkaa"}
            </button>
            <button
              type="button"
              onClick={resetBlockForm}
              className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Peruuta
            </button>
          </div>
        </form>
      )}

      {/* ===== Loading ===== */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ===== Week view ===== */}
      {!isLoading && view === "week" && (
        <WeekView
          weekDates={weekDates}
          bookingsByDate={weekBookingsByDate}
          overridesByDate={showOverrides ? overridesByDate : {}}
          getEmployeeColor={getEmployeeColor}
          employees={employees}
          onDeleteOverride={handleDeleteOverride}
          today={today}
          linkPrefix={linkPrefix}
          showTimeLine={showTimeLine && nowInCurrentWeek}
          nowOffset={nowOffset}
          nowDayIndex={nowDayIndex}
          gridRef={gridRef}
          currentEmployeeId={currentEmployeeId}
        />
      )}

      {/* ===== Month view ===== */}
      {!isLoading && view === "month" && (
        <MonthView
          year={monthYear}
          month={monthMonth}
          grid={monthGrid}
          bookingsByDate={weekBookingsByDate}
          overridesByDate={showOverrides ? overridesByDate : {}}
          getEmployeeColor={getEmployeeColor}
          employees={employees}
          onDeleteOverride={handleDeleteOverride}
          today={today}
          onDayClick={goToDayInWeek}
          currentEmployeeId={currentEmployeeId}
        />
      )}

      {/* ===== List view ===== */}
      {!isLoading && view === "list" && (
        <ListView
          grouped={listGrouped}
          today={today}
          getEmployeeColor={getEmployeeColor}
          linkPrefix={linkPrefix}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Week View
// ===========================================================================

interface WeekViewProps {
  weekDates: Date[];
  bookingsByDate: Record<string, Booking[]>;
  overridesByDate: Record<string, (CalendarOverride & { employee_id: string; underlying_ids: string[] })[]>;
  getEmployeeColor: (id: string | null) => (typeof EMPLOYEE_COLORS)[0];
  employees?: Employee[];
  onDeleteOverride: (ov: CalendarOverride & { employee_id: string; underlying_ids: string[] }) => void;
  today: string;
  linkPrefix: string;
  showTimeLine: boolean;
  nowOffset: number;
  nowDayIndex: number;
  gridRef: React.RefObject<HTMLDivElement | null>;
  currentEmployeeId?: string;
}

function WeekView({
  weekDates,
  bookingsByDate,
  overridesByDate,
  getEmployeeColor,
  employees,
  onDeleteOverride,
  today,
  linkPrefix,
  showTimeLine,
  nowOffset,
  nowDayIndex,
  gridRef,
  currentEmployeeId,
}: WeekViewProps) {
  const confirm = useConfirm();
  const joinBooking = useJoinBooking();
  const { data: myTeamRow } = useMyTeam(currentEmployeeId);
  const myTeammateIds = useMemo(() => {
    const ids = new Set<string>();
    if (!myTeamRow?.team_id) return ids;
    for (const m of (myTeamRow.members || []) as Array<{ employee_id: string }>) {
      ids.add(m.employee_id);
    }
    return ids;
  }, [myTeamRow]);
  // Compute overlap groups for each day
  const dayColumns = useMemo(() => {
    const result: Record<string, { booking: Booking; col: number; totalCols: number }[]> = {};
    for (const d of weekDates) {
      const key = fmtDateKey(d);
      const dayBookings = (bookingsByDate[key] || [])
        .slice()
        .sort((a, b) => a.time_slot.localeCompare(b.time_slot));

      if (dayBookings.length === 0) {
        result[key] = [];
        continue;
      }

      // Assign columns for overlapping bookings
      const items: { booking: Booking; startMin: number; endMin: number; col: number }[] = [];
      for (const b of dayBookings) {
        const startMin = timeToMinutes(b.time_slot);
        const dur = b.duration_minutes || b.services?.duration_minutes || 60;
        const endMin = startMin + dur;
        items.push({ booking: b, startMin, endMin, col: 0 });
      }

      // Greedy column assignment
      for (let i = 0; i < items.length; i++) {
        const usedCols = new Set<number>();
        for (let j = 0; j < i; j++) {
          if (items[j].endMin > items[i].startMin && items[j].startMin < items[i].endMin) {
            usedCols.add(items[j].col);
          }
        }
        let col = 0;
        while (usedCols.has(col)) col++;
        items[i].col = col;
      }

      // Determine total cols per overlap group
      const groups: number[][] = [];
      for (let i = 0; i < items.length; i++) {
        let placed = false;
        for (const group of groups) {
          const overlaps = group.some(
            (j) => items[j].endMin > items[i].startMin && items[j].startMin < items[i].endMin
          );
          if (overlaps) {
            group.push(i);
            placed = true;
            break;
          }
        }
        if (!placed) groups.push([i]);
      }

      // Merge overlapping groups
      const merged: number[][] = [];
      for (const group of groups) {
        let didMerge = false;
        for (const mg of merged) {
          const overlaps = group.some((gi) =>
            mg.some(
              (mi) =>
                items[mi].endMin > items[gi].startMin && items[mi].startMin < items[gi].endMin
            )
          );
          if (overlaps) {
            mg.push(...group);
            didMerge = true;
            break;
          }
        }
        if (!didMerge) merged.push([...group]);
      }

      const totalColsMap = new Map<number, number>();
      for (const mg of merged) {
        const maxCol = Math.max(...mg.map((i) => items[i].col)) + 1;
        for (const i of mg) totalColsMap.set(i, maxCol);
      }

      result[key] = items.map((it, i) => ({
        booking: it.booking,
        col: it.col,
        totalCols: totalColsMap.get(i) ?? 1,
      }));
    }
    return result;
  }, [weekDates, bookingsByDate]);

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="overflow-x-auto" ref={gridRef}>
      {/* Day headers */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: "56px repeat(7, 1fr)", minWidth: 700 }}>
        <div className="border-r border-border" />
        {weekDates.map((d, i) => {
          const key = fmtDateKey(d);
          const isToday = key === today;
          return (
            <div
              key={key}
              className={`text-center py-3 border-r border-border last:border-r-0 ${
                isToday ? "bg-accent-muted/30" : ""
              }`}
            >
              <div className="text-[10px] font-semibold text-text-muted tracking-wider">
                {WEEK_DAY_LABELS[i]}
              </div>
              <div
                className={`text-lg font-bold mt-0.5 ${
                  isToday
                    ? "w-8 h-8 mx-auto rounded-full bg-brand text-white flex items-center justify-center"
                    : "text-text-primary"
                }`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div>
        <div
          className="relative"
          style={{
            height: HOURS.length * HOUR_HEIGHT,
            minWidth: 700,
          }}
        >
          <div
            className="grid h-full"
            style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}
          >
            {/* Time labels column */}
            <div className="relative border-r border-border">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 flex items-start justify-end pr-2"
                  style={{ top: (h - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                >
                  <span className="text-[10px] text-text-muted -mt-1.5 font-medium">
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDates.map((d, dayIdx) => {
              const key = fmtDateKey(d);
              const isToday = key === today;
              const items = dayColumns[key] || [];

              return (
                <div
                  key={key}
                  className={`relative border-r border-border last:border-r-0 ${
                    isToday ? "bg-accent-muted/10" : ""
                  }`}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-border/50"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Booking blocks */}
                  {items.map(({ booking, col, totalCols }) => {
                    const startMin = timeToMinutes(booking.time_slot);
                    const dur = booking.duration_minutes || booking.services?.duration_minutes || 60;
                    const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height = Math.max((dur / 60) * HOUR_HEIGHT, 24);
                    const color = getEmployeeColor(booking.employee_id);
                    const widthPercent = 100 / totalCols;
                    const leftPercent = col * widthPercent;
                    const isTeammate =
                      !!currentEmployeeId &&
                      !!booking.employee_id &&
                      booking.employee_id !== currentEmployeeId;
                    const teamRows = (booking.booking_employees || []) as Array<{ employee_id: string }>;
                    const meOnTeam = !!currentEmployeeId && teamRows.some((be) => be.employee_id === currentEmployeeId);
                    const isActive = booking.status !== "completed" && booking.status !== "cancelled";
                    const canJoinInline =
                      isActive &&
                      isTeammate &&
                      !meOnTeam &&
                      !!booking.employee_id &&
                      myTeammateIds.has(booking.employee_id);

                    async function handleQuickJoin(e: React.MouseEvent) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!currentEmployeeId) return;
                      const conflicts = await fetchEmployeeConflicts({
                        employeeId: currentEmployeeId,
                        date: booking.booking_date,
                        startTime: booking.time_slot,
                        durationMin: dur,
                        excludeBookingId: booking.id,
                      });
                      if (conflicts.length > 0) {
                        const ok = await confirm({
                          message: `Sinulla on jo ${conflicts.length === 1 ? "varaus" : `${conflicts.length} varausta`} tähän aikaan. Liitytäänkö silti?`,
                          confirmLabel: "Liity silti",
                          variant: "danger",
                        });
                        if (!ok) return;
                      }
                      try {
                        await joinBooking.mutateAsync({ booking_id: booking.id, booking_number: booking.booking_number });
                      } catch (err: any) {
                        alert(err?.message || "Liittyminen epäonnistui");
                      }
                    }

                    return (
                      <Link
                        key={booking.id}
                        to={`${linkPrefix}/${booking.booking_number}`}
                        className={`absolute rounded-lg border px-1.5 py-1 overflow-hidden transition-opacity hover:opacity-80 ${color.bg} ${color.border}`}
                        style={{
                          top: Math.max(top, 0),
                          height,
                          left: `calc(${leftPercent}% + 2px)`,
                          width: `calc(${widthPercent}% - 4px)`,
                        }}
                      >
                        <div className={`text-[10px] font-semibold ${color.text} leading-tight flex items-center gap-1`}>
                          {isTeammate && booking.employees && (
                            <span className="px-1 rounded bg-white/40 text-[9px] truncate max-w-[60px]">
                              {booking.employees.first_name}
                            </span>
                          )}
                          {booking.time_slot}
                          {canJoinInline && (
                            <button
                              type="button"
                              onClick={handleQuickJoin}
                              title="Liity tähän keikkaan"
                              className="ml-auto p-0.5 rounded bg-white/60 hover:bg-white text-emerald-700"
                            >
                              <UserPlus className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className={`text-[10px] ${color.text} truncate leading-tight`}>
                          {booking.customers?.first_name} {booking.customers?.last_name}
                        </div>
                        {height > 40 && booking.services?.name && (
                          <div className={`text-[9px] ${color.text} opacity-70 truncate leading-tight`}>
                            {booking.services.name}
                          </div>
                        )}
                      </Link>
                    );
                  })}

                  {/* Override blocks — laid out side-by-side like bookings */}
                  {(() => {
                    const ovs = (overridesByDate[key] || []).map((ov) => {
                      const isFullDay = !ov.start_time || !ov.end_time;
                      const startMin = isFullDay ? START_HOUR * 60 : timeToMinutes(ov.start_time!);
                      const endMin = isFullDay ? END_HOUR * 60 : timeToMinutes(ov.end_time!);
                      return { ov, isFullDay, startMin, endMin, col: 0 };
                    }).filter((o) => {
                      const cs = Math.max(o.startMin, START_HOUR * 60);
                      const ce = Math.min(o.endMin, END_HOUR * 60);
                      return ce > cs;
                    });

                    // Greedy column assignment
                    for (let i = 0; i < ovs.length; i++) {
                      const used = new Set<number>();
                      for (let j = 0; j < i; j++) {
                        if (ovs[j].endMin > ovs[i].startMin && ovs[j].startMin < ovs[i].endMin) {
                          used.add(ovs[j].col);
                        }
                      }
                      let c = 0;
                      while (used.has(c)) c++;
                      ovs[i].col = c;
                    }

                    // Total cols per overlap group
                    const groups: number[][] = [];
                    for (let i = 0; i < ovs.length; i++) {
                      let placed = false;
                      for (const g of groups) {
                        if (g.some((j) => ovs[j].endMin > ovs[i].startMin && ovs[j].startMin < ovs[i].endMin)) {
                          g.push(i);
                          placed = true;
                          break;
                        }
                      }
                      if (!placed) groups.push([i]);
                    }
                    const totalMap = new Map<number, number>();
                    for (const g of groups) {
                      const max = Math.max(...g.map((i) => ovs[i].col)) + 1;
                      for (const i of g) totalMap.set(i, max);
                    }

                    return ovs.map(({ ov, isFullDay, startMin, endMin, col }, idx) => {
                      const clampedStart = Math.max(startMin, START_HOUR * 60);
                      const clampedEnd = Math.min(endMin, END_HOUR * 60);
                      const ovTop = ((clampedStart - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                      const ovHeight = ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT;
                      const emp = employees?.find((e) => e.id === ov.employee_id);
                      const color = getEmployeeColor(ov.employee_id);
                      const totalCols = totalMap.get(idx) ?? 1;
                      const widthPercent = 100 / totalCols;
                      const leftPercent = col * widthPercent;

                      return (
                        <div
                          key={ov.id}
                          className={`absolute rounded-lg border border-dashed ${color.border} z-[1] group/ov overflow-hidden transition-colors`}
                          style={{
                            top: ovTop,
                            height: ovHeight,
                            left: `calc(${leftPercent}% + 1px)`,
                            width: `calc(${widthPercent}% - 2px)`,
                            backgroundImage: `repeating-linear-gradient(135deg, transparent, transparent 3px, currentColor 3px, currentColor 4px)`,
                            backgroundSize: "8px 8px",
                            color: "rgb(0 0 0 / 0.06)",
                            backgroundColor: "rgb(255 255 255 / 0.85)",
                          }}
                          title={`${emp ? `${emp.first_name}: ` : ""}${ov.reason || "Estetty"}`}
                        >
                          <div className="px-1.5 py-0.5 overflow-hidden relative bg-white/80">
                            <div className="flex items-center gap-0.5">
                              <Ban className={`w-2.5 h-2.5 flex-shrink-0 ${color.text} opacity-60`} />
                              <span className={`text-[9px] font-semibold ${color.text} truncate leading-tight`}>
                                {emp?.first_name ?? "Estetty"}
                              </span>
                            </div>
                            {ovHeight > 24 && (
                              <div className={`text-[8px] ${color.text} opacity-70 truncate leading-tight`}>
                                {isFullDay ? "Koko päivä" : `${ov.start_time?.slice(0, 5)}–${ov.end_time?.slice(0, 5)}`}
                              </div>
                            )}
                            {ov.reason && ovHeight > 38 && (
                              <div className={`text-[8px] ${color.text} opacity-50 truncate leading-tight`}>
                                {ov.reason}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteOverride(ov); }}
                            className={`absolute top-0.5 right-0.5 p-0.5 rounded ${color.bg} ${color.text} hover:opacity-80 opacity-0 group-hover/ov:opacity-100 transition-opacity`}
                            title="Poista blokkaus"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    });
                  })()}

                  {/* Current time line */}
                  {showTimeLine && dayIdx === nowDayIndex && (
                    <div
                      className="absolute left-0 right-0 z-10 pointer-events-none"
                      style={{ top: nowOffset }}
                    >
                      <div className="relative">
                        <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                        <div className="h-0.5 bg-red-500 w-full" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Month View
// ===========================================================================

interface MonthViewProps {
  year: number;
  month: number;
  grid: (number | null)[];
  bookingsByDate: Record<string, Booking[]>;
  overridesByDate: Record<string, (CalendarOverride & { employee_id: string; underlying_ids: string[] })[]>;
  getEmployeeColor: (id: string | null) => (typeof EMPLOYEE_COLORS)[0];
  employees?: Employee[];
  onDeleteOverride: (ov: CalendarOverride & { employee_id: string; underlying_ids: string[] }) => void;
  today: string;
  onDayClick: (d: Date) => void;
  currentEmployeeId?: string;
}

function MonthView({
  year,
  month,
  grid,
  bookingsByDate,
  overridesByDate,
  getEmployeeColor,
  employees,
  onDeleteOverride,
  today,
  onDayClick,
  currentEmployeeId,
}: MonthViewProps) {
  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden overflow-x-auto">
      <div style={{ minWidth: 500 }}>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {MONTH_DAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center py-2 text-[10px] font-semibold text-text-muted tracking-wider border-r border-border last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          if (day === null) {
            return (
              <div
                key={`empty-${i}`}
                className="min-h-[80px] sm:min-h-[100px] border-r border-b border-border last:border-r-0 bg-surface-alt/30"
              />
            );
          }

          const key = dateKey(year, month, day);
          const isToday = key === today;
          const dayBookings = (bookingsByDate[key] || [])
            .slice()
            .sort((a, b) => a.time_slot.localeCompare(b.time_slot));
          const shown = dayBookings.slice(0, 3);
          const overflow = dayBookings.length - 3;

          return (
            <button
              key={key}
              onClick={() => onDayClick(new Date(year, month, day))}
              className="min-h-[80px] sm:min-h-[100px] border-r border-b border-border last:border-r-0 p-1 sm:p-1.5 text-left hover:bg-surface-hover/50 transition-colors flex flex-col"
            >
              {/* Day number */}
              <div className="flex justify-start mb-0.5">
                <span
                  className={`text-xs font-semibold ${
                    isToday
                      ? "w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center"
                      : "text-text-primary px-1"
                  }`}
                >
                  {day}
                </span>
              </div>

              {/* Override indicators */}
              {(overridesByDate[key] || []).map((ov) => {
                const emp = employees?.find((e) => e.id === ov.employee_id);
                return (
                  <div key={ov.id} className="flex items-center gap-0.5 mb-0.5 px-1 group/ovm">
                    <Ban className="w-2.5 h-2.5 text-red-400 flex-shrink-0" />
                    <span className="text-[8px] text-red-500 font-medium truncate flex-1">
                      {emp?.first_name ?? "Estetty"}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteOverride(ov); }}
                      className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-100 opacity-0 group-hover/ovm:opacity-100 transition-opacity flex-shrink-0"
                      title="Poista blokkaus"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}

              {/* Booking entries */}
              <div className="flex-1 space-y-0.5 overflow-hidden">
                {shown.map((b) => {
                  const color = getEmployeeColor(b.employee_id);
                  const isTeammate =
                    !!currentEmployeeId &&
                    !!b.employee_id &&
                    b.employee_id !== currentEmployeeId;
                  return (
                    <div
                      key={b.id}
                      className={`text-[9px] sm:text-[10px] px-1 py-0.5 rounded truncate ${color.bg} ${color.text}`}
                    >
                      {b.time_slot.replace(":", ".")}{" "}
                      {b.customers?.first_name} {b.customers?.last_name}
                      {isTeammate && b.employees && ` (${b.employees.first_name})`}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[9px] text-text-muted px-1">
                    +{overflow} lisaa
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// ===========================================================================
// List View
// ===========================================================================

interface ListViewProps {
  grouped: [string, Booking[]][];
  today: string;
  getEmployeeColor: (id: string | null) => (typeof EMPLOYEE_COLORS)[0];
  linkPrefix: string;
}

function ListView({ grouped, today, getEmployeeColor, linkPrefix }: ListViewProps) {
  if (grouped.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-8 text-center">
        <p className="text-sm text-text-muted">Ei varauksia valitulla ajanjaksolla</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([date, bookings]) => {
        const isToday = date === today;
        return (
          <div key={date} className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div
              className={`px-4 py-2.5 border-b border-border ${
                isToday ? "bg-accent-muted/30" : "bg-surface-alt"
              }`}
            >
              <span className="text-sm font-semibold text-text-primary capitalize">
                {formatListDate(date)}
              </span>
              {isToday && (
                <span className="ml-2 text-xs font-medium text-accent-dark bg-accent-muted px-2 py-0.5 rounded-full">
                  Tanaan
                </span>
              )}
            </div>

            <div className="divide-y divide-border">
              {bookings.map((b) => {
                const color = getEmployeeColor(b.employee_id);
                return (
                  <Link
                    key={b.id}
                    to={`${linkPrefix}/${b.booking_number}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3.5 sm:py-3 hover:bg-surface-hover transition-colors"
                  >
                    {/* Time */}
                    <span className="text-sm font-semibold text-text-primary w-14 flex-shrink-0">
                      {b.time_slot}
                    </span>

                    {/* Customer */}
                    <span className="text-sm text-text-primary flex-1 truncate">
                      {b.customers?.first_name} {b.customers?.last_name}
                    </span>

                    {/* Service */}
                    <span className="text-xs text-text-muted truncate max-w-[200px]">
                      {b.services?.name}
                    </span>

                    {/* Status */}
                    <Badge className={`text-xs flex-shrink-0 ${STATUS_COLORS[b.status]}`}>
                      {STATUS_LABELS[b.status]}
                    </Badge>

                    {/* Employee */}
                    {b.employees && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${color.bg} ${color.text}`}
                      >
                        {b.employees.first_name}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
