import { useMemo } from "react";
import type { PipelineOverviewRow } from "@/hooks/sales/useSellerPerformance";

// Lead statuses in pipeline order
const LEAD_STAGES: { key: string; label: string; color: string }[] = [
  { key: "new",            label: "Uusi",           color: "#3b82f6" },
  { key: "called",         label: "Soitettu",       color: "#8b5cf6" },
  { key: "answered",       label: "Vastasi",        color: "#06b6d4" },
  { key: "no_answer",      label: "Ei vastausta",   color: "#f59e0b" },
  { key: "qualified",      label: "Kvalifioitu",    color: "#10b981" },
  { key: "booked",         label: "Varattu",        color: "#14b8a6" },
  { key: "not_interested", label: "Ei kiinnostunut",color: "#94a3b8" },
  { key: "won",            label: "Voitettu",       color: "#22c55e" },
  { key: "lost",           label: "Hävitty",        color: "#ef4444" },
  { key: "do_not_call",    label: "Älä soita",      color: "#64748b" },
];

// Opportunity statuses in pipeline order
const OPP_STAGES: { key: string; label: string; color: string }[] = [
  { key: "new_inbound",       label: "Uusi inbound",      color: "#3b82f6" },
  { key: "kontaktoitu",       label: "Kontaktoitu",       color: "#8b5cf6" },
  { key: "kartoitus_varattu", label: "Kartoitus varattu", color: "#06b6d4" },
  { key: "kartoitus_tehty",   label: "Kartoitus tehty",   color: "#10b981" },
  { key: "tarjous_lahetetty", label: "Tarjous lähetetty", color: "#f59e0b" },
  { key: "voitettu",          label: "Voitettu",          color: "#22c55e" },
  { key: "havitty",           label: "Hävitty",           color: "#ef4444" },
];

interface Props {
  rows: PipelineOverviewRow[];
  type: "lead" | "opportunity";
}

export function PipelineBar({ rows, type }: Props) {
  const stages = type === "lead" ? LEAD_STAGES : OPP_STAGES;

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      if (r.entity_type === type) map[r.status] = Number(r.cnt);
    }
    return map;
  }, [rows, type]);

  const total = useMemo(() => Object.values(counts).reduce((s, v) => s + v, 0), [counts]);

  if (total === 0) {
    return <p className="text-xs text-text-muted text-center py-4">Ei dataa</p>;
  }

  // Build segments only for stages that have data, plus unknowns
  const knownKeys = new Set(stages.map((s) => s.key));
  const segments = [
    ...stages.map((s) => ({ ...s, count: counts[s.key] || 0 })),
    // any statuses not in the predefined list
    ...Object.entries(counts)
      .filter(([k]) => !knownKeys.has(k))
      .map(([k, count]) => ({ key: k, label: k, color: "#94a3b8", count })),
  ].filter((s) => s.count > 0);

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-8 rounded-lg overflow-hidden gap-px">
        {segments.map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${s.count}`}
            style={{
              width: `${(s.count / total) * 100}%`,
              background: s.color,
              minWidth: s.count > 0 ? 2 : 0,
            }}
            className="relative group flex items-center justify-center transition-opacity hover:opacity-80 cursor-default"
          >
            {(s.count / total) > 0.08 && (
              <span className="text-white text-[10px] font-bold select-none">{s.count}</span>
            )}
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 hidden group-hover:block pointer-events-none">
              <div className="bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                <span className="font-semibold">{s.label}</span>
                <span className="ml-2 opacity-80">{s.count} ({((s.count / total) * 100).toFixed(0)} %)</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-[11px] text-text-muted">
              {s.label} <span className="font-semibold text-text-primary">{s.count}</span>
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] text-text-muted">Yht. <span className="font-semibold text-text-primary">{total}</span></span>
        </div>
      </div>
    </div>
  );
}

// Per-seller breakdown table

interface SellerPipelineProps {
  rows: PipelineOverviewRow[];
  sellers: { salesperson_id: string; first_name: string; last_name: string }[];
  type: "lead" | "opportunity";
}

export function SellerPipelineBreakdown({ rows: _rows, sellers, type: _type }: SellerPipelineProps) {

  // Build seller → status → count map
  // Note: overview RPC doesn't return per-seller breakdown; we need the distribution RPC for that
  // This component is for when we pass per-seller data
  if (sellers.length === 0) {
    return <p className="text-xs text-text-muted text-center py-4">Ei myyjiä</p>;
  }

  return null; // placeholder — see usage below
}
