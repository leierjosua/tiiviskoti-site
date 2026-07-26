import { useMemo, useState } from "react";
import { useInventoryOverview, type InventoryOverviewRow } from "@/hooks/useInventoryOverview";
import { useManufacturerOrders } from "@/hooks/useManufacturerOrders";
import { useAutoReorderAlerts } from "@/hooks/useAutoReorder";
import RecordOrderDialog from "@/components/inventory/RecordOrderDialog";
import { inputCls } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Truck,
  AlertTriangle,
  ShoppingCart,
  Search,
  Link2,
  Plus,
  CheckCircle2,
  Wallet,
} from "lucide-react";

interface OrderCartLine {
  product_id: string;
  quantity: number;
}

/**
 * Map an overview row to the orderable product(s). Split bundles are ordered as
 * their two components (stock for a bundle is min(indoor, outdoor)), so that
 * receiving and "ordered" counts line up with how the overview aggregates them.
 */
function rowToOrderLines(row: InventoryOverviewRow, quantity: number): OrderCartLine[] {
  const qty = Math.max(1, quantity);
  if (row.indoor_component_id && row.outdoor_component_id) {
    return [
      { product_id: row.indoor_component_id, quantity: qty },
      { product_id: row.outdoor_component_id, quantity: qty },
    ];
  }
  return [{ product_id: row.id, quantity: qty }];
}

const URGENCY_STYLES: Record<InventoryOverviewRow["urgency"], { label: string; cls: string; dot: string; order: number }> = {
  out:     { label: "Loppumassa",  cls: "bg-red-50 text-red-700 border-red-200",         dot: "bg-red-500",     order: 0 },
  low:     { label: "Vähissä",     cls: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500",   order: 1 },
  ordered: { label: "Tilauksessa", cls: "bg-blue-50 text-blue-700 border-blue-200",      dot: "bg-blue-500",    order: 2 },
  ok:      { label: "OK",          cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", order: 3 },
};

function fEur(cents: number): string {
  return (cents / 100).toLocaleString("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function fDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("fi-FI", {
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Helsinki",
  });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / 86_400_000);
}

