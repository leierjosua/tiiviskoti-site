import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CSTicket } from "@/lib/cs-types";

type SLAState = "ok" | "approaching" | "breached" | "none";

function getSLAState(ticket: CSTicket): SLAState {
  if (ticket.sla_breached) return "breached";
  if (ticket.first_response_at || ticket.status === "resolved" || ticket.status === "closed")
    return "ok";
  if (!ticket.sla_first_response_minutes) return "none";

  const created = new Date(ticket.created_at).getTime();
  const now = Date.now();
  const elapsedMin = (now - created) / 60_000;
  const target = ticket.sla_first_response_minutes;
  const remaining = target - elapsedMin;

  if (remaining <= 0) return "breached";
  if (remaining <= target * 0.25) return "approaching";
  return "ok";
}

function formatRemaining(ticket: CSTicket): string {
  if (!ticket.sla_first_response_minutes) return "";
  if (ticket.first_response_at) return "Vastattu";

  const created = new Date(ticket.created_at).getTime();
  const now = Date.now();
  const elapsedMin = (now - created) / 60_000;
  const remaining = ticket.sla_first_response_minutes - elapsedMin;

  if (remaining <= 0) {
    const over = Math.abs(remaining);
    if (over >= 60) return `${Math.floor(over / 60)}h ylitetty`;
    return `${Math.floor(over)}min ylitetty`;
  }
  if (remaining >= 60) return `${Math.floor(remaining / 60)}h jäljellä`;
  return `${Math.floor(remaining)}min jäljellä`;
}

const STATE_STYLES: Record<SLAState, string> = {
  ok: "text-green-600",
  approaching: "text-amber-600",
  breached: "text-red-600",
  none: "text-gray-400",
};

export function SLAIndicator({ ticket }: { ticket: CSTicket }) {
  const state = getSLAState(ticket);
  if (state === "none") return null;

  const Icon = state === "breached" ? AlertTriangle : state === "ok" ? CheckCircle2 : Clock;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${STATE_STYLES[state]}`}>
      <Icon className="h-3.5 w-3.5" />
      {formatRemaining(ticket)}
    </span>
  );
}
