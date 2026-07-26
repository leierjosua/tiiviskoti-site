import { Check, Clock, Package, Truck, Warehouse, HandMetal, MapPin, X } from "lucide-react";
import type { BookingProductOrder, ProductOrderStatus } from "@/lib/types";

const STEPS: { status: ProductOrderStatus; label: string; icon: React.ElementType }[] = [
  { status: "pending", label: "Odottaa", icon: Clock },
  { status: "sourced_from_stock", label: "Varastosta", icon: Warehouse },
  { status: "order_placed", label: "Tilattu", icon: Package },
  { status: "order_confirmed", label: "Vahvistettu", icon: Check },
  { status: "shipped", label: "Matkalla", icon: Truck },
  { status: "received", label: "Vastaanotettu", icon: Warehouse },
  { status: "ready_for_pickup", label: "Noudettavissa", icon: Package },
  { status: "picked_up", label: "Noudettu", icon: HandMetal },
  { status: "delivered", label: "Toimitettu", icon: MapPin },
];

const STATUS_ORDER: Record<ProductOrderStatus, number> = {
  pending: 0,
  sourced_from_stock: 1,
  order_placed: 2,
  order_confirmed: 3,
  shipped: 4,
  received: 5,
  ready_for_pickup: 6,
  picked_up: 7,
  delivered: 8,
  cancelled: -1,
};

function formatTs(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("fi-FI", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Helsinki",
  });
}

export default function BookingProductOrderTimeline({ order }: { order: BookingProductOrder }) {
  if (order.status === "cancelled") {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600">
        <X className="w-4 h-4" />
        <span>Peruutettu {formatTs(order.cancelled_at)}</span>
      </div>
    );
  }

  const currentIdx = STATUS_ORDER[order.status] ?? 0;

  // Determine which steps to show based on source
  const relevantSteps = order.source === "from_stock"
    ? STEPS.filter((s) => ["pending", "sourced_from_stock", "ready_for_pickup", "picked_up", "delivered"].includes(s.status))
    : STEPS.filter((s) => s.status !== "sourced_from_stock");

  return (
    <div className="flex items-center gap-1">
      {relevantSteps.map((step, i) => {
        const stepIdx = STATUS_ORDER[step.status];
        const isActive = stepIdx <= currentIdx;
        const isCurrent = step.status === order.status;
        const Icon = step.icon;

        return (
          <div key={step.status} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`w-4 h-0.5 ${isActive ? "bg-accent" : "bg-border"}`} />
            )}
            <div
              className={`relative flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                isCurrent
                  ? "bg-accent text-white ring-2 ring-accent/30"
                  : isActive
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-hover text-text-muted"
              }`}
              title={step.label}
            >
              <Icon className="w-3 h-3" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
