import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  CalendarDays, LayoutGrid, List,
  Bell, Mail, MapPin,
} from "lucide-react";
import { useUserRole } from "@/context/UserRoleContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { finnishToday, finnishNow, MONTH_NAMES_FI } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  type: "followup" | "booking" | "awaiting_reply";
  title: string;
  subtitle?: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  linkTo?: string;
  durationMinutes?: number;
  hoursWaiting?: number;
}

type ViewMode = "week" | "month" | "list";

// ─── Constants ──────────────────────────────────────────────────────────────

const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const WEEK_DAY_LABELS = ["MA", "TI", "KE", "TO", "PE", "LA", "SU"];
const MONTH_DAY_LABELS = ["MA", "TI", "KE", "TO", "PE", "LA", "SU"];

const EVENT_STYLES: Record<string, { bg: string; border: string; text: string; dot: string; icon: typeof Bell; label: string }> = {
  followup:       { bg: "bg-amber-50",  border: "border-amber-300",  text: "text-amber-800",  dot: "bg-amber-400",  icon: Bell,   label: "Seuranta" },
  booking:        { bg: "bg-blue-50",   border: "border-blue-300",   text: "text-blue-800",   dot: "bg-blue-400",   icon: MapPin, label: "Varaus" },
  awaiting_reply: { bg: "bg-red-50",    border: "border-red-300",    text: "text-red-800",    dot: "bg-red-400",    icon: Mail,   label: "Odottaa vastausta" },
};

// ─── Data Hook ──────────────────────────────────────────────────────────────

