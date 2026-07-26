import { useAllBookings } from "@/hooks/useBookings";
import { useEmployees } from "@/hooks/useEmployees";
import { useServices } from "@/hooks/useServices";
import BookingCalendar from "@/components/BookingCalendar";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { Link } from "react-router-dom";

export default function Calendar() {
  const { data: bookings = [], isLoading } = useAllBookings();
  const { data: employees = [] } = useEmployees("installer");
  const { data: services = [] } = useServices();
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Kalenteri</h1>
        </div>
        <Link
          to="/varaukset/uusi"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-dark transition-colors min-h-[44px]"
        >
          <CalendarPlus className="w-4 h-4" />
          <span className="hidden sm:inline">Luo varaus</span>
          <span className="sm:hidden">Varaus</span>
        </Link>
      </div>
      <BookingCalendar bookings={bookings} employees={employees} services={services} isLoading={isLoading} linkPrefix="/varaukset" />
    </div>
  );
}
