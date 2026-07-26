import { useState, useMemo } from "react";
import { Search, Package, Check, Clock, AlertCircle, MessageSquare } from "lucide-react";
import { useDeviceOrders, type DeviceOrderRow } from "@/hooks/sales/useDeviceOrders";
import OrderThreadDialog from "@/components/sales/OrderThreadDialog";

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof Check }> = {
  sent: { label: "Tilattu", cls: "bg-green-50 text-green-700", icon: Check },
  pending: { label: "Odottaa", cls: "bg-gray-100 text-gray-600", icon: Clock },
  failed: { label: "Epäonnistunut", cls: "bg-red-50 text-red-700", icon: AlertCircle },
};

type StatusFilter = "all" | "sent" | "pending" | "failed";

function formatDate(iso: string | null) {
  if (!iso) return "–";
  return new Date(iso + "T00:00:00").toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Helsinki" });
}

export default function DeviceOrders() {
  const { data: orders = [], isLoading } = useDeviceOrders();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [threadDialog, setThreadDialog] = useState<{ threadId: string; brand: string } | null>(null);

  const filtered = useMemo(() => {
    let result = orders;
    if (statusFilter !== "all") result = result.filter((o) => o.orderStatus === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.customerName?.toLowerCase().includes(q) ||
          o.brand.toLowerCase().includes(q) ||
          o.bookingAddress?.toLowerCase().includes(q) ||
          String(o.bookingNumber).includes(q) ||
          o.offerNumber?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [orders, statusFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Laitetilaukset</h1>
          <span className="text-sm text-text-tertiary">({filtered.length})</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Hae asiakas, brändi, osoite..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "sent", "pending", "failed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === s ? "bg-accent text-white" : "bg-bg-secondary text-text-secondary hover:bg-bg-secondary/80"
              }`}
            >
              {s === "all" ? "Kaikki" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary text-sm">
          {orders.length === 0 ? "Ei laitetilauksia" : "Ei hakutuloksia"}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-secondary/50">
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Varaus</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Pvm</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Asiakas</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Osoite</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Brändi</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Laite</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Tila</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Viestit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <OrderRow key={row.orderId} row={row} onShowThread={setThreadDialog} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {threadDialog && (
        <OrderThreadDialog
          threadId={threadDialog.threadId}
          brand={threadDialog.brand}
          onClose={() => setThreadDialog(null)}
        />
      )}
    </div>
  );
}

function OrderRow({ row, onShowThread }: { row: DeviceOrderRow; onShowThread: (d: { threadId: string; brand: string }) => void }) {
  const cfg = STATUS_CONFIG[row.orderStatus] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-bg-secondary/30 transition-colors">
      <td className="px-4 py-3 font-medium text-text-primary">
        {row.bookingNumber ? `#${row.bookingNumber}` : row.offerNumber ? `T${row.offerNumber}` : "–"}
      </td>
      <td className="px-4 py-3 text-text-secondary">{formatDate(row.bookingDate)}</td>
      <td className="px-4 py-3 text-text-primary">{row.customerName || "–"}</td>
      <td className="px-4 py-3 text-text-secondary truncate max-w-[200px]">{row.bookingAddress || "–"}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
          {row.brand}
        </span>
      </td>
      <td className="px-4 py-3 text-text-primary text-sm max-w-[250px]">
        {row.productNames.length > 0 ? row.productNames.join(", ") : "–"}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
          <Icon className="w-3 h-3" />
          {cfg.label}
        </span>
      </td>
      <td className="px-4 py-3">
        {row.gmailThreadId ? (
          <button
            onClick={() => onShowThread({ threadId: row.gmailThreadId!, brand: row.brand })}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Näytä
          </button>
        ) : (
          <span className="text-xs text-text-tertiary">–</span>
        )}
      </td>
    </tr>
  );
}
