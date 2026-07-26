import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, OFFER_STATUS_LABELS, OFFER_STATUS_COLORS } from "@/lib/sales-types";
import type { LeadStatus, OfferStatus } from "@/lib/sales-types";

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${LEAD_STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {LEAD_STATUS_LABELS[status] || status}
    </span>
  );
}

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${OFFER_STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {OFFER_STATUS_LABELS[status] || status}
    </span>
  );
}

export function StageBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border"
      style={{ backgroundColor: color + "18", color, borderColor: color + "40" }}
    >
      {label}
    </span>
  );
}
