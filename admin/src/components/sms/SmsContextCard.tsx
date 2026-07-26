import { User, Calendar, Wrench, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import type { Customer, Booking, Employee } from "@/lib/types";

export function SmsContextCard({
  phoneE164,
  customer,
  booking,
  employee,
}: {
  phoneE164: string;
  customer?: Customer;
  booking?: Booking & { services?: { name: string } };
  employee?: Employee;
}) {
  return (
    <div className="border-b border-gray-200 px-4 py-2.5 bg-gray-50/50">
      <div className="flex items-center gap-4 flex-wrap text-xs">
        {/* Customer info */}
        {customer ? (
          <Link
            to={`/asiakkaat/${customer.id}`}
            className="flex items-center gap-1.5 text-gray-700 hover:text-accent transition-colors"
          >
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-medium">
              {customer.first_name} {customer.last_name}
            </span>
            {customer.address && (
              <span className="text-gray-400">
                {customer.address}
              </span>
            )}
            <ExternalLink className="w-3 h-3 text-gray-300" />
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 text-gray-500">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span>{phoneE164}</span>
            <span className="text-gray-400">(tuntematon asiakas)</span>
          </div>
        )}

        {/* Booking info */}
        {booking && (
          <Link
            to={`/varaukset/${(booking as Booking).booking_number}`}
            className="flex items-center gap-1.5 text-gray-600 hover:text-accent transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span>
              #{(booking as Booking).booking_number}
              {(booking as unknown as { services?: { name: string } }).services?.name &&
                ` - ${(booking as unknown as { services?: { name: string } }).services!.name}`}
            </span>
            <ExternalLink className="w-3 h-3 text-gray-300" />
          </Link>
        )}

        {/* Installer info */}
        {employee && (
          <div className="flex items-center gap-1.5 text-gray-600">
            <Wrench className="w-3.5 h-3.5 text-gray-400" />
            <span>
              {employee.first_name} {employee.last_name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
