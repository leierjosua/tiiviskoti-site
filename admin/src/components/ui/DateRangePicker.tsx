import { useState, useRef, useEffect, useCallback } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { finnishNow } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
  prevFrom?: string;
  prevTo?: string;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

function toFinnish(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Helsinki" });
}

function toFinnishShort(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fi-FI", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Helsinki" });
}

// ── Presets ────────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  getRange: () => DateRange;
}

function getPresets(): Preset[] {
  const today = finnishNow();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const todayStr = fmt(today);
  const yesterday = fmt(new Date(y, m, d - 1));

  return [
    { label: "Tänään", getRange: () => ({ from: todayStr, to: todayStr }) },
    { label: "Eilen", getRange: () => ({ from: yesterday, to: yesterday }) },
    { label: "Viimeiset 7 pv", getRange: () => ({ from: fmt(new Date(y, m, d - 6)), to: todayStr }) },
    { label: "Viimeiset 14 pv", getRange: () => ({ from: fmt(new Date(y, m, d - 13)), to: todayStr }) },
    { label: "Viimeiset 30 pv", getRange: () => ({ from: fmt(new Date(y, m, d - 29)), to: todayStr }) },
    { label: "Viimeiset 90 pv", getRange: () => ({ from: fmt(new Date(y, m, d - 89)), to: todayStr }) },
    { label: "Tämä kuukausi", getRange: () => ({ from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}` }) },
    {
      label: "Edellinen kuukausi",
      getRange: () => {
        const pm = m === 0 ? 11 : m - 1;
        const py = m === 0 ? y - 1 : y;
        return { from: `${py}-${pad(pm + 1)}-01`, to: `${py}-${pad(pm + 1)}-${pad(lastDay(py, pm))}` };
      },
    },
    { label: "Tämä vuosi", getRange: () => ({ from: `${y}-01-01`, to: todayStr }) },
    {
      label: "Edellinen vuosi",
      getRange: () => ({ from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }),
    },
    { label: "Q1", getRange: () => ({ from: `${y}-01-01`, to: `${y}-03-31` }) },
    { label: "Q2", getRange: () => ({ from: `${y}-04-01`, to: `${y}-06-30` }) },
    { label: "Q3", getRange: () => ({ from: `${y}-07-01`, to: `${y}-09-30` }) },
    { label: "Q4", getRange: () => ({ from: `${y}-10-01`, to: `${y}-12-31` }) },
  ];
}

// ── Calendar Month ─────────────────────────────────────────────────────────

const WEEKDAYS = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];
const MONTH_NAMES = [
  "Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu",
  "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu",
];

function CalendarMonth({
  year,
  month,
  rangeStart,
  rangeEnd,
  hoverDate,
  onDayClick,
  onDayHover,
}: {
  year: number;
  month: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  hoverDate: string | null;
  onDayClick: (date: string) => void;
  onDayHover: (date: string | null) => void;
}) {
  const daysInMonth = lastDay(year, month);
  // Monday = 0
  const firstDayOfWeek = ((new Date(year, month, 1).getDay() + 6) % 7);
  const todayStr = fmt(finnishNow());

  const effectiveEnd = rangeEnd || hoverDate;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function isInRange(dateStr: string) {
    if (!rangeStart || !effectiveEnd) return false;
    const a = rangeStart < effectiveEnd ? rangeStart : effectiveEnd;
    const b = rangeStart < effectiveEnd ? effectiveEnd : rangeStart;
    return dateStr >= a && dateStr <= b;
  }

  function isStart(dateStr: string) {
    if (!rangeStart || !effectiveEnd) return dateStr === rangeStart;
    const a = rangeStart < effectiveEnd ? rangeStart : effectiveEnd;
    return dateStr === a;
  }

  function isEnd(dateStr: string) {
    if (!rangeStart || !effectiveEnd) return false;
    const b = rangeStart < effectiveEnd ? effectiveEnd : rangeStart;
    return dateStr === b;
  }

  return (
    <div className="select-none w-full sm:w-[280px]">
      <p className="text-sm font-semibold text-text-primary text-center mb-3">
        {MONTH_NAMES[month]} {year}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-[11px] font-medium text-text-muted text-center py-1">
            {wd}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
          const isToday = dateStr === todayStr;
          const inRange = isInRange(dateStr);
          const start = isStart(dateStr);
          const end = isEnd(dateStr);

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onDayClick(dateStr)}
              onMouseEnter={() => onDayHover(dateStr)}
              className={`relative w-9 h-9 min-h-[36px] text-sm font-medium transition-colors rounded-lg ${
                start || end
                  ? "bg-accent text-white z-10"
                  : inRange
                    ? "bg-accent/10 text-accent-dark"
                    : "text-text-primary hover:bg-surface-hover"
              } ${isToday && !start && !end ? "ring-1 ring-inset ring-accent/40" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── DateRangePicker ────────────────────────────────────────────────────────

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ start: string | null; end: string | null }>({
    start: value.from,
    end: value.to,
  });
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [picking, setPicking] = useState<"start" | "end">("start");

  // Two visible months: left and right
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(value.to + "T00:00:00");
    // Show previous month and current month
    return { year: d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(), month: d.getMonth() === 0 ? 11 : d.getMonth() - 1 };
  });

  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Reset draft when value changes externally
  useEffect(() => {
    if (!open) {
      setDraft({ start: value.from, end: value.to });
    }
  }, [value, open]);

  const rightMonth = viewDate.month === 11 ? 0 : viewDate.month + 1;
  const rightYear = viewDate.month === 11 ? viewDate.year + 1 : viewDate.year;

  function prevMonth() {
    setViewDate((v) => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  }
  function nextMonth() {
    setViewDate((v) => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });
  }

  const handleDayClick = useCallback((dateStr: string) => {
    if (picking === "start") {
      setDraft({ start: dateStr, end: null });
      setPicking("end");
      setHoverDate(null);
    } else {
      // Ensure start <= end
      const start = draft.start!;
      if (dateStr < start) {
        setDraft({ start: dateStr, end: start });
      } else {
        setDraft({ start, end: dateStr });
      }
      setPicking("start");
    }
  }, [picking, draft.start]);

  function handlePreset(preset: Preset) {
    const range = preset.getRange();
    setDraft({ start: range.from, end: range.to });
    setPicking("start");
    // Navigate calendar to show the range
    const d = new Date(range.to + "T00:00:00");
    setViewDate({ year: d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(), month: d.getMonth() === 0 ? 11 : d.getMonth() - 1 });
    // Auto-apply preset selection
    onChange({ from: range.from, to: range.to, prevFrom: "", prevTo: "" });
    setOpen(false);
  }

  function apply() {
    if (draft.start && draft.end) {
      onChange({ from: draft.start, to: draft.end, prevFrom: "", prevTo: "" });
      setOpen(false);
    }
  }

  function cancel() {
    setDraft({ start: value.from, end: value.to });
    setPicking("start");
    setOpen(false);
  }

  const presets = getPresets();

  return (
    <div ref={ref} className="relative inline-block">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-sm font-medium text-text-primary transition-colors"
      >
        <CalendarDays className="w-4 h-4 text-text-muted flex-shrink-0" />
        <span className="truncate">{toFinnishShort(value.from)} – {toFinnishShort(value.to)}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="fixed inset-2 sm:inset-auto sm:absolute sm:left-0 sm:top-full sm:mt-2 z-50 bg-surface border border-border rounded-2xl shadow-2xl shadow-black/10 flex flex-col sm:flex-row overflow-hidden max-h-[calc(100vh-1rem)] sm:max-h-none">
          {/* Presets - horizontal scroll on mobile, sidebar on desktop */}
          <div className="flex sm:flex-col sm:w-48 border-b sm:border-b-0 sm:border-r border-border py-2 sm:py-3 overflow-x-auto sm:overflow-x-visible sm:overflow-y-auto sm:max-h-[480px] flex-shrink-0">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                className="whitespace-nowrap text-left px-4 sm:px-5 py-2 sm:py-2.5 text-sm text-text-primary hover:bg-surface-hover transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar area */}
          <div className="p-4 sm:p-5 flex flex-col gap-4 sm:gap-5 overflow-y-auto flex-1 min-h-0">
            {/* Date inputs */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-border bg-white text-sm text-text-primary min-w-0">
                {draft.start ? toFinnish(draft.start) : "Alkupäivä"}
              </div>
              <span className="text-text-muted text-sm flex-shrink-0">→</span>
              <div className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-border bg-white text-sm text-text-primary min-w-0">
                {draft.end ? toFinnish(draft.end) : "Loppupäivä"}
              </div>
            </div>

            {/* Two month calendars - stack on mobile */}
            <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
              <div className="relative">
                <button
                  onClick={prevMonth}
                  className="absolute -top-0.5 left-0 p-1 rounded-lg hover:bg-surface-hover transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-text-muted" />
                </button>
                <CalendarMonth
                  year={viewDate.year}
                  month={viewDate.month}
                  rangeStart={draft.start}
                  rangeEnd={draft.end}
                  hoverDate={picking === "end" ? hoverDate : null}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
                />
              </div>
              <div className="relative">
                <button
                  onClick={nextMonth}
                  className="absolute -top-0.5 right-0 p-1 rounded-lg hover:bg-surface-hover transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                </button>
                <CalendarMonth
                  year={rightYear}
                  month={rightMonth}
                  rangeStart={draft.start}
                  rangeEnd={draft.end}
                  hoverDate={picking === "end" ? hoverDate : null}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={cancel}
                className="px-4 py-2 sm:py-1.5 rounded-lg text-sm font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                Peruuta
              </button>
              <button
                onClick={apply}
                disabled={!draft.start || !draft.end}
                className="px-4 py-2 sm:py-1.5 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand/90 disabled:opacity-40 transition-colors"
              >
                Käytä
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
