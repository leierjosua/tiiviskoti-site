import { useState } from "react";
import { X, Warehouse, ShoppingCart, Layers } from "lucide-react";
import { useUpdateBookingProductOrder } from "@/hooks/useLogistics";
import { useManufacturerOrders } from "@/hooks/useManufacturerOrders";
import type { BookingProductOrder } from "@/lib/types";

interface Props {
  order: BookingProductOrder;
  onClose: () => void;
}

export default function SourceAssignmentDialog({ order, onClose }: Props) {
  const [source, setSource] = useState<"from_stock" | "single_order" | "batch_order" | "">("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const update = useUpdateBookingProductOrder();
  const brand = order.products?.brand ?? "";

  // Fetch existing draft/placed batch orders for this brand
  const { data: batchOrders = [] } = useManufacturerOrders({
    orderType: "batch",
    brand: brand || undefined,
  });

  const availableBatches = batchOrders.filter(
    (mo) => mo.status === "draft" || mo.status === "placed" || mo.status === "confirmed",
  );

  const stockQty = (order.products as { stock_quantity?: number | null } | undefined)?.stock_quantity;
  const hasStock = stockQty != null && stockQty >= order.quantity;

  const handleAssign = async () => {
    if (!source) return;
    await update.mutateAsync({
      id: order.id,
      bookingId: order.booking_id,
      updates: {
        source,
        status: source === "from_stock" ? "sourced_from_stock" : "order_placed",
        manufacturer_order_id: source === "batch_order" ? selectedBatchId || null : null,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">Valitse lähde</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-text-secondary mb-4">
            <strong>{order.products?.name}</strong> — {order.quantity} kpl
          </p>

          {/* From Stock */}
          <button
            onClick={() => setSource("from_stock")}
            disabled={!hasStock}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left ${
              source === "from_stock"
                ? "border-accent bg-accent/5"
                : hasStock
                  ? "border-border hover:border-accent/50"
                  : "border-border opacity-50 cursor-not-allowed"
            }`}
          >
            <Warehouse className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Varastosta</p>
              <p className="text-xs text-text-muted">
                {hasStock
                  ? `Varastossa: ${stockQty} kpl`
                  : `Ei riittävästi (${stockQty ?? 0} kpl)`}
              </p>
            </div>
          </button>

          {/* Single Order */}
          <button
            onClick={() => setSource("single_order")}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left ${
              source === "single_order"
                ? "border-accent bg-accent/5"
                : "border-border hover:border-accent/50"
            }`}
          >
            <ShoppingCart className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Yksittäistilaus</p>
              <p className="text-xs text-text-muted">Tilaa valmistajalta tähän varaukseen</p>
            </div>
          </button>

          {/* Batch Order */}
          <button
            onClick={() => setSource("batch_order")}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left ${
              source === "batch_order"
                ? "border-accent bg-accent/5"
                : "border-border hover:border-accent/50"
            }`}
          >
            <Layers className="w-5 h-5 text-purple-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Erätilaus</p>
              <p className="text-xs text-text-muted">Liitä olemassa olevaan erätilauksen</p>
            </div>
          </button>

          {/* Batch order selector */}
          {source === "batch_order" && (
            <div className="pl-8">
              {availableBatches.length > 0 ? (
                <select
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface"
                >
                  <option value="">Valitse erätilaus...</option>
                  {availableBatches.map((mo) => (
                    <option key={mo.id} value={mo.id}>
                      VT-{mo.order_number} — {mo.brand} ({mo.status})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-text-muted">
                  Ei avoimia erätilauksia brändille {brand || "?"}
                </p>
              )}
            </div>
          )}

          {update.isError && (
            <p className="text-sm text-red-600">{update.error?.message ?? "Virhe"}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Peruuta
          </button>
          <button
            onClick={handleAssign}
            disabled={!source || update.isPending || (source === "batch_order" && !selectedBatchId)}
            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-40"
          >
            Vahvista
          </button>
        </div>
      </div>
    </div>
  );
}
