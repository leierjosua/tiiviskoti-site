import { useOfferOrderEmails } from "@/hooks/sales/useOfferOrderEmails";
import { OrderStatusBadge } from "./OrderStatusBadge";

export function OfferOrderStatusBadge({ offerId }: { offerId: string }) {
  const { data: orderEmails = [] } = useOfferOrderEmails(offerId);
  if (orderEmails.length === 0) return null;
  return <OrderStatusBadge orderEmails={orderEmails} />;
}
