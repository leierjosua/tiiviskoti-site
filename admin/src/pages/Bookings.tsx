import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useConfirm, useConfirmWithCheckbox } from "@/context/ConfirmContext";
import { useBookings, useBookingKpiStats, useUpdateBooking, useUpdateBookingStatus, useDeleteBooking } from "@/hooks/useBookings";
import { useEmployees } from "@/hooks/useEmployees";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  formatCents,
  formatDateTime,
  STATUS_LABELS,
  STATUS_COLORS,
  PAYMENT_LABELS,
  PAYMENT_COLORS,
  PLAN_LABELS,
  MONTH_SHORT_FI,
  LEAD_SOURCE_LABELS,
  downloadCsv,
  formatAddress,
} from "@/lib/utils";
import {
  Search,
  XCircle,
  Trash2,
  MapPin,
  Phone,
  User,
  Plus,
  CreditCard,
  ClipboardCheck,
  Download,
  Globe,
  ChevronDown,
  Layers,
  CircleAlert,
  CircleCheck,
  ClipboardList,
} from "lucide-react";
import { useServices } from "@/hooks/useServices";
import type { Booking, BookingStatus, PaymentStatus } from "@/lib/types";

const STATUS_TABS: { label: string; value: BookingStatus | undefined }[] = [
  { label: "Kaikki", value: undefined },
  { label: "Odottaa", value: "pending" },
  { label: "Vahvistettu", value: "confirmed" },
  { label: "Valmis", value: "completed" },
  { label: "Peruutettu", value: "cancelled" },
];


type SortDir = "newest" | "oldest";

