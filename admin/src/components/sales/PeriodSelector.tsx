import { finnishNow } from "@/lib/utils";

interface PeriodSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const PERIODS = [
  { value: "week", label: "Tämä viikko" },
  { value: "month", label: "Tämä kuukausi" },
  { value: "quarter", label: "Tämä kvartaali" },
  { value: "year", label: "Tämä vuosi" },
  { value: "all", label: "Kaikki" },
];

export function getPeriodRange(period: string): { from: string; to: string } {
  const now = finnishNow();
  const to = new Date().toISOString();

  switch (period) {
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() + 1); // Monday
      d.setHours(0, 0, 0, 0);
      return { from: d.toISOString(), to };
    }
    case "month": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d.toISOString(), to };
    }
    case "quarter": {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const d = new Date(now.getFullYear(), qMonth, 1);
      return { from: d.toISOString(), to };
    }
    case "year": {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: d.toISOString(), to };
    }
    default:
      return { from: "1970-01-01T00:00:00Z", to: "2099-12-31T23:59:59Z" };
  }
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex border border-border rounded-lg overflow-hidden">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
            value === p.value
              ? "bg-accent text-white"
              : "text-text-muted hover:bg-muted/30"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
