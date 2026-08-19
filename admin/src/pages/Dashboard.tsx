import { useDashboardStats } from "@/hooks/useDashboardStats";
import { formatCents, formatDate, formatAddress, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/KpiCard";
import {
  CalendarPlus,
  CalendarDays,
  Briefcase,
  ChevronRight,
  MapPin,
  User,
  Calendar,
  Clock,
  Layers,
  LayoutDashboard,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Booking } from "@/lib/types";

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-border rounded-xl w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-surface rounded-2xl" />
          <div className="h-96 bg-surface rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      label: "Uudet varaukset",
      value: formatCents(stats.todayNewBookingsValue),
      sub: `${stats.todayNewBookings} varausta · tänään`,
      icon: CalendarPlus,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-50",
      accent: "border-l-blue-400",
    },
    {
      label: "Varaukset",
      value: formatCents(stats.last30DaysBookingsValue),
      sub: `${stats.last30DaysBookings} varausta · viim. 30 pv`,
      icon: CalendarDays,
      iconColor: "text-violet-600",
      iconBg: "bg-violet-50",
      accent: "border-l-violet-400",
    },
    {
      label: "Keikat tänään",
      value: stats.todayGigCount,
      sub: formatCents(stats.todayGigsValue),
      icon: Briefcase,
      iconColor: "text-amber-600",
      iconBg: "bg-amber-50",
      accent: "border-l-amber-400",
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
            Yhteenveto
          </h1>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {cards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      {/* Two columns: Recent bookings + Today's gigs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookings */}
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-text-muted" />
              <h2 className="font-semibold text-sm text-text-primary">
                Viimeisimmät varaukset
              </h2>
            </div>
            <Link
              to="/varaukset"
              className="text-xs text-accent-dark hover:text-accent font-semibold inline-flex items-center gap-0.5"
            >
              Kaikki
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {stats.recentBookings.length === 0 ? (
              <p className="p-6 text-text-muted text-sm text-center">
                Ei varauksia
              </p>
            ) : (
              stats.recentBookings.map((booking: Booking) => (
                <RecentBookingRow key={booking.id} booking={booking} />
              ))
            )}
          </div>
        </div>

        {/* Today's Gigs Timeline */}
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-text-muted" />
              <h2 className="font-semibold text-sm text-text-primary">
                Tänään
              </h2>
            </div>
            <Badge className="bg-accent-muted text-accent-dark border border-accent/30 text-xs font-bold">
              {stats.todayGigCount} keikkaa
            </Badge>
          </div>

          {stats.todayGigs.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
                <Calendar className="w-7 h-7 text-text-muted/40" />
              </div>
              <p className="text-sm font-medium text-text-muted">
                Ei keikkoja tänään
              </p>
              <p className="text-xs text-text-muted/60 mt-0.5">
                Kaikki vapaa!
              </p>
            </div>
          ) : (
            <div className="p-5">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[52px] top-0 bottom-0 w-px bg-border" />

                <div className="space-y-0">
                  {stats.todayGigs.map((gig: Booking, i: number) => (
                    <TodayGigItem
                      key={gig.id}
                      gig={gig}
                      isLast={i === stats.todayGigs.length - 1}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentBookingRow({ booking }: { booking: Booking }) {
  const createdAt = new Date(booking.created_at);
  const timeStr = createdAt.toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Helsinki",
  });
  const isToday =
    new Date().toLocaleDateString("fi-FI", { timeZone: "Europe/Helsinki" }) ===
    createdAt.toLocaleDateString("fi-FI", { timeZone: "Europe/Helsinki" });

  return (
    <Link
      to={`/varaukset/${booking.booking_number}`}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-hover transition-colors"
    >
      {/* Time badge */}
      <div className="w-16 flex-shrink-0 text-center">
        <p className="text-sm font-bold text-text-primary tabular-nums">
          {timeStr}
        </p>
        <p className="text-[10px] text-text-muted">
          {isToday ? "tänään" : formatDate(booking.created_at.split("T")[0])}
        </p>
        <Badge
          className={`${STATUS_COLORS[booking.status]} text-[10px] px-1.5 py-0 mt-1`}
        >
          {STATUS_LABELS[booking.status]}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-text-primary truncate">
          {booking.customers?.first_name} {booking.customers?.last_name}
        </p>
        <p className="text-xs text-text-muted truncate">
          {booking.services?.name || "–"}
        </p>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-text-muted flex-wrap">
          {booking.address && (
            <span className="hidden sm:inline-flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">
                {formatAddress(booking.address, booking.postal_code)}
              </span>
            </span>
          )}
          {booking.employees && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <User className="w-3 h-3" />
              {booking.employees.first_name}
            </span>
          )}
          <span className="inline-flex items-center gap-1 flex-shrink-0">
            <Calendar className="w-3 h-3" />
            {formatDate(booking.booking_date)} klo{" "}
            {booking.time_slot?.slice(0, 5)}
          </span>
        </div>
      </div>

      {/* Price */}
      <p className="text-sm font-bold text-text-primary flex-shrink-0 tabular-nums hidden sm:block">
        {formatCents(booking.price_cents)}
      </p>
    </Link>
  );
}

function TodayGigItem({ gig, isLast }: { gig: Booking; isLast: boolean }) {
  const timeStr = gig.time_slot?.slice(0, 5) || "–";
  const durationMin = gig.services?.duration_minutes || 60;

  // Check if gig is currently happening
  const now = new Date();
  const finnishHour = parseInt(
    now.toLocaleString("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Europe/Helsinki",
    })
  );
  const finnishMin = now.getMinutes();
  const currentMinute = finnishHour * 60 + finnishMin;
  const [gh, gm] = timeStr.split(":").map(Number);
  const gigStart = isNaN(gh) || isNaN(gm) ? null : gh * 60 + gm;
  const gigEnd = gigStart !== null ? gigStart + durationMin : null;
  const isActive = gigStart !== null && currentMinute >= gigStart && currentMinute < gigEnd!;
  const isPast = gigEnd !== null && currentMinute >= gigEnd;

  return (
    <Link
      to={`/varaukset/${gig.booking_number}`}
      className={`relative flex items-start gap-4 py-3 hover:bg-surface-hover rounded-xl px-2 -mx-2 transition-colors ${isLast ? "" : ""}`}
    >
      {/* Time */}
      <div className="w-10 flex-shrink-0 text-right pt-0.5">
        <p
          className={`text-sm font-bold tabular-nums ${isActive ? "text-accent-dark" : isPast ? "text-text-muted" : "text-text-primary"}`}
        >
          {timeStr}
        </p>
      </div>

      {/* Timeline dot */}
      <div className="relative flex-shrink-0 mt-1.5">
        <div
          className={`w-3 h-3 rounded-full border-2 ${
            isActive
              ? "bg-accent border-accent-dark animate-pulse"
              : isPast
                ? "bg-border border-border-strong"
                : "bg-surface border-accent"
          }`}
        />
      </div>

      {/* Card */}
      <div
        className={`flex-1 min-w-0 rounded-xl border p-3 ${
          isActive
            ? "bg-accent-muted/40 border-accent/30"
            : isPast
              ? "bg-surface-alt border-border opacity-60"
              : "bg-surface border-border"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm text-text-primary truncate">
              {gig.customers?.first_name} {gig.customers?.last_name}
            </p>
            <p className="text-xs text-text-muted line-clamp-2">
              {gig.services?.name || "–"}
            </p>
          </div>
          <Badge
            className={`${STATUS_COLORS[gig.status]} text-[10px] px-1.5 py-0 flex-shrink-0`}
          >
            {STATUS_LABELS[gig.status]}
          </Badge>
        </div>
        {gig.address && (
          <div className="flex items-start gap-1 mt-2 text-[11px] text-text-muted">
            <MapPin className="w-3 h-3 flex-shrink-0 mt-px" />
            <span className="line-clamp-2">
              {formatAddress(gig.address, gig.postal_code)}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-text-muted">
          {gig.employees && (
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              {gig.employees.first_name} {gig.employees.last_name}
            </span>
          )}
          <span className="inline-flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {durationMin} min
          </span>
        </div>
      </div>
    </Link>
  );
}
