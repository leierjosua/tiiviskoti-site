import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";

const POPUP_W = 200;
const POPUP_H = 300;

interface TimePickerProps {
  value: string; // "HH:MM" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  startHour?: number;
  endHour?: number;
  intervalMinutes?: number;
  /** Only show times strictly after this value (e.g. "08:00") */
  minTime?: string;
}

export function TimePicker({
  value,
  onChange,
  placeholder = "Valitse aika",
  className = "",
  startHour = 6,
  endHour = 22,
  intervalMinutes = 30,
  minTime,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let h = startHour; h <= endHour; h++) {
      for (let m = 0; m < 60; m += intervalMinutes) {
        if (h === endHour && m > 0) break;
        opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return minTime ? opts.filter((t) => t > minTime) : opts;
  }, [startHour, endHour, intervalMinutes, minTime]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left;
    if (left + POPUP_W > vw - 8) {
      left = rect.right - POPUP_W;
    }
    left = Math.max(8, left);

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
      // Scroll to selected time
      requestAnimationFrame(() => {
        selectedRef.current?.scrollIntoView({ block: "center" });
      });
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

  // Close on resize
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [isOpen]);

  // Display with Finnish dot format
  const displayValue = value ? value.replace(":", ".") : "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all text-left min-h-[44px] ${className}`}
      >
        <Clock className="w-4 h-4 text-text-muted flex-shrink-0" />
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
            className="fixed z-[9999] bg-surface border border-border rounded-xl shadow-lg py-2"
            style={{ top: pos.top, left: pos.left, width: POPUP_W, maxHeight: POPUP_H, overflowY: "auto" }}
          >
            {timeOptions.map((t) => {
              const isSelected = value === t;
              return (
                <button
                  key={t}
                  ref={isSelected ? selectedRef : undefined}
                  type="button"
                  onClick={() => {
                    onChange(t);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-sm text-left transition-colors ${
                    isSelected
                      ? "bg-brand text-white font-semibold"
                      : "text-text-primary hover:bg-surface-hover"
                  }`}
                >
                  {t.replace(":", ".")}
                </button>
              );
            })}

            {/* Quick actions */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border mt-1">
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
                  const fi = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
                  const h = String(fi.getHours()).padStart(2, "0");
                  const m = fi.getMinutes() < 30 ? "00" : "30";
                  onChange(`${h}:${m}`);
                  setIsOpen(false);
                }}
                className="text-xs text-accent-dark hover:text-accent font-medium transition-colors"
              >
                Nyt
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
