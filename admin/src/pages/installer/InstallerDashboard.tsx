import { useMemo, useState, useEffect } from "react";
import { useUserRole } from "@/context/UserRoleContext";
import { useInstallerDashboardStats } from "@/hooks/useInstallerData";
import { useActiveShift, useClockIn, useClockOut } from "@/hooks/useTimeTracking";
import { formatDate, formatCents, formatAddress, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/KpiCard";
import {
  Clock,
  CalendarDays,
  CheckCircle2,
  Euro,
  ChevronRight,
  MapPin,
  Calendar,
  Play,
  Square,
  Timer,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Booking } from "@/lib/types";

function formatElapsed(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

function ClockInOut({ employeeId }: { employeeId: string }) {
  const { data: activeShift, isLoading } = useActiveShift(employeeId);
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeShift) { setElapsed(0); return; }
    const calc = () => setElapsed(Date.now() - new Date(activeShift.clock_in).getTime());
    calc();
    const interval = setInterval(calc, 60_000);
    return () => clearInterval(interval);
  }, [activeShift]);

  if (isLoading) return <div className="h-20 bg-surface rounded-2xl border border-border animate-pulse" />;

  const isClockedIn = !!activeShift;

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 mb-6 ${isClockedIn ? "bg-green-50 border-green-200" : "bg-surface border-border"}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${isClockedIn ? "bg-green-100" : "bg-surface-alt"}`}>
            <Timer className={`w-5 h-5 ${isClockedIn ? "text-green-700" : "text-text-muted"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {isClockedIn ? "Vuoro käynnissä" : "Ei aktiivista vuoroa"}
            </p>
            {isClockedIn && (
              <p className="text-xs text-green-700 mt-0.5">
                Aloitettu {new Date(activeShift.clock_in).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" })}
                {" "}&middot; {formatElapsed(elapsed)}
              </p>
            )}
          </div>
        </div>

        {isClockedIn ? (
          <button onClick={() => clockOut.mutate({ entryId: activeShift.id, employeeId })}
            disabled={clockOut.isPending}
            className="w-full sm:w-auto px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Square className="w-3.5 h-3.5" /> Lopeta vuoro
          </button>
        ) : (
          <button onClick={() => clockIn.mutate(employeeId)} disabled={clockIn.isPending}
            className="w-full sm:w-auto px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Play className="w-3.5 h-3.5" /> Aloita vuoro
          </button>
        )}
      </div>
    </div>
  );
}

