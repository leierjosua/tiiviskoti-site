import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Truck,
  AlertTriangle,
  Plus,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Settings,
  Pencil,
  Trash2,
  Check,
  X,
  Save,
  CalendarClock,
} from "lucide-react";
import { useBookingProductOrders, useUpdateBookingProductOrder, useBulkUpdateBPOStatus, type BPOFilters } from "@/hooks/useLogistics";
import { useManufacturerOrders, useUpdateManufacturerOrderStatus } from "@/hooks/useManufacturerOrders";
import { useAutoReorderAlerts, useApproveReorder, useDismissReorder, useTriggerAutoReorderCheck } from "@/hooks/useAutoReorder";
import { useBrandOrderRules, useCreateBrandOrderRule, useUpdateBrandOrderRule, useDeleteBrandOrderRule } from "@/hooks/sales/useBrandOrderRules";
import { useProductBrands } from "@/hooks/useProducts";
import TiptapEditor from "@/components/email/TiptapEditor";
import {
  ProductOrderStatusBadge,
  ProductOrderSourceBadge,
  ManufacturerOrderStatusBadge,
} from "@/components/logistics/LogisticsStatusBadge";
import BookingProductOrderTimeline from "@/components/logistics/BookingProductOrderTimeline";
import RecordOrderDialog from "@/components/inventory/RecordOrderDialog";
import ReceiveOrderDialog from "@/components/logistics/ReceiveOrderDialog";
import SourceAssignmentDialog from "@/components/logistics/SourceAssignmentDialog";
import OrderThreadDialog from "@/components/sales/OrderThreadDialog";
import type {
  BookingProductOrder,
  ProductOrderStatus,
  ManufacturerOrder,
  ManufacturerOrderStatus,
  AutoReorderAlert,
} from "@/lib/types";
import type { BrandOrderRule } from "@/lib/sales-types";

type Tab = "needs" | "orders" | "manufacturer" | "alerts" | "settings";

function formatDate(iso: string | null) {
  if (!iso) return "–";
  return new Date(iso + (iso.includes("T") ? "" : "T00:00:00")).toLocaleDateString("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Helsinki",
  });
}

