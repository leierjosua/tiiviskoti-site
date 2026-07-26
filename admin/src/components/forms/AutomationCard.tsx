import { Pencil, Trash2, Clock, Zap, ToggleLeft, ToggleRight } from "lucide-react";
import type { FormAutomation } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  send_email_template: "Lähetä sähköpostipohja",
  send_raw_email: "Lähetä sähköposti",
  create_opportunity: "Luo liidi",
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: "=",
  not_equals: "≠",
  contains: "sisältää",
  starts_with: "alkaa",
  exists: "täytetty",
  in: "on joukossa",
};

interface AutomationCardProps {
  automation: FormAutomation;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

export function AutomationCard({ automation, onEdit, onDelete, onToggleActive }: AutomationCardProps) {
  return (
    <div
      className={`bg-surface border rounded-xl p-4 transition-colors ${
        automation.is_active ? "border-border" : "border-border/50 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h4 className="font-semibold text-sm text-text-primary truncate">{automation.name}</h4>
            {automation.delay_minutes > 0 ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                <Clock className="w-3 h-3" />
                {automation.delay_minutes >= 60
                  ? `${Math.floor(automation.delay_minutes / 60)} h${automation.delay_minutes % 60 > 0 ? ` ${automation.delay_minutes % 60} min` : ""}`
                  : `${automation.delay_minutes} min`}
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700">
                <Zap className="w-3 h-3" />
                Heti
              </span>
            )}
          </div>

          {/* Conditions */}
          {automation.conditions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {automation.conditions.map((c, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md text-[11px] bg-blue-50 text-blue-700 font-medium"
                >
                  {c.field} {OPERATOR_LABELS[c.operator] || c.operator}{" "}
                  {c.operator !== "exists" && `"${Array.isArray(c.value) ? c.value.join(", ") : c.value}"`}
                </span>
              ))}
            </div>
          )}

          {/* Action */}
          <p className="text-xs text-text-muted">
            {ACTION_LABELS[automation.action_type] || automation.action_type}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggleActive}
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
            title={automation.is_active ? "Poista käytöstä" : "Ota käyttöön"}
          >
            {automation.is_active ? (
              <ToggleRight className="w-5 h-5 text-green-600" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-text-muted" />
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-text-muted hover:text-text-primary"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-text-muted hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
