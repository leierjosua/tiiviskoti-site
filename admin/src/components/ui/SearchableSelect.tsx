import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { inputCls } from "@/lib/constants";

export interface SearchableSelectOption {
  id: string;
  label: string;
  /** Secondary line (e.g. brand). Also searched. */
  sublabel?: string;
  /** Price in euros, shown right-aligned. */
  price?: number;
  /** Extra text matched by search but not displayed (e.g. SKU). */
  keywords?: string;
  /** Hidden from the default list; revealed only once the user types a query. */
  hiddenUntilSearch?: boolean;
  /** Small tag shown next to the label (e.g. "komponentti"). */
  badge?: string;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Shown under the list when no query is active and some options are hidden. */
  hint?: string;
  /** Extra classes for the trigger button. */
  className?: string;
}

/**
 * A searchable single-select dropdown — a drop-in upgrade for a bare <select>
 * over a long, hard-to-scan list (e.g. the full product catalog).
 *
 * Supports progressive disclosure: options flagged `hiddenUntilSearch` stay out
 * of the default list (keeping it clean) but surface as soon as the user types,
 * so nothing is unreachable. Used for hiding indoor/outdoor components behind a
 * search in quote/combo builders.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Valitse...",
  searchPlaceholder = "Hae...",
  emptyText = "Ei tuloksia",
  hint,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === value);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the search field when opening.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const q = query.trim().toLowerCase();
  const hasHidden = useMemo(() => options.some((o) => o.hiddenUntilSearch), [options]);

  const filtered = useMemo(() => {
    return options.filter((o) => {
      if (!q) return !o.hiddenUntilSearch;
      return (
        o.label.toLowerCase().includes(q) ||
        (o.sublabel || "").toLowerCase().includes(q) ||
        (o.keywords || "").toLowerCase().includes(q)
      );
    });
  }, [options, q]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${inputCls} !py-1.5 !text-xs flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={`truncate ${selected ? "" : "text-text-muted"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {selected && (
            <X
              className="w-3.5 h-3.5 text-text-muted hover:text-text-primary"
              onClick={(e) => { e.stopPropagation(); pick(""); }}
            />
          )}
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-surface shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                ref={inputRef}
                className={`${inputCls} !py-1.5 !text-xs !pl-8`}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="text-xs text-text-muted text-center py-2">{emptyText}</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.id)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-secondary text-left transition-colors"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{o.label}</span>
                    {o.badge && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded px-1 py-0.5 flex-shrink-0">{o.badge}</span>
                    )}
                  </span>
                  {o.sublabel && <span className="block text-[10px] text-text-muted truncate">{o.sublabel}</span>}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {typeof o.price === "number" && (
                    <span className="text-xs font-semibold">{o.price.toFixed(2)} €</span>
                  )}
                  {o.id === value && <Check className="w-3.5 h-3.5 text-accent" />}
                </span>
              </button>
            ))}
            {!q && hasHidden && hint && (
              <p className="text-[10px] text-text-muted px-2 pt-1.5 pb-0.5">{hint}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