export default function InstallerDashboard() {
  const { employee } = useUserRole();
  const { data: stats, isLoading } = useInstallerDashboardStats(employee?.id);

  const showCommission =
    employee?.tier === "yrittaja" || employee?.tier === "alihankkija";
  const showClock = employee?.tier === "palkallinen";
  const showPrices = employee?.can_see_prices ?? true;

  const commissionData = useMemo(() => {
    if (!stats || !employee?.tier || employee.tier === "palkallinen")
      return null;

    const manual = stats.manualCommissionCents || 0;
    const sales = stats.salesCommissionCents || 0;
    const contractSales = stats.contractSalesCommissionCents || 0;

    const keikka = (stats.monthCompletedBookings || []).reduce(
      (sum: number, b: { booking_employees?: { commission_cents: number }[] }) =>
        sum + (b.booking_employees?.[0]?.commission_cents || 0),
      0
    );

    const keikkaProjected = (stats.monthAllBookings || []).reduce(
      (sum: number, b: { booking_employees?: { commission_cents: number }[] }) =>
        sum + (b.booking_employees?.[0]?.commission_cents || 0),
      0
    );

    const realized = keikka + manual + sales + contractSales;
    const projected = keikkaProjected + manual + sales + contractSales;

    return {
      realized,
      projected,
      keikkaCents: keikka,
      salesCents: sales,
      wonDeals: stats.wonDeals || 0,
      contractSalesCents: contractSales,
      manualCents: manual,
    };
  }, [stats, employee?.tier]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-border rounded w-48" />
        <div
          className={`grid gap-3 ${showCommission ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}
        >
          {[1, 2, 3, ...(showCommission ? [4] : [])].map((i) => (
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

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-text-primary mb-6">
        Etusivu
      </h1>

      {/* Clock In/Out for salaried installers */}
      {showClock && employee && <ClockInOut employeeId={employee.id} />}

      {/* KPI Cards */}
      <div
        className={`grid gap-3 mb-8 ${showCommission ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}
      >
        <KpiCard
          label="Tänään"
          value={stats.todayCount}
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          accent="border-l-amber-400"
        />
        <KpiCard
          label="Tulevat"
          value={stats.futureCount}
          icon={CalendarDays}
          iconColor="text-accent-dark"
          iconBg="bg-accent-muted"
          accent="border-l-accent"
        />
        <KpiCard
          label="Valmiit"
          value={stats.monthCompleted}
          icon={CheckCircle2}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          accent="border-l-blue-400"
        />

        {showCommission && commissionData && (
          <KpiCard
            label="Provisio"
            value={formatCents(commissionData.realized)}
            sub={`Enn. ${formatCents(commissionData.projected)}`}
            icon={Euro}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
            accent="border-l-violet-400"
            to="/tyontekija/provisiot"
            trailing={<ChevronRight className="w-4 h-4 text-text-muted" />}
          />
        )}
      </div>

      {/* Two columns: Today's timeline + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              {stats.todayCount} keikkaa
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
                <div className="absolute left-[52px] top-0 bottom-0 w-px bg-border" />
                <div className="space-y-0">
                  {stats.todayGigs.map((gig: Booking, i: number) => (
                    <TodayGigItem
                      key={gig.id}
                      gig={gig}
                      isLast={i === stats.todayGigs.length - 1}
                      showPrices={showPrices}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Upcoming Bookings */}
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-text-muted" />
              <h2 className="font-semibold text-sm text-text-primary">
                Tulevat työt
              </h2>
            </div>
            <Link
              to="/tyontekija/kalenteri"
              className="text-xs text-accent-dark hover:text-accent font-semibold inline-flex items-center gap-0.5"
            >
              Kalenteri
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {stats.upcomingBookings.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
                  <CalendarDays className="w-7 h-7 text-text-muted/40" />
                </div>
                <p className="text-sm font-medium text-text-muted">
                  Ei tulevia varauksia
                </p>
              </div>
            ) : (
              stats.upcomingBookings.map((booking: Booking) => (
                <Link
                  key={booking.id}
                  to={`/tyontekija/varaukset/${booking.booking_number}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-hover transition-colors"
                >
                  <div className="w-16 flex-shrink-0 text-center">
                    <p className="text-sm font-bold text-text-primary tabular-nums">
                      {booking.time_slot?.slice(0, 5)}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {formatDate(booking.booking_date)}
                    </p>
                    <Badge
                      className={`${STATUS_COLORS[booking.status]} text-[10px] px-1.5 py-0 mt-1`}
                    >
                      {STATUS_LABELS[booking.status]}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-text-primary truncate">
                      {booking.customers?.first_name}{" "}
                      {booking.customers?.last_name}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {booking.services?.name || "–"}
                    </p>
                    {booking.address && (
                      <div className="flex items-start gap-1 mt-1 text-[11px] text-text-muted">
                        <MapPin className="w-3 h-3 flex-shrink-0 mt-px" />
                        <span className="line-clamp-2">
                          {formatAddress(booking.address, booking.postal_code)}
                        </span>
                      </div>
                    )}
                  </div>
                  {showPrices && booking.price_cents != null && (
                    <p className="text-sm font-bold text-text-primary flex-shrink-0 tabular-nums">
                      {formatCents(booking.price_cents)}
                    </p>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TodayGigItem({ gig, showPrices }: { gig: Booking; isLast: boolean; showPrices: boolean }) {
  const timeStr = gig.time_slot?.slice(0, 5) || "–";
  const durationMin = gig.services?.duration_minutes || 60;

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
  const gigStart = gh * 60 + gm;
  const gigEnd = gigStart + durationMin;
  const isActive = currentMinute >= gigStart && currentMinute < gigEnd;
  const isPast = currentMinute >= gigEnd;

  return (
    <Link
      to={`/tyontekija/varaukset/${gig.booking_number}`}
      className={`relative flex items-start gap-4 py-3 hover:bg-surface-hover rounded-xl px-2 -mx-2 transition-colors`}
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
          <span className="inline-flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {durationMin} min
          </span>
          {showPrices && gig.price_cents != null && (
            <span className="inline-flex items-center gap-1 flex-shrink-0 font-semibold text-text-primary">
              <Euro className="w-3 h-3" />
              {formatCents(gig.price_cents)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
