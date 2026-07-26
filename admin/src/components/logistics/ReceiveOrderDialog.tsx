import { useState } from "react";
import { X, PackageCheck, Boxes } from "lucide-react";
import { useReceiveManufacturerOrder } from "@/hooks/useManufacturerOrders";
import { useReceiveUnits } from "@/hooks/useInventoryUnits";
import type { ManufacturerOrder } from "@/lib/types";

interface Props {
  order: ManufacturerOrder;
  onClose: () => void;
}

export default function ReceiveOrderDialog({ order, onClose }: Props) {
  const lines = order.manufacturer_order_lines ?? [];
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.id, l.quantity_ordered])),
  );
  const [autoCreateUnits, setAutoCreateUnits] = useState(true);
  const receive = useReceiveManufacturerOrder();
  const receiveUnits = useReceiveUnits();

  const allFullyReceived = lines.every(
    (l) => (quantities[l.id] ?? 0) >= l.quantity_ordered,
  );

  const handleReceive = async (markFull: boolean) => {
    await receive.mutateAsync({
      id: order.id,
      lines: lines.map((l) => ({
        line_id: l.id,
        quantity_received: quantities[l.id] ?? 0,
      })),
      markFullyReceived: markFull,
    });

    // Auto-create inventory_units for the newly received quantity per line
    if (autoCreateUnits) {
      const noteRef = `Tilaus VT-${order.order_number}`;
      for (const line of lines) {
        const newlyReceived = (quantities[line.id] ?? 0) - line.quantity_received;
        if (newlyReceived > 0 && line.product_id) {
          await receiveUnits.mutateAsync({
            product_id: line.product_id,
            serial_numbers: Array.from({ length: newlyReceived }, () => ""),
            notes: noteRef,
          });
        }
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">
            Vastaanota tilaus VT-{order.order_number}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-text-secondary">
            Syötä vastaanotetut määrät kullekin tuoteriville.
          </p>

          <div className="space-y-3">
            {lines.map((line) => (
              <div key={line.id} className="flex items-center gap-3 bg-surface-hover rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {line.products?.name ?? "Tuote"}
                  </p>
                  <p className="text-xs text-text-muted">
                    Tilattu: {line.quantity_ordered} kpl
                    {line.quantity_received > 0 && ` — Aiemmin vast.: ${line.quantity_received} kpl`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={line.quantity_ordered}
                    value={quantities[line.id] ?? 0}
                    onChange={(e) =>
                      setQuantities({
                        ...quantities,
                        [line.id]: Math.min(line.quantity_ordered, Math.max(0, parseInt(e.target.value) || 0)),
                      })
                    }
                    className="w-16 border border-border rounded px-2 py-1 text-sm text-center"
                  />
                  <span className="text-xs text-text-muted">/ {line.quantity_ordered}</span>
                </div>
              </div>
            ))}
          </div>

          <label className="flex items-start gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCreateUnits}
              onChange={(e) => setAutoCreateUnits(e.target.checked)}
              className="mt-0.5 rounded border-border text-accent focus:ring-accent/30"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <Boxes className="w-3.5 h-3.5 text-accent" />
                Luo fyysiset yksiköt varastoon automaattisesti
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                Kullekin vastaanotetulle rivin yksikölle luodaan inventory_units-rivi (status: varastossa).
                Sarjanumerot voit täyttää myöhemmin Yksiköt-välilehdellä.
              </p>
            </div>
          </label>

          {receive.isError && (
            <p className="text-sm text-red-600">{receive.error?.message ?? "Virhe vastaanotossa"}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Peruuta
          </button>
          {!allFullyReceived && (
            <button
              onClick={() => handleReceive(false)}
              disabled={receive.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 disabled:opacity-40"
            >
              Osittainen vastaanotto
            </button>
          )}
          <button
            onClick={() => handleReceive(true)}
            disabled={receive.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40"
          >
            <PackageCheck className="w-4 h-4" />
            {allFullyReceived ? "Vastaanota kaikki" : "Merkitse valmiiksi"}
          </button>
        </div>
      </div>
    </div>
  );
}
