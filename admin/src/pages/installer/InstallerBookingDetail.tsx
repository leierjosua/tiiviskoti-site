import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUpdateCustomer } from "@/hooks/useCustomers";
import { useBookingByNumber } from "@/hooks/useBookings";
import { useProtocolsByBooking } from "@/hooks/useProtocols";
import { useBookingLineItems } from "@/hooks/useBookingLineItems";
import { useComponentProducts, lineItemComponentIds, ProductComponentBreakdown } from "@/components/booking/ProductComponents";
import { useBookingDeviceOrders } from "@/hooks/sales/useDeviceOrders";
import { useBookingProductOrdersByBooking, useBulkUpdateBPOStatus } from "@/hooks/useLogistics";
import { useEmployees } from "@/hooks/useEmployees";
import { useMyTeam } from "@/hooks/useTeams";
import { useJoinBooking, useLeaveBooking, fetchEmployeeConflicts, type ConflictRow } from "@/hooks/useBookingTeam";
import { ProductOrderStatusBadge } from "@/components/logistics/LogisticsStatusBadge";
import OrderThreadDialog from "@/components/sales/OrderThreadDialog";
import BookingFileUpload from "@/components/BookingFileUpload";
import { CalendarStep } from "@/components/CalendarStep";
import { supabase, getFreshToken } from "@/lib/supabase";
import { useStorageUrls } from "@/lib/storage";
import { queryKeys } from "@/lib/queryKeys";
import { useConfirm } from "@/context/ConfirmContext";
import { useUserRole } from "@/context/UserRoleContext";
import {
  formatDate,
  formatDateTime,
  formatCents,
  STATUS_LABELS,
  STATUS_COLORS,
  formatAddress,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, MapPin, Phone, Mail, Clock, Package, ClipboardCheck, Undo2,
  FileText, Check, MessageSquare, Image, Download, Users, Pencil, ArrowRightLeft, X,
  UserPlus, UserMinus, AlertTriangle, CalendarClock, UserCheck,
} from "lucide-react";
import type { SalesOpportunityFile } from "@/lib/sales-types";

