import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useInventoryUnits,
  useReceiveUnits,
  useUpdateUnit,
  useDeleteUnit,
} from "@/hooks/useInventoryUnits";
import { useProducts, useProductCategories } from "@/hooks/useProducts";
import { useManufacturerOrders } from "@/hooks/useManufacturerOrders";
import { useApplyReceivedToOrders } from "@/hooks/useReceiveStock";
import { inputCls, selectCls } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ScanReceiveDialog } from "@/components/inventory/ScanReceiveDialog";
import { lookupProductByCode } from "@/lib/productLookup";
import { useToast } from "@/context/ToastContext";
import {
  INVENTORY_UNIT_STATUS_LABELS,
  INVENTORY_UNIT_STATUS_STYLES,
  type InventoryUnit,
  type InventoryUnitStatus,
  type Product,
  type ProductCategory,
} from "@/lib/types";
import {
  Package,
  Search,
  Plus,
  X,
  Trash2,
  PackagePlus,
  Pencil,
  Link2,
  Check,
  ScanLine,
  Truck,
} from "lucide-react";

export function UnitsTab({ onAfterReceive }: { onAfterReceive?: () => void } = {}) {
  const [productFilter, setProductFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<InventoryUnitStatus | "">("");
  const [search, setSearch] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [scanReceiveOpen, setScanReceiveOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<InventoryUnit | null>(null);
  const [scanSearch, setScanSearch] = useState(false);

  const { data: allProducts } = useProducts();
  const { data: categories } = useProductCategories();
  const { data: units, isLoading } = useInventoryUnits({
    productId: productFilter || undefined,
    status: statusFilter || undefined,
    search: search.trim() || undefined,
    limit: 500,
  });

  // All active products — user picks which one they're receiving
  const trackableProducts = useMemo(
    () =>
      (allProducts || [])
        .filter((p) => p.active)
        .sort((a, b) => a.name.localeCompare(b.name, "fi")),
    [allProducts]
  );

  return (
    <>
      {/* Filters + Receive button */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">Kaikki tuotteet</option>
            {trackableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.sku ? `(${p.sku})` : ""}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target.value || "") as InventoryUnitStatus | "")}
            className={selectCls}
          >
            <option value="">Kaikki tilat</option>
            {Object.entries(INVENTORY_UNIT_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Hae sarjanumerolla..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputCls + " pl-9 pr-10"}
            />
            <button
              type="button"
              onClick={() => setScanSearch(true)}
              title="Skannaa sarjanumero"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-accent hover:bg-accent-muted transition-colors"
            >
              <ScanLine className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setScanReceiveOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
          >
            <ScanLine className="w-4 h-4" />
            Skannaa saapuva tavara
          </button>
          <button
            onClick={() => setReceiveOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface border border-border hover:bg-surface-hover text-text-primary rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
          >
            <PackagePlus className="w-4 h-4" />
            Vastaanota käsin
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
          Ladataan...
        </div>
      ) : !units || units.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
          Ei yksiköitä. Klikkaa "Skannaa saapuva tavara" tai "Vastaanota käsin" lisätäksesi.
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover/50">
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Tuote</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Sarjanumero</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted hidden md:table-cell">
                    Vastaanotettu
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-text-muted">Tila</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted hidden lg:table-cell">
                    Setti / Varaus
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-text-muted">Toiminto</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <UnitRow key={u.id} unit={u} onEdit={() => setEditUnit(u)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {receiveOpen && (
        <ReceiveDialog
          products={trackableProducts}
          categories={categories || []}
          onClose={() => setReceiveOpen(false)}
        />
      )}
      {scanReceiveOpen && (
        <ScanReceiveDialog
          onClose={() => setScanReceiveOpen(false)}
          onSaved={onAfterReceive}
        />
      )}
      {editUnit && <EditUnitDialog unit={editUnit} onClose={() => setEditUnit(null)} />}
      {scanSearch && (
        <BarcodeScanner
          title="Hae sarjanumerolla"
          hint="Skannaa laitteen sarjanumero"
          mode="single"
          onDetected={(code) => setSearch(code)}
          onClose={() => setScanSearch(false)}
        />
      )}
    </>
  );
}

// ─── Single row ─────────────────────────────────────────────────────────────

