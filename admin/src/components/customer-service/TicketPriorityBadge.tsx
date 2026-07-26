import {
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_DOT_COLORS,
  type TicketPriority,
} from "@/lib/cs-types";

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span
        className={`inline-block h-2 w-2 rounded-full ${TICKET_PRIORITY_DOT_COLORS[priority]}`}
      />
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}
