import {
  PRODUCT_ORDER_STATUS_LABELS,
  PRODUCT_ORDER_STATUS_STYLES,
  PRODUCT_ORDER_SOURCE_LABELS,
  MANUFACTURER_ORDER_STATUS_LABELS,
  MANUFACTURER_ORDER_STATUS_STYLES,
  type ProductOrderStatus,
  type ProductOrderSource,
  type ManufacturerOrderStatus,
} from "@/lib/types";

export function ProductOrderStatusBadge({ status }: { status: ProductOrderStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRODUCT_ORDER_STATUS_STYLES[status]}`}>
      {PRODUCT_ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export function ProductOrderSourceBadge({ source }: { source: ProductOrderSource | null }) {
  if (!source) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        Ei päätetty
      </span>
    );
  }
  const STYLES: Record<ProductOrderSource, string> = {
    from_stock: "bg-blue-50 text-blue-700",
    single_order: "bg-amber-50 text-amber-700",
    batch_order: "bg-purple-50 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[source]}`}>
      {PRODUCT_ORDER_SOURCE_LABELS[source]}
    </span>
  );
}

export function ManufacturerOrderStatusBadge({ status }: { status: ManufacturerOrderStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${MANUFACTURER_ORDER_STATUS_STYLES[status]}`}>
      {MANUFACTURER_ORDER_STATUS_LABELS[status]}
    </span>
  );
}
