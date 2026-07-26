import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirm, useConfirmWithCheckbox } from "@/context/ConfirmContext";
import { useBookingByNumber, useBookingStatusLog, useBookingAuditLog, useBookingNotes, useAddBookingNote, useUpdateBookingNote, useDeleteBookingNote, useUpdateBookingStatus, useUpdateBooking, useDeleteBooking } from "@/hooks/useBookings";
import { queryKeys } from "@/lib/queryKeys";
import { useEmployees } from "@/hooks/useEmployees";
import { useUpdateBookingTeam, useEmployeeTeamMembers, fetchEmployeeConflicts, type ConflictRow } from "@/hooks/useBookingTeam";
import { useUpdateOpportunity } from "@/hooks/sales/useSalesOpportunities";
import { useServices, useServiceAreas, useCompanySettings } from "@/hooks/useServices";
import { useBookingLineItems, useAddBookingLineItem, useUpdateBookingLineItem, useDeleteBookingLineItem } from "@/hooks/useBookingLineItems";
import { useAddonServices } from "@/hooks/useAddonServices";
import { useBookingInternalCosts } from "@/hooks/usePalkallinenInternalCosts";
import { useProducts } from "@/hooks/useProducts";
import { useProtocolsByBooking } from "@/hooks/useProtocols";
import { useUpdateCustomer } from "@/hooks/useCustomers";
import { useBookingDeviceOrders } from "@/hooks/sales/useDeviceOrders";
import { useBookingProductOrdersByBooking } from "@/hooks/useLogistics";
import { ProductOrderStatusBadge, ProductOrderSourceBadge } from "@/components/logistics/LogisticsStatusBadge";
import BookingProductOrderTimeline from "@/components/logistics/BookingProductOrderTimeline";
import SourceAssignmentDialog from "@/components/logistics/SourceAssignmentDialog";
import type { BookingProductOrder } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import BookingFileUpload from "@/components/BookingFileUpload";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { BookingInventoryAssignment } from "@/components/inventory/BookingInventoryAssignment";
import { useComponentProducts, lineItemComponentIds, ProductComponentBreakdown } from "@/components/booking/ProductComponents";
import OrderThreadDialog from "@/components/sales/OrderThreadDialog";
import type { SalesOpportunityFile } from "@/lib/sales-types";
import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CalendarStep } from "@/components/CalendarStep";
import {
  describeReviewSmsSendTime,
  formatCents,
  formatDate,
  formatDateTime,
  getUnitPriceCents,
  STATUS_LABELS,
  STATUS_COLORS,
  PAYMENT_LABELS,
  PAYMENT_COLORS,
  PLAN_LABELS,
  postalCity,
  formatAddress,
} from "@/lib/utils";
import { supabase, getFreshToken } from "@/lib/supabase";
import { useStorageUrls } from "@/lib/storage";
import { ArrowLeft, CheckCircle, XCircle, Clock, Trash2, ClipboardCheck, CalendarClock, UserRoundCog, X, Undo2, Pencil, Save, Send, MessageSquare, Check, FileText, Download, Plus, Camera, ChevronDown, Users, UserPlus, AlertTriangle, Link2 } from "lucide-react";
import type { BookingStatus, PaymentStatus } from "@/lib/types";

const STATUS_ACTIONS: Record<BookingStatus, { label: string; next: BookingStatus; icon: typeof CheckCircle; color: string }[]> = {
  pending: [
    { label: "Vahvista", next: "confirmed", icon: CheckCircle, color: "bg-accent hover:bg-accent-dark text-white" },
    { label: "Peruuta", next: "cancelled", icon: XCircle, color: "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200" },
  ],
  confirmed: [
    { label: "Peruuta", next: "cancelled", icon: XCircle, color: "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200" },
  ],
  completed: [],
  cancelled: [
    { label: "Palauta odottavaksi", next: "pending", icon: Clock, color: "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200" },
  ],
};

type ActivePanel = null | "reschedule" | "installer" | "edit";