export default function InstallerBookingDetail() {
  const { bookingNumber } = useParams();
  const navigate = useNavigate();
  const { employee } = useUserRole();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [reverting, setReverting] = useState(false);
  const [threadDialog, setThreadDialog] = useState<{ threadId: string; brand: string } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone: "", address: "", postal_code: "" });
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [joinConflicts, setJoinConflicts] = useState<ConflictRow[] | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleCalendarId, setRescheduleCalendarId] = useState<string | null>(null);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleSendEmail, setRescheduleSendEmail] = useState(true);
  const [rescheduleError, setRescheduleError] = useState("");
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const joinBooking = useJoinBooking();
  const leaveBooking = useLeaveBooking();
  const { data: myTeamRow } = useMyTeam(employee?.id);
  const updateCustomer = useUpdateCustomer();
  // RLS scopes this to self + teammates only
  const { data: visibleInstallers = [] } = useEmployees("installer");
  const num = bookingNumber ? parseInt(bookingNumber, 10) : undefined;
  const { data: booking, isLoading } = useBookingByNumber(num);
  const { data: lineItems = [] } = useBookingLineItems(booking?.id);
  const { data: componentProducts } = useComponentProducts(lineItemComponentIds(lineItems));
  const showPrices = employee?.can_see_prices ?? true;
  const { data: deviceOrders = [] } = useBookingDeviceOrders(booking?.opportunity_id ?? undefined);
  const { data: productOrders = [] } = useBookingProductOrdersByBooking(booking?.id);
  const bulkUpdateBPO = useBulkUpdateBPOStatus();

  // Sales notes flagged "show_to_installer" for this booking's opportunity.
  // RLS policy 'sales_opp_notes_installer_read' restricts to flagged notes for own bookings.
  const { data: salesNotes = [] } = useQuery({
    queryKey: ["installer-sales-notes", booking?.opportunity_id],
    enabled: !!booking?.opportunity_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunity_notes")
        .select("id, body, created_at")
        .eq("opportunity_id", booking!.opportunity_id!)
        .eq("show_to_installer", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; body: string; created_at: string }[];
    },
  });

  // Seller (myyjä) who sold the job. RLS hides the salesperson's employees row
  // from installers (not a teammate), so resolve the name via a SECURITY DEFINER
  // RPC scoped to bookings the installer is actually assigned to.
  const { data: sellerName } = useQuery({
    queryKey: ["booking-seller", booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_booking_seller", {
        p_booking_id: booking!.id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || null : null;
    },
  });

  // Check if this service has a protocol template
  const { data: hasProtocol } = useQuery({
    queryKey: ["service-has-protocol", booking?.service_id],
    enabled: !!booking?.service_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("protocol_templates")
        .select("id")
        .eq("service_id", booking!.service_id!)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      return !!data;
    },
  });

  // Fetch opportunity files (photos, install plan, etc.)
  const { data: oppFiles = [] } = useQuery({
    queryKey: ["installer-opp-files", booking?.opportunity_id],
    enabled: !!booking?.opportunity_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunity_files")
        .select("*")
        .eq("opportunity_id", booking!.opportunity_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Installers must not see the offer PDF (it contains prices). The
      // installation plan and all other files stay visible. Filtering here
      // means offer PDFs never enter component state or get a signed URL.
      return (data as SalesOpportunityFile[]).filter(
        (f) => f.file_type !== "offer_pdf"
      );
    },
  });

  const oppFileUrls = useStorageUrls(oppFiles);

  // Completed protocol PDFs for this booking — shown like in admin so the
  // installer (and teammates) can open the finished pöytäkirja directly.
  const { data: protocols = [] } = useProtocolsByBooking(booking?.id);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-border rounded w-48" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  if (!booking) {
    return <p className="text-text-muted">Varausta ei löytynyt.</p>;
  }

  // RLS on the bookings table guarantees we only loaded this row if the user
  // can see it (own booking, on the team, or shares an employee_team with the
  // primary). No further client-side gating needed.

  const customer = booking.customers;
  const service = booking.services;
  const bookingTeam = booking.booking_employees || [];

  // Split opportunity files
  const images = oppFiles.filter((f) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));
  const docs = oppFiles.filter((f) => !/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));

  function getFileUrl(file: SalesOpportunityFile) {
    return oppFileUrls[file.id];
  }

  const transferCandidates = visibleInstallers.filter(
    (e) => e.id !== employee?.id && e.active && !bookingTeam.some((be) => be.employee_id === e.id)
  );
  const canTransfer =
    booking.employee_id === employee?.id &&
    transferCandidates.length > 0 &&
    booking.status !== "completed" &&
    booking.status !== "cancelled";

  const myBe = bookingTeam.find((be) => be.employee_id === employee?.id);
  const isPrimary = booking.employee_id === employee?.id;
  const isOnBooking = !!myBe || isPrimary;
  const primaryInMyTeam = !!myTeamRow?.team_id && ((myTeamRow.members || []) as Array<{ employee_id: string }>).some(
    (m) => m.employee_id === booking.employee_id
  );
  const isActiveStatus = booking.status !== "completed" && booking.status !== "cancelled";
  const canJoinBooking = isActiveStatus && !isOnBooking && primaryInMyTeam && !!booking.employee_id;
  const canLeaveBooking = isActiveStatus && myBe?.role === "secondary";
  // Self-reschedule: only the primary, only when admin granted the permission, and
  // only for active bookings. The edge function re-checks all of this server-side.
  const canReschedule =
    employee?.can_reschedule_own_bookings === true && isPrimary && isActiveStatus;

  async function commitJoin() {
    setJoining(true);
    try {
      await joinBooking.mutateAsync({ booking_id: booking!.id, booking_number: booking!.booking_number });
      setJoinConflicts(null);
    } catch (err: any) {
      alert(err?.message || "Liittyminen epäonnistui");
    } finally {
      setJoining(false);
    }
  }

  async function handleJoinClick() {
    if (joining || !employee?.id) return;
    const dur = booking!.duration_minutes || service?.duration_minutes || 60;
    const conflicts = await fetchEmployeeConflicts({
      employeeId: employee.id,
      date: booking!.booking_date,
      startTime: booking!.time_slot!,
      durationMin: dur,
      excludeBookingId: booking!.id,
    });
    if (conflicts.length > 0) {
      setJoinConflicts(conflicts);
      return;
    }
    await commitJoin();
  }

  async function handleLeaveClick() {
    if (leaving) return;
    if (!await confirm({ message: "Poistutaanko tästä keikasta? Et näe sitä enää omassa kalenterissasi.", confirmLabel: "Poistu", variant: "danger" })) return;
    setLeaving(true);
    try {
      await leaveBooking.mutateAsync({ booking_id: booking!.id, booking_number: booking!.booking_number });
    } catch (err: any) {
      alert(err?.message || "Poistuminen epäonnistui");
    } finally {
      setLeaving(false);
    }
  }

  async function handleTransfer() {
    if (!transferTargetId) return;
    setTransferring(true);
    setTransferError("");
    try {
      const { error } = await supabase.functions.invoke("reassign-booking-installer", {
        body: { booking_id: booking!.id, employee_id: transferTargetId },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.byNumber(booking!.booking_number) });
      setShowTransfer(false);
      navigate("/tyontekija");
    } catch (err: any) {
      setTransferError(err?.message || "Siirto epäonnistui");
    } finally {
      setTransferring(false);
    }
  }

  function openReschedule() {
    setRescheduleDate(null);
    setRescheduleTime(null);
    setRescheduleCalendarId(null);
    setRescheduleSendEmail(true);
    setRescheduleError("");
    const d = new Date(booking!.booking_date + "T00:00:00");
    setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
    setShowReschedule(true);
  }

  async function handleRescheduleSave() {
    if (!rescheduleDate || !rescheduleTime) return;
    setRescheduleSaving(true);
    setRescheduleError("");
    try {
      const { error } = await supabase.functions.invoke("reschedule-booking-installer", {
        body: {
          booking_id: booking!.id,
          booking_date: rescheduleDate,
          time_slot: rescheduleTime,
          calendar_id: rescheduleCalendarId,
          notify_customer: rescheduleSendEmail,
        },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.byNumber(booking!.booking_number) });
      setShowReschedule(false);
    } catch (err: any) {
      setRescheduleError(err?.message || "Siirto epäonnistui");
    } finally {
      setRescheduleSaving(false);
    }
  }

  // Compute end time
  const endTime = (() => {
    const [h, m] = (booking.time_slot || "08:00").split(":").map(Number);
    const dur = booking.duration_minutes || service?.duration_minutes || 60;
    const endTotal = h * 60 + m + dur;
    return `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
  })();

  return (
    <div>
      <Link
        to="/tyontekija"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Takaisin
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
          Varaus #{booking.booking_number}
        </h1>
        <Badge className={STATUS_COLORS[booking.status]}>
          {STATUS_LABELS[booking.status]}
        </Badge>
      </div>

      {/* Action buttons */}
      {booking.status === "confirmed" && booking.price_cents > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            to={`/tyontekija/varaukset/${booking.booking_number}/viimeistely`}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-white rounded-xl font-semibold hover:bg-accent-dark transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" />
            Viimeistele
          </Link>
          {(hasProtocol || protocols.length > 0) && (
            <Link
              to={`/tyontekija/varaukset/${booking.booking_number}/poytakirja`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-text-primary hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Pöytäkirja
            </Link>
          )}
          {canTransfer && (
            <button
              onClick={() => setShowTransfer(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-text-primary hover:bg-gray-50 transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Siirrä tiimikaverille
            </button>
          )}
        </div>
      )}
      {booking.status === "pending" && canTransfer && (
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={() => setShowTransfer(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-text-primary hover:bg-gray-50 transition-colors"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Siirrä tiimikaverille
          </button>
        </div>
      )}
      {booking.status === "completed" && booking.price_cents > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          {(hasProtocol || protocols.length > 0) && (
            <Link
              to={`/tyontekija/varaukset/${booking.booking_number}/poytakirja`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-text-primary hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Pöytäkirja
            </Link>
          )}
          <button
            onClick={async () => {
              if (!await confirm({ message: "Peruutetaanko viimeistely? Varaus palautetaan vahvistetuksi ja viimeistelytiedot nollataan.", confirmLabel: "Peruuta viimeistely", variant: "danger" })) return;
              setReverting(true);
              try {
                // Debug: try raw fetch to see actual network error
                const token = await getFreshToken();
                const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revert-finalization`;
                const res = await fetch(url, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                  },
                  body: JSON.stringify({ booking_id: booking.id }),
                });
                if (!res.ok) {
                  const text = await res.text();
                  throw new Error(`${res.status}: ${text}`);
                }
                queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                queryClient.invalidateQueries({ queryKey: queryKeys.bookings.byNumber(booking.booking_number) });
              } catch (err: any) {
                console.error("revert-finalization error:", err);
                alert(`Virhe: ${err?.name}: ${err?.message}`);
              } finally {
                setReverting(false);
              }
            }}
            disabled={reverting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 disabled:opacity-50"
          >
            {reverting ? (
              <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Undo2 className="w-4 h-4" />
            )}
            {reverting ? "Palautetaan..." : "Peruuta viimeistely"}
          </button>
        </div>
      )}

      {canReschedule && (
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={openReschedule}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-text-primary hover:bg-gray-50 transition-colors"
          >
            <CalendarClock className="w-4 h-4" />
            Siirrä ajankohtaa
          </button>
        </div>
      )}

      {(canJoinBooking || canLeaveBooking) && (
        <div className="mb-6">
          <div className="flex flex-wrap gap-3">
            {canJoinBooking && (
              <button
                onClick={handleJoinClick}
                disabled={joining || !!joinConflicts}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 disabled:opacity-50 transition-colors"
              >
                {joining ? (
                  <div className="w-4 h-4 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                {joining ? "Liitytään..." : "Liity tähän keikkaan"}
              </button>
            )}
            {canLeaveBooking && (
              <button
                onClick={handleLeaveClick}
                disabled={leaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-surface hover:bg-surface-hover text-text-secondary border border-border disabled:opacity-50 transition-colors"
              >
                {leaving ? (
                  <div className="w-4 h-4 border-2 border-text-secondary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <UserMinus className="w-4 h-4" />
                )}
                {leaving ? "Poistutaan..." : "Poistu keikalta"}
              </button>
            )}
          </div>

          {joinConflicts && (
            <div className="mt-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">Sinulla on jo varaus tähän aikaan</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {joinConflicts.map((c) => (
                      <li key={c.id} className="text-xs text-amber-800">
                        #{c.booking_number ?? "?"} klo {c.time_slot?.slice(0, 5)} — {c.customers?.first_name} {c.customers?.last_name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={commitJoin}
                  disabled={joining}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
                >
                  Liity silti
                </button>
                <button
                  onClick={() => setJoinConflicts(null)}
                  disabled={joining}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-amber-900 border border-amber-300 hover:bg-amber-50 disabled:opacity-50"
                >
                  Peruuta
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking info */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-text-primary">Työn tiedot</h2>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {formatDate(booking.booking_date)} klo {booking.time_slot?.slice(0, 5)} – {endTime}
                </p>
                {service && (
                  <p className="text-xs text-text-muted">
                    Kesto: {booking.duration_minutes || service.duration_minutes} min
                  </p>
                )}
              </div>
            </div>

            {service && (
              <div className="flex items-start gap-3">
                <Package className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {service.name}
                    {booking.service_variants && (
                      <span className="text-text-muted font-normal ml-1">— {booking.service_variants.label}</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {booking.address && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <p className="text-sm text-text-primary">
                  {formatAddress(booking.address, booking.postal_code)}
                </p>
              </div>
            )}

            {bookingTeam.length > 1 && (
              <div className="flex items-start gap-3">
                <Users className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  {bookingTeam.map((be) => (
                    <p key={be.id} className="text-sm text-text-primary">
                      {be.employees ? `${be.employees.first_name} ${be.employees.last_name}` : "–"}
                      {be.role === "secondary" && <span className="text-xs text-text-muted ml-1">(apuri)</span>}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {sellerName && (
              <div className="flex items-start gap-3">
                <UserCheck className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-text-muted">Myyjä</p>
                  <p className="text-sm text-text-primary">{sellerName}</p>
                </div>
              </div>
            )}

            <div className="pt-2">
              {showPrices && (
                <>
                  <p className="text-sm font-medium text-text-primary">
                    Hinta: {formatCents(booking.price_cents)}
                  </p>
                  {booking.discount_amount_cents > 0 && (
                    <p className="text-xs text-accent-dark mt-0.5">Alennus: -{formatCents(booking.discount_amount_cents)}{booking.discount_codes?.code && ` (${booking.discount_codes.code})`}</p>
                  )}
                  {lineItems.length > 0 && (() => {
                    const materialFromField = lineItems.reduce((sum, li) => sum + (li.material_cost_cents || 0) * li.quantity, 0);
                    const materialFromProducts = materialFromField > 0
                      ? materialFromField
                      : lineItems.filter((li) => li.line_type === "product").reduce((sum, li) => sum + li.price_cents * li.quantity, 0);
                    const laborPortion = booking.price_cents - materialFromProducts;
                    return materialFromProducts > 0 ? (
                      <div className="mt-1.5 space-y-0.5">
                        <p className="text-xs text-text-muted">Työn osuus: <span className="font-medium text-text-secondary">{formatCents(laborPortion)}</span></p>
                        <p className="text-xs text-text-muted">Materiaalit: <span className="font-medium text-text-secondary">{formatCents(materialFromProducts)}</span></p>
                      </div>
                    ) : null;
                  })()}
                </>
              )}
              {bookingTeam.some((be: any) => be.employees?.tier !== "palkallinen") && (() => {
                const myBe = bookingTeam.find((be: any) => be.employee_id === employee?.id);
                const commission = myBe?.commission_cents || 0;
                return commission > 0 ? (
                  <p className={`text-xs text-purple-600 ${showPrices ? "mt-1.5" : ""}`}>Provisio: {formatCents(commission)}</p>
                ) : null;
              })()}
            </div>
          </div>

          {/* Line items */}
          {lineItems.length > 0 && (
            <div className="pt-3 border-t border-border space-y-1.5">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Tuotteet ja palvelut</p>
              {lineItems.map((item) => (
                <div key={item.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary">{item.name}</span>
                      {item.quantity > 1 && <span className="text-text-muted">× {item.quantity}</span>}
                      {item.line_type === "addon_service" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">lisäpalvelu</span>}
                      {item.line_type === "product" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">tuote</span>}
                    </div>
                    {showPrices && (
                      <span className="text-text-muted shrink-0">{formatCents(item.price_cents * item.quantity)}</span>
                    )}
                  </div>
                  {item.line_type === "product" && (
                    <ProductComponentBreakdown
                      product={item.products}
                      components={componentProducts || new Map()}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {booking.notes && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Lisätiedot
              </p>
              <p className="text-sm text-text-primary whitespace-pre-wrap">
                {booking.notes}
              </p>
            </div>
          )}

          {salesNotes.length > 0 && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                Myynnin muistiinpanot
              </p>
              <div className="space-y-2">
                {salesNotes.map((n) => (
                  <div key={n.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{n.body}</p>
                    <p className="text-[11px] text-text-muted mt-1">{formatDate(n.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {booking.inside_notes && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Asentajan muistiinpanot
              </p>
              <p className="text-sm text-text-primary whitespace-pre-wrap">
                {booking.inside_notes}
              </p>
            </div>
          )}
        </div>

        {/* Customer info */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">Asiakas</h2>
            {customer && !editingCustomer && (
              <button
                onClick={() => {
                  setEditForm({
                    first_name: customer.first_name || "",
                    last_name: customer.last_name || "",
                    email: customer.email || "",
                    phone: customer.phone || "",
                    address: customer.address || "",
                    postal_code: customer.postal_code || "",
                  });
                  setEditingCustomer(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Muokkaa
              </button>
            )}
          </div>

          {customer && !editingCustomer && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text-primary">
                {customer.first_name} {customer.last_name}
              </p>

              {customer.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-text-muted shrink-0" />
                  <a href={`tel:${customer.phone}`} className="text-sm text-accent-dark hover:underline">
                    {customer.phone}
                  </a>
                </div>
              )}

              {customer.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-text-muted shrink-0" />
                  <a href={`mailto:${customer.email}`} className="text-sm text-accent-dark hover:underline">
                    {customer.email}
                  </a>
                </div>
              )}

              {(customer.address || customer.postal_code) && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-text-muted shrink-0" />
                  <p className="text-sm text-text-primary">
                    {formatAddress(customer.address, customer.postal_code)}
                  </p>
                </div>
              )}
            </div>
          )}

          {customer && editingCustomer && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await updateCustomer.mutateAsync({
                    id: customer.id,
                    first_name: editForm.first_name.trim(),
                    last_name: editForm.last_name.trim(),
                    email: editForm.email.trim(),
                    phone: editForm.phone.trim() || null,
                    address: editForm.address.trim() || null,
                    postal_code: editForm.postal_code.trim() || null,
                  });
                  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.byNumber(booking.booking_number) });
                  setEditingCustomer(false);
                } catch (err: any) {
                  alert(`Tallennus epäonnistui: ${err?.message || "Tuntematon virhe"}`);
                }
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Etunimi</label>
                  <input
                    type="text"
                    required
                    value={editForm.first_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Sukunimi</label>
                  <input
                    type="text"
                    required
                    value={editForm.last_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Sähköposti</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Puhelin</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Osoite</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="w-32">
                <label className="block text-xs text-text-muted mb-1">Postinumero</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={editForm.postal_code}
                  onChange={(e) => setEditForm((f) => ({ ...f, postal_code: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={updateCustomer.isPending}
                  className="px-4 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
                >
                  {updateCustomer.isPending ? "Tallennetaan..." : "Tallenna"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCustomer(false)}
                  className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary border border-border rounded-lg hover:bg-surface-hover transition-colors"
                >
                  Peruuta
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Product logistics */}
      {productOrders.length > 0 && (
        <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <Package className="w-4 h-4 text-accent" />
            Tuotetilaukset
          </h2>
          {productOrders.map((po) => (
            <div key={po.id} className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-text-primary">{po.products?.name ?? "Tuote"}</span>
                <span className="block text-xs text-text-tertiary">{po.products?.brand} — {po.quantity} kpl</span>
              </div>
              <div className="flex items-center gap-2">
                <ProductOrderStatusBadge status={po.status} />
                {po.status === "ready_for_pickup" && (
                  <button
                    onClick={() => bulkUpdateBPO.mutate({ ids: [po.id], status: "picked_up" })}
                    className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg"
                  >
                    Noudettu
                  </button>
                )}
                {po.status === "picked_up" && (
                  <button
                    onClick={() => bulkUpdateBPO.mutate({ ids: [po.id], status: "delivered" })}
                    className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg"
                  >
                    Toimitettu
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legacy device orders */}
      {deviceOrders.length > 0 && productOrders.length === 0 && (
        <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <Package className="w-4 h-4 text-accent" />
            Laitetilaukset
          </h2>
          {deviceOrders.map((order) => (
            <div key={order.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-text-primary">{order.brand}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  order.status === "sent" ? "bg-green-50 text-green-700" :
                  order.status === "failed" ? "bg-red-50 text-red-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {order.status === "sent" ? <Check className="w-3 h-3" /> : null}
                  {order.status === "sent" ? "Tilattu" : order.status === "failed" ? "Epäonnistunut" : "Odottaa"}
                </span>
              </div>
              {order.gmailThreadId && (
                <button
                  onClick={() => setThreadDialog({ threadId: order.gmailThreadId!, brand: order.brand })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Näytä tilaus
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Documents */}
      {docs.length > 0 && (
        <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            Tiedostot
          </h2>
          <div className="space-y-2">
            {docs.map((file) => {
              const url = getFileUrl(file);
              return (
                <div key={file.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-text-muted shrink-0" />
                    <span className="text-sm text-text-primary truncate">{file.filename}</span>
                    {file.file_type === "offer_pdf" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 shrink-0">tarjous</span>}
                    {file.file_type === "installation_plan_pdf" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 shrink-0">asennussuunnitelma</span>}
                  </div>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Avaa
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Protocol PDFs (pöytäkirjat) — same as admin's Tiedostot section */}
      {protocols.some((p) => p.status === "completed" && p.pdf_storage_path) && (
        <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            Pöytäkirjat
          </h2>
          <div className="space-y-2">
            {protocols
              .filter((p) => p.status === "completed" && p.pdf_storage_path)
              .map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-text-muted shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">Pöytäkirja {p.sequence_number} — #{booking.booking_number}</p>
                      {p.completed_at && (
                        <p className="text-xs text-text-muted">{formatDateTime(p.completed_at)}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const { data } = supabase.storage
                        .from("protocol-files")
                        .getPublicUrl(p.pdf_storage_path!);
                      window.open(data.publicUrl, "_blank");
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Avaa
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Photos */}
      {images.length > 0 && (
        <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <Image className="w-4 h-4 text-accent" />
            Kuvat
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map((file) => {
              const url = getFileUrl(file);
              return (
                <button
                  key={file.id}
                  onClick={() => url && setLightboxUrl(url)}
                  className="relative aspect-square rounded-xl overflow-hidden border border-border hover:ring-2 hover:ring-accent/30 transition-all"
                >
                  <img src={url || ""} alt={file.filename} className="w-full h-full object-cover" />
                  {file.photo_category && (
                    <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">
                      {file.photo_category}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking files upload */}
      <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
        <h2 className="font-semibold text-text-primary flex items-center gap-2">
          <Image className="w-4 h-4 text-accent" />
          Varauksen kuvat ja tiedostot
        </h2>
        <BookingFileUpload siteId={booking.site_id} bookingId={booking.id} />
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
        </div>
      )}

      {threadDialog && (
        <OrderThreadDialog
          threadId={threadDialog.threadId}
          brand={threadDialog.brand}
          onClose={() => setThreadDialog(null)}
        />
      )}

      {/* Transfer modal */}
      {showTransfer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !transferring && setShowTransfer(false)}
        >
          <div
            className="bg-surface rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text-primary">Siirrä tiimikaverille</h3>
              <button
                onClick={() => !transferring && setShowTransfer(false)}
                className="p-1 text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-text-secondary">
              Keikka siirtyy valitulle henkilölle. Asiakkaalle ei lähde mitään ilmoitusta.
            </p>
            {transferError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {transferError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Vastaanottaja
              </label>
              <select
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
                disabled={transferring}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              >
                <option value="">Valitse…</option>
                {transferCandidates.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowTransfer(false)}
                disabled={transferring}
                className="px-4 py-2 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                Peruuta
              </button>
              <button
                onClick={handleTransfer}
                disabled={!transferTargetId || transferring}
                className="px-5 py-2 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {transferring ? "Siirretään..." : "Siirrä"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {showReschedule && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => !rescheduleSaving && setShowReschedule(false)}
        >
          <div
            className="bg-surface rounded-2xl shadow-xl max-w-lg w-full my-8 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text-primary">Siirrä ajankohtaa</h3>
              <button
                onClick={() => !rescheduleSaving && setShowReschedule(false)}
                className="p-1 text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Nykyinen: {formatDate(booking.booking_date)} klo {booking.time_slot?.slice(0, 5)}
            </p>
            {rescheduleError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {rescheduleError}
              </div>
            )}
            <CalendarStep
              path="free"
              postalCode={booking.postal_code || ""}
              selectedServiceIds={booking.service_id ? [booking.service_id] : []}
              allServices={[]}
              allEmployees={visibleInstallers}
              allAreas={[]}
              selectedEmployeeId={employee?.id ?? null}
              setSelectedEmployeeId={() => {}}
              selectedCalendarId={rescheduleCalendarId}
              setSelectedCalendarId={setRescheduleCalendarId}
              selectedDate={rescheduleDate}
              setSelectedDate={setRescheduleDate}
              selectedTime={rescheduleTime}
              setSelectedTime={setRescheduleTime}
              calMonth={calMonth}
              setCalMonth={setCalMonth}
              totalDuration={(booking.duration_minutes || service?.duration_minutes || 60) + (service?.transition_minutes ?? 0)}
              minSchedulingNoticeHours={0}
              excludeBookingId={booking.id}
              hideEmployeeFilter
              onBack={() => setShowReschedule(false)}
              onNext={handleRescheduleSave}
              canProceed={!!rescheduleDate && !!rescheduleTime}
              isSubmitting={rescheduleSaving}
              highlightTime={booking.time_slot?.slice(0, 5) || null}
              backLabel="Peruuta"
              nextLabel="Tallenna"
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rescheduleSendEmail}
                onChange={(e) => setRescheduleSendEmail(e.target.checked)}
                className="rounded border-border text-accent accent-accent-dark"
              />
              Lähetä ilmoitus asiakkaalle
            </label>
          </div>
        </div>
      )}

    </div>
  );
}