export function OverviewTab() {
  const { data: rows, isLoading, error } = useInventoryOverview();
  const { data: allMOs } = useManufacturerOrders();
  const { data: alerts } = useAutoReorderAlerts();

  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<InventoryOverviewRow["urgency"] | "all">("all");
  // null = order dialog closed; an array (possibly empty) = open, pre-filled with these lines.
  const [orderInit, setOrderInit] = useState<OrderCartLine[] | null>(null);
  const [showComponents, setShowComponents] = useState(false);

  // KPI totals
  const kpis = useMemo(() => {
    const all = rows || [];
    const totalStock = all.reduce((s, r) => s + r.stock, 0);
    const totalOrdered = all.reduce((s, r) => s + r.ordered, 0);
    const totalNeeded = all.reduce((s, r) => s + r.needed, 0);
    const alertCount = all.filter((r) => r.urgency === "out" || r.urgency === "low").length;
    return { totalStock, totalOrdered, totalNeeded, alertCount };
  }, [rows]);

  // Filter + sort rows
  const visible = useMemo(() => {
    const list = (rows || []).filter((r) => {
      // Hide idle products entirely: nothing in stock, nothing ordered, no upcoming demand.
      if (r.needed === 0 && r.stock === 0 && r.ordered === 0) return false;
      // Hide components by default (the bundle row shows them aggregated)
      if (!showComponents && r.isComponentOf) return false;
      if (urgencyFilter !== "all" && r.urgency !== urgencyFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${r.name} ${r.sku || ""} ${r.brand || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Sort: active (demand or stock or ordered) first → urgency → run-out date → name.
    // Idle rows (no need, no stock, no order) sink to the bottom.
    list.sort((a, b) => {
      const aActive = a.needed > 0 || a.stock > 0 || a.ordered > 0;
      const bActive = b.needed > 0 || b.stock > 0 || b.ordered > 0;
      if (aActive !== bActive) return aActive ? -1 : 1;

      const ua = URGENCY_STYLES[a.urgency].order;
      const ub = URGENCY_STYLES[b.urgency].order;
      if (ua !== ub) return ua - ub;

      // Within same urgency, things with demand come before things without
      const aDemand = a.needed > 0 ? 0 : 1;
      const bDemand = b.needed > 0 ? 0 : 1;
      if (aDemand !== bDemand) return aDemand - bDemand;

      const da = a.stockRunsOutDate || "9999-12-31";
      const db = b.stockRunsOutDate || "9999-12-31";
      if (da !== db) return da.localeCompare(db);
      return a.name.localeCompare(b.name, "fi");
    });
    return list;
  }, [rows, search, urgencyFilter]);

  // Shortage list: every non-component product still short after stock + ordered.
  // `items` is the human-readable per-product list ("what to buy and how many"),
  // `lines` is the same demand mapped to orderable products (split → components),
  // merged by product, ready to pre-fill the order cart.
  const replenish = useMemo(() => {
    const items = (rows || [])
      .filter((r) => !r.isComponentOf && r.shortage > 0)
      .sort((a, b) => {
        const da = a.stockRunsOutDate || "9999-12-31";
        const db = b.stockRunsOutDate || "9999-12-31";
        if (da !== db) return da.localeCompare(db);
        if (a.shortage !== b.shortage) return b.shortage - a.shortage;
        return a.name.localeCompare(b.name, "fi");
      });
    const byProduct = new Map<string, number>();
    for (const r of items) {
      for (const line of rowToOrderLines(r, r.shortage)) {
        byProduct.set(line.product_id, (byProduct.get(line.product_id) || 0) + line.quantity);
      }
    }
    const lines: OrderCartLine[] = [...byProduct].map(([product_id, quantity]) => ({ product_id, quantity }));
    return { items, lines, productCount: items.length };
  }, [rows]);

  // Stock & on-order value. Valued at the sellable product/set level: a split
  // bundle's quantity is complete sets (min of components) × the set's own
  // cost/price, simple products by their unit count. Components are skipped to
  // avoid double-counting. NOTE: cost_cents is ALV 0; price_cents INCLUDES ALV
  // 25,5 %, so the ex-VAT sales figures divide by 1.255.
  const value = useMemo(() => {
    const VAT = 1.255;
    let stockCost = 0;
    let stockSalesVat = 0;
    let orderCost = 0;
    let orderSalesVat = 0;
    for (const r of rows || []) {
      if (r.isComponentOf) continue;
      stockCost += r.stock * (r.cost_cents || 0);
      stockSalesVat += r.stock * (r.price_cents || 0);
      orderCost += r.ordered * (r.cost_cents || 0);
      orderSalesVat += r.ordered * (r.price_cents || 0);
    }
    return {
      stockCost,
      stockSalesVat,
      stockSalesExVat: Math.round(stockSalesVat / VAT),
      orderCost,
      orderSalesVat,
      orderSalesExVat: Math.round(orderSalesVat / VAT),
      totalCost: stockCost + orderCost,
      totalSalesVat: stockSalesVat + orderSalesVat,
      totalSalesExVat: Math.round((stockSalesVat + orderSalesVat) / VAT),
    };
  }, [rows]);

  if (isLoading) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
        Ladataan varastokuvaa...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-800">
        <p className="font-semibold mb-1">Yleiskatsauksen lataus epäonnistui</p>
        <p className="font-mono text-xs">{(error as Error).message}</p>
      </div>
    );
  }

  const activeMoCount = (allMOs || []).filter(
    (mo) => mo.status !== "received" && mo.status !== "cancelled" && mo.status !== "draft",
  ).length;
  const alertsActive = (alerts || []).filter((a) => a.status === "suggested").length;

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Package}
          label="Yksiköitä varastossa"
          value={String(kpis.totalStock)}
          color="emerald"
        />
        <KpiCard
          icon={Truck}
          label="Matkalla varastoon"
          value={String(kpis.totalOrdered)}
          sub={`${activeMoCount} aktiivista tilausta`}
          color="blue"
        />
        <KpiCard
          icon={ShoppingCart}
          label="Tarvitaan (tulevat)"
          value={String(kpis.totalNeeded)}
          color="indigo"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Hälytyksiä"
          value={String(kpis.alertCount + alertsActive)}
          sub={alertsActive > 0 ? `${alertsActive} alle hälytysrajan` : "Ei kriittisiä"}
          color={kpis.alertCount + alertsActive > 0 ? "red" : "emerald"}
          onClick={() => setUrgencyFilter(urgencyFilter === "out" ? "all" : "out")}
          active={urgencyFilter === "out"}
        />
      </div>

      {/* Stock value: purchase cost (ALV 0) vs sales value */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-text-muted" />
          <p className="text-xs text-text-muted uppercase tracking-wide">Varaston arvo</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="pr-4">
            <p className="text-2xl font-bold text-text-primary">{fEur(value.stockCost)}</p>
            <p className="text-[11px] text-text-muted mt-1">Ostohinta (ALV 0 %)</p>
          </div>
          <div className="pl-4">
            <p className="text-2xl font-bold text-emerald-700">{fEur(value.stockSalesExVat)}</p>
            <p className="text-[11px] text-text-muted mt-1">
              Myyntihinta (ALV 0 %) · sis. ALV {fEur(value.stockSalesVat)}
            </p>
          </div>
        </div>

        {/* On-order (on the way) value — distinguished */}
        {(value.orderCost > 0 || value.orderSalesVat > 0) && (
          <>
            <div className="mt-3 pt-3 border-t border-dashed border-border flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                <Truck className="w-3.5 h-3.5" /> Matkalla (tilatut):
              </span>
              <span className="text-text-muted">
                ostohinta <span className="font-semibold text-text-primary">{fEur(value.orderCost)}</span>
              </span>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted">
                myyntihinta <span className="font-semibold text-emerald-700">{fEur(value.orderSalesExVat)}</span>{" "}
                (ALV 0 %, sis. ALV {fEur(value.orderSalesVat)})
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-border flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-semibold text-text-primary">Yhteensä (varasto + matkalla):</span>
              <span className="text-text-muted">
                ostohinta <span className="font-bold text-text-primary">{fEur(value.totalCost)}</span>
              </span>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted">
                myyntihinta <span className="font-bold text-emerald-700">{fEur(value.totalSalesExVat)}</span>{" "}
                (ALV 0 %, sis. ALV {fEur(value.totalSalesVat)})
              </span>
            </div>
          </>
        )}
      </div>

      {/* Shopping list: what's still short after stock + ordered */}
      {replenish.productCount > 0 && (
        <ShortageList
          items={replenish.items}
          onAddRow={(row) => setOrderInit(rowToOrderLines(row, Math.max(1, row.shortage)))}
          onOrderAll={() => setOrderInit(replenish.lines)}
        />
      )}

      {/* Order actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOrderInit([])}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-accent hover:bg-accent-dark text-white transition-colors"
        >
          <Truck className="w-4 h-4" />
          Kirjaa tilaus
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Hae nimellä, SKU:lla, merkillä..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls + " pl-9"}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {(["all", "out", "low", "ordered", "ok"] as const).map((u) => {
            const isActive = urgencyFilter === u;
            const style = u === "all" ? null : URGENCY_STYLES[u];
            return (
              <button
                key={u}
                type="button"
                onClick={() => setUrgencyFilter(u)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  isActive
                    ? "bg-accent text-white border-accent"
                    : "bg-surface text-text-secondary border-border hover:bg-surface-hover"
                }`}
              >
                {style && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>}
                {u === "all" ? "Kaikki" : style!.label}
              </button>
            );
          })}
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-surface text-text-secondary hover:bg-surface-hover cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showComponents}
              onChange={(e) => setShowComponents(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent/30"
            />
            Näytä komponentit erikseen
          </label>
        </div>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
          Ei tuotteita näytettäväksi.
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover/50">
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Tuote</th>
                  <th className="text-center px-3 py-3 font-medium text-text-muted">Varastossa</th>
                  <th className="text-center px-3 py-3 font-medium text-text-muted">Tilattu</th>
                  <th className="text-center px-3 py-3 font-medium text-text-muted">Tarve</th>
                  <th className="text-left px-3 py-3 font-medium text-text-muted hidden md:table-cell">Riittävyys</th>
                  <th className="text-center px-3 py-3 font-medium text-text-muted">Tila</th>
                  <th className="text-right px-4 py-3 font-medium text-text-muted">Toiminto</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <OverviewRow
                    key={row.id}
                    row={row}
                    onAddToOrder={() => setOrderInit(rowToOrderLines(row, Math.max(1, row.shortage)))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record-order dialog (cart) */}
      {orderInit !== null && (
        <RecordOrderDialog initialLines={orderInit} onClose={() => setOrderInit(null)} />
      )}
    </div>
  );
}

// ─── Shortage list ("what to buy and how many") ─────────────────────────────

function ShortageList({
  items,
  onAddRow,
  onOrderAll,
}: {
  items: InventoryOverviewRow[];
  onAddRow: (row: InventoryOverviewRow) => void;
  onOrderAll: () => void;
}) {
  const totalShort = items.reduce((s, r) => s + r.shortage, 0);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-amber-200/70">
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingCart className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-text-primary truncate">
            Tilattavaa — {items.length} {items.length === 1 ? "tuote" : "tuotetta"} · yhteensä {totalShort} kpl
          </h3>
        </div>
        <button
          type="button"
          onClick={onOrderAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap flex-shrink-0"
        >
          <Truck className="w-3.5 h-3.5" />
          Tilaa puuttuvat
        </button>
      </div>
      <ul className="divide-y divide-amber-200/50">
        {items.map((r) => {
          const isSplit = !!(r.indoor_component_id && r.outdoor_component_id);
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
                  {r.name}
                  {isSplit && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide text-blue-700 bg-blue-50 px-1 py-0.5 rounded">
                      <Link2 className="w-2.5 h-2.5" /> kaksiosainen
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted">
                  Tarve {r.needed} · varastossa {r.stock} · tilattu {r.ordered}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right leading-none">
                  <div className="text-base font-bold text-amber-700">{r.shortage}</div>
                  <div className="text-[10px] text-amber-600 uppercase tracking-wide">puuttuu</div>
                </div>
                <button
                  type="button"
                  onClick={() => onAddRow(r)}
                  title="Lisää tämä tuote uuteen tilaukseen"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-surface border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Tilaukseen
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function OverviewRow({ row, onAddToOrder }: { row: InventoryOverviewRow; onAddToOrder: () => void }) {
  const style = URGENCY_STYLES[row.urgency];
  const daysUntilOut = daysUntil(row.stockRunsOutDate);
  const isSplit = !!(row.indoor_component_id && row.outdoor_component_id);
  const hasUpcomingNeed = row.needed > 0;

  return (
    <tr className="border-b border-border/50 hover:bg-surface-hover/30 transition-colors">
      <td className="px-4 py-3">
        <div className={`flex items-center gap-2 ${row.isComponentOf ? "pl-6 border-l-2 border-blue-200" : ""}`}>
          <span className={`w-2 h-2 rounded-full ${style.dot} flex-shrink-0`}></span>
          <div className="min-w-0">
            <div className="font-medium text-text-primary truncate flex items-center gap-1.5">
              {row.name}
              {row.isComponentOf && (
                <span className="text-[9px] uppercase tracking-wide text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                  komponentti
                </span>
              )}
            </div>
            <div className="text-[11px] text-text-muted flex items-center gap-2">
              {row.brand && <span>{row.brand}</span>}
              {row.sku && <span className="font-mono">{row.sku}</span>}
              {isSplit && (
                <span className="inline-flex items-center gap-0.5 text-blue-700">
                  <Link2 className="w-2.5 h-2.5" /> kaksiosainen
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-center">
        <div className="inline-flex flex-col items-center">
          <span className={`font-bold ${row.stock === 0 ? "text-red-600" : "text-text-primary"}`}>
            {row.stock}
            {isSplit && <span className="text-[9px] text-text-muted ml-1 align-baseline">settiä</span>}
          </span>
          {isSplit && row.componentBreakdown && (
            <span
              className={`text-[10px] ${
                row.componentBreakdown.indoorStock !== row.componentBreakdown.outdoorStock
                  ? "text-amber-700 font-semibold"
                  : "text-text-muted"
              }`}
              title={
                row.componentBreakdown.indoorStock !== row.componentBreakdown.outdoorStock
                  ? "Epätasapaino — toista komponenttia on enemmän kuin toista"
                  : ""
              }
            >
              {row.componentBreakdown.indoorStock} sisä / {row.componentBreakdown.outdoorStock} ulko
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 text-center text-blue-700">
        {row.ordered > 0 ? (
          <div className="inline-flex flex-col items-center">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Truck className="w-3 h-3" />
              {row.ordered}
            </span>
            {isSplit && row.componentBreakdown && (row.componentBreakdown.indoorOrdered > 0 || row.componentBreakdown.outdoorOrdered > 0) && (
              <span className="text-[10px] text-blue-700/70">
                {row.componentBreakdown.indoorOrdered} sisä / {row.componentBreakdown.outdoorOrdered} ulko
              </span>
            )}
          </div>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-center text-text-primary">
        {row.needed > 0 ? (
          <span className="font-semibold">{row.needed}</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3 hidden md:table-cell">
        {!hasUpcomingNeed ? (
          <span className="text-text-muted text-xs">—</span>
        ) : row.stockRunsOutDate === null ? (
          <div className="text-xs">
            <div className="text-emerald-700 font-medium">Riittää kaikkiin</div>
            <div className="text-[10px] text-text-muted">
              kattaa kaikki {row.coversByStock} tulevaa varausta
            </div>
          </div>
        ) : (
          <div className="text-xs space-y-0.5">
            {/* Shortage callout — always visible if there's a final shortfall */}
            {row.shortage > 0 && (
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 font-semibold text-[10px]">
                Puuttuu {row.shortage} kpl tilauksen jälkeenkin
              </div>
            )}
            <div className="text-text-primary">
              Varasto loppuu{" "}
              <span
                className={
                  daysUntilOut !== null && daysUntilOut < 7
                    ? "text-red-700 font-bold"
                    : "font-semibold"
                }
              >
                {fDate(row.stockRunsOutDate)}
              </span>
              {daysUntilOut !== null && (
                <span
                  className={`ml-1 text-[10px] ${
                    daysUntilOut < 7
                      ? "text-red-600 font-semibold"
                      : daysUntilOut < 14
                        ? "text-amber-600"
                        : "text-text-muted"
                  }`}
                >
                  ({daysUntilOut === 0 ? "tänään" : daysUntilOut === 1 ? "huom." : `${daysUntilOut} pv`})
                </span>
              )}
            </div>
            <div className="text-[10px] text-text-muted">
              Varasto kattaa {row.coversByStock} varausta
              {row.ordered > 0 && (
                <span>
                  {" · "}tilauksen kanssa {row.coversByStockAndOrdered} varausta
                </span>
              )}
            </div>
            {row.ordered > 0 && (
              <div className="text-[10px] text-blue-700">
                Tilauksen perillä viimeistään:{" "}
                <span className="font-semibold">{fDate(row.stockRunsOutDate)}</span>
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-3 text-center">
        <Badge className={`${style.cls} border text-xs`}>{style.label}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        {row.urgency === "ok" ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="w-3 h-3" />
            Kunnossa
          </span>
        ) : (
          <button
            type="button"
            onClick={onAddToOrder}
            title="Lisää tämä tuote uuteen tilaukseen"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-accent hover:bg-accent-dark text-white transition-colors"
          >
            <Plus className="w-3 h-3" />
            Tilaukseen
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── KPI card ───────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  onClick,
  active,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: "emerald" | "blue" | "indigo" | "red";
  onClick?: () => void;
  active?: boolean;
}) {
  const colorMap = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    red: "bg-red-50 border-red-200 text-red-700",
  };

  const content = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${colorMap[color]}`.replace(/bg-\S+\s+border-\S+\s+/, "")} />
        <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      {sub && <p className="text-[11px] text-text-muted mt-1">{sub}</p>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-2xl border p-4 text-left bg-surface transition-all hover:shadow-sm ${
          active ? "ring-2 ring-accent/40" : "border-border"
        }`}
      >
        {content}
      </button>
    );
  }

  return <div className="rounded-2xl border border-border bg-surface p-4">{content}</div>;
}