export default function BookingDetail() {
  const confirm = useConfirm();
  const confirmWithCheckbox = useConfirmWithCheckbox();
  const queryClient = useQueryClient();
  const { bookingNumber } = useParams<{ bookingNumber: string }>();
  const parsedNumber = bookingNumber ? parseInt(bookingNumber, 10) : undefined;
  const { data: booking, isLoading } = useBookingByNumber(parsedNumber);
  const { data: statusLog } = useBookingStatusLog(booking?.id);
  const { data: auditLog } = useBookingAuditLog(booking?.id);
  const { data: bookingNotes } = useBookingNotes(booking?.id);
  const addNote = useAddBookingNote();
  const updateNote = useUpdateBookingNote();
  const deleteNote = useDeleteBookingNote();
  const updateStatus = useUpdateBookingStatus();
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();
  const navigate = useNavigate();

  const { data: allEmployees } = useEmployees("installer");
  const { data: allSellers } = useEmployees("seller");
  const updateOpp = useUpdateOpportunity();
  const { data: allServices } = useServices();
  const { data: allAreas } = useServiceAreas();
  const { data: companySettings } = useCompanySettings();
  const { data: lineItems } = useBookingLineItems(booking?.id);
  const { data: componentProducts } = useComponentProducts(lineItemComponentIds(lineItems || []));
  const addLineItem = useAddBookingLineItem();
  const updateLineItem = useUpdateBookingLineItem();
  const deleteLineItem = useDeleteBookingLineItem();
  const { data: allAddons } = useAddonServices();
  const { data: allProducts } = useProducts();
  const { data: protocols = [] } = useProtocolsByBooking(booking?.id);
  const { data: deviceOrders = [] } = useBookingDeviceOrders(booking?.opportunity_id ?? undefined);
  const { data: productOrders = [] } = useBookingProductOrdersByBooking(booking?.id);
  const [sourceDialogBPO, setSourceDialogBPO] = useState<BookingProductOrder | null>(null);

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
  // Review SMS status
  const { data: reviewSms } = useQuery({
    queryKey: ["review-sms", booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("review_sms_log")
        .select("id, status, scheduled_at, created_at")
        .eq("booking_id", booking!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; status: string; scheduled_at: string | null; created_at: string } | null;
    },
    refetchInterval: 30_000,
  });

  // Customer feedback/review
  const { data: feedback } = useQuery({
    queryKey: ["booking-feedback", booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("booking_feedback")
        .select("rating, comment, submitted_at")
        .eq("booking_id", booking!.id)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { rating: string; comment: string | null; submitted_at: string } | null;
    },
  });

  // Match utm_campaign to marketing_campaigns for human-readable name
  const { data: matchedCampaign } = useQuery({
    queryKey: ["booking-campaign-match", booking?.utm_campaign],
    enabled: !!booking?.utm_campaign,
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_campaigns")
        .select("name, platform")
        .eq("platform_campaign_id", booking!.utm_campaign!)
        .maybeSingle();
      return (data as { name: string; platform: "google_ads" | "meta_ads" }) || null;
    },
  });

  const { data: oppFiles = [] } = useQuery({
    queryKey: ["admin-opp-files", booking?.opportunity_id],
    enabled: !!booking?.opportunity_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunity_files")
        .select("*")
        .eq("opportunity_id", booking!.opportunity_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOpportunityFile[];
    },
  });

  const { data: oppSeller } = useQuery({
    queryKey: ["booking-opp-seller", booking?.opportunity_id],
    enabled: !!booking?.opportunity_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunities")
        .select("id, assigned_salesperson_id")
        .eq("id", booking!.opportunity_id!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; assigned_salesperson_id: string | null } | null;
    },
  });
  const oppFileUrls = useStorageUrls(oppFiles);
  const bookingTeam = booking?.booking_employees || [];
  const { data: internalCosts } = useBookingInternalCosts(booking?.id);
  const [threadDialog, setThreadDialog] = useState<{ threadId: string; brand: string } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [reverting, setReverting] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);

  // Reschedule state
  const [rescheduleEmployeeId, setRescheduleEmployeeId] = useState<string | null>(null);
  const [rescheduleCalendarId, setRescheduleCalendarId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleSendEmail, setRescheduleSendEmail] = useState(true);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  // "Copy reschedule link" feedback ("" | "copied" | "error")
  const [copyLinkState, setCopyLinkState] = useState<"" | "copied" | "error">("");
  const [copyLinkBusy, setCopyLinkBusy] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Edit state
  const [editServiceQty, setEditServiceQty] = useState<Record<string, number>>({});
  const [editPriceOverride, setEditPriceOverride] = useState<string | null>(null); // null = auto-calculate
  const [editDiscountCents, setEditDiscountCents] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editInsideNotes, setEditInsideNotes] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPostalCode, setEditPostalCode] = useState("");

  // Line item add state
  const [lineItemType, setLineItemType] = useState<"addon_service" | "product" | "custom">("addon_service");
  const [lineItemPickId, setLineItemPickId] = useState("");
  const [lineItemCustomName, setLineItemCustomName] = useState("");
  const [lineItemCustomPrice, setLineItemCustomPrice] = useState("");
  const [lineItemCustomDuration, setLineItemCustomDuration] = useState("");
  const [lineItemCustomMaterial, setLineItemCustomMaterial] = useState("");
  const [lineItemCustomCommission, setLineItemCustomCommission] = useState("");
  const [lineItemCustomPurchasePrice, setLineItemCustomPurchasePrice] = useState("");

  // Installer change state
  const [installerChanging, setInstallerChanging] = useState<string | null>(null);
  const [teamMutating, setTeamMutating] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<{ empId: string; conflicts: ConflictRow[] } | null>(null);
  const updateBookingTeam = useUpdateBookingTeam();
  const primaryEmpId = booking?.employee_id ?? null;
  const { data: primaryTeammates = [] } = useEmployeeTeamMembers(primaryEmpId ?? undefined);

  // Customer edit state
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerEditForm, setCustomerEditForm] = useState({ first_name: "", last_name: "", email: "", phone: "", address: "", postal_code: "", company_name: "", business_id: "" });
  const updateCustomer = useUpdateCustomer();

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-6 bg-border rounded w-32" />
      <div className="h-64 bg-surface rounded-2xl" />
    </div>;
  }

  if (!booking) {
    return <p className="text-text-muted">Varausta ei löytynyt</p>;
  }

  const actions = STATUS_ACTIONS[booking.status] || [];
  const isActiveBooking = booking.status === "pending" || booking.status === "confirmed";

  // ─── Build merged timeline (status changes + field edits) ───
  const FIELD_LABELS: Record<string, string> = {
    booking_date: "Päivämäärä",
    time_slot: "Kellonaika",
    employee_id: "Asentaja",
    service_id: "Palvelu",
    variant_id: "Palveluvariantti",
    price_cents: "Hinta",
    discount_amount_cents: "Alennus",
    address: "Osoite",
    postal_code: "Postinumero",
    notes: "Lisätiedot",
    payment_status: "Maksun tila",
    send_receipt: "Kuitti",
  };

  function formatAuditValue(field: string, value: string | null): string {
    if (!value) return "–";
    if (field === "price_cents" || field === "discount_amount_cents") return formatCents(parseInt(value, 10));
    if (field === "employee_id") {
      const emp = allEmployees?.find((e) => e.id === value);
      return emp ? `${emp.first_name} ${emp.last_name}` : value.slice(0, 8);
    }
    if (field === "service_id") {
      const svc = allServices?.find((s) => s.id === value);
      return svc?.name || value.slice(0, 8);
    }
    if (field === "payment_status") return value === "paid" ? "Maksettu" : "Maksamatta";
    if (field === "send_receipt") return value === "true" ? "Kyllä" : "Ei";
    return value;
  }

  type TimelineEntry =
    | { type: "status"; id: string; created_at: string; old_status: BookingStatus | null; new_status: BookingStatus; note: string | null }
    | { type: "edit"; id: string; created_at: string; field_name: string; old_value: string | null; new_value: string | null };

  const timeline: TimelineEntry[] = [
    ...(statusLog || []).map((s) => ({ type: "status" as const, id: s.id, created_at: s.created_at, old_status: s.old_status, new_status: s.new_status, note: s.note })),
    ...(auditLog || []).filter((a) => a.field_name !== "status").map((a) => ({ type: "edit" as const, id: a.id, created_at: a.created_at, field_name: a.field_name, old_value: a.old_value, new_value: a.new_value })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  function openReschedule() {
    setRescheduleEmployeeId(null);
    setRescheduleCalendarId(null);
    setRescheduleDate(null);
    setRescheduleTime(null);
    const d = new Date(booking!.booking_date + "T00:00:00");
    setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
    setActivePanel("reschedule");
  }

  // Get-or-create a reschedule token for this booking and copy the customer
  // self-service link to the clipboard. The customer opens it on the public
  // site and can move the booking to any available slot themselves.
  async function copyRescheduleLink() {
    if (!booking || copyLinkBusy) return;
    setCopyLinkBusy(true);
    try {
      let token: string | undefined;
      const { data: existing } = await supabase
        .from("booking_reschedule_tokens")
        .select("token")
        .eq("booking_id", booking.id)
        .maybeSingle();
      token = existing?.token;

      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
        const { error } = await supabase
          .from("booking_reschedule_tokens")
          .insert({ booking_id: booking.id, token });
        if (error) {
          // Likely a race (token created in parallel) — re-fetch the existing one.
          const { data: retry } = await supabase
            .from("booking_reschedule_tokens")
            .select("token")
            .eq("booking_id", booking.id)
            .maybeSingle();
          token = retry?.token;
          if (!token) throw error;
        }
      }

      await navigator.clipboard.writeText(`https://lasikiilto.fi/siirra-aika/${token}`);
      setCopyLinkState("copied");
    } catch (e) {
      console.error("copyRescheduleLink failed", e);
      setCopyLinkState("error");
    } finally {
      setCopyLinkBusy(false);
      setTimeout(() => setCopyLinkState(""), 2500);
    }
  }

  async function handleRescheduleSave() {
    if (!rescheduleDate || !rescheduleTime || !rescheduleEmployeeId) return;
    setRescheduleSaving(true);
    try {
      const { error } = await supabase.functions.invoke("reschedule-booking", {
        body: {
          booking_id: booking!.id,
          booking_date: rescheduleDate,
          time_slot: rescheduleTime,
          employee_id: rescheduleEmployeeId,
          calendar_id: rescheduleCalendarId,
          notify_customer: rescheduleSendEmail,
        },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: ["booking"] });
      queryClient.invalidateQueries({ queryKey: ["booking-by-number"] });
      queryClient.invalidateQueries({ queryKey: ["booking-audit-log"] });
      setActivePanel(null);
    } finally {
      setRescheduleSaving(false);
    }
  }

  async function handleInstallerChange(employeeId: string) {
    if (installerChanging) return;
    setInstallerChanging(employeeId);
    try {
      const { error } = await supabase.functions.invoke("reassign-booking-installer", {
        body: { booking_id: booking!.id, employee_id: employeeId },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: ["booking"] });
      queryClient.invalidateQueries({ queryKey: ["booking-by-number"] });
      queryClient.invalidateQueries({ queryKey: ["booking-audit-log"] });
    } finally {
      setInstallerChanging(null);
    }
  }

  function teamToPayload(rows: any[]) {
    return rows.map((be) => ({
      employee_id: be.employee_id,
      calendar_id: be.calendar_id || null,
      role: be.role,
      commission_cents: be.commission_override_cents ?? be.commission_cents ?? 0,
    }));
  }

  async function commitAddTeamMember(empId: string) {
    setTeamMutating(empId);
    try {
      // Build new team: existing rows + new secondary
      const base = bookingTeam.length > 0
        ? bookingTeam
        : (booking!.employee_id ? [{ employee_id: booking!.employee_id, calendar_id: booking!.calendar_id, role: "primary" as const }] : []);
      const newTeam = [
        ...teamToPayload(base),
        { employee_id: empId, role: "secondary" as const },
      ];
      await updateBookingTeam.mutateAsync({
        booking_id: booking!.id,
        booking_number: booking!.booking_number,
        team: newTeam,
      });
      setPendingAdd(null);
    } finally {
      setTeamMutating(null);
    }
  }

  async function handleAddTeamMember(empId: string) {
    if (teamMutating) return;
    const dur = booking!.duration_minutes || booking!.services?.duration_minutes || 60;
    const conflicts = await fetchEmployeeConflicts({
      employeeId: empId,
      date: booking!.booking_date,
      startTime: booking!.time_slot!,
      durationMin: dur,
      excludeBookingId: booking!.id,
    });
    if (conflicts.length > 0) {
      setPendingAdd({ empId, conflicts });
      return;
    }
    await commitAddTeamMember(empId);
  }

  async function handleRemoveTeamMember(empId: string) {
    if (teamMutating) return;
    setTeamMutating(empId);
    try {
      const newTeam = teamToPayload(bookingTeam.filter((be: any) => be.employee_id !== empId));
      // Re-mark first as primary in case we accidentally removed the primary
      if (newTeam.length > 0) newTeam[0].role = "primary";
      await updateBookingTeam.mutateAsync({
        booking_id: booking!.id,
        booking_number: booking!.booking_number,
        team: newTeam,
      });
    } finally {
      setTeamMutating(null);
    }
  }

  function openEdit() {
    // Build service qty from the service line item (source of truth for count),
    // falling back to device_count. Hardcoding 1 here dropped multi-unit bookings
    // (e.g. 2× huoltopesu) back to a single unit on save.
    const qty: Record<string, number> = {};
    if (booking!.service_id) {
      const serviceLine = (lineItems || []).find((li) => li.line_type === "service");
      qty[booking!.service_id] = serviceLine?.quantity || booking!.device_count || 1;
    }
    setEditServiceQty(qty);
    setEditPriceOverride(null);
    setEditDiscountCents(String((booking!.discount_amount_cents || 0) / 100));
    setEditNotes(booking!.notes || "");
    setEditInsideNotes(booking!.inside_notes || "");
    setEditAddress(booking!.address || "");
    setEditPostalCode(booking!.postal_code || "");
    setActivePanel("edit");
  }

  // Computed values for edit panel
  const editSelectedServices = (allServices || []).filter((s) => (editServiceQty[s.id] || 0) > 0);
  const editServicePrice = editSelectedServices.reduce((sum, s) => {
    const qty = editServiceQty[s.id] || 1;
    return sum + getUnitPriceCents(s, qty) * qty;
  }, 0);
  // Include non-service line items in auto-price (addons, products, custom)
  const editLineItemsPrice = (lineItems || [])
    .filter((li) => li.line_type !== "service")
    .reduce((sum, li) => sum + li.price_cents * li.quantity, 0);
  const editAutoPrice = editServicePrice + editLineItemsPrice;

  async function handleEditSave() {
    const discountCents = Math.round(parseFloat(editDiscountCents.replace(",", ".") || "0") * 100);

    // Determine primary service and total device count
    const serviceEntries = Object.entries(editServiceQty).filter(([, qty]) => qty > 0);
    const primaryServiceId = serviceEntries[0]?.[0] || null;
    const deviceCount = serviceEntries.reduce((sum, [, qty]) => sum + qty, 0) || 1;

    // Build service label and unit price for emails
    const primaryService = allServices?.find((s) => s.id === primaryServiceId);
    const unitPriceCents = primaryService ? getUnitPriceCents(primaryService, deviceCount) : null;
    const baseName = primaryService?.name || "Palvelu";
    const serviceLabel = deviceCount > 1 ? `${baseName} × ${deviceCount}` : baseName;

    // Compute duration: base + extra per additional unit
    let durationMinutes: number | null = null;
    if (primaryService) {
      const baseDur = primaryService.duration_minutes || 0;
      const extraPerUnit = (primaryService as any).extra_duration_per_unit_minutes;
      durationMinutes = deviceCount > 1 && extraPerUnit != null
        ? baseDur + (deviceCount - 1) * extraPerUnit
        : baseDur * deviceCount;
    }

    // Update (or recreate) the service line item — trigger recalculates bookings.price_cents
    const serviceLineItem = (lineItems || []).find((li) => li.line_type === "service");
    if (primaryServiceId) {
      // If user manually overrode the total price, back-calculate service unit price
      let serviceUnitPrice = unitPriceCents ?? primaryService?.base_price_cents ?? serviceLineItem?.price_cents ?? 0;
      if (editPriceOverride !== null) {
        const overrideTotal = Math.round(parseFloat(editPriceOverride.replace(",", ".") || "0") * 100);
        if (!isNaN(overrideTotal) && overrideTotal >= 0) {
          // service price = (desired total + discount) - non-service line items
          const totalServiceCents = overrideTotal + discountCents - editLineItemsPrice;
          serviceUnitPrice = Math.max(0, Math.round(totalServiceCents / deviceCount));
        }
      }
      // The line item NAME must be the plain service name. The unit count lives in
      // `quantity`, and the UI appends "× quantity" when rendering — baking the
      // multiplier into the name too produced "Huoltopesu × 2 × 2". (serviceLabel,
      // which carries the "× N", is still used for booking.service_label / emails.)
      const lineFields = {
        name: baseName,
        price_cents: serviceUnitPrice,
        quantity: deviceCount,
        duration_minutes: durationMinutes ?? primaryService?.duration_minutes ?? 0,
        material_cost_cents: primaryService?.material_cost_cents || 0,
      };
      if (serviceLineItem) {
        await updateLineItem.mutateAsync({ id: serviceLineItem.id, booking_id: booking!.id, ...lineFields });
      } else {
        // Booking has no service line item (some creation paths omit it, or it was
        // deleted) — recreate it so the primary service is part of price_cents
        // instead of the total collapsing to just the addons/products.
        await addLineItem.mutateAsync({ booking_id: booking!.id, line_type: "service", sort_order: -1, ...lineFields });
      }
    }

    // Don't send price_cents — the DB trigger calculates it from line items
    await updateBooking.mutateAsync({
      id: booking!.id,
      service_id: primaryServiceId,
      discount_amount_cents: discountCents,
      device_count: deviceCount,
      unit_price_cents: unitPriceCents,
      service_label: serviceLabel,
      duration_minutes: durationMinutes,
      notes: editNotes.trim() || null,
      inside_notes: editInsideNotes.trim() || null,
      address: editAddress.trim() || null,
      postal_code: editPostalCode.trim() || null,
    } as any);
    // Update Google Calendar event with new details
    supabase.functions.invoke("create-booking-calendar-event", {
      body: { booking_id: booking!.id },
    }).catch(console.error);
    setActivePanel(null);
  }

  return (
    <div>
      <Link to="/varaukset" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />
        Takaisin
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary break-words">
            #{booking.booking_number} — {booking.customers?.first_name} {booking.customers?.last_name}
          </h1>
          <p className="text-text-muted text-sm mt-0.5">
            Varaus luotu {formatDateTime(booking.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${STATUS_COLORS[booking.status]} text-sm px-3 py-1.5`}>
            {STATUS_LABELS[booking.status]}
          </Badge>
          {(booking.finalized_at || booking.payment_status === "paid" || booking.status === "completed") && (
            <div className="relative">
              <button
                onClick={() => setShowPaymentDropdown(!showPaymentDropdown)}
                className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Badge className={`${PAYMENT_COLORS[booking.payment_status] || "bg-gray-50 text-gray-500 border border-gray-200"} text-sm px-3 py-1.5`}>
                  {PAYMENT_LABELS[booking.payment_status] || "Ei maksettu"}
                </Badge>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
              </button>
              {showPaymentDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPaymentDropdown(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-lg py-1 z-20 min-w-[140px]">
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
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        {booking.status === "confirmed" && booking.price_cents > 0 && (
          <Link
            to={`/varaukset/${booking.booking_number}/viimeistely`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all bg-accent hover:bg-accent-dark text-white"
          >
            <ClipboardCheck className="w-4 h-4" />
            Viimeistele
          </Link>
        )}
        {(hasProtocol || protocols.length > 0) && (booking.status === "confirmed" || booking.status === "completed") && (
          <Link
            to={`/varaukset/${booking.booking_number}/poytakirja`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-text-primary hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Pöytäkirja
          </Link>
        )}
        {!hasProtocol && protocols.length === 0 && (booking.status === "confirmed" || booking.status === "completed") && (
          <Link
            to={`/varaukset/${booking.booking_number}/poytakirja`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-text-secondary hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Lisää pöytäkirja
          </Link>
        )}
        {booking.status === "completed" && booking.price_cents > 0 && (
          <button
            onClick={async () => {
              if (!await confirm({ message: "Peruutetaanko viimeistely? Varaus palautetaan vahvistetuksi ja viimeistelytiedot nollataan.", confirmLabel: "Peruuta viimeistely", variant: "danger" })) return;
              setReverting(true);
              try {
                const { error } = await supabase.functions.invoke("revert-finalization", {
                  body: { booking_id: booking.id },
                });
                if (error) throw error;
                queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                queryClient.invalidateQueries({ queryKey: queryKeys.bookings.byNumber(booking.booking_number) });
              } catch {
                alert("Virhe viimeistelyn peruutuksessa");
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
        )}
        {booking.status === "completed" && (
          <button
            onClick={async () => {
              if (sendingReceipt || receiptSent) return;
              setSendingReceipt(true);
              try {
                // 1. Generate PDF via Vercel Chromium API
                const token = await getFreshToken();
                const pdfResp = await fetch("https://loppusiivous-site-new.vercel.app/api/receipt-pdf", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ booking_id: booking.id }),
                });
                if (!pdfResp.ok) throw new Error("PDF generation failed");

                // 2. Convert to base64 in chunks (avoid stack overflow with large PDFs)
                const pdfBuf = await pdfResp.arrayBuffer();
                const pdfBytes = new Uint8Array(pdfBuf);
                const chunkSize = 8192;
                const chunks: string[] = [];
                for (let i = 0; i < pdfBytes.length; i += chunkSize) {
                  chunks.push(String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize)));
                }
                const pdfBase64 = btoa(chunks.join(""));

                // 3. Queue via email_outbox with pre-generated PDF
                const { error } = await supabase.from("email_outbox").insert({
                  type: "booking",
                  sender_email: "info@lasikiilto.fi",
                  payload: {
                    booking_id: booking.id,
                    email_type: "receipt",
                    pdf_base64: pdfBase64,
                  },
                  status: "pending",
                  scheduled_at: new Date().toISOString(),
                  reference_type: "booking",
                  reference_id: booking.id,
                });
                if (error) throw error;

                setSendingReceipt(false);
                setReceiptSent(true);
                setTimeout(() => setReceiptSent(false), 3000);
              } catch (err) {
                console.error("Receipt error:", err);
                alert("Virhe kuitin lähetyksessä");
                setSendingReceipt(false);
              }
            }}
            disabled={sendingReceipt || receiptSent}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 disabled:opacity-50"
          >
            {sendingReceipt ? (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : receiptSent ? (
              <Check className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sendingReceipt ? "Lähetetään..." : receiptSent ? "Kuitti lähetetty" : "Lähetä kuitti"}
          </button>
        )}
        {booking.status === "completed" && (
          <button
            onClick={async () => {
              if (downloadingReceipt) return;
              setDownloadingReceipt(true);
              try {
                // Generate the same PDF as the send flow, but stream it to the browser as a download
                const token = await getFreshToken();
                const pdfResp = await fetch("https://loppusiivous-site-new.vercel.app/api/receipt-pdf", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ booking_id: booking.id }),
                });
                if (!pdfResp.ok) throw new Error("PDF generation failed");

                const blob = await pdfResp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `kuitti-${booking.booking_number}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err) {
                console.error("Receipt download error:", err);
                alert("Virhe kuitin latauksessa");
              } finally {
                setDownloadingReceipt(false);
              }
            }}
            disabled={downloadingReceipt}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 disabled:opacity-50"
          >
            {downloadingReceipt ? (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloadingReceipt ? "Ladataan..." : "Lataa kuitti"}
          </button>
        )}
        {actions.map((action) => (
          <button
            key={action.next}
            onClick={async () => {
              if (action.next === "cancelled") {
                const result = await confirmWithCheckbox({
                  message: "Haluatko varmasti peruuttaa tämän varauksen?",
                  confirmLabel: "Peruuta varaus",
                  variant: "danger",
                  checkbox: { label: "Lähetä peruutusilmoitus asiakkaalle", defaultChecked: true },
                });
                if (!result.confirmed) return;
                updateStatus.mutate({ id: booking.id, status: action.next, notify_customer: result.checkboxValue });
                return;
              }
              updateStatus.mutate({ id: booking.id, status: action.next });
            }}
            disabled={updateStatus.isPending}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${action.color} disabled:opacity-50`}
          >
            <action.icon className="w-4 h-4" />
            {action.label}
          </button>
        ))}
        {isActiveBooking && (
          <>
            <button
              onClick={openReschedule}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
            >
              <CalendarClock className="w-4 h-4" />
              Siirrä ajankohtaa
            </button>
            <button
              onClick={copyRescheduleLink}
              disabled={copyLinkBusy}
              title="Kopioi asiakkaalle linkki, jolla hän voi siirtää aikaa itse"
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border disabled:opacity-50 ${
                copyLinkState === "copied"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : copyLinkState === "error"
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-surface hover:bg-surface-hover text-text-secondary border-border"
              }`}
            >
              {copyLinkState === "copied" ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
              {copyLinkState === "copied"
                ? "Linkki kopioitu"
                : copyLinkState === "error"
                  ? "Kopiointi epäonnistui"
                  : "Kopioi siirtolinkki"}
            </button>
            <button
              onClick={() => setActivePanel(activePanel === "installer" ? null : "installer")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all bg-surface hover:bg-surface-hover text-text-secondary border border-border"
            >
              <UserRoundCog className="w-4 h-4" />
              Asentajat
            </button>
          </>
        )}
        {isActiveBooking && (
          <button
            onClick={openEdit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all bg-surface hover:bg-surface-hover text-text-secondary border border-border"
          >
            <Pencil className="w-4 h-4" />
            Muokkaa
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={async () => {
            if (!await confirm({ message: "Poistetaanko varaus pysyvästi? Tätä ei voi perua.", confirmLabel: "Poista", variant: "danger" })) return;
            await deleteBooking.mutateAsync(booking.id);
            navigate("/varaukset");
          }}
          disabled={deleteBooking.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          Poista
        </button>
      </div>

      {/* Reschedule panel */}
      {activePanel === "reschedule" && (
        <div className="bg-surface rounded-2xl border-2 border-blue-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-text-primary">Siirrä ajankohtaa</h2>
            <button onClick={() => setActivePanel(null)} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
          <p className="text-sm text-text-muted mb-4">
            Nykyinen: {formatDate(booking.booking_date)} klo {booking.time_slot?.slice(0, 5)}
            {booking.employees && ` — ${booking.employees.first_name} ${booking.employees.last_name}`}
          </p>
          <CalendarStep
            path={booking.postal_code ? "postal" : "free"}
            postalCode={booking.postal_code || ""}
            selectedServiceIds={booking.service_id ? [booking.service_id] : []}
            allServices={allServices || []}
            allEmployees={allEmployees || []}
            allAreas={allAreas || []}
            selectedEmployeeId={rescheduleEmployeeId}
            setSelectedEmployeeId={setRescheduleEmployeeId}
            selectedCalendarId={rescheduleCalendarId}
            setSelectedCalendarId={setRescheduleCalendarId}
            selectedDate={rescheduleDate}
            setSelectedDate={setRescheduleDate}
            selectedTime={rescheduleTime}
            setSelectedTime={setRescheduleTime}
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            totalDuration={(booking.duration_minutes || booking.services?.duration_minutes || 60) + (booking.services?.transition_minutes ?? companySettings?.default_transition_minutes ?? 0)}
            minSchedulingNoticeHours={0}
            excludeBookingId={booking.id}
            onBack={() => setActivePanel(null)}
            onNext={handleRescheduleSave}
            canProceed={!!rescheduleDate && !!rescheduleTime && !!rescheduleEmployeeId}
            isSubmitting={rescheduleSaving}
            highlightTime={booking.time_slot?.slice(0, 5) || null}
            backLabel="Peruuta"
            nextLabel="Tallenna"
          />
          <label className="flex items-center gap-2 mt-4 text-sm text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rescheduleSendEmail}
              onChange={(e) => setRescheduleSendEmail(e.target.checked)}
              className="rounded border-border text-accent accent-accent-dark"
            />
            Lähetä ilmoitus asiakkaalle
          </label>
        </div>
      )}

      {/* Installer / team panel */}
      {activePanel === "installer" && (() => {
        const primary = bookingTeam.find((be: any) => be.role === "primary")
          || (booking.employee_id ? { employee_id: booking.employee_id, employees: booking.employees, role: "primary" } : null);
        const secondaries = bookingTeam.filter((be: any) => be.role === "secondary");
        const secondaryIds = new Set(secondaries.map((be: any) => be.employee_id));

        const addableTeammates = primaryTeammates.filter(
          (e) => e.employee_id !== primary?.employee_id && !secondaryIds.has(e.employee_id) && e.active
        );
        const primaryHasTeam = primaryTeammates.length > 0;

        return (
          <div className="bg-surface rounded-2xl border-2 border-border p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-text-primary flex items-center gap-2"><Users className="w-4 h-4" /> Asentajat</h2>
              <button onClick={() => { setActivePanel(null); setPendingAdd(null); }} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            {/* Primary */}
            <div className="mb-5">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Pääasentaja</p>
              <p className="text-sm text-text-muted mb-3">
                Nykyinen: {primary?.employees ? `${primary.employees.first_name} ${primary.employees.last_name}` : "Ei asentajaa"}
              </p>
              <div className="flex flex-wrap gap-2">
                {allEmployees?.filter((e) => e.active).map((emp) => {
                  const isCurrent = primary?.employee_id === emp.id;
                  const isChangingThis = installerChanging === emp.id;
                  const isDisabled = !!installerChanging || !!teamMutating || isCurrent;
                  return (
                    <button
                      key={emp.id}
                      onClick={() => handleInstallerChange(emp.id)}
                      disabled={isDisabled}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        isChangingThis
                          ? "bg-accent text-white border-accent animate-pulse"
                          : isCurrent
                            ? "bg-accent-muted text-accent-dark border-accent/30"
                            : installerChanging
                              ? "bg-surface text-text-muted border-border opacity-50 cursor-not-allowed"
                              : "bg-surface text-text-secondary border-border hover:border-border-strong"
                      }`}
                    >
                      {isChangingThis && (
                        <svg className="inline w-3.5 h-3.5 mr-1.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
                      )}
                      {emp.first_name} {emp.last_name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Secondaries */}
            <div className="border-t border-border pt-5">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Kakkosasentajat</p>
              {secondaries.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-4">
                  {secondaries.map((be: any) => {
                    const removing = teamMutating === be.employee_id;
                    return (
                      <div key={be.id} className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-xl bg-accent-muted/60 border border-accent/30 text-sm font-medium text-accent-dark">
                        {be.employees ? `${be.employees.first_name} ${be.employees.last_name}` : "–"}
                        <button
                          onClick={() => handleRemoveTeamMember(be.employee_id)}
                          disabled={!!teamMutating}
                          className="ml-1 p-1 rounded-lg hover:bg-accent/20 disabled:opacity-50"
                          title="Poista tiimistä"
                        >
                          {removing ? (
                            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
                          ) : (
                            <X className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-text-muted mb-4">Ei kakkosasentajia</p>
              )}

              {primary ? (
                addableTeammates.length > 0 ? (
                  <div>
                    <p className="text-xs text-text-muted mb-2">Lisää pääasentajan tiimistä:</p>
                    <div className="flex flex-wrap gap-2">
                      {addableTeammates.map((emp) => {
                        const adding = teamMutating === emp.employee_id;
                        return (
                          <button
                            key={emp.employee_id}
                            onClick={() => handleAddTeamMember(emp.employee_id)}
                            disabled={!!teamMutating}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-dashed border-border bg-surface text-text-secondary hover:border-accent hover:text-accent-dark disabled:opacity-50 transition-all"
                          >
                            {adding ? (
                              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
                            ) : (
                              <UserPlus className="w-3.5 h-3.5" />
                            )}
                            {emp.first_name} {emp.last_name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">
                    {primaryHasTeam
                      ? "Kaikki tiimiläiset ovat jo mukana"
                      : "Pääasentajaa ei ole liitetty tiimiin — lisää tiimi ensin asetuksissa"}
                  </p>
                )
              ) : (
                <p className="text-xs text-text-muted">Valitse ensin pääasentaja yltä</p>
              )}

              {pendingAdd && (() => {
                const emp = allEmployees?.find((e) => e.id === pendingAdd.empId);
                const empName = emp ? `${emp.first_name} ${emp.last_name}` : "Asentajalla";
                return (
                  <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-900">{empName} on jo varattu samaan aikaan</p>
                        <ul className="mt-1.5 space-y-0.5">
                          {pendingAdd.conflicts.map((c) => (
                            <li key={c.id} className="text-xs text-amber-800">
                              #{c.booking_number ?? "?"} klo {c.time_slot?.slice(0, 5)} — {c.customers?.first_name} {c.customers?.last_name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => commitAddTeamMember(pendingAdd.empId)}
                        disabled={!!teamMutating}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
                      >
                        Lisää silti
                      </button>
                      <button
                        onClick={() => setPendingAdd(null)}
                        disabled={!!teamMutating}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-amber-900 border border-amber-300 hover:bg-amber-50 disabled:opacity-50"
                      >
                        Peruuta
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* Edit booking panel */}
      {activePanel === "edit" && (
        <div className="bg-surface rounded-2xl border-2 border-accent/40 p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-text-primary">Muokkaa varausta</h2>
            <button onClick={() => setActivePanel(null)} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Services */}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2 block">Palvelut</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allServices?.filter((s) => s.active).map((svc) => {
                  const qty = editServiceQty[svc.id] || 0;
                  return (
                    <div
                      key={svc.id}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        qty > 0 ? "border-accent bg-accent-muted" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-text-primary truncate">{svc.name}</p>
                          <p className="text-xs text-text-muted">{formatCents(svc.base_price_cents)} &middot; {svc.duration_minutes} min</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {qty > 0 && (
                            <button
                              type="button"
                              onClick={() => setEditServiceQty((prev) => {
                                const next = { ...prev };
                                if (next[svc.id] <= 1) delete next[svc.id];
                                else next[svc.id]--;
                                return next;
                              })}
                              className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover text-sm font-bold"
                            >
                              −
                            </button>
                          )}
                          {qty > 0 && (
                            <span className="w-5 text-center text-sm font-semibold text-text-primary">{qty}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditServiceQty((prev) => ({ ...prev, [svc.id]: (prev[svc.id] || 0) + 1 }));
                              setEditPriceOverride(null); // Reset to auto-price
                            }}
                            className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-accent hover:text-white hover:border-accent text-sm font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Price */}
            <div>
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 block">Hinta (€, sis. ALV)</label>
              <input
                type="text"
                inputMode="decimal"
                value={editPriceOverride !== null ? editPriceOverride : String(editAutoPrice / 100)}
                onChange={(e) => setEditPriceOverride(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              {editPriceOverride !== null && (
                <button
                  type="button"
                  onClick={() => setEditPriceOverride(null)}
                  className="text-xs text-accent-dark hover:underline mt-1"
                >
                  Palauta autohinta ({formatCents(editAutoPrice)})
                </button>
              )}
            </div>
            {/* Discount */}
            <div>
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 block">Alennus (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={editDiscountCents}
                onChange={(e) => setEditDiscountCents(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            {/* Postal code */}
            <div>
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 block">Postinumero</label>
              <input
                type="text"
                value={editPostalCode}
                onChange={(e) => setEditPostalCode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            {/* Address */}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 block">Osoite</label>
              <input
                type="text"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 block">Lisätiedot</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
              />
            </div>
            {/* Inside notes */}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 block">Sisäiset muistiinpanot asentajalle</label>
              <textarea
                value={editInsideNotes}
                onChange={(e) => setEditInsideNotes(e.target.value)}
                rows={3}
                placeholder="Näkyy vain asentajalle, ei asiakkaalle"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
              />
            </div>
          </div>

          {/* Line items (addon services, products, custom charges) */}
          <div className="mt-6 border-t border-border pt-5">
            <label className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3 block">Lisäpalvelut, tuotteet ja muut veloitukset</label>

            {/* Existing line items — the primary service is managed by the Palvelut
                grid above, so it's excluded here to avoid a duplicate (deletable) row. */}
            {lineItems && lineItems.some((i) => i.line_type !== "service") && (
              <div className="space-y-2 mb-4">
                {lineItems.filter((item) => item.line_type !== "service").map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-alt border border-border gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        {item.name}
                        {item.quantity > 1 && <span className="text-text-muted ml-1">× {item.quantity}</span>}
                      </p>
                      {item.line_type === "product" && (
                        <ProductComponentBreakdown
                          product={item.products}
                          components={componentProducts || new Map()}
                        />
                      )}
                      <p className="text-xs text-text-muted">
                        {formatCents(item.price_cents * item.quantity)}
                        {item.line_type === "addon_service" && <span className="text-purple-500 ml-1">[lisäpalvelu]</span>}
                        {item.line_type === "product" && <span className="text-amber-600 ml-1">[tuote]</span>}
                        {item.line_type === "custom" && <span className="text-blue-500 ml-1">[muu veloitus]</span>}
                        {item.line_type !== "custom" && item.commission_cents > 0 && <span className="text-green-600 ml-1">provisio {formatCents(item.commission_cents)}</span>}
                      </p>
                    </div>
                    {item.line_type === "custom" && (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] text-text-muted whitespace-nowrap">Ostohinta €</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={item.cost_cents ? (item.cost_cents / 100).toFixed(2).replace(".", ",") : ""}
                            placeholder="0,00"
                            onBlur={(e) => {
                              const val = Math.round(parseFloat(e.target.value.replace(",", ".") || "0") * 100);
                              if (val !== (item.cost_cents || 0)) {
                                updateLineItem.mutate({ id: item.id, booking_id: booking!.id, cost_cents: val });
                              }
                            }}
                            className="w-16 px-2 py-1 rounded-lg border border-border bg-white text-xs text-text-primary text-right focus:outline-none focus:ring-2 focus:ring-accent/40"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] text-text-muted whitespace-nowrap">Provisio €</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={item.commission_cents ? (item.commission_cents / 100).toFixed(2).replace(".", ",") : ""}
                            placeholder="0,00"
                            onBlur={(e) => {
                              const val = Math.round(parseFloat(e.target.value.replace(",", ".") || "0") * 100);
                              if (val !== (item.commission_cents || 0)) {
                                updateLineItem.mutate({ id: item.id, booking_id: booking!.id, commission_cents: val });
                              }
                            }}
                            className="w-16 px-2 py-1 rounded-lg border border-border bg-white text-xs text-text-primary text-right focus:outline-none focus:ring-2 focus:ring-accent/40"
                          />
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => deleteLineItem.mutate({ id: item.id, booking_id: booking!.id })}
                      className="p-1.5 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new line item */}
            <div className="space-y-3 p-4 rounded-xl bg-surface-alt border border-dashed border-border">
              <div className="flex gap-2">
                {(["addon_service", "product", "custom"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setLineItemType(t); setLineItemPickId(""); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      lineItemType === t
                        ? "bg-accent text-white"
                        : "bg-surface border border-border text-text-secondary hover:border-border-strong"
                    }`}
                  >
                    {t === "addon_service" ? "Lisäpalvelu" : t === "product" ? "Tuote" : "Muu veloitus"}
                  </button>
                ))}
              </div>

              {lineItemType === "addon_service" && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      value={lineItemPickId}
                      onChange={setLineItemPickId}
                      options={(allAddons || []).filter((a) => a.active).map((a) => ({ id: a.id, label: a.name, price: a.price_cents / 100 }))}
                      placeholder="Valitse lisäpalvelu…"
                      searchPlaceholder="Hae lisäpalvelua…"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!lineItemPickId || addLineItem.isPending}
                    onClick={() => {
                      const addon = allAddons?.find((a) => a.id === lineItemPickId);
                      if (!addon) return;
                      addLineItem.mutate({
                        booking_id: booking!.id,
                        line_type: "addon_service",
                        addon_service_id: addon.id,
                        name: addon.name,
                        price_cents: addon.price_cents,
                        duration_minutes: addon.duration_minutes || 0,
                        material_cost_cents: addon.material_cost_cents || 0,
                      });
                      setLineItemPickId("");
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-all disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> Lisää
                  </button>
                </div>
              )}

              {lineItemType === "product" && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      value={lineItemPickId}
                      onChange={setLineItemPickId}
                      options={(allProducts || []).filter((p) => p.active).map((p) => ({ id: p.id, label: p.name, price: p.price_cents / 100 }))}
                      placeholder="Valitse tuote…"
                      searchPlaceholder="Hae tuotetta…"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!lineItemPickId || addLineItem.isPending}
                    onClick={() => {
                      const product = allProducts?.find((p) => p.id === lineItemPickId);
                      if (!product) return;
                      addLineItem.mutate({
                        booking_id: booking!.id,
                        line_type: "product",
                        product_id: product.id,
                        name: product.name,
                        price_cents: product.price_cents,
                        cost_cents: product.cost_cents || 0,
                      });
                      setLineItemPickId("");
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-all disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> Lisää
                  </button>
                </div>
              )}

              {lineItemType === "custom" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Nimi / kuvaus"
                        value={lineItemCustomName}
                        onChange={(e) => setLineItemCustomName(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-text-muted mb-1 block">Hinta (€)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={lineItemCustomPrice}
                        onChange={(e) => setLineItemCustomPrice(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-text-muted mb-1 block">Kesto (min)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={lineItemCustomDuration}
                        onChange={(e) => setLineItemCustomDuration(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-text-muted mb-1 block">Materiaalikustannus (€)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={lineItemCustomMaterial}
                        onChange={(e) => setLineItemCustomMaterial(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-text-muted mb-1 block">Ostohinta (€)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={lineItemCustomPurchasePrice}
                        onChange={(e) => setLineItemCustomPurchasePrice(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-text-muted mb-1 block">Provisio (€)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={lineItemCustomCommission}
                        onChange={(e) => setLineItemCustomCommission(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!lineItemCustomName.trim() || !lineItemCustomPrice || addLineItem.isPending}
                    onClick={() => {
                      const priceCents = Math.round(parseFloat(lineItemCustomPrice.replace(",", ".") || "0") * 100);
                      const durationMin = parseInt(lineItemCustomDuration, 10) || 0;
                      const materialCents = Math.round(parseFloat(lineItemCustomMaterial.replace(",", ".") || "0") * 100);
                      const purchasePriceCents = Math.round(parseFloat(lineItemCustomPurchasePrice.replace(",", ".") || "0") * 100);
                      const commissionCents = Math.round(parseFloat(lineItemCustomCommission.replace(",", ".") || "0") * 100);
                      if (isNaN(priceCents)) return;
                      addLineItem.mutate({
                        booking_id: booking!.id,
                        line_type: "custom",
                        name: lineItemCustomName.trim(),
                        price_cents: priceCents,
                        duration_minutes: durationMin,
                        material_cost_cents: materialCents,
                        cost_cents: purchasePriceCents,
                        commission_cents: commissionCents,
                      });
                      setLineItemCustomName("");
                      setLineItemCustomPrice("");
                      setLineItemCustomDuration("");
                      setLineItemCustomMaterial("");
                      setLineItemCustomPurchasePrice("");
                      setLineItemCustomCommission("");
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-all disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> Lisää
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-5">
            <button
              onClick={() => setActivePanel(null)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all"
            >
              Peruuta
            </button>
            <button
              onClick={handleEditSave}
              disabled={updateBooking.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-all disabled:opacity-50"
            >
              {updateBooking.isPending ? (
                <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Tallenna
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Booking details */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-5">Varauksen tiedot</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Palvelut</p>
              {lineItems && lineItems.length > 0 ? (
                <div className="space-y-0.5">
                  {lineItems.map((item) => (
                    <div key={item.id}>
                      <p className={`text-${item.line_type === "service" ? "sm font-medium" : "xs"} text-text-${item.line_type === "service" ? "primary" : "muted"}`}>
                        {item.line_type !== "service" && "+ "}
                        {item.name}
                        {item.quantity > 1 && ` × ${item.quantity}`}
                        {" "}({formatCents(item.price_cents * item.quantity)})
                        {item.line_type === "addon_service" && <span className="text-purple-500 ml-1">[lisäpalvelu]</span>}
                        {item.line_type === "product" && <span className="text-amber-600 ml-1">[tuote]</span>}
                        {item.line_type === "custom" && <span className="text-blue-500 ml-1">[muu]</span>}
                      </p>
                      {item.line_type === "product" && (
                        <ProductComponentBreakdown
                          product={item.products}
                          components={componentProducts || new Map()}
                          className="ml-3"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-medium text-text-primary">
                  {booking.services?.name || (booking.plan && PLAN_LABELS[booking.plan]) || "–"}
                </p>
              )}
            </div>
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Hinta</p>
              <p className="font-bold text-text-primary text-lg">{formatCents(booking.price_cents)}</p>
              {booking.discount_amount_cents > 0 && (
                <p className="text-xs text-accent-dark mt-0.5">Alennus: -{formatCents(booking.discount_amount_cents)}{booking.discount_codes?.code && ` (${booking.discount_codes.code})`}</p>
              )}
              {(() => {
                const priceExVat = Math.round(booking.price_cents / 1.255);

                // Asiakkaan erittely: materiaalit = tuotteiden myyntihinta + palveluiden material_cost_cents
                const customerMaterials = lineItems ? lineItems.reduce((sum, li) => {
                  if (li.line_type === "product") return sum + li.price_cents * li.quantity;
                  return sum + (li.material_cost_cents || 0) * li.quantity;
                }, 0) : 0;
                const laborPortion = booking.price_cents - customerMaterials;

                // Sisäinen kate: laitteiden ostohinta tukusta + line item kulut
                const installerCommission = bookingTeam.reduce((sum: number, be: any) => sum + (be.commission_cents || 0), 0);
                const palkallinenInternalCost = (internalCosts || []).reduce((sum, c) => sum + (c.internal_cost_cents || 0), 0);
                // Myyjän provisio kuuluu varaukselle aina kun sille on kohdistettu myyjä:
                // joko liidin (opportunity → assigned_salesperson_id) tai suoran varauksen
                // (salesperson_id) kautta. EI riipu siitä onko tarjousta tehty — sama logiikka
                // kuin myyjävalitsimessa alempana ja get_seller_commissions_for_period-RPC:ssä.
                const creditedSellerId = booking.opportunity_id
                  ? (oppSeller?.assigned_salesperson_id || "")
                  : (booking.salesperson_id || "");
                const salesCommission = (creditedSellerId && booking.services?.sales_commission_cents ? booking.services.sales_commission_cents : 0) + (booking.discount_codes?.commission_cents || 0);
                // Laitekustannus: käytä snapshottia (bli.cost_cents tallennettu varauksen teossa)
                // ja fallbackaa live products.cost_cents:iin jos snapshotti on 0 (vanhat varaukset).
                // Näin historia säilyy vaikka tuote myöhemmin poistetaan tai sen cost_cents muuttuu.
                const productCost = lineItems ? lineItems.reduce((sum, li) => {
                  if (li.line_type !== "product") return sum;
                  const snapshot = li.cost_cents || 0;
                  const live = (li.products?.cost_cents ?? 0);
                  return sum + (snapshot > 0 ? snapshot : live) * li.quantity;
                }, 0) : 0;
                // Ostokulut: custom-rivien (muut veloitukset) tallennetut ostohinnat.
                // Product-rivit on jo laskettu productCost:iin, joten ne suljetaan pois tästä
                // ettei niitä lasketa kahdesti.
                const lineItemCosts = lineItems ? lineItems.reduce((sum, li) => {
                  if (li.line_type === "product") return sum;
                  return sum + (li.cost_cents || 0);
                }, 0) : 0;
                // Custom-rivien (muut veloitukset) provisiot on JO laskettu
                // installerCommission:iin: calculate_booking_commissions folmaa ne
                // booking_employees.commission_cents:iin ja jakaa tiimin kesken.
                // Ei vähennetä toista kertaa erillisenä rivinä (aiheutti tuplauksen).
                const margin = priceExVat - installerCommission - palkallinenInternalCost - salesCommission - productCost - lineItemCosts;
                const hasCommissions = installerCommission > 0 || palkallinenInternalCost > 0 || salesCommission > 0 || lineItemCosts > 0;

                if (!customerMaterials && !hasCommissions && !productCost) return null;

                return (
                  <div className="mt-3 space-y-3">
                    {/* Asiakkaan erittely */}
                    <div className="space-y-1 text-xs">
                      <p className="text-text-muted">ALV 0%: <span className="font-medium text-text-secondary">{formatCents(priceExVat)}</span></p>
                      {customerMaterials > 0 && (
                        <>
                          <p className="text-text-muted">Työn osuus: <span className="font-medium text-text-secondary">{formatCents(laborPortion)}</span></p>
                          <p className="text-text-muted">Materiaalit: <span className="font-medium text-text-secondary">{formatCents(customerMaterials)}</span></p>
                        </>
                      )}
                    </div>
                    {/* Sisäinen katelaskenta */}
                    <div className="border-t border-border pt-2 space-y-1 text-xs">
                      {productCost > 0 && <p className="text-text-muted">Laitekustannus: <span className="font-medium text-text-secondary">-{formatCents(productCost)}</span></p>}
                      {lineItemCosts > 0 && <p className="text-text-muted">Ostokulut: <span className="font-medium text-text-secondary">-{formatCents(lineItemCosts)}</span></p>}
                      {installerCommission > 0 && <p className="text-purple-600">Asentajan provisio: <span className="font-medium">-{formatCents(installerCommission)}</span></p>}
                      {palkallinenInternalCost > 0 && <p className="text-purple-600">Sisäinen kulu (palkallinen): <span className="font-medium">-{formatCents(palkallinenInternalCost)}</span></p>}
                      {salesCommission > 0 && <p className="text-purple-600">Myyjän provisio: <span className="font-medium">-{formatCents(salesCommission)}</span></p>}
                      <p className="text-emerald-600 font-semibold">Kate: {formatCents(margin)}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Päivämäärä</p>
              <p className="font-medium text-text-primary">{formatDate(booking.booking_date)}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Kellonaika</p>
              <p className="font-medium text-text-primary">
                {booking.time_slot?.slice(0, 5)}
                {" – "}
                {(() => {
                  const [h, m] = (booking.time_slot || "08:00").split(":").map(Number);
                  const dur = booking.duration_minutes || booking.services?.duration_minutes || 60;
                  const endTotal = h * 60 + m + dur;
                  return `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
                })()}
              </p>
            </div>
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">
                {bookingTeam.length > 1 ? "Tiimi" : "Asentaja"}
              </p>
              {bookingTeam.length > 0 ? (
                <div className="space-y-1">
                  {bookingTeam.map((be: any) => (
                    <div key={be.id} className="flex items-center gap-2">
                      <p className="font-medium text-text-primary">
                        {be.employees ? `${be.employees.first_name} ${be.employees.last_name}` : "–"}
                      </p>
                      <Badge className={be.role === "primary" ? "bg-accent-muted text-accent-dark border border-accent/30 text-[10px]" : "bg-surface-hover text-text-muted border border-border text-[10px]"}>
                        {be.role === "primary" ? "Pääasentaja" : "2. asentaja"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-medium text-text-primary">
                  {booking.employees ? `${booking.employees.first_name} ${booking.employees.last_name}` : "–"}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Osoite</p>
              <p className="font-medium text-text-primary">
                {formatAddress(booking.address, booking.postal_code)}
              </p>
            </div>
            {booking.lead_source && (
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Lähde</p>
                <p className="font-medium text-text-primary">{booking.lead_source}</p>
              </div>
            )}
            {(booking.utm_source || booking.referrer) && (
              <div className="sm:col-span-2 border-t border-border pt-4 mt-2">
                <p className="text-text-muted text-xs uppercase tracking-wide mb-2">Varauksen lähde</p>
                {/* ── Selkokielinen yhteenveto ── */}
                <div className="mb-3">
                  <p className="font-semibold text-text-primary text-sm">
                    {(() => {
                      // Platform name based on UTM params
                      const platform = booking.utm_source === "google" && booking.utm_medium === "cpc" ? "Google Ads"
                        : booking.utm_source === "fb" || booking.utm_source === "facebook" || booking.utm_source === "ig" || booking.utm_source === "instagram" ? "Meta (Facebook/Instagram)"
                        : booking.utm_source === "google" ? "Google (orgaaninen)"
                        : booking.utm_source ? booking.utm_source.charAt(0).toUpperCase() + booking.utm_source.slice(1)
                        : booking.referrer ? "Viittaus ulkoiselta sivulta"
                        : "Tuntematon";
                      // Campaign name: prefer matched name from marketing_campaigns, fallback to utm_campaign prettified
                      const campaignName = matchedCampaign?.name
                        || (booking.utm_campaign && !/^\d+$/.test(booking.utm_campaign)
                          ? booking.utm_campaign.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                          : null);
                      const campaign = campaignName ? ` \u2013 ${campaignName}` : "";
                      return `${platform}${campaign}`;
                    })()}
                  </p>
                  {booking.utm_content && (
                    <p className="text-text-secondary text-xs mt-0.5">
                      Mainos: {booking.utm_content.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                  )}
                  {booking.utm_term && (
                    <p className="text-text-secondary text-xs mt-0.5">
                      Hakusana: {booking.utm_term}
                    </p>
                  )}
                </div>
                {/* ── Yksityiskohdat ── */}
                <details className="text-xs">
                  <summary className="text-text-muted cursor-pointer hover:text-text-secondary select-none">Tekniset tiedot</summary>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-2">
                  {booking.utm_source && (
                    <div><span className="text-text-muted">utm_source: </span><span className="font-medium text-text-primary">{booking.utm_source}</span></div>
                  )}
                  {booking.utm_medium && (
                    <div><span className="text-text-muted">utm_medium: </span><span className="font-medium text-text-primary">{booking.utm_medium}</span></div>
                  )}
                  {booking.utm_campaign && (
                    <div className="sm:col-span-2"><span className="text-text-muted">utm_campaign: </span><span className="font-medium text-text-primary break-all">{booking.utm_campaign}</span></div>
                  )}
                  {booking.utm_content && (
                    <div className="sm:col-span-2"><span className="text-text-muted">utm_content: </span><span className="font-medium text-text-primary break-all">{booking.utm_content}</span></div>
                  )}
                  {booking.utm_term && (
                    <div className="sm:col-span-2"><span className="text-text-muted">utm_term: </span><span className="font-medium text-text-primary break-all">{booking.utm_term}</span></div>
                  )}
                  {booking.referrer && (
                    <div className="sm:col-span-2"><span className="text-text-muted">Viittaava sivu: </span><span className="font-medium text-text-primary break-all">{booking.referrer}</span></div>
                  )}
                  {booking.landing_page && (
                    <div className="sm:col-span-2"><span className="text-text-muted">Saapumissivu: </span><span className="font-medium text-text-primary break-all">{booking.landing_page}</span></div>
                  )}
                  {booking.page_url && (
                    <div className="sm:col-span-2">
                      <span className="text-text-muted">Varaussivu: </span>
                      <a href={booking.page_url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline break-all">{booking.page_url}</a>
                    </div>
                  )}
                  </div>
                </details>
              </div>
            )}
            {booking.finalized_at && (
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Viimeistelty</p>
                <p className="font-medium text-text-primary">{formatDateTime(booking.finalized_at)}</p>
              </div>
            )}
          </div>
          {booking.notes && (
            <div className="text-sm border-t border-border mt-5 pt-5">
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Lisätiedot</p>
              <p className="text-text-primary">{booking.notes}</p>
            </div>
          )}
          {booking.inside_notes && (
            <div className="text-sm border-t border-border mt-5 pt-5">
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Sisäiset muistiinpanot asentajalle</p>
              <p className="text-text-primary whitespace-pre-wrap">{booking.inside_notes}</p>
            </div>
          )}
        </div>

        {/* Satisfaction & Review */}
        {booking.status === "completed" && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-5">Tyytyväisyys ja arvostelu</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              {/* Installer satisfaction */}
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Asentajan arvio</p>
                <p className="font-medium text-text-primary">
                  {booking.installer_satisfaction === "happy" ? "🤩 Erinomainen"
                    : booking.installer_satisfaction === "neutral" ? "😐 Ok"
                    : booking.installer_satisfaction === "unhappy" ? "😞 Huono"
                    : "–"}
                </p>
              </div>

              {/* Customer review */}
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Asiakkaan arvostelu</p>
                {feedback ? (
                  <div>
                    <p className="font-medium text-text-primary">
                      {feedback.rating === "happy" ? "🤩 Erinomainen"
                        : feedback.rating === "neutral" ? "😐 Ok"
                        : feedback.rating === "unhappy" ? "😞 Huono"
                        : feedback.rating}
                    </p>
                    {feedback.comment && (
                      <p className="text-xs text-text-muted mt-1 italic">"{feedback.comment}"</p>
                    )}
                  </div>
                ) : (
                  <p className="text-text-muted">Ei arvostelua</p>
                )}
              </div>

              {/* Review SMS status */}
              <div className="sm:col-span-2">
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Arvostelupyyntö (SMS)</p>
                {reviewSms ? (
                  <p className="font-medium text-text-primary">
                    {reviewSms.status === "sent" ? (
                      <span className="text-emerald-600">✓ Lähetetty {formatDateTime(reviewSms.scheduled_at || reviewSms.created_at)}</span>
                    ) : reviewSms.status === "attempted" ? (
                      <span className="text-emerald-600">✓ Lähetetty {formatDateTime(reviewSms.scheduled_at || reviewSms.created_at)}</span>
                    ) : reviewSms.status === "pending" ? (
                      (() => {
                        const { text, delayed } = describeReviewSmsSendTime(reviewSms.scheduled_at || "");
                        return (
                          <span className="text-amber-600">
                            ⏱ Lähtee {text}
                            {delayed && (
                              <span className="ml-1 text-xs text-text-muted">(hiljaiset ajat: ma–pe 09–20)</span>
                            )}
                          </span>
                        );
                      })()
                    ) : reviewSms.status === "sending" ? (
                      <span className="text-amber-600">⏱ Lähetetään...</span>
                    ) : reviewSms.status === "cancelled" ? (
                      <span className="text-text-muted">Peruutettu</span>
                    ) : reviewSms.status === "failed" ? (
                      <span className="text-red-600">Lähetys epäonnistui</span>
                    ) : (
                      <span className="text-text-muted">{reviewSms.status}</span>
                    )}
                  </p>
                ) : booking.customer_satisfaction === "happy" ? (
                  <p className="text-text-muted">Ei lähetetty</p>
                ) : (
                  <p className="text-text-muted">–</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Customer info */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-text-primary">Asiakkaan tiedot</h2>
            <div className="flex items-center gap-3">
              {booking.customers && !editingCustomer && (
                <button
                  onClick={() => {
                    const c = booking.customers!;
                    setCustomerEditForm({
                      first_name: c.first_name || "",
                      last_name: c.last_name || "",
                      email: c.email || "",
                      phone: c.phone || "",
                      address: c.address || "",
                      postal_code: c.postal_code || "",
                      company_name: c.company_name || "",
                      business_id: c.business_id || "",
                    });
                    setEditingCustomer(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Muokkaa
                </button>
              )}
              {booking.customer_id && (
                <Link to={`/asiakkaat/${booking.customer_id}`} className="text-sm text-accent-dark hover:text-accent font-medium">
                  Näytä profiili →
                </Link>
              )}
            </div>
          </div>

          {!editingCustomer ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Nimi</p>
                <p className="font-medium text-text-primary">{booking.customers?.first_name} {booking.customers?.last_name}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Sähköposti</p>
                <p className="font-medium text-text-primary">{booking.customers?.email}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Puhelin</p>
                <p className="font-medium text-text-primary">{booking.customers?.phone || "-"}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Postinumero</p>
                <p className="font-medium text-text-primary">
                  {booking.customers?.postal_code
                    ? `${booking.customers.postal_code} ${postalCity(booking.customers.postal_code)}`
                    : "-"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Osoite</p>
                <p className="font-medium text-text-primary">{booking.customers?.address || "-"}</p>
              </div>
              {(booking.customers?.company_name || booking.customers?.business_id) && (
                <>
                  <div>
                    <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Yritys</p>
                    <p className="font-medium text-text-primary">{booking.customers?.company_name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Y-tunnus</p>
                    <p className="font-medium text-text-primary">{booking.customers?.business_id || "-"}</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await updateCustomer.mutateAsync({
                    id: booking.customer_id,
                    first_name: customerEditForm.first_name.trim(),
                    last_name: customerEditForm.last_name.trim(),
                    email: customerEditForm.email.trim(),
                    phone: customerEditForm.phone.trim() || null,
                    address: customerEditForm.address.trim() || null,
                    postal_code: customerEditForm.postal_code.trim() || null,
                    company_name: customerEditForm.company_name.trim() || null,
                    business_id: customerEditForm.business_id.trim() || null,
                  });
                  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.byNumber(booking.booking_number) });
                  setEditingCustomer(false);
                } catch (err: any) {
                  alert(`Tallennus epäonnistui: ${err?.message || "Tuntematon virhe"}`);
                }
              }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm"
            >
              <div>
                <label className="block text-text-muted text-xs uppercase tracking-wide mb-1">Etunimi</label>
                <input
                  type="text"
                  required
                  value={customerEditForm.first_name}
                  onChange={(e) => setCustomerEditForm((f) => ({ ...f, first_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs uppercase tracking-wide mb-1">Sukunimi</label>
                <input
                  type="text"
                  required
                  value={customerEditForm.last_name}
                  onChange={(e) => setCustomerEditForm((f) => ({ ...f, last_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs uppercase tracking-wide mb-1">Sähköposti</label>
                <input
                  type="email"
                  required
                  value={customerEditForm.email}
                  onChange={(e) => setCustomerEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs uppercase tracking-wide mb-1">Puhelin</label>
                <input
                  type="tel"
                  value={customerEditForm.phone}
                  onChange={(e) => setCustomerEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-text-muted text-xs uppercase tracking-wide mb-1">Osoite</label>
                <input
                  type="text"
                  value={customerEditForm.address}
                  onChange={(e) => setCustomerEditForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="w-40">
                <label className="block text-text-muted text-xs uppercase tracking-wide mb-1">Postinumero</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={customerEditForm.postal_code}
                  onChange={(e) => setCustomerEditForm((f) => ({ ...f, postal_code: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs uppercase tracking-wide mb-1">Yritys</label>
                <input
                  type="text"
                  value={customerEditForm.company_name}
                  onChange={(e) => setCustomerEditForm((f) => ({ ...f, company_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs uppercase tracking-wide mb-1">Y-tunnus</label>
                <input
                  type="text"
                  value={customerEditForm.business_id}
                  onChange={(e) => setCustomerEditForm((f) => ({ ...f, business_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="sm:col-span-2 flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={updateCustomer.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {updateCustomer.isPending ? "Tallennetaan..." : "Tallenna"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCustomer(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary border border-border rounded-lg hover:bg-surface-hover transition-colors"
                >
                  Peruuta
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Inventory units assigned to this booking */}
        {lineItems && lineItems.some((li) => li.line_type === "product") && (
          <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-text-muted" />
              <h2 className="font-semibold text-text-primary">Varastoyksiköt</h2>
            </div>
            <BookingInventoryAssignment
              bookingId={booking.id}
              bookingEmployeeId={booking.employee_id ?? null}
              scheduledAt={booking.booking_date ?? null}
              lineItems={lineItems.map((li) => ({
                id: li.id,
                product_id: li.product_id,
                name: li.name,
                quantity: li.quantity,
                line_type: li.line_type,
              }))}
            />
          </div>
        )}

        {/* Admin notes */}
        <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-text-muted" />
            <h2 className="font-semibold text-text-primary">Sisäiset muistiinpanot</h2>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const text = noteText.trim();
              if (!text) return;
              await addNote.mutateAsync({ bookingId: booking.id, content: text });
              setNoteText("");
            }}
            className="flex gap-2 mb-4"
          >
            <input
              type="text"
              placeholder="Lisää muistiinpano..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <button
              type="submit"
              disabled={!noteText.trim() || addNote.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-all disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Lisää
            </button>
          </form>
          {bookingNotes && bookingNotes.length > 0 ? (
            <div className="space-y-2">
              {bookingNotes.map((note) => (
                <div key={note.id} className="bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5 group">
                  {editingNoteId === note.id ? (
                    <div className="flex gap-1.5">
                      <input
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editingNoteText.trim()) {
                            updateNote.mutate({ id: note.id, content: editingNoteText.trim() });
                            setEditingNoteId(null);
                          }
                          if (e.key === "Escape") setEditingNoteId(null);
                        }}
                        className="flex-1 px-2 py-1 border border-accent/40 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                        autoFocus
                      />
                      <button onClick={() => { if (editingNoteText.trim()) { updateNote.mutate({ id: note.id, content: editingNoteText.trim() }); setEditingNoteId(null); } }} className="p-1 text-accent hover:text-accent-dark"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingNoteId(null)} className="p-1 text-text-muted hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-text-primary">{note.content}</p>
                        <p className="text-xs text-text-muted mt-1">{formatDateTime(note.created_at)}</p>
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                        <button
                          onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.content); }}
                          className="p-1 text-text-muted hover:text-accent transition-colors"
                          title="Muokkaa"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteNote.mutate(note.id)}
                          className="p-1 text-text-muted hover:text-red-500 transition-colors"
                          title="Poista"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Ei muistiinpanoja</p>
          )}
        </div>

        {/* Documents (protocol PDFs) */}
        {protocols.some((p) => p.status === "completed" && p.pdf_storage_path) && (
          <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
            <h2 className="font-semibold text-text-primary mb-4">Tiedostot</h2>
            <div className="space-y-2">
              {protocols
                .filter((p) => p.status === "completed" && p.pdf_storage_path)
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 border border-border rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-accent-muted">
                        <FileText className="w-4 h-4 text-accent-dark" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">Pöytäkirja {p.sequence_number} — #{booking.booking_number}</p>
                        <p className="text-xs text-text-muted">{p.completed_at ? formatDateTime(p.completed_at) : ""}</p>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const { data } = supabase.storage
                          .from("protocol-files")
                          .getPublicUrl(p.pdf_storage_path!);
                        window.open(data.publicUrl, "_blank");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Lataa
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Photos & files */}
        <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
          <h2 className="font-semibold text-text-primary mb-4">Kuvat ja tiedostot</h2>
          <BookingFileUpload siteId={booking.site_id} bookingId={booking.id} />
        </div>

        {/* Salesperson editor (also shown for direct bookings without opportunity) */}
        {(() => {
          const hasOpp = !!booking.opportunity_id;
          const currentSellerId = hasOpp
            ? oppSeller?.assigned_salesperson_id || ""
            : booking.salesperson_id || "";
          const sellerOptions = (allSellers || []).filter((s) => s.active !== false);
          const fallbackEmployee = currentSellerId && !sellerOptions.find((s) => s.id === currentSellerId)
            ? (allEmployees || []).find((e) => e.id === currentSellerId)
            : null;
          const isPending = updateOpp.isPending || updateBooking.isPending;
          const handleChange = async (value: string) => {
            const newId = value || null;
            if (hasOpp) {
              await updateOpp.mutateAsync({
                id: booking.opportunity_id!,
                assigned_salesperson_id: newId,
              });
              queryClient.invalidateQueries({ queryKey: ["booking-opp-seller", booking.opportunity_id] });
            } else {
              await updateBooking.mutateAsync({
                id: booking.id,
                salesperson_id: newId,
              });
            }
          };

          return (
            <div className="bg-surface rounded-2xl border border-border p-4 lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                    Myyjä (saa myyntiprovision)
                  </span>
                  <select
                    value={currentSellerId}
                    disabled={isPending || (hasOpp && !oppSeller)}
                    onChange={(e) => handleChange(e.target.value)}
                    className="mt-1 px-3 py-1.5 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                  >
                    <option value="">– Ei myyjää –</option>
                    {sellerOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                      </option>
                    ))}
                    {fallbackEmployee && (
                      <option key={fallbackEmployee.id} value={fallbackEmployee.id}>
                        {fallbackEmployee.first_name} {fallbackEmployee.last_name} (ei seller-roolia)
                      </option>
                    )}
                  </select>
                  <p className="text-[10px] text-text-muted mt-1">
                    {hasOpp
                      ? "Vaihto päivittää koko liidin vastuumyyjää — provisio menee uudelle henkilölle."
                      : "Suoraan kirjattu varaus — myyjä saa palvelun ja lisäpalveluiden myyntiprovision."}
                  </p>
                </div>
                {hasOpp && (
                  <Link
                    to={`/myynti/inbound/${booking.opportunity_id}`}
                    className="text-sm text-accent-dark hover:text-accent font-medium whitespace-nowrap"
                  >
                    Näytä liidi →
                  </Link>
                )}
              </div>
            </div>
          );
        })()}

        {/* Product logistics */}
        {productOrders.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
            <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-accent" />
              Tuotetilaukset
            </h2>
            <div className="space-y-3">
              {productOrders.map((po) => (
                <div key={po.id} className="flex items-center gap-4 py-2 border-b border-border last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-primary">{po.products?.name ?? "Tuote"}</span>
                    <span className="block text-xs text-text-tertiary">{po.products?.brand} — {po.quantity} kpl</span>
                  </div>
                  <ProductOrderSourceBadge source={po.source} />
                  <ProductOrderStatusBadge status={po.status} />
                  <div className="hidden sm:block">
                    <BookingProductOrderTimeline order={po} />
                  </div>
                  {po.status === "pending" && !po.source && (
                    <button
                      onClick={() => setSourceDialogBPO(po)}
                      className="text-xs text-accent font-medium hover:underline shrink-0"
                    >
                      Valitse lähde
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legacy device orders (manufacturer email tracking) */}
        {deviceOrders.length > 0 && productOrders.length === 0 && (
          <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
            <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
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

        {sourceDialogBPO && (
          <SourceAssignmentDialog order={sourceDialogBPO} onClose={() => setSourceDialogBPO(null)} />
        )}

        {/* Opportunity photos */}
        {(() => {
          const oppImages = oppFiles.filter((f) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));
          if (oppImages.length === 0) return null;
          return (
            <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
              <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
                <Camera className="w-4 h-4 text-accent" />
                Myyntikuvat
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {oppImages.map((file) => {
                  const url = oppFileUrls[file.id];
                  return (
                    <button key={file.id} onClick={() => url && setLightboxUrl(url)} className="aspect-square rounded-xl overflow-hidden border border-border hover:ring-2 hover:ring-accent/30 transition-all">
                      <img src={url || ""} alt={file.filename} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Opportunity documents (offer PDF, install plan) */}
        {(() => {
          const oppDocs = oppFiles.filter((f) => !/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));
          if (oppDocs.length === 0) return null;
          return (
            <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
              <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-accent" />
                Myyntitiedostot
              </h2>
              <div className="space-y-2">
                {oppDocs.map((file) => {
                  const url = oppFileUrls[file.id];
                  return (
                    <div key={file.id} className="flex items-center justify-between p-3 border border-border rounded-xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="text-sm text-text-primary truncate">{file.filename}</span>
                        {file.file_type === "installation_plan_pdf" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 shrink-0">asennussuunnitelma</span>}
                      </div>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors shrink-0">
                          <Download className="w-3.5 h-3.5" /> Avaa
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Lightbox */}
        {lightboxUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightboxUrl(null)}>
            <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
          </div>
        )}

        {/* Thread dialog */}
        {threadDialog && (
          <OrderThreadDialog threadId={threadDialog.threadId} brand={threadDialog.brand} onClose={() => setThreadDialog(null)} />
        )}

        {/* Timeline (status changes + edits) */}
        <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
          <h2 className="font-semibold text-text-primary mb-5">Historia</h2>
          {timeline.length > 0 ? (
            <div className="space-y-3">
              {timeline.map((entry) => (
                <div key={entry.id} className="flex flex-col sm:flex-row items-start gap-1 sm:gap-3 text-sm">
                  <span className="text-text-muted text-xs sm:w-36 shrink-0 pt-0.5">
                    {formatDateTime(entry.created_at)}
                  </span>
                  {entry.type === "status" ? (
                    <span className="inline-flex items-center gap-2">
                      {entry.old_status && (
                        <>
                          <Badge className={STATUS_COLORS[entry.old_status]}>
                            {STATUS_LABELS[entry.old_status]}
                          </Badge>
                          <span className="text-text-muted">→</span>
                        </>
                      )}
                      <Badge className={STATUS_COLORS[entry.new_status]}>
                        {STATUS_LABELS[entry.new_status]}
                      </Badge>
                      {entry.note && <span className="text-text-muted">{entry.note}</span>}
                    </span>
                  ) : (
                    <span className="text-text-secondary">
                      <span className="font-medium">{FIELD_LABELS[entry.field_name] || entry.field_name}</span>
                      {": "}
                      <span className="text-text-muted">{formatAuditValue(entry.field_name, entry.old_value)}</span>
                      <span className="text-text-muted mx-1">→</span>
                      <span className="font-medium">{formatAuditValue(entry.field_name, entry.new_value)}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Ei historiaa</p>
          )}
        </div>
      </div>
    </div>
  );
}
