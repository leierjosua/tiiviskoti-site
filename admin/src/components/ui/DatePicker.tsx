import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { MONTH_NAMES_FI, finnishToday } from "@/lib/utils";

const WEEKDAYS = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];
const POPUP_W = 280;
const POPUP_H = 340; // approximate max height

interface DatePickerProps {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({ value, onChange, placeholder = "Valitse päivä", className = "" }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const initialDate = value ? new Date(value + "T00:00:00") : new Date();
  const [year, setYear] = useState(initialDate.getFullYear());
  const [month, setMonth] = useState(initialDate.getMonth());

  // Sync calendar view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
  }, [value]);

  // Calculate position when opening
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: align left edge with trigger, flip if overflows right
    let left = rect.left;
    if (left + POPUP_W > vw - 8) {
      left = rect.right - POPUP_W;
    }
    left = Math.max(8, left);

    // Vertical: below trigger, flip above if overflows bottom
    let top = rect.bottom + 4;
    if (top + POPUP_H > vh - 8) {
      top = rect.top - POPUP_H - 4;
    }
    top = Math.max(8, top);

    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Close on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [isOpen]);

  const lastDay = new Date(year, month + 1, 0).getDate();

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    const result: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) result.push(null);
    for (let d = 1; d <= lastDay; d++) result.push(d);
    return result;
  }, [year, month, lastDay]);

  function prevMonth() {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  }

  function selectDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(dateStr);
    setIsOpen(false);
  }

  const todayStr = finnishToday();

  // Format display value — parse string directly to avoid timezone issues
  const displayValue = value
    ? (() => {
        const [y, m, d] = value.split("-").map(Number);
        return `${d}.${m}.${y}`;
      })()
    : "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all text-left min-h-[44px] ${className}`}
      >
        <CalendarDays className="w-4 h-4 text-text-muted flex-shrink-0" />
        <span className={value ? "text-text-primary" : "text-text-muted"}>
          {displayValue || placeholder}
        </span>
        {value && (
          <X
            className="w-3.5 h-3.5 text-text-muted hover:text-text-primary ml-auto flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setIsOpen(false);
            }}
          />
        )}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popupRef}
            className="fixed z-[9999] bg-surface border border-border rounded-xl shadow-lg p-4"
            style={{ top: pos.top, left: pos.left, width: POPUP_W }}
          >
            {/* Month nav */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-text-secondary" />
              </button>
              <span className="text-sm font-semibold text-text-primary">
                {MONTH_NAMES_FI[month]} {year}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-text-secondary" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className={`text-center text-[10px] font-semibold py-1 uppercase tracking-wide ${
                    d === "Su" ? "text-text-muted/40" : "text-text-muted"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, i) => {
                if (day === null) return <div key={`e-${i}`} />;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isSelected = value === dateStr;
                const isToday = dateStr === todayStr;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => selectDay(day)}
                    className={`w-full aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-brand text-white"
                        : isToday
                          ? "text-accent-dark font-bold hover:bg-surface-hover"
                          : "text-text-primary hover:bg-surface-hover"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Quick actions */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Tyhjennä
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setYear(today.getFullYear());
                  setMonth(today.getMonth());
                  onChange(todayStr);
                  setIsOpen(false);
                }}
                className="text-xs text-accent-dark hover:text-accent font-medium transition-colors"
              >
                Tänään
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
