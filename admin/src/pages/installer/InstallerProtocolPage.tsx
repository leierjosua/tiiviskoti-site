import { useParams } from "react-router-dom";
import { useBookingByNumber } from "@/hooks/useBookings";
import ProtocolTabs from "@/components/ProtocolTabs";

export default function InstallerProtocolPage() {
  const { bookingNumber } = useParams<{ bookingNumber: string }>();
  const num = bookingNumber ? parseInt(bookingNumber, 10) : undefined;
  const { data: booking, isLoading } = useBookingByNumber(num);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-border rounded w-48" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  if (!booking) {
    return <p className="text-text-muted">Varausta ei löytynyt.</p>;
  }

  // RLS on the bookings table guarantees we only loaded this row if the user
  // can see it (own booking, on the team, or shares an employee_team with the
  // primary). No further client-side gating needed — matches InstallerBookingDetail.

  return (
    <ProtocolTabs
      booking={booking}
      backUrl={`/tyontekija/varaukset/${booking.booking_number}`}
    />
  );
}