function useSellerCalendarEvents(employeeId: string | undefined, rangeStart: string, rangeEnd: string) {
  return useQuery({
    queryKey: ["seller-calendar", employeeId, rangeStart, rangeEnd],
    enabled: !!employeeId,
    staleTime: 30_000,
    queryFn: async () => {
      const events: CalendarEvent[] = [];

      // 1. Follow-ups from opportunities
      const { data: opps } = await supabase
        .from("sales_opportunities")
        .select("id, name, phone, next_followup_at, status")
        .eq("assigned_salesperson_id", employeeId!)
        .eq("is_archived", false)
        .not("next_followup_at", "is", null)
        .gte("next_followup_at", rangeStart)
        .lte("next_followup_at", rangeEnd);

      for (const o of opps || []) {
        const dt = new Date(o.next_followup_at);
        events.push({
          id: `opp-${o.id}`, type: "followup",
          title: o.name || "Nimetön", subtitle: o.phone || undefined,
          date: dt.toISOString().slice(0, 10),
          time: `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`,
          linkTo: `/myyja/inbound/${o.id}`,
        });
      }

      // 2. Follow-ups from leads
      const { data: leads } = await supabase
        .from("sales_leads")
        .select("id, name, phone, next_followup_at, status")
        .eq("assigned_salesperson_id", employeeId!)
        .not("next_followup_at", "is", null)
        .gte("next_followup_at", rangeStart)
        .lte("next_followup_at", rangeEnd)
        .not("status", "in", "(won,lost,do_not_call)");

      for (const l of leads || []) {
        const dt = new Date(l.next_followup_at);
        events.push({
          id: `lead-${l.id}`, type: "followup",
          title: l.name || "Nimetön", subtitle: l.phone || undefined,
          date: dt.toISOString().slice(0, 10),
          time: `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`,
          linkTo: `/myyja/kylmasoitot/${l.id}`,
        });
      }

      // 3. Bookings where this seller is linked
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_number, opportunity_id, booking_date, time_slot, status, duration_minutes, customers(first_name, last_name), services(name, duration_minutes), booking_employees(employee_id)")
        .gte("booking_date", rangeStart)
        .lte("booking_date", rangeEnd)
        .not("status", "eq", "cancelled");

      for (const b of bookings || []) {
        const isLinked = (b.booking_employees || []).some((be: { employee_id: string }) => be.employee_id === employeeId);
        if (!isLinked) continue;
        const custRaw = b.customers as unknown;
        const cust = Array.isArray(custRaw) ? custRaw[0] as { first_name: string; last_name: string } | undefined : custRaw as { first_name: string; last_name: string } | null;
        const svcRaw = b.services as unknown;
        const svc = Array.isArray(svcRaw) ? svcRaw[0] as { name: string; duration_minutes: number } | undefined : svcRaw as { name: string; duration_minutes: number } | null;
        events.push({
          id: `booking-${b.id}`, type: "booking",
          title: cust ? `${cust.first_name} ${cust.last_name}` : `#${b.booking_number}`,
          subtitle: svc?.name,
          date: b.booking_date, time: b.time_slot || undefined,
          durationMinutes: b.duration_minutes || svc?.duration_minutes || 60,
          // Sellers care about the deal, not the technical booking record.
          // Fall back to the booking view for bookings with no opportunity (e.g. huollot).
          linkTo: b.opportunity_id
            ? `/myyja/inbound/${b.opportunity_id}`
            : `/myyja/varaukset/${b.booking_number}`,
        });
      }

      // 4. Awaiting reply
      const { data: awaitingRows } = await supabase.rpc("get_opportunities_awaiting_reply");
      if (awaitingRows) {
        const awaitingIds = awaitingRows.map((r: { opportunity_id: string }) => r.opportunity_id);
        if (awaitingIds.length > 0) {
          const { data: awOpps } = await supabase
            .from("sales_opportunities")
            .select("id, name")
            .in("id", awaitingIds)
            .eq("assigned_salesperson_id", employeeId!);
          for (const o of awOpps || []) {
            const row = awaitingRows.find((r: { opportunity_id: string }) => r.opportunity_id === o.id);
            if (!row) continue;
            const dt = new Date(row.last_inbound_at);
            events.push({
              id: `await-${o.id}`, type: "awaiting_reply",
              title: o.name || "Nimetön", subtitle: "Odottaa vastausta",
              date: dt.toISOString().slice(0, 10),
              time: `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`,
              linkTo: `/myyja/inbound/${o.id}`,
              hoursWaiting: row.hours_waiting,
            });
          }
        }
      }

      return events;
    },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toDateStr(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function getMonday(d: Date): Date { const r = new Date(d); const dow = r.getDay(); r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1)); r.setHours(0, 0, 0, 0); return r; }
function timeToMin(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }

function formatWeekRange(mon: Date): string {
  const sun = addDays(mon, 6);
  const s = mon.getDate(), e = sun.getDate();
  const sm = mon.getMonth() + 1, em = sun.getMonth() + 1;
  if (sm === em) return `${s}.–${e}.${sm}.${mon.getFullYear()}`;
  return `${s}.${sm}.–${e}.${em}.${mon.getFullYear()}`;
}

function formatDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  const days = ["sunnuntai", "maanantai", "tiistai", "keskiviikko", "torstai", "perjantai", "lauantai"];
  return `${days[dt.getDay()]} ${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SellerCalendar() {
  const { employee } = useUserRole();
  const navigate = useNavigate();
  const today = finnishToday();
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date(today));

  const monday = useMemo(() => getMonday(anchor), [anchor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const monthYear = anchor.getFullYear();
  const monthMonth = anchor.getMonth();

  // Calculate range for data fetching
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === "week") {
      return { rangeStart: toDateStr(monday), rangeEnd: toDateStr(addDays(monday, 6)) };
    }
    // Month: include surrounding days for the grid
    const first = new Date(monthYear, monthMonth, 1);
    const last = new Date(monthYear, monthMonth + 1, 0);
    return { rangeStart: toDateStr(addDays(getMonday(first), -7)), rangeEnd: toDateStr(addDays(last, 7)) };
  }, [view, monday, monthYear, monthMonth]);

  const { data: events = [], isLoading } = useSellerCalendarEvents(employee?.id, rangeStart, rangeEnd);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      (map.get(ev.date) || (() => { const a: CalendarEvent[] = []; map.set(ev.date, a); return a; })()).push(ev);
    }
    for (const [, list] of map) list.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    return map;
  }, [events]);

  // Navigation
  function goToday() { setAnchor(new Date(today)); }
  function goPrev() {
    if (view === "week") setAnchor((a) => addDays(a, -7));
    else setAnchor((a) => { const d = new Date(a); d.setMonth(d.getMonth() - 1); return d; });
  }
  function goNext() {
    if (view === "week") setAnchor((a) => addDays(a, 7));
    else setAnchor((a) => { const d = new Date(a); d.setMonth(d.getMonth() + 1); return d; });
  }
  function goToDayInWeek(d: Date) { setAnchor(d); setView("week"); }

  const periodLabel = view === "week"
    ? formatWeekRange(monday)
    : `${MONTH_NAMES_FI[monthMonth]} ${monthYear}`;

  // Stats
  const followupCount = events.filter((e) => e.type === "followup").length;
  const bookingCount = events.filter((e) => e.type === "booking").length;
  const awaitingCount = events.filter((e) => e.type === "awaiting_reply").length;

  // Current time line (week view)
  const [nowMin, setNowMin] = useState(() => { const n = finnishNow(); return n.getHours() * 60 + n.getMinutes(); });
  const todayStr = today;
  useEffect(() => {
    const iv = setInterval(() => { const n = finnishNow(); setNowMin(n.getHours() * 60 + n.getMinutes()); }, 60_000);
    return () => clearInterval(iv);
  }, []);

  // Scroll to current time
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view === "week" && gridRef.current) {
      const scrollTo = Math.max(0, (nowMin / 60 - START_HOUR - 1) * HOUR_HEIGHT);
      gridRef.current.scrollTop = scrollTo;
    }
  }, [view]);


  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-accent" />
          <h1 className="text-xl font-bold">Kalenteri</h1>
        </div>
        {/* View mode toggle */}
        <div className="flex gap-1 bg-muted/40 rounded-xl p-0.5">
          {([["week", CalendarDays, "Viikko"], ["month", LayoutGrid, "Kuukausi"], ["list", List, "Lista"]] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === key ? "bg-surface shadow-sm text-text-primary" : "text-text-muted hover:text-text-primary"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([["followup", followupCount, "seurantaa"], ["booking", bookingCount, "varausta"], ["awaiting_reply", awaitingCount, "odottaa vastausta"]] as const)
          .filter(([, count]) => count > 0)
          .map(([type, count, label]) => {
            const s = EVENT_STYLES[type];
            const Icon = s.icon;
            return (
              <div key={type} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${s.bg} border ${s.border} ${s.text} text-xs font-medium`}>
                <Icon className="w-3.5 h-3.5" /> {count} {label}
              </div>
            );
          })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-4 bg-surface border border-border rounded-xl px-3 py-2">
        <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-bg-secondary transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{periodLabel}</span>
          <button onClick={goToday} className="text-[10px] font-medium text-accent hover:text-accent/80 px-2 py-0.5 rounded-lg bg-accent/10">
            Tänään
          </button>
        </div>
        <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-bg-secondary transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === "week" ? (
        /* ═══════════ WEEK VIEW ═══════════ */
        <div className="border border-border rounded-xl overflow-hidden bg-surface">
          {/* Day headers */}
          <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-border">
            <div className="border-r border-border" />
            {weekDays.map((d, i) => {
              const ds = toDateStr(d);
              const isToday = ds === todayStr;
              return (
                <div key={i} className={`text-center py-2 border-r border-border last:border-r-0 ${isToday ? "bg-accent/5" : ""}`}>
                  <span className="text-[10px] text-text-muted font-medium">{WEEK_DAY_LABELS[i]}</span>
                  <div className={`text-sm font-bold ${isToday ? "text-accent" : ""}`}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>
          {/* Time grid */}
          <div ref={gridRef} className="relative overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <div className="grid grid-cols-[48px_repeat(7,1fr)]" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
              {/* Hour labels */}
              <div className="border-r border-border">
                {HOURS.map((h) => (
                  <div key={h} className="border-b border-border/50 flex items-start justify-end pr-1.5 pt-0.5" style={{ height: HOUR_HEIGHT }}>
                    <span className="text-[10px] text-text-muted">{h}:00</span>
                  </div>
                ))}
              </div>
              {/* Day columns */}
              {weekDays.map((d, di) => {
                const ds = toDateStr(d);
                const isToday = ds === todayStr;
                const dayEvents = (eventsByDate.get(ds) || []).filter((e) => e.time);
                return (
                  <div key={di} className={`relative border-r border-border last:border-r-0 ${isToday ? "bg-accent/[0.02]" : ""}`}>
                    {HOURS.map((h) => <div key={h} className="border-b border-border/50" style={{ height: HOUR_HEIGHT }} />)}
                    {/* Current time line */}
                    {isToday && nowMin >= START_HOUR * 60 && nowMin < END_HOUR * 60 && (
                      <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: ((nowMin / 60) - START_HOUR) * HOUR_HEIGHT }}>
                        <div className="flex items-center">
                          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                          <div className="flex-1 h-px bg-red-500" />
                        </div>
                      </div>
                    )}
                    {/* Events */}
                    {dayEvents.map((ev) => {
                      const min = timeToMin(ev.time!);
                      if (min < START_HOUR * 60 || min >= END_HOUR * 60) return null;
                      const top = ((min / 60) - START_HOUR) * HOUR_HEIGHT;
                      const dur = ev.durationMinutes || 30;
                      const height = Math.max(24, (dur / 60) * HOUR_HEIGHT);
                      const s = EVENT_STYLES[ev.type];
                      const Icon = s.icon;
                      return (
                        <button
                          key={ev.id}
                          onClick={() => ev.linkTo && navigate(ev.linkTo)}
                          className={`absolute left-0.5 right-0.5 ${s.bg} border ${s.border} rounded-lg px-1.5 py-0.5 text-left cursor-pointer hover:shadow-sm transition-shadow overflow-hidden z-10`}
                          style={{ top, height }}
                        >
                          <div className="flex items-center gap-1">
                            <Icon className={`w-2.5 h-2.5 flex-shrink-0 ${s.text}`} />
                            <span className={`text-[10px] font-semibold truncate ${s.text}`}>{ev.time} {ev.title}</span>
                          </div>
                          {height > 28 && ev.subtitle && (
                            <p className={`text-[9px] truncate ${s.text} opacity-70`}>{ev.subtitle}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : view === "month" ? (
        /* ═══════════ MONTH VIEW ═══════════ */
        <div className="border border-border rounded-xl overflow-hidden bg-surface">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {MONTH_DAY_LABELS.map((d) => (
              <div key={d} className="text-center py-1.5 text-[10px] font-semibold text-text-muted border-r border-border last:border-r-0">{d}</div>
            ))}
          </div>
          {/* Month grid */}
          <MonthGrid
            year={monthYear}
            month={monthMonth}
            today={todayStr}
            eventsByDate={eventsByDate}
            onDayClick={goToDayInWeek}
          />
        </div>
      ) : (
        /* ═══════════ LIST VIEW ═══════════ */
        <div className="space-y-4">
          {(() => {
            const sorted = [...events].sort((a, b) => {
              const dc = a.date.localeCompare(b.date);
              return dc !== 0 ? dc : (a.time || "99:99").localeCompare(b.time || "99:99");
            });
            const groups = new Map<string, CalendarEvent[]>();
            for (const ev of sorted) (groups.get(ev.date) || (() => { const a: CalendarEvent[] = []; groups.set(ev.date, a); return a; })()).push(ev);
            if (groups.size === 0) return (
              <div className="text-center py-12 text-text-muted text-sm">Ei tapahtumia tällä viikolla</div>
            );
            return [...groups.entries()].map(([date, dayEvents]) => (
              <div key={date} className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className={`px-4 py-2 border-b border-border ${date === todayStr ? "bg-accent/5" : "bg-bg-secondary/30"}`}>
                  <span className={`text-xs font-semibold ${date === todayStr ? "text-accent" : "text-text-primary"}`}>
                    {formatDate(date)}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {dayEvents.map((ev) => {
                    const s = EVENT_STYLES[ev.type];
                    const Icon = s.icon;
                    return (
                      <button
                        key={ev.id}
                        onClick={() => ev.linkTo && navigate(ev.linkTo)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-secondary/30 transition-colors text-left"
                      >
                        <div className={`w-8 h-8 rounded-lg ${s.bg} border ${s.border} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-4 h-4 ${s.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {ev.time && <span className="text-xs font-mono text-text-muted">{ev.time}</span>}
                            <span className="text-sm font-semibold truncate">{ev.title}</span>
                          </div>
                          {ev.subtitle && <p className="text-xs text-text-muted truncate">{ev.subtitle}</p>}
                        </div>
                        <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text} border ${s.border}`}>
                          {s.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Month Grid Component ───────────────────────────────────────────────────

function MonthGrid({ year, month, today, eventsByDate, onDayClick }: {
  year: number;
  month: number;
  today: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  onDayClick: (d: Date) => void;
}) {
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1; // Monday-based
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: { date: Date; inMonth: boolean }[] = [];
    // Leading days from previous month
    for (let i = startDow - 1; i >= 0; i--) result.push({ date: addDays(first, -i - 1), inMonth: false });
    // Days of this month
    for (let i = 0; i < daysInMonth; i++) result.push({ date: new Date(year, month, i + 1), inMonth: true });
    // Trailing days
    while (result.length % 7 !== 0) result.push({ date: addDays(new Date(year, month + 1, 0), result.length - startDow - daysInMonth + 1), inMonth: false });
    return result;
  }, [year, month]);

  return (
    <div className="grid grid-cols-7">
      {cells.map(({ date, inMonth }, i) => {
        const ds = toDateStr(date);
        const isToday = ds === today;
        const dayEvents = eventsByDate.get(ds) || [];
        return (
          <button
            key={i}
            onClick={() => onDayClick(date)}
            className={`min-h-[80px] p-1.5 border-b border-r border-border text-left hover:bg-bg-secondary/30 transition-colors ${!inMonth ? "opacity-40" : ""} ${isToday ? "bg-accent/5" : ""}`}
          >
            <span className={`text-xs font-semibold ${isToday ? "text-accent bg-accent/10 rounded-full px-1.5 py-0.5" : "text-text-primary"}`}>
              {date.getDate()}
            </span>
            <div className="mt-1 space-y-0.5">
              {dayEvents.slice(0, 3).map((ev) => {
                const s = EVENT_STYLES[ev.type];
                return (
                  <div key={ev.id} className={`text-[9px] font-medium truncate px-1 py-0.5 rounded ${s.bg} ${s.text}`}>
                    {ev.time ? `${ev.time} ` : ""}{ev.title}
                  </div>
                );
              })}
              {dayEvents.length > 3 && (
                <div className="text-[9px] text-text-muted pl-1">+{dayEvents.length - 3} lisää</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
