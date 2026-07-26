import { Badge } from "@/components/ui/badge";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  type TicketStatus,
} from "@/lib/cs-types";

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge className={`${TICKET_STATUS_COLORS[status]} text-xs font-medium`}>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}