function UnitRow({ unit, onEdit }: { unit: InventoryUnit; onEdit: () => void }) {
  const style = INVENTORY_UNIT_STATUS_STYLES[unit.status];
  const label = INVENTORY_UNIT_STATUS_LABELS[unit.status];
  const date = new Date(unit.received_at).toLocaleDateString("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Helsinki",
  });

  return (
    <tr className="border-b border-border/50 hover:bg-surface-hover/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0 overflow-hidden">
            {unit.products?.images?.length ? (
              <img src={unit.products.images[0]} alt="" className="w-full h-full object-cover" />
            ) : (
              <Package className="w-4 h-4 text-text-muted/40" />
            )}
          </div>
          <div>
            <p className="font-medium text-text-primary">{unit.products?.name || "—"}</p>
            {unit.products?.sku && (
              <p className="text-[10px] text-text-muted font-mono">{unit.products.sku}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {unit.serial_number ? (
          <span className="font-mono text-xs text-text-secondary">{unit.serial_number}</span>
        ) : (
          <span className="text-text-muted text-xs italic">ei SN</span>
        )}
      </td>
      <td className="px-4 py-3 text-text-muted text-xs hidden md:table-cell">{date}</td>
      <td className="px-4 py-3 text-center">
        <Badge className={`${style} border text-xs`}>{label}</Badge>
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <div className="flex flex-col gap-1 text-xs">
          {unit.pair_id && (
            <span className="inline-flex items-center gap-1 text-text-muted">
              <Link2 className="w-3 h-3" />
              <span className="font-mono">{unit.pair_id.slice(0, 8)}</span>
            </span>
          )}
          {unit.assigned_booking_id && (
            <Link
              to={`/bookings/${unit.assigned_booking_id}`}
              className="text-accent hover:underline"
            >
              Avaa varaus
            </Link>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-accent-muted text-accent-dark hover:bg-accent/20 transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Muokkaa
        </button>
      </td>
    </tr>
  );
}

// ─── Receive dialog ─────────────────────────────────────────────────────────

interface ReceiveLine {
  product_id: string;
  indoorQty: string;
  indoorSns: string;
  outdoorQty: string;
  outdoorSns: string;
}

function ReceiveDialog({
  products,
  categories,
  onClose,
}: {
  products: Product[];
  categories: ProductCategory[];
  onClose: () => void;
}) {
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [scanProduct, setScanProduct] = useState(false);

  const receive = useReceiveUnits();
  const applyToOrders = useApplyReceivedToOrders();
  const toast = useToast();

  // Open purchase orders → remaining (unreceived) quantity per product_id. Used
  // to preview how much of each received line auto-closes an order vs. is surplus.
  const { data: allOrders } = useManufacturerOrders();
  const remainingByProduct = useMemo(() => {
    const OPEN = ["placed", "confirmed", "shipped", "partially_received"];
    const m = new Map<string, number>();
    for (const o of allOrders || []) {
      if (!OPEN.includes(o.status)) continue;
      for (const l of o.manufacturer_order_lines || []) {
        const rem = l.quantity_ordered - l.quantity_received;
        if (rem > 0) m.set(l.product_id, (m.get(l.product_id) || 0) + rem);
      }
    }
    return m;
  }, [allOrders]);

  const categoryById = useMemo(() => {
    const m = new Map<string, ProductCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const chipCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1);
    }
    return categories
      .filter((c) => c.active && (counts.get(c.id) || 0) > 0)
      .map((c) => ({ ...c, productCount: counts.get(c.id) || 0 }))
      .sort((a, b) => {
        const aRoot = a.parent_id ? categoryById.get(a.parent_id)?.slug : a.slug;
        const bRoot = b.parent_id ? categoryById.get(b.parent_id)?.slug : b.slug;
        if (aRoot === "komponentit" && bRoot !== "komponentit") return -1;
        if (bRoot === "komponentit" && aRoot !== "komponentit") return 1;
        return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "fi");
      });
  }, [products, categories, categoryById]);

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

  const addedIds = useMemo(() => new Set(lines.map((l) => l.product_id)), [lines]);

  const addProduct = (product: Product) => {
    if (addedIds.has(product.id)) {
      // Already in list — bump quantity by 1 instead (handy for repeated clicks of the same product)
      setLines((prev) =>
        prev.map((l) => {
          if (l.product_id !== product.id) return l;
          const isSplit = !!(product.indoor_component_id && product.outdoor_component_id);
          if (isSplit) {
            const cur = parseInt(l.indoorQty) || 0;
            const curOut = parseInt(l.outdoorQty) || 0;
            return { ...l, indoorQty: String(cur + 1), outdoorQty: String(curOut + 1) };
          }
          const cur = parseInt(l.indoorQty) || 0;
          return { ...l, indoorQty: String(cur + 1) };
        }),
      );
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        product_id: product.id,
        indoorQty: "1",
        indoorSns: "",
        outdoorQty: product.indoor_component_id ? "1" : "0",
        outdoorSns: "",
      },
    ]);
    setSearch("");
  };

  // Scanned a box barcode → match to a product and add it (bumps qty if already in cart)
  const handleProductScan = async (code: string) => {
    try {
      const found = await lookupProductByCode(code);
      if (!found) {
        toast.error(`Ei tuotetta koodilla ${code}`);
        return;
      }
      const inList = products.find((p) => p.id === found.id);
      if (!inList) {
        toast.error(`${found.name} löytyi, mutta ei ole aktiivinen tuote`);
        return;
      }
      addProduct(inList);
      toast.success(`Lisätty: ${inList.name}`);
    } catch {
      toast.error("Tuotehaku epäonnistui");
    }
  };

  const updateLine = (productId: string, patch: Partial<ReceiveLine>) => {
    setLines((prev) => prev.map((l) => (l.product_id === productId ? { ...l, ...patch } : l)));
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.product_id !== productId));
  };

  const parseSns = (textVal: string, fallbackQty: string): string[] => {
    const found = textVal
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (found.length > 0) return found;
    const qty = parseInt(fallbackQty);
    if (!qty || qty <= 0) return [];
    return Array.from({ length: qty }, () => "");
  };

  // Create units for one product id, then auto-apply the received count to that
  // product's open orders (oldest first). Returns how many closed an order line.
  const receiveAndApply = async (
    productId: string,
    serials: string[],
    note: string,
  ): Promise<number> => {
    if (serials.length === 0) return 0;
    await receive.mutateAsync({ product_id: productId, serial_numbers: serials, notes: note });
    const res = await applyToOrders.mutateAsync({ productId, qty: serials.length });
    return res?.applied ?? 0;
  };

  const handleSubmit = async () => {
    if (lines.length === 0) return;
    try {
      let appliedToOrders = 0;
      for (const line of lines) {
        const product = products.find((p) => p.id === line.product_id);
        if (!product) continue;
        const isSplit = !!(product.indoor_component_id && product.outdoor_component_id);

        if (isSplit) {
          appliedToOrders += await receiveAndApply(
            product.indoor_component_id!,
            parseSns(line.indoorSns, line.indoorQty),
            notes,
          );
          appliedToOrders += await receiveAndApply(
            product.outdoor_component_id!,
            parseSns(line.outdoorSns, line.outdoorQty),
            notes,
          );
        } else {
          appliedToOrders += await receiveAndApply(
            product.id,
            parseSns(line.indoorSns, line.indoorQty),
            notes,
          );
        }
      }
      if (appliedToOrders > 0) {
        toast.success(`${appliedToOrders} yksikköä kuitattu avoimista tilauksista`);
      }
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  const totalUnitsToCreate = useMemo(() => {
    let total = 0;
    for (const line of lines) {
      const product = products.find((p) => p.id === line.product_id);
      if (!product) continue;
      const isSplit = !!(product.indoor_component_id && product.outdoor_component_id);
      const indoorCount = parseSns(line.indoorSns, line.indoorQty).length;
      const outdoorCount = isSplit ? parseSns(line.outdoorSns, line.outdoorQty).length : 0;
      total += indoorCount + outdoorCount;
    }
    return total;
  }, [lines, products]);

  const canSubmit =
    totalUnitsToCreate > 0 && !receive.isPending && !applyToOrders.isPending;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-text-primary">Vastaanota tavaraerä</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Lisää saapunut tuote ja määrä. Avoimista tilauksista kuitataan
              automaattisesti se verran kuin oli tilattu — loput jää tilaukseen.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Open purchase orders — receive against an order to close its line */}
          {remainingByProduct.size > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-2.5 flex items-center gap-2 text-xs text-blue-900">
              <Truck className="w-4 h-4 shrink-0" />
              <span>
                Avoimia tilauksia odottaa toimitusta. Saapuva määrä kuitataan niistä
                automaattisesti (vanhin ensin) — alla näkyy montako menee tilauksiin ja
                montako jää ylimääräiseksi varastoksi.
              </span>
            </div>
          )}

          {/* Selected lines (cart) */}
          {lines.length > 0 && (
            <div>
              <label className="text-xs font-medium text-text-muted mb-2 block">
                Saapuneet erät ({lines.length} {lines.length === 1 ? "tuote" : "tuotetta"})
              </label>
              <div className="space-y-2">
                {lines.map((line) => {
                  const product = products.find((p) => p.id === line.product_id);
                  if (!product) return null;
                  return (
                    <ReceiveLineCard
                      key={line.product_id}
                      product={product}
                      products={products}
                      line={line}
                      remainingByProduct={remainingByProduct}
                      parseSns={parseSns}
                      onUpdate={(patch) => updateLine(line.product_id, patch)}
                      onRemove={() => removeLine(line.product_id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Product picker */}
          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">
              {lines.length === 0 ? "Lisää ensimmäinen tuote" : "Lisää toinen tuote"}
            </label>

            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Hae nimellä, SKU:lla, merkillä..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputCls + " pl-9 pr-28"}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setScanProduct(true)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent-muted text-accent-dark hover:bg-accent/20 text-xs font-semibold transition-colors"
              >
                <ScanLine className="w-3.5 h-3.5" />
                Skannaa
              </button>
            </div>

            {chipCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                <CategoryChip
                  label="Kaikki"
                  count={products.length}
                  active={!categoryFilter}
                  onClick={() => setCategoryFilter("")}
                />
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

            <div className="rounded-xl border border-border max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-text-muted">
                  Ei tuotteita haulla "{search}"
                  {categoryFilter ? " tässä kategoriassa" : ""}.
                </div>
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
                              isAdded
                                ? "bg-emerald-500 border-emerald-500"
                                : "border border-border"
                            }`}
                          >
                            {isAdded ? (
                              <Check className="w-3 h-3 text-white" />
                            ) : (
                              <Plus className="w-3 h-3 text-text-muted" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-text-primary truncate">{p.name}</div>
                            <div className="text-[11px] text-text-muted flex items-center gap-2">
                              {p.sku && <span className="font-mono">{p.sku}</span>}
                              {cat && <span>· {cat.name}</span>}
                              {p.indoor_component_id && (
                                <span className="inline-flex items-center gap-0.5 text-blue-700">
                                  · <Link2 className="w-2.5 h-2.5" /> kaksiosainen
                                </span>
                              )}
                            </div>
                          </div>
                          {isAdded && (
                            <span className="text-[10px] font-semibold text-emerald-700 whitespace-nowrap">
                              +1 määrää
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Shared notes */}
          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">
              Muistiinpanot (valinnainen) — koskee kaikkia eriä
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Esim. Toimituserä #2026-18, vastaanottaja Mikko..."
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex justify-between items-center gap-2 px-5 py-4 border-t border-border">
          <p className="text-xs text-text-muted">
            {totalUnitsToCreate > 0
              ? `Tallentaa ${totalUnitsToCreate} yksikköä`
              : "Lisää tuote yllä olevasta listasta"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-xl transition-colors"
            >
              Peruuta
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {receive.isPending ? "Tallennetaan..." : "Tallenna"}
            </button>
          </div>
        </div>
      </div>

      {scanProduct && (
        <BarcodeScanner
          title="Skannaa tuote"
          hint="Skannaa laatikon viivakoodi (EAN) tai tuotekoodi"
          mode="repeat"
          onDetected={(code) => handleProductScan(code)}
          onClose={() => setScanProduct(false)}
        />
      )}
    </div>
  );
}

// ─── Single line in the receive "cart" ──────────────────────────────────────

function ReceiveLineCard({
  product,
  products,
  line,
  remainingByProduct,
  parseSns,
  onUpdate,
  onRemove,
}: {
  product: Product;
  products: Product[];
  line: ReceiveLine;
  remainingByProduct: Map<string, number>;
  parseSns: (textVal: string, fallbackQty: string) => string[];
  onUpdate: (patch: Partial<ReceiveLine>) => void;
  onRemove: () => void;
}) {
  const isSplit = !!(product.indoor_component_id && product.outdoor_component_id);
  const indoorComponent = isSplit
    ? products.find((p) => p.id === product.indoor_component_id)
    : null;
  const outdoorComponent = isSplit
    ? products.find((p) => p.id === product.outdoor_component_id)
    : null;
  const [snOpen, setSnOpen] = useState(false);

  // Preview: of the units about to be received, how many close an open order
  // (oldest first) vs. land as plain surplus stock.
  const splitForProduct = (pid: string, count: number) => {
    const rem = remainingByProduct.get(pid) || 0;
    const toOrders = Math.min(count, rem);
    return { toOrders, toStock: count - toOrders };
  };
  let toOrders = 0;
  let toStock = 0;
  if (isSplit) {
    const inC = parseSns(line.indoorSns, line.indoorQty).length;
    const outC = parseSns(line.outdoorSns, line.outdoorQty).length;
    const a = splitForProduct(product.indoor_component_id!, inC);
    const b = splitForProduct(product.outdoor_component_id!, outC);
    toOrders = a.toOrders + b.toOrders;
    toStock = a.toStock + b.toStock;
  } else {
    const c = parseSns(line.indoorSns, line.indoorQty).length;
    const r = splitForProduct(product.id, c);
    toOrders = r.toOrders;
    toStock = r.toStock;
  }

  return (
    <div className="rounded-xl border border-border bg-surface-alt p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-primary truncate">{product.name}</div>
          <div className="text-[11px] text-text-muted flex items-center gap-2">
            {product.sku && <span className="font-mono">{product.sku}</span>}
            {isSplit && (
              <span className="inline-flex items-center gap-0.5 text-blue-700">
                <Link2 className="w-2.5 h-2.5" /> kaksiosainen
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isSplit && indoorComponent && outdoorComponent ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <CompactQtyInput
            label="Sisäyksiköt"
            subtitle={indoorComponent.sku || ""}
            qty={line.indoorQty}
            sns={line.indoorSns}
            onQtyChange={(v) => onUpdate({ indoorQty: v })}
            onSnsChange={(v) => onUpdate({ indoorSns: v })}
            snOpen={snOpen}
            onToggleSn={() => setSnOpen(!snOpen)}
          />
          <CompactQtyInput
            label="Ulkoyksiköt"
            subtitle={outdoorComponent.sku || ""}
            qty={line.outdoorQty}
            sns={line.outdoorSns}
            onQtyChange={(v) => onUpdate({ outdoorQty: v })}
            onSnsChange={(v) => onUpdate({ outdoorSns: v })}
            snOpen={snOpen}
            onToggleSn={() => setSnOpen(!snOpen)}
          />
        </div>
      ) : (
        <CompactQtyInput
          label="Määrä"
          subtitle={product.sku || ""}
          qty={line.indoorQty}
          sns={line.indoorSns}
          onQtyChange={(v) => onUpdate({ indoorQty: v })}
          onSnsChange={(v) => onUpdate({ indoorSns: v })}
          snOpen={snOpen}
          onToggleSn={() => setSnOpen(!snOpen)}
        />
      )}

      {toOrders > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">
          <Truck className="w-3 h-3 text-blue-600 shrink-0" />
          <span>
            <span className="font-semibold text-blue-700">{toOrders}</span> kuitataan avoimista
            tilauksista
            {toStock > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-text-secondary">{toStock}</span> jää varastoksi
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function CompactQtyInput({
  label,
  subtitle,
  qty,
  sns,
  onQtyChange,
  onSnsChange,
  snOpen,
  onToggleSn,
}: {
  label: string;
  subtitle: string;
  qty: string;
  sns: string;
  onQtyChange: (v: string) => void;
  onSnsChange: (v: string) => void;
  snOpen: boolean;
  onToggleSn: () => void;
}) {
  const [scanSn, setScanSn] = useState(false);
  const snCodes = sns
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const lineCount = snCodes.length;
  const effectiveQty = lineCount > 0 ? lineCount : parseInt(qty) || 0;

  return (
    <div className="rounded-lg bg-surface border border-border p-2">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-text-muted mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onQtyChange(String(Math.max(0, (parseInt(qty) || 0) - 1)))}
          disabled={lineCount > 0}
          className="w-7 h-7 rounded-md border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40 flex items-center justify-center text-sm font-bold"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={lineCount > 0 ? lineCount : qty}
          onChange={(e) => onQtyChange(e.target.value)}
          disabled={lineCount > 0}
          className="w-14 text-center px-2 py-1 rounded-md border border-border bg-surface text-sm"
        />
        <button
          type="button"
          onClick={() => onQtyChange(String((parseInt(qty) || 0) + 1))}
          disabled={lineCount > 0}
          className="w-7 h-7 rounded-md border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40 flex items-center justify-center text-sm font-bold"
        >
          +
        </button>
        <span className="text-[10px] text-text-muted ml-1 truncate">{subtitle}</span>
      </div>
      <div className="flex items-center gap-3 mt-1">
        <button
          type="button"
          onClick={onToggleSn}
          className="text-[10px] text-accent hover:underline"
        >
          {snOpen ? "Piilota sarjanumerot" : `Lisää sarjanumerot (${effectiveQty} yksikköä)`}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!snOpen) onToggleSn();
            setScanSn(true);
          }}
          className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
        >
          <ScanLine className="w-3 h-3" />
          Skannaa
        </button>
      </div>
      {snOpen && (
        <textarea
          value={sns}
          onChange={(e) => onSnsChange(e.target.value)}
          rows={3}
          placeholder="SN-001&#10;SN-002"
          className={inputCls + " font-mono text-xs mt-1"}
        />
      )}
      {scanSn && (
        <BarcodeScanner
          title={`Skannaa sarjanumerot — ${label}`}
          hint="Skannaa jokainen yksikkö peräkkäin"
          mode="accumulate"
          initialCodes={snCodes}
          onDetected={(_code, all) => onSnsChange(all.join("\n"))}
          onClose={() => setScanSn(false)}
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
        active
          ? "bg-accent text-white border-accent"
          : "bg-surface border-border text-text-secondary hover:bg-surface-hover"
      }`}
    >
      <span>{label}</span>
      <span className={active ? "text-white/70" : "text-text-muted"}>{count}</span>
    </button>
  );
}

// ─── Edit single unit dialog ────────────────────────────────────────────────

function EditUnitDialog({ unit, onClose }: { unit: InventoryUnit; onClose: () => void }) {
  const [sn, setSn] = useState(unit.serial_number || "");
  const [status, setStatus] = useState<InventoryUnitStatus>(unit.status);
  const [notes, setNotes] = useState(unit.notes || "");
  const [scanSn, setScanSn] = useState(false);
  const update = useUpdateUnit();
  const del = useDeleteUnit();

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        id: unit.id,
        serial_number: sn.trim() || null,
        status,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Poistetaanko tämä yksikkö pysyvästi?")) return;
    try {
      await del.mutateAsync(unit.id);
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-text-primary">Muokkaa yksikköä</h3>
            <p className="text-xs text-text-muted mt-0.5">{unit.products?.name || "—"}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">
              Sarjanumero
            </label>
            <div className="relative">
              <input
                type="text"
                value={sn}
                onChange={(e) => setSn(e.target.value)}
                className={inputCls + " font-mono pr-10"}
              />
              <button
                type="button"
                onClick={() => setScanSn(true)}
                title="Skannaa sarjanumero"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-accent hover:bg-accent-muted transition-colors"
              >
                <ScanLine className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">Tila</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InventoryUnitStatus)}
              className={selectCls}
            >
              {Object.entries(INVENTORY_UNIT_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">
              Muistiinpanot
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
            />
          </div>

          {unit.pair_id && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
              <p className="font-medium">Tämä yksikkö on osa settiä</p>
              <p className="text-blue-700 mt-0.5">
                Pair ID: <span className="font-mono">{unit.pair_id.slice(0, 12)}…</span>
                {unit.assigned_booking_id && " · varattu asennukseen"}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={handleDelete}
            disabled={del.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Poista
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-xl transition-colors"
            >
              Peruuta
            </button>
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {update.isPending ? "Tallennetaan..." : "Tallenna"}
            </button>
          </div>
        </div>
      </div>

      {scanSn && (
        <BarcodeScanner
          title="Skannaa sarjanumero"
          mode="single"
          onDetected={(code) => setSn(code)}
          onClose={() => setScanSn(false)}
        />
      )}
    </div>
  );
}
