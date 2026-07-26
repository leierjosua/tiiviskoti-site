import { Trash2 } from "lucide-react";
import type { AutomationCondition, ContactFormField } from "@/lib/types";

const OPERATORS = [
  { value: "equals", label: "on" },
  { value: "not_equals", label: "ei ole" },
  { value: "contains", label: "sisältää" },
  { value: "starts_with", label: "alkaa" },
  { value: "exists", label: "on täytetty" },
] as const;

interface ConditionRowProps {
  condition: AutomationCondition;
  fields: ContactFormField[];
  onChange: (updated: AutomationCondition) => void;
  onRemove: () => void;
}

export function ConditionRow({ condition, fields, onChange, onRemove }: ConditionRowProps) {
  const selectedField = fields.find((f) => (f.name || f.id) === condition.field);
  const hasOptions = selectedField?.options && selectedField.options.length > 0;
  const showValueInput = condition.operator !== "exists";

  return (
    <div className="flex items-center gap-2">
      {/* Field selector */}
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value, value: "" })}
        className="flex-1 min-w-0 px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
      >
        <option value="">Valitse kenttä...</option>
        {fields
          .filter((f) => !["divider", "heading", "paragraph"].includes(f.type))
          .map((f) => (
            <option key={f.name || f.id} value={f.name || f.id}>
              {f.label}
            </option>
          ))}
      </select>

      {/* Operator */}
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as AutomationCondition["operator"] })}
        className="w-28 px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {/* Value */}
      {showValueInput && (
        hasOptions ? (
          <select
            value={String(condition.value ?? "")}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="flex-1 min-w-0 px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
          >
            <option value="">Valitse...</option>
            {selectedField!.options!.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={String(condition.value ?? "")}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="Arvo"
            className="flex-1 min-w-0 px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
          />
        )
      )}

      <button
        onClick={onRemove}
        className="p-2 text-text-muted hover:text-red-500 transition-colors flex-shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
