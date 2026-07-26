import { useMemo, useState } from "react";
import {
  useInventoryUnits,
  useUnitsByBooking,
  useAssignSingleUnit,
  useAssignPair,
  useUnassignUnit,
} from "@/hooks/useInventoryUnits";
import { useProducts } from "@/hooks/useProducts";
import { openInventoryLabelPdf } from "@/lib/chromiumPdf";
import { Badge } from "@/components/ui/badge";
import { selectCls } from "@/lib/constants";
import { Link2, Plus, X, Printer, Package } from "lucide-react";
import type { InventoryUnit, Product } from "@/lib/types";

interface BookingLine {
  id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  line_type: string;
}

export function BookingInventoryAssignment({
  bookingId,
  bookingEmployeeId,
  scheduledAt,
  lineItems,
}: {
  bookingId: string;
  bookingEmployeeId: string | null;
  scheduledAt: string | null;
  lineItems: BookingLine[];
}) {
  const productLines = lineItems.filter((l) => l.line_type === "product" && l.product_id);
  const { data: assignedUnits } = useUnitsByBooking(bookingId);
  const { data: allProducts } = useProducts();

  if (productLines.length === 0) return null;

  return (
    <div className="mt-6 border-t border-border pt-5">
      <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3 block">
        Varastoyksiköt
      </label>
      <p className="text-xs text-text-muted mb-4">
        Kohdista fyysiset laitteet varastosta tähän asennukseen. Kaksiosaisille (esim. Toshiba)
        valitse sisä- ja ulkoyksikkö setiksi.
      </p>

      <div className="space-y-3">
        {productLines.map((line) => {
          const product = allProducts?.find((p) => p.id === line.product_id);
          if (!product) return null;
          return (
            <ProductAssignmentCard
              key={line.id}
              line={line}
              product={product}
              bookingId={bookingId}
              bookingEmployeeId={bookingEmployeeId}
              scheduledAt={scheduledAt}
              assignedUnits={assignedUnits || []}
              allProducts={allProducts || []}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── One card per product line ──────────────────────────────────────────────

function ProductAssignmentCard({
  line,
  product,
  bookingId,
  bookingEmployeeId,
  scheduledAt,
  assignedUnits,
  allProducts,
}: {
  line: BookingLine;
  product: Product;
  bookingId: string;
  bookingEmployeeId: string | null;
  scheduledAt: string | null;
  assignedUnits: InventoryUnit[];
  allProducts: Product[];
}) {
  const isSplit = !!(product.indoor_component_id && product.outdoor_component_id);
  const [picking, setPicking] = useState(false);

  // Units assigned to THIS line: match by product (single) or by component products (split)
  const relevantProductIds = isSplit
    ? [product.indoor_component_id!, product.outdoor_component_id!]
    : [product.id];
  const myUnits = assignedUnits.filter(
    (u) => u.product_id && relevantProductIds.includes(u.product_id)
  );

  // Group: for split, group by pair_id → each group is a "set". For single, each unit IS a slot.
  const slots: InventoryUnit[][] = useMemo(() => {
    if (!isSplit) return myUnits.map((u) => [u]);
    const groups = new Map<string, InventoryUnit[]>();
    for (const u of myUnits) {
      const key = u.pair_id || u.id; // fall back to unit id if no pair (shouldn't happen but safe)
      const arr = groups.get(key) || [];
      arr.push(u);
      groups.set(key, arr);
    }
    return Array.from(groups.values());
  }, [myUnits, isSplit]);

  const filledCount = slots.length;
  const needed = line.quantity;
  const remaining = Math.max(0, needed - filledCount);

  const handlePrintLabel = async (slot: InventoryUnit[]) => {
    const pairId = slot[0].pair_id;
    try {
      await openInventoryLabelPdf(
        bookingId,
        pairId ? { pair_id: pairId } : { unit_id: slot[0].id },
      );
    } catch (e) {
      console.error(e);
      alert("Tarran tulostus epäonnistui");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-alt p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{product.name}</p>
          <p className="text-[11px] text-text-muted">
            {filledCount} / {needed} {isSplit ? "settiä" : "yksikköä"} kohdistettu
            {isSplit && (
              <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                <Link2 className="w-3 h-3" /> kaksiosainen
              </span>
            )}
          </p>
        </div>
        {remaining > 0 && !picking && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-dark text-white transition-colors"
          >
            <Plus className="w-3 h-3" />
            Lisää {isSplit ? "setti" : "yksikkö"}
          </button>
        )}
      </div>

      {/* Existing slots */}
      {slots.length > 0 && (
        <div className="space-y-2 mb-3">
          {slots.map((slot, idx) => (
            <AssignedSlot
              key={slot.map((u) => u.id).join("|")}
              slot={slot}
              index={idx}
              isSplit={isSplit}
              indoorComponentId={product.indoor_component_id}
              onPrint={() => handlePrintLabel(slot)}
            />
          ))}
        </div>
      )}

      {/* Picker */}
      {picking && (
        <PickerRow
          product={product}
          isSplit={isSplit}
          allProducts={allProducts}
          bookingId={bookingId}
          bookingEmployeeId={bookingEmployeeId}
          scheduledAt={scheduledAt}
          onDone={() => setPicking(false)}
        />
      )}
    </div>
  );
}

// ─── One filled slot (set or single) ────────────────────────────────────────

function AssignedSlot({
  slot,
  index,
  isSplit,
  indoorComponentId,
  onPrint,
}: {
  slot: InventoryUnit[];
  index: number;
  isSplit: boolean;
  indoorComponentId: string | null;
  onPrint: () => void;
}) {
  const unassign = useUnassignUnit();

  // For split: put indoor unit first (matched by product_id), outdoor second
  const sortedSplit = useMemo(() => {
    if (!isSplit) return slot;
    return [...slot].sort((a, b) => {
      const aIsIndoor = a.product_id === indoorComponentId ? 0 : 1;
      const bIsIndoor = b.product_id === indoorComponentId ? 0 : 1;
      return aIsIndoor - bIsIndoor;
    });
  }, [slot, isSplit, indoorComponentId]);

  return (
    <div className="rounded-lg border border-border bg-surface p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-secondary mb-1">
          {isSplit ? `Setti ${index + 1}` : `Yksikkö ${index + 1}`}
        </p>
        {isSplit ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
            {sortedSplit.map((u, i) => (
              <div key={u.id} className="flex items-center gap-1.5 text-text-muted">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-text-muted/70">
                  {i === 0 ? "Sisä" : "Ulko"}
                </span>
                <span className="text-text-secondary">{u.products?.name || "—"}</span>
                {u.serial_number && (
                  <span className="font-mono text-text-muted">· {u.serial_number}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-text-secondary">
            {slot[0].products?.name}
            {slot[0].serial_number && (
              <span className="font-mono text-text-muted ml-2">· {slot[0].serial_number}</span>
            )}
          </div>
        )}
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 border text-[10px] mt-1.5">
          Varattu
        </Badge>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-accent-muted text-accent-dark hover:bg-accent/20 transition-colors"
          title="Tulosta tarra"
        >
          <Printer className="w-3 h-3" />
          Tarra
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(isSplit ? "Poista koko setti tästä varauksesta?" : "Poista yksikkö tästä varauksesta?")) {
              unassign.mutate(slot[0].id);
            }
          }}
          className="p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Poista kohdistus"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Picker row for adding a new slot ───────────────────────────────────────

function PickerRow({
  product,
  isSplit,
  allProducts,
  bookingId,
  bookingEmployeeId,
  scheduledAt,
  onDone,
}: {
  product: Product;
  isSplit: boolean;
  allProducts: Product[];
  bookingId: string;
  bookingEmployeeId: string | null;
  scheduledAt: string | null;
  onDone: () => void;
}) {
  const indoorComponentId = isSplit ? product.indoor_component_id : null;
  const outdoorComponentId = isSplit ? product.outdoor_component_id : null;

  // Fetch available stock for relevant products
  const { data: indoorPool } = useInventoryUnits({
    productId: indoorComponentId || (isSplit ? "skip" : product.id),
    status: "in_stock",
    limit: 200,
  });
  const { data: outdoorPool } = useInventoryUnits({
    productId: outdoorComponentId || "skip",
    status: "in_stock",
    limit: 200,
  });

  const [indoorId, setIndoorId] = useState("");
  const [outdoorId, setOutdoorId] = useState("");

  const assignSingle = useAssignSingleUnit();
  const assignPair = useAssignPair();

  const installationDate = scheduledAt ? scheduledAt.slice(0, 10) : null;

  const indoorOptions = (indoorPool || []).filter((u) => u.product_id !== "skip");
  const outdoorOptions = (outdoorPool || []).filter((u) => u.product_id !== "skip");

  const indoorComponent = isSplit
    ? allProducts.find((p) => p.id === indoorComponentId)
    : null;
  const outdoorComponent = isSplit
    ? allProducts.find((p) => p.id === outdoorComponentId)
    : null;

  const handleSubmit = async () => {
    if (isSplit) {
      if (!indoorId || !outdoorId) return;
      try {
        await assignPair.mutateAsync({
          indoor_unit_id: indoorId,
          outdoor_unit_id: outdoorId,
          booking_id: bookingId,
          installer_id: bookingEmployeeId,
          installation_date: installationDate,
        });
        onDone();
      } catch (e) {
        console.error(e);
      }
    } else {
      if (!indoorId) return;
      try {
        await assignSingle.mutateAsync({
          unit_id: indoorId,
          booking_id: bookingId,
          installer_id: bookingEmployeeId,
          installation_date: installationDate,
        });
        onDone();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const pending = assignSingle.isPending || assignPair.isPending;
  const canSubmit = isSplit ? !!indoorId && !!outdoorId : !!indoorId;

  return (
    <div className="rounded-lg border border-dashed border-accent/40 bg-accent/5 p-3 space-y-3">
      {isSplit ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-text-muted mb-1 block">
              Sisäyksikkö {indoorComponent ? `(${indoorComponent.name})` : ""}
            </label>
            <select
              value={indoorId}
              onChange={(e) => setIndoorId(e.target.value)}
              className={selectCls}
            >
              <option value="">Valitse…</option>
              {indoorOptions.length === 0 && (
                <option value="" disabled>
                  Ei vapaita varastossa
                </option>
              )}
              {indoorOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.serial_number || `Yksikkö ${u.id.slice(0, 6)}`} ·{" "}
                  {new Date(u.received_at).toLocaleDateString("fi-FI")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-muted mb-1 block">
              Ulkoyksikkö {outdoorComponent ? `(${outdoorComponent.name})` : ""}
            </label>
            <select
              value={outdoorId}
              onChange={(e) => setOutdoorId(e.target.value)}
              className={selectCls}
            >
              <option value="">Valitse…</option>
              {outdoorOptions.length === 0 && (
                <option value="" disabled>
                  Ei vapaita varastossa
                </option>
              )}
              {outdoorOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.serial_number || `Yksikkö ${u.id.slice(0, 6)}`} ·{" "}
                  {new Date(u.received_at).toLocaleDateString("fi-FI")}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div>
          <label className="text-[11px] font-medium text-text-muted mb-1 block">
            Yksikkö ({product.name})
          </label>
          <select
            value={indoorId}
            onChange={(e) => setIndoorId(e.target.value)}
            className={selectCls}
          >
            <option value="">Valitse…</option>
            {indoorOptions.length === 0 && (
              <option value="" disabled>
                Ei vapaita varastossa
              </option>
            )}
            {indoorOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.serial_number || `Yksikkö ${u.id.slice(0, 6)}`} ·{" "}
                {new Date(u.received_at).toLocaleDateString("fi-FI")}
              </option>
            ))}
          </select>
        </div>
      )}

      {indoorOptions.length === 0 && outdoorOptions.length === 0 && (
        <p className="text-xs text-text-muted flex items-center gap-1.5">
          <Package className="w-3 h-3" />
          Ei vapaita yksiköitä varastossa. Vastaanota tavaraerä Varasto → Vastaanota & yksiköt -näkymässä.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover rounded-lg transition-colors"
        >
          Peruuta
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || pending}
          className="px-3 py-1.5 bg-accent hover:bg-accent-dark text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {pending ? "Tallennetaan…" : "Kohdista"}
        </button>
      </div>
    </div>
  );
}
