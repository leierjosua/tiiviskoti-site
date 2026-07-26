import { Link } from "react-router-dom";
import { Plus, ClipboardCheck } from "lucide-react";
import { useUserRole } from "@/context/UserRoleContext";
import { useInstallerBookings } from "@/hooks/useInstallerData";
import { useEmployees } from "@/hooks/useEmployees";
import BookingCalendar from "@/components/BookingCalendar";

export default function InstallerCalendar() {
  const { employee } = useUserRole();
  const { data: bookings = [], isLoading } = useInstallerBookings(employee?.id);
  // RLS limits this to self + teammates only — perfect for the team filter UI.
  const { data: visibleEmployees = [] } = useEmployees("installer");
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Kalenteri</h1>
        <div className="flex gap-2">
          <Link
            to="/tyontekija/uusi-varaus"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Uusi varaus
          </Link>
          <Link
            to="/tyontekija/tehty-keikka"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-border bg-surface text-text-primary hover:bg-gray-50 transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" /> Tehty keikka
          </Link>
        </div>
      </div>
      <BookingCalendar
        bookings={bookings}
        employees={visibleEmployees}
        isLoading={isLoading}
        linkPrefix="/tyontekija/varaukset"
        currentEmployeeId={employee?.id}
      />
    </div>
  );
}
