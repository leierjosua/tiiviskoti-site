import { useState, useMemo } from "react";
import { useInventoryMovements } from "@/hooks/useInventory";
import { useProducts } from "@/hooks/useProducts";
import { selectCls } from "@/lib/constants";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_TYPE_STYLES,
  type InventoryMovementType,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { UnitsTab } from "@/components/inventory/UnitsTab";
import { AllocationTab } from "@/components/inventory/AllocationTab";
import { OverviewTab as DashboardTab } from "@/components/inventory/OverviewTab";
import { InventoryCountTab } from "@/components/inventory/InventoryCountTab";
import {
  ProductNeedsTab,
  ManufacturerOrdersTab,
  StockAlertsTab,
} from "@/pages/Logistics";
import {
  Package,
  AlertTriangle,
  History,
  Boxes,
  LayoutDashboard,
  Truck,
  ClipboardList,
  ClipboardCheck,
  PackageCheck,
  PackagePlus,
  ChevronDown,
} from "lucide-react";

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab =
  | "dashboard"
  | "orders"
  | "units"
  | "allocation"
  | "count"
  | "needs"
  | "alerts"
  | "movements";

const PRIMARY_TABS = [
  { key: "dashboard", label: "Yleiskatsaus", icon: LayoutDashboard },
  { key: "orders", label: "Tilaukset", icon: Truck },
  { key: "units", label: "Vastaanota & yksiköt", icon: PackagePlus },
  { key: "allocation", label: "Kohdista", icon: PackageCheck },
  { key: "count", label: "Inventaario", icon: ClipboardCheck },
] as const;

// Less frequently used views, tucked behind a "Lisää" menu.
const MORE_TABS = [
  { key: "needs", label: "Tarpeet", icon: ClipboardList },
  { key: "alerts", label: "Hälytykset", icon: AlertTriangle },
  { key: "movements", label: "Liikkeet", icon: History },
] as const;

// ─── Main component ─────────────────────────────────────────────────────────

export default function Inventory() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [moreOpen, setMoreOpen] = useState(false);

  const activeMore = MORE_TABS.find((t) => t.key === tab);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Boxes className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Varasto</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-border">
        {/* Only the primary tabs scroll horizontally. The "Lisää" menu lives
            outside this container — an overflow-x ancestor would clip its
            absolutely-positioned dropdown (overflow-y also becomes auto). */}
        <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
          {PRIMARY_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === key
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* "Lisää" overflow menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeMore
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            {activeMore ? <activeMore.icon className="w-4 h-4" /> : null}
            {activeMore ? activeMore.label : "Lisää"}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 min-w-44 rounded-xl border border-border bg-surface shadow-lg py-1">
                {MORE_TABS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setTab(key);
                      setMoreOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      tab === key
                        ? "text-accent bg-accent-muted/40"
                        : "text-text-secondary hover:bg-surface-hover"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "orders" && <ManufacturerOrdersTab />}
      {tab === "units" && <UnitsTab onAfterReceive={() => setTab("allocation")} />}
      {tab === "allocation" && <AllocationTab />}
      {tab === "count" && <InventoryCountTab />}
      {tab === "needs" && <ProductNeedsTab />}
      {tab === "alerts" && <StockAlertsTab />}
      {tab === "movements" && <MovementsTab />}
    </div>
  );
}

// ─── Movements tab ──────────────────────────────────────────────────────────

function MovementsTab() {
  const { data: allProducts } = useProducts();
  const [productFilter, setProductFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<InventoryMovementType | undefined>();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: movements, isLoading } = useInventoryMovements({
    productId: productFilter,
    movementType: typeFilter,
    from: dateFrom || undefined,
    to: dateTo || undefined,
    limit: 200,
  });

  // Products with stock tracking for filter dropdown
  const trackedProducts = useMemo(
    () => (allProducts || []).filter((p) => p.stock_quantity != null).sort((a, b) => a.name.localeCompare(b.name, "fi")),
    [allProducts]
  );

  return (
    <>
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <select
          value={productFilter || ""}
          onChange={(e) => setProductFilter(e.target.value || undefined)}
          className={selectCls}
        >
          <option value="">Kaikki tuotteet</option>
          {trackedProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.sku ? `(${p.sku})` : ""}
            </option>
          ))}
        </select>

        <select
          value={typeFilter || ""}
          onChange={(e) => setTypeFilter((e.target.value || undefined) as InventoryMovementType | undefined)}
          className={selectCls}
        >
          <option value="">Kaikki tyypit</option>
          {Object.entries(MOVEMENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="Alkaen" />
        <DatePicker value={dateTo} onChange={setDateTo} placeholder="Päättyen" />
      </div>

      {/* Movements list */}
      {isLoading ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">Ladataan...</div>
      ) : !movements || movements.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
          Ei varastoliikkeitä.
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover/50">
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Aika</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Tuote</th>
                  <th className="text-center px-4 py-3 font-medium text-text-muted">Tyyppi</th>
                  <th className="text-center px-4 py-3 font-medium text-text-muted">Määrä</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted hidden sm:table-cell">Syy</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const style = MOVEMENT_TYPE_STYLES[m.movement_type];
                  const label = MOVEMENT_TYPE_LABELS[m.movement_type];
                  return (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-surface-hover/30 transition-colors">
                      <td className="px-4 py-3 text-text-muted text-xs whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Helsinki" })}
                        {" "}
                        {new Date(m.created_at).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-md bg-surface-hover flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {m.products?.images?.length ? (
                              <img src={m.products.images[0]} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-3 h-3 text-text-muted/40" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-text-primary text-xs">{m.products?.name || "—"}</p>
                            {m.products?.sku && <p className="text-[10px] text-text-muted font-mono">{m.products.sku}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`${style} border text-xs`}>{label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${m.quantity > 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {m.quantity > 0 ? "+" : ""}{m.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs hidden sm:table-cell">
                        {m.reason || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
