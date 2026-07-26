import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  FileText,
  Ticket,
  ShoppingBag,
} from "lucide-react";
import { formatDateTime, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from "@/lib/cs-types";
import type { CSTicket } from "@/lib/cs-types";
import { useCustomerContext } from "@/hooks/customer-service/useCustomerContext";

interface Props {
  ticket: CSTicket;
}

export function CustomerContextPanel({ ticket }: Props) {
  const email = ticket.customer_email;
  const customerId = ticket.customer_id;

  const { prevTickets, bookings, contracts, formSubs } = useCustomerContext(
    email,
    customerId,
    ticket.id
  );

  const hasNoData =
    !prevTickets?.length &&
    !bookings?.length &&
    !contracts?.length &&
    !formSubs?.length;

  if (!email && !customerId) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-text-muted uppercase">
        Asiakashistoria
      </h3>

      {hasNoData && (
        <p className="text-xs text-text-muted">Ei aiempaa historiaa</p>
      )}

      {/* Previous tickets */}
      {(prevTickets?.length ?? 0) > 0 && (
        <ContextSection icon={Ticket} title="Aiemmat tiketit">
          {prevTickets!.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between py-1 text-xs rounded px-1 -mx-1"
            >
              <span className="text-text-primary truncate min-w-0">
                <span className="text-text-muted font-mono">#{t.ticket_number}</span>{" "}
                {t.subject}
              </span>
              <Badge
                className={`${TICKET_STATUS_COLORS[t.status as keyof typeof TICKET_STATUS_COLORS] ?? "bg-gray-100 text-gray-600"} text-[10px] shrink-0 ml-2`}
              >
                {TICKET_STATUS_LABELS[t.status as keyof typeof TICKET_STATUS_LABELS] ?? t.status}
              </Badge>
            </div>
          ))}
        </ContextSection>
      )}

      {/* Bookings */}
      {(bookings?.length ?? 0) > 0 && (
        <ContextSection icon={Calendar} title="Varaukset">
          {bookings!.map((b: Record<string, unknown>) => (
            <Link
              key={b.id as string}
              to={`/varaukset/${b.booking_number}`}
              className="flex items-center justify-between py-1 text-xs hover:bg-surface-hover rounded px-1 -mx-1"
            >
              <span className="text-text-primary">
                <span className="text-text-muted font-mono">#{b.booking_number as number}</span>{" "}
                {b.booking_date as string}
              </span>
              <Badge
                className={`${STATUS_COLORS[b.status as keyof typeof STATUS_COLORS] ?? "bg-gray-100 text-gray-600"} text-[10px] shrink-0 ml-2`}
              >
                {STATUS_LABELS[b.status as keyof typeof STATUS_LABELS] ?? (b.status as string)}
              </Badge>
            </Link>
          ))}
        </ContextSection>
      )}

      {/* Contracts */}
      {(contracts?.length ?? 0) > 0 && (
        <ContextSection icon={FileText} title="Sopimukset">
          {contracts!.map((c: Record<string, unknown>) => (
            <Link
              key={c.id as string}
              to={`/sopimukset/${c.contract_number}`}
              className="flex items-center justify-between py-1 text-xs hover:bg-surface-hover rounded px-1 -mx-1"
            >
              <span className="text-text-primary">
                Sopimus #{c.contract_number as number}
              </span>
              <span className="text-text-muted text-[10px]">
                {c.start_date as string}
              </span>
            </Link>
          ))}
        </ContextSection>
      )}

      {/* Form submissions */}
      {(formSubs?.length ?? 0) > 0 && (
        <ContextSection icon={ShoppingBag} title="Lomakelähetykset">
          {formSubs!.map((f: Record<string, unknown>) => (
            <div
              key={f.id as string}
              className="py-1 text-xs text-text-primary"
            >
              <span className="text-text-muted">{f.form_slug as string}</span>{" "}
              <span className="text-text-secondary">
                {formatDateTime(f.created_at as string)}
              </span>
              {!!f.message && (
                <p className="text-text-secondary truncate mt-0.5">
                  {(f.message as string).slice(0, 80)}
                </p>
              )}
            </div>
          ))}
        </ContextSection>
      )}
    </div>
  );
}

function ContextSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Ticket;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary mb-1">
        <Icon className="h-3.5 w-3.5 text-text-muted" />
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
