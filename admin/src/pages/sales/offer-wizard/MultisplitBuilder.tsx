import { useMemo } from "react";
import { Minus, Plus, AlertTriangle, Wind } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatCents } from "@/lib/utils";
import { isMultisplitOutdoor, isIndoorComponent } from "@/lib/products";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface Props {
  allProducts: Product[];
  productQty: Record<string, number>;
  onSetProductQty: (id: string, qty: number) => void;
}

/**
 * Multisplit device builder: pick ONE multisplit outdoor unit, then attach N
 * indoor units. Selections are written to the shared productQty record, so they
 * flow into line items exactly like any other product — no special storage.
 *
 * The outdoor unit and indoor units are normally hidden components; here they
 * are the whole point, so they're surfaced explicitly and structured as
 * "1 outdoor + many indoor" instead of one flat list.
 */
export function MultisplitBuilder({ allProducts, productQty, onSetProductQty }: Props) {
  const outdoors = useMemo(
    () => allProducts.filter((p) => p.active && isMultisplitOutdoor(p)),
    [allProducts],
  );
  const indoors = useMemo(
    () => allProducts.filter((p) => p.active && isIndoorComponent(p)),
    [allProducts],
  );

  // The selected outdoor is whichever multisplit outdoor currently has qty > 0.
  const selectedOutdoor = useMemo(
    () => outdoors.find((p) => (productQty[p.id] || 0) > 0) || null,
    [outdoors, productQty],
  );
  const ports = selectedOutdoor?.multisplit_ports ?? null;

  // Indoor and outdoor units are brand-tied: a Toshiba outdoor only pairs with
  // Toshiba indoor units. Once an outdoor is picked, restrict the indoor list to
  // its brand so we don't offer incompatible cross-brand combinations.
  const outdoorBrand = (selectedOutdoor?.brand || "").trim().toLowerCase();
  const brandIndoors = useMemo(
    () => (outdoorBrand ? indoors.filter((p) => (p.brand || "").trim().toLowerCase() === outdoorBrand) : indoors),
    [indoors, outdoorBrand],
  );

  const selectedIndoors = useMemo(
    () => indoors.filter((p) => (productQty[p.id] || 0) > 0),
    [indoors, productQty],
  );
  const indoorCount = selectedIndoors.reduce((sum, p) => sum + (productQty[p.id] || 0), 0);
  const overCapacity = ports != null && indoorCount > ports;

  function selectOutdoor(id: string) {
    // Switching outdoor: clear the previously selected one (only one outdoor per multisplit).
    if (selectedOutdoor && selectedOutdoor.id !== id) onSetProductQty(selectedOutdoor.id, 0);
    if (id) onSetProductQty(id, 1);
    else if (selectedOutdoor) onSetProductQty(selectedOutdoor.id, 0);
  }

  const inc = (id: string) => onSetProductQty(id, (productQty[id] || 0) + 1);
  const dec = (id: string) => onSetProductQty(id, Math.max(0, (productQty[id] || 0) - 1));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wind size={16} className="text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">Multi-split-laitteisto</h3>
      </div>

      {/* Outdoor unit */}
      <div>
        <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
          Ulkoyksikkö (1 kpl)
        </label>
        {outdoors.length === 0 ? (
          <p className="text-xs text-text-muted">
            Ei multi-split-ulkoyksiköitä. Merkitse ulkoyksikölle porttimäärä tuotehallinnassa.
          </p>
        ) : (
          <SearchableSelect
            value={selectedOutdoor?.id || ""}
            onChange={selectOutdoor}
            placeholder="Valitse multi-split-ulkoyksikkö..."
            searchPlaceholder="Hae ulkoyksikköä nimellä, merkillä tai SKU:lla..."
            options={outdoors.map((p) => ({
              id: p.id,
              label: p.name,
              sublabel: [p.brand, p.multisplit_ports ? `${p.multisplit_ports} porttia` : null].filter(Boolean).join(" · ") || undefined,
              price: p.price_cents / 100,
              keywords: p.sku || undefined,
            }))}
          />
        )}
      </div>

      {/* Indoor units — only once an outdoor is chosen */}
      {selectedOutdoor && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide">
              Sisäyksiköt
            </label>
            <span className={`text-[11px] font-semibold ${overCapacity ? "text-red-600" : "text-text-muted"}`}>
              {indoorCount}{ports != null ? ` / ${ports}` : ""} valittu
            </span>
          </div>

          {overCapacity && (
            <div className="flex items-start gap-1.5 mb-2 p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700">
              <AlertTriangle size={13} className="flex-shrink-0 mt-px" />
              <span>Liikaa sisäyksiköitä: ulkoyksikössä on {ports} porttia, valittu {indoorCount}.</span>
            </div>
          )}

          {/* Selected indoor units with steppers */}
          {selectedIndoors.length > 0 && (
            <div className="space-y-2 mb-2">
              {selectedIndoors.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-accent bg-accent/5">
                  <div className="min-w-0">
                    {p.brand && <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mr-1">{p.brand}</span>}
                    <span className="text-sm font-medium break-words">{p.name}</span>
                    <span className="text-xs text-text-muted ml-2">{formatCents(p.price_cents)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => dec(p.id)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Minus size={14} /></button>
                    <span className="text-sm font-semibold w-6 text-center">{productQty[p.id]}</span>
                    <button onClick={() => inc(p.id)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Plus size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add another indoor unit */}
          <SearchableSelect
            value=""
            onChange={(id) => { if (id) inc(id); }}
            placeholder={`Lisää sisäyksikkö${selectedOutdoor?.brand ? ` (${selectedOutdoor.brand})` : ""}...`}
            searchPlaceholder="Hae sisäyksikköä nimellä, merkillä tai SKU:lla..."
            options={brandIndoors
              .filter((p) => !(productQty[p.id] > 0))
              .map((p) => ({
                id: p.id,
                label: p.name,
                sublabel: p.brand || undefined,
                price: p.price_cents / 100,
                keywords: p.sku || undefined,
              }))}
          />
        </div>
      )}
    </div>
  );
}
