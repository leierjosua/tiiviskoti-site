import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { inputCls, selectCls } from "@/lib/constants";

interface LineItem {
  id?: string;
  line_type: string;
  name: string;
  description: string;
  unit_price: number;
  quantity: number;
  sort_order: number;
  item_id?: string | null;
  duration_minutes?: number | null;
}

interface QuoteLineItemEditorProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}

const LINE_TYPE_LABELS: Record<string, string> = {
  service: "Palvelu",
  additional_service: "Lisäpalvelu",
  product: "Tuote",
  other_charge: "Muu",
};

function rowId(item: LineItem, index: number) {
  return item.id ?? `new-${index}`;
}

interface SortableRowProps {
  item: LineItem;
  id: string;
  onUpdate: (updates: Partial<LineItem>) => void;
  onRemove: () => void;
}

function SortableRow({ item, id, onUpdate, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 px-3 py-2 border border-border rounded-xl bg-surface">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-2 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-primary flex-shrink-0 touch-none"
        aria-label="Siirrä rivi"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1 grid grid-cols-12 gap-2">
        <select
          value={item.line_type}
          onChange={(e) => onUpdate({ line_type: e.target.value })}
          className={`${selectCls} col-span-2 !py-1.5 !text-xs`}
        >
          {Object.entries(LINE_TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <input
          value={item.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Nimi"
          className={`${inputCls} col-span-4 !py-1.5 !text-xs`}
        />
        <input
          type="number"
          value={item.quantity}
          onChange={(e) => onUpdate({ quantity: parseInt(e.target.value) || 1 })}
          className={`${inputCls} col-span-1 !py-1.5 !text-xs text-center`}
          min={1}
        />
        <div className="col-span-2 relative">
          <input
            type="number"
            value={item.unit_price}
            onChange={(e) => onUpdate({ unit_price: parseFloat(e.target.value) || 0 })}
            className={`${inputCls} !py-1.5 !text-xs !pr-6`}
            step="0.01"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
        </div>
        <div className="col-span-2 flex items-center justify-between">
          <span className="text-xs font-semibold">
            {(item.unit_price * item.quantity).toFixed(2)} €
          </span>
          <button onClick={onRemove} className="text-text-muted hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuoteLineItemEditor({ items, onChange }: QuoteLineItemEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const ids = items.map((item, i) => rowId(item, i));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex).map((li, i) => ({ ...li, sort_order: i }));
    onChange(reordered);
  }

  function addItem() {
    onChange([
      ...items,
      {
        line_type: "service",
        name: "",
        description: "",
        unit_price: 0,
        quantity: 1,
        sort_order: items.length,
      },
    ]);
  }

  function updateItem(index: number, updates: Partial<LineItem>) {
    const next = items.map((item, i) => (i === index ? { ...item, ...updates } : item));
    onChange(next);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableRow
              key={ids[i]}
              id={ids[i]}
              item={item}
              onUpdate={(updates) => updateItem(i, updates)}
              onRemove={() => removeItem(i)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="flex items-center justify-between">
        <button
          onClick={addItem}
          className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80"
        >
          <Plus className="w-3.5 h-3.5" /> Lisää rivi
        </button>
        <div className="text-sm font-semibold">
          Yhteensä: {total.toFixed(2)} €
        </div>
      </div>
    </div>
  );
}
