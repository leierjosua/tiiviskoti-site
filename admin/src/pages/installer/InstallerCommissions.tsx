import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useUserRole } from "@/context/UserRoleContext";
import { useInstallerDashboardStats } from "@/hooks/useInstallerData";
import { formatDate, formatCents, finnishNow, MONTH_NAMES_FI } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Euro } from "lucide-react";

export default function InstallerCommissions() {
  const { employee } = useUserRole();
  const now = finnishNow();
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const { data: stats, isLoading } = useInstallerDashboardStats(employee?.id, selectedMonth);

  const isCurrentMonth = selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth();

  function prevMonth() {
    setSelectedMonth((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    setSelectedMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 });
  }

  const data = useMemo(() => {
    if (!stats || !employee?.tier || employee.tier === "palkallinen") return null;

    const manual = stats.manualCommissionCents || 0;
    const sales = stats.salesCommissionCents || 0;
    const contractSales = stats.contractSalesCommissionCents || 0;

    const bookings = (stats.monthAllBookings || []).map((b) => ({
      id: b.id,
      date: b.booking_date || "",
      status: b.status || "",
      bookingNumber: b.booking_number || 0,
      customerName: b.customers
        ? `${b.customers.first_name} ${b.customers.last_name}`
        : "–",
      commission: b.booking_employees?.[0]?.commission_cents || 0,
    }));

    const keikka = bookings
      .filter((b) => b.status === "completed")
      .reduce((sum, b) => sum + b.commission, 0);

    const total = keikka + manual + sales + contractSales;

    return { bookings, keikka, sales, contractSales, manual, total, wonDeals: stats.wonDeals || 0 };
  }, [stats, employee?.tier]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-border rounded w-48" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-text-muted">Provisiotietoja ei saatavilla.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/tyontekija"
          className="p-2 rounded-xl hover:bg-surface-hover transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-text-muted" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Provisiot</h1>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between bg-surface rounded-xl border border-border px-4 py-2.5 mb-6">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
          <ChevronLeft className="w-5 h-5 text-text-muted" />
        </button>
        <span className="text-sm font-semibold text-text-primary capitalize">
          {MONTH_NAMES_FI[selectedMonth.month]} {selectedMonth.year}
        </span>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      {/* Total */}
      <div className="bg-surface rounded-2xl border border-border p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-50">
              <Euro className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">Yhteensä</p>
              <p className="text-2xl font-bold text-text-primary tabular-nums">
                {formatCents(data.total)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-surface rounded-xl border border-border px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <p className="text-xs font-medium text-text-muted">Keikkaprovisiot</p>
          </div>
          <p className="text-lg font-bold text-text-primary tabular-nums">{formatCents(data.keikka)}</p>
          <p className="text-[10px] text-text-muted mt-0.5">
            {data.bookings.filter((b) => b.status === "completed").length} valmista keikkaa
          </p>
        </div>

        {data.sales > 0 && (
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-violet-500" />
              <p className="text-xs font-medium text-text-muted">Myyntiprovisiot</p>
            </div>
            <p className="text-lg font-bold text-text-primary tabular-nums">{formatCents(data.sales)}</p>
            <p className="text-[10px] text-text-muted mt-0.5">{data.wonDeals} kauppaa</p>
          </div>
        )}

        {data.contractSales > 0 && (
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <p className="text-xs font-medium text-text-muted">Sopimusmyynti</p>
            </div>
            <p className="text-lg font-bold text-text-primary tabular-nums">{formatCents(data.contractSales)}</p>
          </div>
        )}

        {data.manual !== 0 && (
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-teal-500" />
              <p className="text-xs font-medium text-text-muted">Muut provisiot</p>
            </div>
            <p className={`text-lg font-bold tabular-nums ${data.manual < 0 ? "text-red-600" : "text-text-primary"}`}>
              {formatCents(data.manual)}
            </p>
          </div>
        )}
      </div>

      {/* Per-booking list */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm text-text-primary">Keikkakohtaiset provisiot</h2>
          <p className="text-[10px] text-text-muted mt-0.5">{data.bookings.length} varausta</p>
        </div>

        {data.bookings.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-text-muted">Ei varauksia</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {[...data.bookings]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((b) => {
                const isCompleted = b.status === "completed";
                return (
                  <Link
                    key={b.id}
                    to={`/tyontekija/varaukset/${b.bookingNumber}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-surface-hover transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[11px] text-text-muted tabular-nums flex-shrink-0 w-[72px]">
                        {b.date ? formatDate(b.date) : "–"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {b.customerName}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-text-muted">#{b.bookingNumber}</span>
                          <Badge
                            className={`text-[10px] px-1.5 py-0 ${
                              isCompleted
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {isCompleted ? "Valmis" : "Vahvistettu"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${isCompleted ? "text-text-primary" : "text-text-muted"}`}>
                      {formatCents(b.commission)}
                    </span>
                  </Link>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