function BookingCard({ booking }: { booking: Booking }) {
  const confirm = useConfirm();
  const confirmWithCheckbox = useConfirmWithCheckbox();
  const updateBooking = useUpdateBooking();
  const updateStatus = useUpdateBookingStatus();
  const deleteBooking = useDeleteBooking();
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);

  const dateObj = new Date(booking.booking_date + "T00:00:00");
  const day = dateObj.getDate();
  const month = MONTH_SHORT_FI[dateObj.getMonth()];
  const time = booking.time_slot?.slice(0, 5);

  const customerName = booking.customers
    ? `${booking.customers.first_name} ${booking.customers.last_name}`
    : "–";
  const installerName = booking.employees
    ? `${booking.employees.first_name} ${booking.employees.last_name}`
    : null;

  return (
    <div className="relative bg-surface rounded-xl border border-border hover:border-border-strong transition-all group">
      {/* Stretched link: real <a href> so right-click / Cmd+click / middle-click can open in a new tab */}
      <Link
        to={`/varaukset/${booking.booking_number}`}
        aria-label={`Avaa varaus ${booking.booking_number}`}
        className="absolute inset-0 z-0 rounded-xl cursor-pointer"
      />
      <div className="flex flex-wrap sm:flex-nowrap items-start gap-0">
        {/* Date block */}
        <div className="flex-shrink-0 w-20 py-4 text-center border-r border-border">
          <p className="text-2xl font-bold text-text-primary leading-none">{day}</p>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mt-1">{month}</p>
          <p className="text-sm font-medium text-accent-dark mt-1.5">{time}</p>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 px-4 sm:px-5 py-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold text-sm text-text-primary">
              {customerName}
            </span>
            {booking.booking_number && (
              <span className="text-xs font-mono text-text-muted bg-surface-alt px-1.5 py-0.5 rounded">
                #{booking.booking_number}
              </span>
            )}
            {/* Status dropdown */}
            <div className="relative z-10">
              <button
                onClick={(e) => { e.stopPropagation(); setShowStatusDropdown(!showStatusDropdown); setShowPaymentDropdown(false); }}
                className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Badge className={`${STATUS_COLORS[booking.status]} text-[10px] px-2 py-0.5`}>
                  {STATUS_LABELS[booking.status]}
                </Badge>
                <ChevronDown className="w-3 h-3 text-text-muted" />
              </button>
              {showStatusDropdown && (
                <div onClick={(e) => e.stopPropagation()} className="absolute left-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-lg py-1 z-20 min-w-[140px]">
                  {(["pending", "confirmed", "completed", "cancelled"] as BookingStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        if (s !== booking.status) updateBooking.mutate({ id: booking.id, status: s });
                        setShowStatusDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-hover transition-colors flex items-center gap-2 ${
                        booking.status === s ? "font-semibold" : "text-text-secondary"
                      }`}
                    >
                      <Badge className={`${STATUS_COLORS[s]} text-[10px] px-1.5 py-0`}>{STATUS_LABELS[s]}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Payment dropdown — show after finalized, if paid, or if completed */}
            {(booking.finalized_at || booking.payment_status === "paid" || booking.status === "completed") && (
            <div className="relative z-10">
              <button
                onClick={(e) => { e.stopPropagation(); setShowPaymentDropdown(!showPaymentDropdown); setShowStatusDropdown(false); }}
                className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Badge className={`${PAYMENT_COLORS[booking.payment_status] || "bg-gray-50 text-gray-500 border border-gray-200"} text-[10px] px-2 py-0.5`}>
                  {PAYMENT_LABELS[booking.payment_status] || "Ei maksettu"}
                </Badge>
                <ChevronDown className="w-3 h-3 text-text-muted" />
              </button>
              {showPaymentDropdown && (
                <div onClick={(e) => e.stopPropagation()} className="absolute left-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-lg py-1 z-20 min-w-[140px]">
                  {(["paid", "unpaid"] as PaymentStatus[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        if (p !== booking.payment_status) updateBooking.mutate({ id: booking.id, payment_status: p });
                        setShowPaymentDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-hover transition-colors flex items-center gap-2 ${
                        booking.payment_status === p ? "font-semibold" : "text-text-secondary"
                      }`}
                    >
                      <Badge className={`${PAYMENT_COLORS[p]} text-[10px] px-1.5 py-0`}>{PAYMENT_LABELS[p]}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>

          <div className="flex items-center gap-4 mt-2 text-xs text-text-muted flex-wrap">
            <span>{booking.services?.name || (booking.plan && PLAN_LABELS[booking.plan]) || "–"}</span>
            {installerName && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" />
                {installerName}
                {booking.booking_employees && booking.booking_employees.length > 1 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                    +{booking.booking_employees.length - 1}
                  </span>
                )}
              </span>
            )}
            {booking.customers?.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {booking.customers.phone}
              </span>
            )}
            {booking.address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {formatAddress(booking.address, booking.postal_code)}
              </span>
            )}
            {booking.lead_source && (
              <span className="inline-flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {LEAD_SOURCE_LABELS[booking.lead_source] || booking.lead_source}
              </span>
            )}
          </div>
        </div>

        {/* Right side: price + actions */}
        <div onClick={(e) => e.stopPropagation()} className="relative z-10 w-full sm:w-auto flex-shrink-0 flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-t sm:border-t-0 border-border">
          <div className="text-right sm:mr-2">
            <p className="text-sm font-bold text-accent-dark">{formatCents(booking.price_cents)}</p>
            {booking.margin_cents != null && (
              <p className={`text-[10px] font-medium mt-0.5 ${booking.margin_cents >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                Kate {formatCents(booking.margin_cents)}
              </p>
            )}
            <p className="text-[10px] text-text-muted mt-0.5">{formatDateTime(booking.created_at)}</p>
          </div>

          {/* Quick actions — cancel + delete only */}
          <div className="flex items-center gap-0.5 sm:gap-1 ml-auto">
            {/* Cancel */}
            {booking.status !== "cancelled" && (
              <button
                title="Peruuta"
                onClick={async () => {
                  const result = await confirmWithCheckbox({
                    message: "Haluatko varmasti peruuttaa tämän varauksen?",
                    confirmLabel: "Peruuta varaus",
                    variant: "danger",
                    checkbox: { label: "Lähetä peruutusilmoitus asiakkaalle", defaultChecked: true },
                  });
                  if (!result.confirmed) return;
                  updateStatus.mutate({ id: booking.id, status: "cancelled" as BookingStatus, notify_customer: result.checkboxValue });
                }}
                disabled={updateStatus.isPending}
                className="p-2 sm:p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}

            {/* Delete */}
            <button
              title="Poista"
              onClick={async () => {
                if (await confirm({ message: "Poistetaanko varaus pysyvästi?", confirmLabel: "Poista", variant: "danger" })) {
                  await deleteBooking.mutateAsync(booking.id);
                }
              }}
              disabled={deleteBooking.isPending}
              className="p-2 sm:p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Bookings() {
  useConfirm();
  const [statusFilter, setStatusFilter] = useState<BookingStatus | undefined>();
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | undefined>();
  const [kpiFilter, setKpiFilter] = useState<"all" | "unpaid" | "not_finalized" | "paid" | null>(null);
  const [search, setSearch] = useState("");
  // Debounce the search so we don't fire a query on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("newest");
  const [installerFilter, setInstallerFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");

  const bookingFilters = {
    status: statusFilter,
    search: debouncedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortDir,
    employeeId: installerFilter || undefined,
    serviceId: serviceFilter || undefined,
    paymentStatus: paymentFilter,
    kpiFilter,
  };
  const { data: bookingsData, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useBookings(bookingFilters);
  const bookings = bookingsData?.pages.flat();
  const { data: kpiStats } = useBookingKpiStats(bookingFilters);
  const { data: installers } = useEmployees("installer");
  const { data: services } = useServices();

  const kpiDefaults = { total: 0, totalRevenue: 0, unpaid: 0, unpaidRevenue: 0, notFinalized: 0, notFinalizedRevenue: 0, paid: 0, paidRevenue: 0 };
  const kpi = kpiStats ?? kpiDefaults;

  const sortedBookings = useMemo(() => {
    if (!bookings) return [];
    // All filters are now applied server-side
    const dir = sortDir === "newest" ? -1 : 1;
    return [...bookings].sort((a, b) => dir * (a.booking_number - b.booking_number));
  }, [bookings, sortDir]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Varaukset</h1>
        </div>
        <div className="flex items-center gap-2">
          {sortedBookings.length > 0 && (
            <button
              onClick={() => {
                downloadCsv(
                  `varaukset-${new Date().toISOString().slice(0, 10)}.csv`,
                  ["#", "Pvm", "Kellonaika", "Asiakas", "Sähköposti", "Puhelin", "Osoite", "Palvelu", "Asentaja", "Hinta €", "Status", "Maksu", "Lähde"],
                  sortedBookings.map((b) => [
                    String(b.booking_number || ""),
                    b.booking_date,
                    b.time_slot?.slice(0, 5) || "",
                    b.customers ? `${b.customers.first_name} ${b.customers.last_name}` : "",
                    b.customers?.email || "",
                    b.customers?.phone || "",
                    formatAddress(b.address, b.postal_code),
                    b.services?.name || "",
                    b.employees ? `${b.employees.first_name} ${b.employees.last_name}` : "",
                    String((b.price_cents / 100).toFixed(2)),
                    STATUS_LABELS[b.status] || b.status,
                    PAYMENT_LABELS[b.payment_status] || b.payment_status,
                    LEAD_SOURCE_LABELS[b.lead_source || ""] || b.lead_source || "",
                  ])
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          )}
          <Link to="/varaukset/tehty-keikka" className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent-dark transition-colors whitespace-nowrap">
            <ClipboardCheck className="w-4 h-4" /> <span className="hidden sm:inline">Tehty keikka</span><span className="sm:hidden">Keikka</span>
          </Link>
          <Link to="/varaukset/uusi" className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-light transition-colors whitespace-nowrap">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Luo varaus</span><span className="sm:hidden">Varaus</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      {bookings && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {([
            { key: "all" as const, label: "Yhteensä", count: kpi.total, revenue: kpi.totalRevenue, icon: Layers, iconColor: "text-text-secondary", iconBg: "bg-surface-alt", borderColor: "border-border-strong" },
            { key: "unpaid" as const, label: "Ei maksettu", count: kpi.unpaid, revenue: kpi.unpaidRevenue, icon: CircleAlert, iconColor: "text-red-600", iconBg: "bg-red-50", borderColor: "border-red-300" },
            { key: "not_finalized" as const, label: "Ei viimeistelty", count: kpi.notFinalized, revenue: kpi.notFinalizedRevenue, icon: ClipboardCheck, iconColor: "text-amber-600", iconBg: "bg-amber-50", borderColor: "border-amber-300" },
            { key: "paid" as const, label: "Maksettu", count: kpi.paid, revenue: kpi.paidRevenue, icon: CircleCheck, iconColor: "text-accent-dark", iconBg: "bg-accent-muted", borderColor: "border-accent" },
          ]).map((card) => (
            <button
              key={card.key}
              onClick={() => setKpiFilter(kpiFilter === card.key ? null : card.key)}
              className={`bg-surface rounded-2xl border-2 p-4 text-left transition-all hover:shadow-sm ${
                kpiFilter === card.key
                  ? `${card.borderColor} shadow-sm`
                  : "border-border hover:border-border-strong"
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className={`p-1.5 rounded-lg ${card.iconBg}`}>
                  <card.icon className={`w-3.5 h-3.5 ${card.iconColor}`} />
                </div>
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{card.label}</span>
              </div>
              <p className="text-2xl font-bold text-text-primary">{card.count}</p>
              <p className="text-xs text-text-muted mt-0.5">{formatCents(card.revenue)}</p>
            </button>
          ))}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 mb-5 bg-surface rounded-xl p-1 border border-border overflow-x-auto flex-nowrap sm:w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              statusFilter === tab.value
                ? "bg-brand text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Hae nimellä, puhelinnumerolla, sähköpostilla, osoitteella, #numerolla..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          />
        </div>
        <div className="flex gap-3">
          <DatePicker
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="Alkaen"
            className="flex-1 sm:flex-none sm:min-w-[160px]"
          />
          <DatePicker
            value={dateTo}
            onChange={setDateTo}
            placeholder="Asti"
            className="flex-1 sm:flex-none sm:min-w-[160px]"
          />
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort direction */}
          <button
            onClick={() => setSortDir(sortDir === "newest" ? "oldest" : "newest")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border bg-surface text-text-secondary hover:border-border-strong transition-all"
          >
            {sortDir === "newest" ? "Uusin ensin ↓" : "Vanhin ensin ↑"}
          </button>

          {/* Installer filter */}
          <div className="relative">
            <select
              value={installerFilter}
              onChange={(e) => setInstallerFilter(e.target.value)}
              className={`appearance-none pl-3 pr-8 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                installerFilter
                  ? "bg-brand text-white border-brand"
                  : "bg-surface text-text-secondary border-border hover:border-border-strong"
              }`}
            >
              <option value="">Kaikki asentajat</option>
              {installers?.filter((e) => e.active).map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" />
          </div>

          {/* Service filter */}
          <div className="relative">
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className={`appearance-none pl-3 pr-8 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                serviceFilter
                  ? "bg-brand text-white border-brand"
                  : "bg-surface text-text-secondary border-border hover:border-border-strong"
              }`}
            >
              <option value="">Kaikki palvelut</option>
              {services?.filter((s) => s.active).map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" />
          </div>
        </div>

        {/* Payment filter */}
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          <span className="text-xs font-medium text-text-muted flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" /> Maksu:
          </span>
          <button
            onClick={() => setPaymentFilter(undefined)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              !paymentFilter
                ? "bg-brand text-white border-brand"
                : "bg-surface text-text-secondary border-border hover:border-border-strong"
            }`}
          >
            Kaikki
          </button>
          <button
            onClick={() => setPaymentFilter("paid")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              paymentFilter === "paid"
                ? "bg-accent-muted text-accent-dark border-accent/30"
                : "bg-surface text-text-secondary border-border hover:border-border-strong"
            }`}
          >
            Maksettu
          </button>
          <button
            onClick={() => setPaymentFilter("unpaid")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              paymentFilter === "unpaid"
                ? "bg-red-50 text-red-600 border-red-200"
                : "bg-surface text-text-secondary border-border hover:border-border-strong"
            }`}
          >
            Ei maksettu
          </button>
        </div>
      </div>

      {/* Booking cards */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="p-8 text-center text-text-muted">Ladataan...</div>
        ) : sortedBookings.length === 0 ? (
          <div className="p-8 text-center text-text-muted">Ei varauksia</div>
        ) : (
          sortedBookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))
        )}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-surface border border-border text-text-secondary hover:bg-surface-hover hover:border-border-strong transition-colors disabled:opacity-50"
          >
            {isFetchingNextPage ? "Ladataan..." : "Lataa lisää"}
          </button>
        </div>
      )}
    </div>
  );
}
