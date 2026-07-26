import type { OfferOrderEmail } from "@/lib/sales-types";

type OrderStatus = "tilattu" | "odottaa" | "osittain" | "epaonnistunut";

const STATUS_CONFIG: Record<OrderStatus, { label: string; cls: string }> = {
  tilattu: { label: "Tilattu", cls: "bg-green-50 text-green-700" },
  odottaa: { label: "Tilaus odottaa", cls: "bg-gray-100 text-gray-600" },
  osittain: { label: "Osittain tilattu", cls: "bg-amber-50 text-amber-700" },
  epaonnistunut: { label: "Tilaus epäonnistunut", cls: "bg-red-50 text-red-700" },
};

function resolveStatus(emails: OfferOrderEmail[]): OrderStatus | null {
  if (emails.length === 0) return null;
  const allSent = emails.every((e) => e.status === "sent");
  if (allSent) return "tilattu";
  const anyFailed = emails.some((e) => e.status === "failed");
  if (anyFailed) return "epaonnistunut";
  const someSent = emails.some((e) => e.status === "sent");
  if (someSent) return "osittain";
  return "odottaa";
}

export function OrderStatusBadge({ orderEmails }: { orderEmails: OfferOrderEmail[] }) {
  const status = resolveStatus(orderEmails);
  if (!status) return null;
  const cfg = STATUS_CONFIG[status];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
