import { useState, useRef, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import type { SalesTag } from "@/lib/sales-types";

interface TagPickerProps {
  tags: SalesTag[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export function TagPicker({ tags, selected, onChange, placeholder = "Valitse tagit..." }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const toggle = (name: string) => {
    onChange(
      selected.includes(name)
        ? selected.filter((t) => t !== name)
        : [...selected, name]
    );
  };

  const selectedTags = tags.filter((t) => selected.includes(t.name));
  const availableTags = tags.filter((t) => t.is_active);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full min-h-[38px] flex flex-wrap items-center gap-1 px-2.5 py-1.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {selectedTags.length > 0 ? (
          selectedTags.map((tag) => (
            <span
              key={tag.name}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{ backgroundColor: tag.color + "20", color: tag.color }}
            >
              {tag.name}
              <X
                className="w-3 h-3 cursor-pointer hover:opacity-70"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(tag.name);
                }}
              />
            </span>
          ))
        ) : (
          <span className="text-text-muted">{placeholder}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-text-muted ml-auto flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
          {availableTags.length === 0 && (
            <p className="px-3 py-2 text-xs text-text-muted">Ei tageja</p>
          )}
          {availableTags.map((tag) => (
            <button
              key={tag.name}
              type="button"
              onClick={() => toggle(tag.name)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors ${
                selected.includes(tag.name) ? "bg-muted/50" : ""
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
              {selected.includes(tag.name) && (
                <span className="ml-auto text-accent text-[10px] font-semibold">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