export default function Logistics() {
  const [tab, setTab] = useState<Tab>("needs");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Logistiikka</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabBtn active={tab === "needs"} onClick={() => setTab("needs")}>
          Tuotetarpeet
        </TabBtn>
        <TabBtn active={tab === "orders"} onClick={() => setTab("orders")}>
          Tuotetilaukset
        </TabBtn>
        <TabBtn active={tab === "manufacturer"} onClick={() => setTab("manufacturer")}>
          Valmistajatilaukset
        </TabBtn>
        <TabBtn active={tab === "alerts"} onClick={() => setTab("alerts")}>
          Varastohälytykset
        </TabBtn>
        <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>
          Tilaussäännöt
        </TabBtn>
      </div>

      {tab === "needs" && <ProductNeedsTab />}
      {tab === "orders" && <BookingProductOrdersTab />}
      {tab === "manufacturer" && <ManufacturerOrdersTab />}
      {tab === "alerts" && <StockAlertsTab />}
      {tab === "settings" && <OrderRulesTab />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "border-accent text-accent"
          : "border-transparent text-text-secondary hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 0: PRODUCT NEEDS (upcoming bookings with products)
// ═══════════════════════════════════════════════════════════════════════════════

interface ProductNeedItem {
  id: string;
  name: string;
  quantity: number;
  product_id: string | null;
  products: { id: string; name: string; brand: string | null; model: string | null; sku: string | null } | null;
  bookings: {
    id: string;
    booking_number: number;
    booking_date: string;
    time_slot: string;
    address: string | null;
    postal_code: string | null;
    status: string;
    customers: { first_name: string; last_name: string } | null;
    employees: { first_name: string; last_name: string } | null;
  };
}

export function ProductNeedsTab() {
  const today = new Date().toISOString().slice(0, 10);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["product-needs", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_line_items")
        .select(`
          id, name, quantity, product_id,
          products(id, name, brand, model, sku),
          bookings!inner(id, booking_number, booking_date, time_slot, address, postal_code, status,
            customers(first_name, last_name),
            employees!bookings_employee_id_fkey(first_name, last_name)
          )
        `)
        .eq("line_type", "product")
        .gte("bookings.booking_date", today)
        .in("bookings.status", ["confirmed", "pending"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as ProductNeedItem[];
    },
  });

  // Sort by booking_date ascending
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.bookings.booking_date.localeCompare(b.bookings.booking_date)),
    [items],
  );

  // Summary: group by product name (use product_id if available, else line item name)
  const productSummary = useMemo(() => {
    const map = new Map<string, { name: string; brand: string | null; total: number }>();
    for (const o of items) {
      const key = o.product_id || o.name;
      const productName = o.products?.name || o.name;
      const brand = o.products?.brand || null;
      const entry = map.get(key) || { name: productName, brand, total: 0 };
      entry.total += o.quantity;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [items]);

  // Group timeline by date
  const byDate = useMemo(() => {
    const map = new Map<string, typeof sorted>();
    for (const o of sorted) {
      const d = o.bookings.booking_date;
      const list = map.get(d) || [];
      list.push(o);
      map.set(d, list);
    }
    return [...map.entries()];
  }, [sorted]);

  if (isLoading) {
    return <div className="text-center py-12 text-text-tertiary">Ladataan...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <CalendarClock className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
        <p className="text-text-secondary font-medium">Ei tulevia tuotetarpeita</p>
        <p className="text-text-tertiary text-sm mt-1">Tulevissa varauksissa ei ole tuotteita</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Tuotteita yhteensä" value={items.reduce((s, o) => s + o.quantity, 0)} color="text-accent" />
        <SummaryCard label="Tulevia varauksia" value={new Set(items.map((o) => o.bookings.id)).size} color="text-blue-600" />
        <SummaryCard label="Eri tuotteita" value={productSummary.length} color="text-purple-600" />
      </div>

      {/* ── Product summary ── */}
      <div className="bg-white border border-border rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Yhteenveto tuotteittain</h3>
        <div className="divide-y divide-border">
          {productSummary.map((p) => (
            <div key={p.name} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-medium text-text-primary">{p.name}</span>
                {p.brand && <span className="text-text-tertiary ml-2">{p.brand}</span>}
              </div>
              <span className="font-semibold text-text-primary">{p.total} kpl</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <CalendarClock className="w-4 h-4" /> Aikajana
        </h3>
        {byDate.map(([date, dateItems]) => {
          const d = new Date(date + "T00:00:00");
          const isToday = date === today;
          const diffDays = Math.round((d.getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
          const dateLabel = isToday
            ? "Tänään"
            : diffDays === 1
              ? "Huomenna"
              : d.toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric" });
          const urgency = isToday ? "border-red-200 bg-red-50/30" : diffDays <= 3 ? "border-amber-200 bg-amber-50/30" : "border-border bg-white";

          return (
            <div key={date} className={`border rounded-2xl p-4 ${urgency}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary text-sm">{dateLabel}</span>
                  <span className="text-text-tertiary text-xs">
                    {d.toLocaleDateString("fi-FI", { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                </div>
                <span className="text-xs text-text-secondary bg-gray-100 px-2 py-0.5 rounded-full">
                  {dateItems.reduce((s, o) => s + o.quantity, 0)} tuotetta
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {dateItems.map((o) => {
                  const cust = o.bookings.customers;
                  const emp = o.bookings.employees;
                  const productLabel = o.products
                    ? `${o.products.brand || ""} ${o.products.name}`.trim()
                    : o.name;
                  return (
                    <div key={o.id} className="py-2 flex items-start justify-between gap-4 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`/varaukset/${o.bookings.booking_number}`}
                            className="font-medium text-accent hover:underline"
                          >
                            #{o.bookings.booking_number}
                          </a>
                          <span className="text-text-tertiary">{o.bookings.time_slot}</span>
                          {cust && (
                            <span className="text-text-secondary">
                              {cust.first_name} {cust.last_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs">
                          <span className="font-medium text-text-primary">{productLabel}</span>
                          {o.quantity > 1 && <span className="text-text-tertiary">× {o.quantity}</span>}
                          {o.products?.sku && <span className="text-text-tertiary">({o.products.sku})</span>}
                        </div>
                        {o.bookings.address && (
                          <p className="text-xs text-text-tertiary mt-0.5">
                            {o.bookings.address}{o.bookings.postal_code ? `, ${o.bookings.postal_code}` : ""}
                          </p>
                        )}
                        {emp && (
                          <p className="text-xs text-text-tertiary">
                            Asentaja: {emp.first_name} {emp.last_name}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: BOOKING PRODUCT ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_FILTER_OPTIONS: { value: ProductOrderStatus | "all"; label: string }[] = [
  { value: "all", label: "Kaikki" },
  { value: "pending", label: "Odottaa" },
  { value: "sourced_from_stock", label: "Varastosta" },
  { value: "order_placed", label: "Tilattu" },
  { value: "shipped", label: "Matkalla" },
  { value: "received", label: "Vastaanotettu" },
  { value: "ready_for_pickup", label: "Noudettavissa" },
  { value: "picked_up", label: "Noudettu" },
  { value: "delivered", label: "Toimitettu" },
];

export function BookingProductOrdersTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductOrderStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sourceDialog, setSourceDialog] = useState<BookingProductOrder | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filters: BPOFilters = {};
  if (statusFilter !== "all") filters.status = statusFilter;

  const { data: orders = [], isLoading } = useBookingProductOrders(filters);
  const bulkUpdate = useBulkUpdateBPOStatus();

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter((o) => {
      const cust = o.bookings?.customers;
      const name = cust ? `${cust.first_name} ${cust.last_name}`.toLowerCase() : "";
      return (
        name.includes(q) ||
        o.products?.name?.toLowerCase().includes(q) ||
        o.products?.brand?.toLowerCase().includes(q) ||
        String(o.bookings?.booking_number).includes(q) ||
        o.bookings?.address?.toLowerCase().includes(q)
      );
    });
  }, [orders, search]);

  // Summary stats
  const pending = orders.filter((o) => o.status === "pending").length;
  const toPickup = orders.filter((o) => ["received", "ready_for_pickup"].includes(o.status)).length;
  const inTransit = orders.filter((o) => ["order_placed", "order_confirmed", "shipped"].includes(o.status)).length;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAction = async (status: ProductOrderStatus) => {
    if (selectedIds.size === 0) return;
    await bulkUpdate.mutateAsync({ ids: [...selectedIds], status });
    setSelectedIds(new Set());
  };

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Odottaa lähdettä" value={pending} color="text-amber-600" />
        <SummaryCard label="Noudettavissa" value={toPickup} color="text-orange-600" />
        <SummaryCard label="Matkalla" value={inTransit} color="text-purple-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Hae asiakas, tuote, brändi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === opt.value
                  ? "bg-accent text-white"
                  : "bg-bg-secondary text-text-secondary hover:bg-bg-secondary/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-accent">{selectedIds.size} valittu</span>
          <button
            onClick={() => handleBulkAction("picked_up")}
            className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg"
          >
            Merkitse noudetuksi
          </button>
          <button
            onClick={() => handleBulkAction("delivered")}
            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg"
          >
            Merkitse toimitetuksi
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-text-tertiary hover:text-text-primary"
          >
            Tyhjennä
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary text-sm">
          {orders.length === 0 ? "Ei tuotetilauksia" : "Ei hakutuloksia"}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-secondary/50">
                  <th className="w-10 px-4 py-3" />
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Varaus</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Asiakas</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Tuote</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Lähde</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Tila</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Eteneminen</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <BPORow
                    key={row.id}
                    order={row}
                    expanded={expandedId === row.id}
                    selected={selectedIds.has(row.id)}
                    onToggleExpand={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    onToggleSelect={() => toggleSelect(row.id)}
                    onAssignSource={() => setSourceDialog(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sourceDialog && (
        <SourceAssignmentDialog order={sourceDialog} onClose={() => setSourceDialog(null)} />
      )}
    </>
  );
}

function BPORow({
  order,
  expanded,
  selected,
  onToggleExpand,
  onToggleSelect,
  onAssignSource,
}: {
  order: BookingProductOrder;
  expanded: boolean;
  selected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onAssignSource: () => void;
}) {
  const update = useUpdateBookingProductOrder();
  const cust = order.bookings?.customers;
  const customerName = cust ? `${cust.first_name} ${cust.last_name}` : "–";

  const handleStatusChange = async (status: ProductOrderStatus) => {
    await update.mutateAsync({ id: order.id, bookingId: order.booking_id, updates: { status } });
  };

  return (
    <>
      <tr className={`border-b border-border last:border-b-0 hover:bg-bg-secondary/30 transition-colors ${selected ? "bg-accent/5" : ""}`}>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="rounded border-border"
          />
        </td>
        <td className="px-4 py-3">
          <span className="font-medium text-text-primary">
            #{order.bookings?.booking_number ?? "–"}
          </span>
          <span className="block text-xs text-text-tertiary">{formatDate(order.bookings?.booking_date ?? null)}</span>
        </td>
        <td className="px-4 py-3 text-text-primary">{customerName}</td>
        <td className="px-4 py-3">
          <span className="text-text-primary">{order.products?.name ?? "–"}</span>
          <span className="block text-xs text-text-tertiary">{order.products?.brand} — {order.quantity} kpl</span>
        </td>
        <td className="px-4 py-3">
          {order.source ? (
            <ProductOrderSourceBadge source={order.source} />
          ) : (
            <button
              onClick={onAssignSource}
              className="text-xs text-accent font-medium hover:underline"
            >
              Valitse lähde
            </button>
          )}
        </td>
        <td className="px-4 py-3">
          <ProductOrderStatusBadge status={order.status} />
        </td>
        <td className="px-4 py-3">
          <BookingProductOrderTimeline order={order} />
        </td>
        <td className="px-4 py-3">
          <button onClick={onToggleExpand} className="text-text-tertiary hover:text-text-primary">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-bg-secondary/30">
          <td colSpan={8} className="px-8 py-4">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
                {order.sourced_at && <span>Lähde päätetty: {formatDate(order.sourced_at)}</span>}
                {order.order_placed_at && <span>Tilattu: {formatDate(order.order_placed_at)}</span>}
                {order.shipped_at && <span>Toimitettu: {formatDate(order.shipped_at)}</span>}
                {order.received_at && <span>Vastaanotettu: {formatDate(order.received_at)}</span>}
                {order.picked_up_at && <span>Noudettu: {formatDate(order.picked_up_at)}</span>}
                {order.delivered_at && <span>Toimitettu asiakkaalle: {formatDate(order.delivered_at)}</span>}
              </div>
              {order.manufacturer_orders && (
                <p className="text-xs text-text-secondary">
                  Valmistajatilaus: VT-{order.manufacturer_orders.order_number} ({order.manufacturer_orders.status})
                  {order.manufacturer_orders.expected_delivery && ` — Arvioitu: ${formatDate(order.manufacturer_orders.expected_delivery)}`}
                </p>
              )}
              {order.notes && <p className="text-xs text-text-tertiary">{order.notes}</p>}
              <div className="flex gap-2">
                {order.status === "pending" && (
                  <button onClick={onAssignSource} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg">
                    Valitse lähde
                  </button>
                )}
                {order.status === "received" && (
                  <QuickAction label="Noudettavissa" onClick={() => handleStatusChange("ready_for_pickup")} />
                )}
                {order.status === "ready_for_pickup" && (
                  <QuickAction label="Noudettu" onClick={() => handleStatusChange("picked_up")} />
                )}
                {order.status === "picked_up" && (
                  <QuickAction label="Toimitettu" color="emerald" onClick={() => handleStatusChange("delivered")} />
                )}
                {order.status === "sourced_from_stock" && (
                  <QuickAction label="Noudettavissa" onClick={() => handleStatusChange("ready_for_pickup")} />
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function QuickAction({ label, onClick, color = "accent" }: { label: string; onClick: () => void; color?: string }) {
  const cls = color === "emerald"
    ? "bg-emerald-600 text-white hover:bg-emerald-700"
    : "bg-accent text-white hover:bg-accent-dark";
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg ${cls}`}>
      <ArrowRight className="w-3 h-3" />
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: MANUFACTURER ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

const MO_STATUS_FILTERS: { value: ManufacturerOrderStatus | "all"; label: string }[] = [
  { value: "all", label: "Kaikki" },
  { value: "draft", label: "Luonnos" },
  { value: "placed", label: "Tilattu" },
  { value: "confirmed", label: "Vahvistettu" },
  { value: "shipped", label: "Toimitettu" },
  { value: "received", label: "Vastaanotettu" },
];

export function ManufacturerOrdersTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ManufacturerOrderStatus | "all">("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<ManufacturerOrder | null>(null);
  const [threadDialog, setThreadDialog] = useState<{ threadId: string; brand: string } | null>(null);

  const { data: orders = [], isLoading } = useManufacturerOrders(
    statusFilter !== "all" ? { status: statusFilter } : {},
  );
  const updateStatus = useUpdateManufacturerOrderStatus();

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        o.brand?.toLowerCase().includes(q) ||
        String(o.order_number).includes(q) ||
        o.notes?.toLowerCase().includes(q),
    );
  }, [orders, search]);

  return (
    <>
      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Hae brändi, tilausnumero..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {MO_STATUS_FILTERS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === opt.value
                  ? "bg-accent text-white"
                  : "bg-bg-secondary text-text-secondary hover:bg-bg-secondary/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-xl hover:bg-accent-dark"
        >
          <Plus className="w-4 h-4" />
          Kirjaa tilaus
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary text-sm">
          Ei valmistajatilauksia
        </div>
      ) : (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-secondary/50">
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">VT#</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Brändi</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Tyyppi</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Tuotteet</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Tila</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Tilattu</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Arv. toimitus</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Toiminnot</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((mo) => {
                  const lines = mo.manufacturer_order_lines ?? [];
                  const productSummary = lines.map((l) => `${l.products?.name ?? "?"} (${l.quantity_ordered})`).join(", ");
                  const totalQty = lines.reduce((sum, l) => sum + l.quantity_ordered, 0);

                  return (
                    <tr key={mo.id} className="border-b border-border last:border-b-0 hover:bg-bg-secondary/30">
                      <td className="px-4 py-3 font-medium text-text-primary">VT-{mo.order_number}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${mo.brand ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                          {mo.brand ?? "Sekalainen"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {mo.order_type === "batch" ? "Erätilaus" : "Yksittäinen"}
                      </td>
                      <td className="px-4 py-3 text-text-primary max-w-[300px] truncate" title={productSummary}>
                        {totalQty} tuotetta
                        <span className="block text-xs text-text-tertiary truncate">{productSummary}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ManufacturerOrderStatusBadge status={mo.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(mo.placed_at)}</td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(mo.expected_delivery)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {["draft", "placed", "confirmed", "shipped", "partially_received"].includes(mo.status) && (
                            <button
                              onClick={() => setReceiveOrder(mo)}
                              className="px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg"
                              title="Kirjaa saapunut tavara — luo yksiköt varastoon"
                            >
                              Vastaanota
                            </button>
                          )}
                          {mo.status !== "received" && mo.status !== "cancelled" && (
                            <button
                              onClick={() => {
                                if (confirm(`Perutaanko tilaus VT-${mo.order_number}?`)) {
                                  updateStatus.mutate({ id: mo.id, status: "cancelled" });
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-text-tertiary hover:text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              Peruuta
                            </button>
                          )}
                          {mo.gmail_thread_id && (
                            <button
                              onClick={() => setThreadDialog({ threadId: mo.gmail_thread_id!, brand: mo.brand ?? "Sekalainen" })}
                              className="px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-bg-secondary rounded-lg"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreateDialog && (
        <RecordOrderDialog onClose={() => setShowCreateDialog(false)} />
      )}
      {receiveOrder && (
        <ReceiveOrderDialog order={receiveOrder} onClose={() => setReceiveOrder(null)} />
      )}
      {threadDialog && (
        <OrderThreadDialog
          threadId={threadDialog.threadId}
          brand={threadDialog.brand}
          onClose={() => setThreadDialog(null)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: STOCK ALERTS
// ═══════════════════════════════════════════════════════════════════════════════

export function StockAlertsTab() {
  const { data: alerts = [], isLoading } = useAutoReorderAlerts();
  const approveReorder = useApproveReorder();
  const dismissReorder = useDismissReorder();
  const triggerCheck = useTriggerAutoReorderCheck();

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Tuotteet joiden varasto on alle hälytysrajan.
        </p>
        <button
          onClick={() => triggerCheck.mutate()}
          disabled={triggerCheck.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-bg-secondary text-text-primary rounded-xl hover:bg-bg-secondary/80 disabled:opacity-40"
        >
          <AlertTriangle className="w-4 h-4" />
          Tarkista nyt
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary text-sm">
          Ei varastohälytyksiä
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onApprove={() => approveReorder.mutate(alert.id)}
              onDismiss={() => dismissReorder.mutate(alert.id)}
              isApproving={approveReorder.isPending}
              isDismissing={dismissReorder.isPending}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AlertCard({
  alert,
  onApprove,
  onDismiss,
  isApproving,
  isDismissing,
}: {
  alert: AutoReorderAlert;
  onApprove: () => void;
  onDismiss: () => void;
  isApproving: boolean;
  isDismissing: boolean;
}) {
  const product = alert.products;
  return (
    <div className="bg-white border border-amber-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{product?.name ?? "Tuote"}</p>
          <p className="text-xs text-text-tertiary">{product?.brand} — {product?.sku}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-red-50 rounded-lg py-2">
          <p className="text-lg font-bold text-red-600">{alert.current_stock}</p>
          <p className="text-[10px] text-red-500 uppercase">Varastossa</p>
        </div>
        <div className="bg-amber-50 rounded-lg py-2">
          <p className="text-lg font-bold text-amber-600">{alert.threshold}</p>
          <p className="text-[10px] text-amber-500 uppercase">Hälytysraja</p>
        </div>
        <div className="bg-emerald-50 rounded-lg py-2">
          <p className="text-lg font-bold text-emerald-600">{alert.suggested_quantity}</p>
          <p className="text-[10px] text-emerald-500 uppercase">Ehdotus</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onApprove}
          disabled={isApproving}
          className="flex-1 px-3 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-40"
        >
          Luo tilausluonnos
        </button>
        <button
          onClick={onDismiss}
          disabled={isDismissing}
          className="px-3 py-2 text-xs font-medium text-text-tertiary hover:text-text-primary hover:bg-bg-secondary rounded-lg disabled:opacity-40"
        >
          Hylkää
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: ORDER RULES (brand-based email routing)
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_BODY_TEMPLATE = `<p>Hei {{recipient_name}},</p>
<p>Pyydämme tilaamaan seuraavat tuotteet:</p>
{{product_lines}}
<p><strong>Asiakas:</strong> {{customer_name}}<br/><strong>Osoite:</strong> {{customer_address}}, {{customer_city}}</p>
<p><strong>Tarjousnumero:</strong> {{offer_number}}</p>
<p>Ystävällisin terveisin,<br/>Lasikiilto</p>`;

export function OrderRulesTab() {
  const { data: rules = [], isLoading } = useBrandOrderRules();
  const { data: allBrands = [] } = useProductBrands();
  const createRule = useCreateBrandOrderRule();
  const updateRule = useUpdateBrandOrderRule();
  const deleteRule = useDeleteBrandOrderRule();

  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    brand: "",
    recipient_email: "",
    recipient_name: "",
    subject_template: "Tilaus: {{brand}} — {{customer_name}}",
    body_template: DEFAULT_BODY_TEMPLATE,
    is_active: true,
  });

  const usedBrands = new Set(rules.map((r) => r.brand));
  const availableBrands = allBrands.filter((b) => !usedBrands.has(b));

  function resetForm() {
    setForm({ brand: "", recipient_email: "", recipient_name: "", subject_template: "Tilaus: {{brand}} — {{customer_name}}", body_template: DEFAULT_BODY_TEMPLATE, is_active: true });
  }

  function startEdit(rule: BrandOrderRule) {
    setEditing(rule.id);
    setForm({ brand: rule.brand, recipient_email: rule.recipient_email, recipient_name: rule.recipient_name || "", subject_template: rule.subject_template, body_template: rule.body_template, is_active: rule.is_active });
  }

  async function handleSave() {
    if (!form.brand.trim() || !form.recipient_email.trim()) return;
    if (editing) {
      await updateRule.mutateAsync({ id: editing, ...form });
      setEditing(null);
    } else {
      await createRule.mutateAsync(form);
      setAdding(false);
    }
    resetForm();
  }

  async function handleDelete(id: string, brand: string) {
    if (!confirm(`Poistetaanko sääntö merkille "${brand}"?`)) return;
    await deleteRule.mutateAsync(id);
  }

  if (isLoading) return <div className="text-xs text-text-tertiary">Ladataan...</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
        <Settings className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong>Automaattiset tilaussäännöt</strong> — Kun asiakas hyväksyy tarjouksen tai erätilaus lähetetään,
          järjestelmä käyttää näitä sääntöjä tilaussähköpostin lähettämiseen.
          <br />
          <span className="text-blue-500">
            Muuttujat: {"{{brand}}"}, {"{{recipient_name}}"}, {"{{customer_name}}"}, {"{{customer_address}}"}, {"{{customer_city}}"}, {"{{offer_number}}"}, {"{{product_lines}}"}
          </span>
        </div>
      </div>

      {rules.map((rule) => (
        <div key={rule.id} className="border border-border rounded-xl bg-white">
          {editing === rule.id ? (
            <RuleFormInline form={form} setForm={setForm} availableBrands={[rule.brand, ...availableBrands]} isEdit onSave={handleSave} onCancel={() => { setEditing(null); resetForm(); }} isSaving={updateRule.isPending} />
          ) : (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-text-primary">{rule.brand}</span>
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${rule.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {rule.is_active ? "Aktiivinen" : "Ei käytössä"}
                  </span>
                </div>
                <div className="text-xs text-text-tertiary mt-0.5 truncate">
                  {rule.recipient_name ? `${rule.recipient_name} — ` : ""}{rule.recipient_email}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-3">
                <button onClick={() => updateRule.mutate({ id: rule.id, is_active: !rule.is_active })} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-tertiary hover:text-text-primary" title={rule.is_active ? "Poista käytöstä" : "Ota käyttöön"}>
                  {rule.is_active ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4" />}
                </button>
                <button onClick={() => startEdit(rule)} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-tertiary hover:text-text-primary"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(rule.id, rule.brand)} className="p-1.5 rounded-lg hover:bg-red-50 text-text-tertiary hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      ))}

      {rules.length === 0 && !adding && (
        <div className="text-center py-8 text-sm text-text-tertiary">Ei tilaussääntöjä. Lisää ensimmäinen sääntö alla.</div>
      )}

      {adding ? (
        <RuleFormInline form={form} setForm={setForm} availableBrands={availableBrands} onSave={handleSave} onCancel={() => { setAdding(false); resetForm(); }} isSaving={createRule.isPending} />
      ) : (
        <button onClick={() => { resetForm(); setAdding(true); }} className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80">
          <Plus className="w-3.5 h-3.5" /> Lisää tilaussääntö
        </button>
      )}
    </div>
  );
}

function RuleFormInline({
  form,
  setForm,
  availableBrands,
  isEdit,
  onSave,
  onCancel,
  isSaving,
}: {
  form: { brand: string; recipient_email: string; recipient_name: string; subject_template: string; body_template: string; is_active: boolean };
  setForm: (f: typeof form) => void;
  availableBrands: string[];
  isEdit?: boolean;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [showTemplate, setShowTemplate] = useState(false);

  return (
    <div className={`p-4 space-y-3 rounded-xl ${isEdit ? "" : "border border-accent/30 bg-accent/5"}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Merkki</label>
          {isEdit ? (
            <input value={form.brand} disabled className="w-full border border-border rounded-lg px-3 py-1.5 text-xs bg-bg-secondary" />
          ) : availableBrands.length > 0 ? (
            <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="w-full border border-border rounded-lg px-3 py-1.5 text-xs bg-bg-primary">
              <option value="">Valitse merkki...</option>
              {availableBrands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : (
            <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Esim. Toshiba" className="w-full border border-border rounded-lg px-3 py-1.5 text-xs" />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Vastaanottajan sähköposti</label>
          <input value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} placeholder="tilaukset@toshiba.fi" className="w-full border border-border rounded-lg px-3 py-1.5 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Vastaanottajan nimi</label>
          <input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} placeholder="Matti Meikäläinen" className="w-full border border-border rounded-lg px-3 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Aihe</label>
          <input value={form.subject_template} onChange={(e) => setForm({ ...form, subject_template: e.target.value })} className="w-full border border-border rounded-lg px-3 py-1.5 text-xs" />
        </div>
      </div>
      <div>
        <button type="button" onClick={() => setShowTemplate(!showTemplate)} className="flex items-center gap-1 text-xs font-medium text-text-tertiary hover:text-text-primary mb-1">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTemplate ? "rotate-180" : ""}`} />
          Viestipohja
        </button>
        {showTemplate && (
          <TiptapEditor content={form.body_template} onChange={(html) => setForm({ ...form, body_template: html })} />
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={isSaving} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-40">
          <Save className="w-3.5 h-3.5" /> Tallenna
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-text-tertiary hover:text-text-primary">
          Peruuta
        </button>
      </div>
    </div>
  );
}

// ─── Shared components ──────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-4">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-text-tertiary mt-1">{label}</p>
    </div>
  );
}
