import { useMemo, useState } from "react";
import { X, Plus, Minus, Trash2, ScanLine, Search, Truck, Link2, Check } from "lucide-react";
import { useProducts, useProductCategories } from "@/hooks/useProducts";
import { useCreateManufacturerOrder } from "@/hooks/useManufacturerOrders";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { DatePicker } from "@/components/ui/DatePicker";
import { lookupProductByCode } from "@/lib/productLookup";
import { useToast } from "@/context/ToastContext";
import { inputCls, selectCls } from "@/lib/constants";
import type { Product, ProductCategory } from "@/lib/types";

interface CartLine {
  product_id: string;
  quantity: number;
}

interface Props {
  onClose: () => void;
  onSaved?: () => void;
  /** Pre-fill the cart (e.g. "order all shortages"). */
  initialLines?: CartLine[];
  title?: string;
}

/**
 * Records ONE order (typically already placed by phone/portal) covering many
 * products at once — a quick "tick what you ordered and how much" cart. The
 * order is saved straight to "placed" (Tilattu); receiving against it happens
 * later, manually or by scanning.
 */
export default function RecordOrderDialog({ onClose, onSaved, initialLines, title }: Props) {
  const { data: allProducts } = useProducts();
  const { data: categories } = useProductCategories();
  const createOrder = useCreateManufacturerOrder();
  const toast = useToast();

  const [lines, setLines] = useState<CartLine[]>(initialLines ?? []);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [brand, setBrand] = useState(""); // "" → mixed (null)
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [brandTouched, setBrandTouched] = useState(false);

  const products = useMemo(
    () => (allProducts || []).filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "fi")),
    [allProducts],
  );
  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const categoryById = useMemo(() => {
    const m = new Map<string, ProductCategory>();
    for (const c of categories || []) m.set(c.id, c);
    return m;
  }, [categories]);

  // Brands present among active products, for the optional supplier selector.
  const brands = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.brand) s.add(p.brand);
    return [...s].sort((a, b) => a.localeCompare(b, "fi"));
  }, [products]);

  // If every line shares one brand and the user hasn't picked, suggest it.
  const lineBrands = useMemo(() => {
    const s = new Set<string>();
    for (const l of lines) {
      const b = productById.get(l.product_id)?.brand;
      if (b) s.add(b);
    }
    return s;
  }, [lines, productById]);
  const effectiveBrand = brandTouched ? brand : lineBrands.size === 1 ? [...lineBrands][0] : brand;

  const chipCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1);
    return (categories || [])
      .filter((c) => c.active && (counts.get(c.id) || 0) > 0)
      .map((c) => ({ ...c, productCount: counts.get(c.id) || 0 }))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "fi"));
  }, [products, categories]);

  const addedIds = useMemo(() => new Set(lines.map((l) => l.product_id)), [lines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && p.category_id !== categoryFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.sku || ""} ${p.brand || ""} ${p.model || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, categoryFilter]);

  const bump = (productId: string, delta: number) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === productId);
      if (!existing) {
        if (delta <= 0) return prev;
        return [...prev, { product_id: productId, quantity: delta }];
      }
      const next = existing.quantity + delta;
      if (next <= 0) return prev.filter((l) => l.product_id !== productId);
      return prev.map((l) => (l.product_id === productId ? { ...l, quantity: next } : l));
    });
  };

  const setQty = (productId: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product_id !== productId)
        : prev.map((l) => (l.product_id === productId ? { ...l, quantity: qty } : l)),
    );
  };

  const addProduct = (p: Product) => {
    bump(p.id, 1);
    setSearch("");
  };

  const handleScan = async (code: string) => {
    try {
      const found = await lookupProductByCode(code);
      if (!found || !productById.has(found.id)) {
        toast.error(`Ei aktiivista tuotetta koodilla ${code}`);
        return;
      }
      bump(found.id, 1);
      toast.success(`Lisätty: ${found.name}`);
    } catch {
      toast.error("Tuotehaku epäonnistui");
    }
  };

  const totalUnits = lines.reduce((s, l) => s + l.quantity, 0);
  const canSubmit = lines.length > 0 && !createOrder.isPending;

  const handleSave = async () => {
    if (lines.length === 0) return;
    try {
      // Split products are ordered at the COMPONENT level (one line per
      // indoor/outdoor component id) so receiving — which creates and applies
      // units per component — matches these lines. Storing the parent id here
      // would leave the order undeductible. Mirrors OverviewTab.rowToOrderLines.
      const qtyByProduct = new Map<string, number>();
      for (const l of lines) {
        const p = productById.get(l.product_id);
        if (p?.indoor_component_id && p?.outdoor_component_id) {
          qtyByProduct.set(p.indoor_component_id, (qtyByProduct.get(p.indoor_component_id) || 0) + l.quantity);
          qtyByProduct.set(p.outdoor_component_id, (qtyByProduct.get(p.outdoor_component_id) || 0) + l.quantity);
        } else {
          qtyByProduct.set(l.product_id, (qtyByProduct.get(l.product_id) || 0) + l.quantity);
        }
      }
      await createOrder.mutateAsync({
        brand: effectiveBrand || null,
        order_type: "batch",
        status: "placed",
        notes: notes.trim() || undefined,
        expected_delivery: expectedDelivery || undefined,
        lines: [...qtyByProduct.entries()].map(([product_id, quantity_ordered]) => ({
          product_id,
          quantity_ordered,
          cost_cents: productById.get(product_id)?.cost_cents ?? 0,
        })),
      });
      toast.success(`Tilaus kirjattu — ${totalUnits} kpl matkalla`);
      onClose();
      onSaved?.();
    } catch (e) {
      toast.error((e as Error).message || "Tilauksen kirjaus epäonnistui");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Truck className="w-4 h-4 text-accent flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-text-primary truncate">{title ?? "Kirjaa tilaus"}</h3>
              <p className="text-xs text-text-muted truncate">
                Merkitse mitä tilasit ja kuinka monta — kirjautuu suoraan "Tilattu" (matkalla).
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-hover transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Cart */}
          {lines.length > 0 && (
            <div>
              <label className="text-xs font-medium text-text-muted mb-2 block">
                Tilattavat tuotteet ({lines.length})
              </label>
              <div className="space-y-2">
                {lines.map((line) => {
                  const p = productById.get(line.product_id);
                  if (!p) return null;
                  const isSplit = !!(p.indoor_component_id && p.outdoor_component_id);
                  return (
                    <div
                      key={line.product_id}
                      className="flex items-center gap-2 bg-surface-alt rounded-xl border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-text-primary truncate">{p.name}</div>
                        <div className="text-[11px] text-text-muted flex items-center gap-2">
                          {p.sku && <span className="font-mono">{p.sku}</span>}
                          {p.brand && <span>{p.brand}</span>}
                          {isSplit && (
                            <span className="inline-flex items-center gap-0.5 text-blue-700">
                              <Link2 className="w-2.5 h-2.5" /> kaksiosainen
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => bump(line.product_id, -1)}
                          className="w-7 h-7 rounded-md border border-border text-text-secondary hover:bg-surface-hover flex items-center justify-center"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => setQty(line.product_id, parseInt(e.target.value) || 0)}
                          className="w-14 text-center px-2 py-1 rounded-md border border-border bg-surface text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => bump(line.product_id, 1)}
                          className="w-7 h-7 rounded-md border border-border text-text-secondary hover:bg-surface-hover flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setQty(line.product_id, 0)}
                          className="p-1 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 ml-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Product picker */}
          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">
              {lines.length === 0 ? "Lisää tuotteita tilaukseen" : "Lisää lisää tuotteita"}
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Hae nimellä, SKU:lla, merkillä..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputCls + " pl-9 pr-28"}
              />
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent-muted text-accent-dark hover:bg-accent/20 text-xs font-semibold transition-colors"
              >
                <ScanLine className="w-3.5 h-3.5" />
                Skannaa
              </button>
            </div>

            {chipCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                <CategoryChip label="Kaikki" count={products.length} active={!categoryFilter} onClick={() => setCategoryFilter("")} />
                {chipCategories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    label={c.name}
                    count={c.productCount}
                    active={categoryFilter === c.id}
                    onClick={() => setCategoryFilter(categoryFilter === c.id ? "" : c.id)}
                  />
                ))}
              </div>
            )}

            <div className="rounded-xl border border-border max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-text-muted">Ei tuotteita haulla.</div>
              ) : (
                <ul>
                  {filtered.map((p) => {
                    const isAdded = addedIds.has(p.id);
                    const cat = categoryById.get(p.category_id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => addProduct(p)}
                          className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-border/60 last:border-b-0 transition-colors ${
                            isAdded ? "bg-emerald-50/60 hover:bg-emerald-50" : "hover:bg-surface-hover"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isAdded ? "bg-emerald-500 border-emerald-500" : "border border-border"
                            }`}
                          >
                            {isAdded ? <Check className="w-3 h-3 text-white" /> : <Plus className="w-3 h-3 text-text-muted" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-text-primary truncate">{p.name}</div>
                            <div className="text-[11px] text-text-muted flex items-center gap-2">
                              {p.sku && <span className="font-mono">{p.sku}</span>}
                              {cat && <span>· {cat.name}</span>}
                            </div>
                          </div>
                          {isAdded && <span className="text-[10px] font-semibold text-emerald-700 whitespace-nowrap">+1</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Order meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Toimittaja (valinnainen)</label>
              <select
                value={effectiveBrand}
                onChange={(e) => {
                  setBrand(e.target.value);
                  setBrandTouched(true);
                }}
                className={selectCls}
              >
                <option value="">Sekalainen (eri toimittajat)</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Arvioitu toimitus (valinnainen)</label>
              <DatePicker value={expectedDelivery} onChange={setExpectedDelivery} placeholder="Valitse päivä" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">Muistiinpanot (valinnainen)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Esim. tilattu portaalista, tilausviite 12345..."
              className={inputCls}
            />
          </div>

          {createOrder.isError && (
            <p className="text-sm text-red-600">{createOrder.error?.message ?? "Virhe tilauksen kirjauksessa"}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-5 py-4 border-t border-border shrink-0">
          <p className="text-xs text-text-muted">
            {totalUnits > 0 ? `${totalUnits} kpl, ${lines.length} tuotetta` : "Lisää tuotteita yltä"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-xl transition-colors"
            >
              Peruuta
            </button>
            <button
              onClick={handleSave}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Truck className="w-4 h-4" />
              {createOrder.isPending ? "Kirjataan..." : "Kirjaa tilaus"}
            </button>
          </div>
        </div>
      </div>

      {scanOpen && (
        <BarcodeScanner
          title="Skannaa tuote tilaukseen"
          hint="Skannaa laatikon viivakoodi (EAN) tai tuotekoodi"
          mode="repeat"
          onDetected={(code) => handleScan(code)}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        active ? "bg-accent text-white border-accent" : "bg-surface border-border text-text-secondary hover:bg-surface-hover"
      }`}
    >
      <span>{label}</span>
      <span className={active ? "text-white/70" : "text-text-muted"}>{count}</span>
    </button>
  );
}
