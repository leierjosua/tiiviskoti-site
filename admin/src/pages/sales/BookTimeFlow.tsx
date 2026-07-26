import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarPlus, Package } from "lucide-react";
import { StepIndicator, ServiceSelectionStep, type ExtraItemForm } from "@/components/booking-wizard";
import { useServices, useServiceAreas } from "@/hooks/useServices";
import { useEmployees, useInstallerCalendars } from "@/hooks/useEmployees";
import { useAddonServices, useAddonsByService } from "@/hooks/useAddonServices";
import { useProducts } from "@/hooks/useProducts";
import { useServiceVariants } from "@/hooks/useServiceVariants";
import { useSalesOpportunity } from "@/hooks/sales/useSalesOpportunities";
import { formatCents, getUnitPriceCents } from "@/lib/utils";
import type { ExtraItem } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { CalendarStep } from "@/components/CalendarStep";
import { inputCls } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";

const labelCls = "block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2";

const LEAD_SOURCES = [
  { value: "website", label: "Nettisivu" },
  { value: "contact_form", label: "Yhteydenottolomake" },
  { value: "phone", label: "Puhelin" },
  { value: "email", label: "Sähköposti" },
  { value: "sales_pipeline", label: "Myyntiputki" },
  { value: "other", label: "Muu" },
];

type FlowPath = "kartoitus" | "muu";

export default function BookTimeFlow() {
  const navigate = useNavigate();
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const toast = useToast();

  // ─── Data hooks ────────────────────────────────────────────────────────────
  const { data: opportunity, isLoading: oppLoading } = useSalesOpportunity(opportunityId);
  const { data: allServices } = useServices();
  const { data: allEmployees } = useEmployees("installer");
  const { data: allAreas } = useServiceAreas();
  const { data: _allCalendars } = useInstallerCalendars();
  const { data: allAddons } = useAddonServices();
  const { data: allProducts } = useProducts();

  // ─── Flow state ────────────────────────────────────────────────────────────
  const [flowPath, setFlowPath] = useState<FlowPath | null>(null);
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Customer form (shared by both paths) ─────────────────────────────────
  const [customerForm, setCustomerForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    postalCode: "",
    address: "",
    city: "",
  });

  // Prefill customer form from opportunity
  useEffect(() => {
    if (!opportunity) return;
    const nameParts = (opportunity.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    setCustomerForm({
      firstName,
      lastName,
      email: opportunity.email || "",
      phone: opportunity.phone || "",
      postalCode: opportunity.postcode || "",
      address: opportunity.address || "",
      city: opportunity.city || "",
    });
  }, [opportunity]);

  // ─── Service selection (Path B: muu) ──────────────────────────────────────
  const [serviceQty, setServiceQty] = useState<Record<string, number>>({});
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});
  const [productSearch, setProductSearch] = useState("");
  const [showAllAddons, setShowAllAddons] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [extraItems, setExtraItems] = useState<ExtraItemForm[]>([]);

  // ─── Calendar state (shared) ──────────────────────────────────────────────
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // ─── Summary state (Path B) ───────────────────────────────────────────────
  const [notes, setNotes] = useState("");
  const [leadSource, setLeadSource] = useState("sales_pipeline");
  const [discountCode, setDiscountCode] = useState("");
  const [discountValid, setDiscountValid] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [discountInfo, setDiscountInfo] = useState<{ id: string; type: string; value: number } | null>(null);
  const [manualDiscountCents, setManualDiscountCents] = useState("");
  const [submitError, setSubmitError] = useState("");

  // ─── Derived: service variants & addons ───────────────────────────────────
  const selectedServiceIds = Object.keys(serviceQty).filter((id) => serviceQty[id] > 0);
  const primaryServiceIdForAddons = selectedServiceIds[0] || undefined;
  const { data: linkedAddons } = useAddonsByService(primaryServiceIdForAddons);
  const { data: serviceVariants } = useServiceVariants(primaryServiceIdForAddons);
  const selectedVariant = (serviceVariants || []).find((v) => v.id === selectedVariantId) ?? null;

  // ─── Kartoitus service (Path A) ──────────────────────────────────────────
  const kartoitusService = useMemo(() => {
    if (!allServices) return null;
    const match = allServices.find(
      (s) => s.active && (s.name.toLowerCase().includes("kartoitus"))
    );
    return match || allServices.find((s) => s.active) || null;
  }, [allServices]);

  const kartoitusServiceIds = kartoitusService ? [kartoitusService.id] : [];
  const kartoitusDuration = kartoitusService
    ? kartoitusService.duration_minutes + (kartoitusService.transition_minutes || 0)
    : 60;

  // ─── Price calculations (Path B) ──────────────────────────────────────────
  const selectedServices = (allServices || []).filter((s) => selectedServiceIds.includes(s.id));
  const parsedExtras: ExtraItem[] = extraItems
    .filter((e) => e.name && e.price)
    .map((e) => ({
      name: e.name,
      price_cents: Math.round(parseFloat(e.price || "0") * 100),
      duration_minutes: parseInt(e.duration || "0") || 0,
      material_cost_cents: Math.round(parseFloat(e.materialCost || "0") * 100),
    }));

  const selectedAddonList = (allAddons || []).filter((a) => (selectedAddons[a.id] || 0) > 0);
  const addonsTotalCents = selectedAddonList.reduce((sum, a) => sum + a.price_cents * (selectedAddons[a.id] || 1), 0);

  const selectedProductList = (allProducts || []).filter((p) => (selectedProducts[p.id] || 0) > 0);
  const productsTotalCents = selectedProductList.reduce((sum, p) => sum + p.price_cents * (selectedProducts[p.id] || 1), 0);

  const serviceTotalCents = selectedVariant
    ? selectedVariant.price_cents * (serviceQty[selectedServices[0]?.id] || 1)
    : selectedServices.reduce((sum, s) => {
        const qty = serviceQty[s.id] || 1;
        return sum + getUnitPriceCents(s, qty) * qty;
      }, 0);
  const extrasTotalCents = parsedExtras.reduce((sum, e) => sum + e.price_cents, 0);
  const subtotalCents = serviceTotalCents + addonsTotalCents + productsTotalCents + extrasTotalCents;

  let discountAmountCents = 0;
  if (discountValid && discountInfo) {
    if (discountInfo.type === "eur") {
      discountAmountCents = Math.min(discountInfo.value, subtotalCents);
    } else {
      discountAmountCents = Math.round((subtotalCents * discountInfo.value) / 100);
    }
  }
  if (manualDiscountCents) {
    discountAmountCents += Math.round(parseFloat(manualDiscountCents) * 100);
  }
  const finalPriceCents = Math.max(0, subtotalCents - discountAmountCents);

  // Duration without transition (for storing on booking, display)
  const totalDuration =
    (selectedVariant
      ? selectedVariant.duration_minutes * (serviceQty[selectedServices[0]?.id] || 1)
      : selectedServices.reduce((sum, s) => {
          const qty = serviceQty[s.id] || 1;
          const extra = (s as any).extra_duration_per_unit_minutes;
          return sum + (extra != null ? s.duration_minutes + Math.max(0, qty - 1) * extra : s.duration_minutes * qty);
        }, 0)) +
    selectedAddonList.reduce((sum, a) => sum + a.duration_minutes * (selectedAddons[a.id] || 1), 0) +
    parsedExtras.reduce((sum, e) => sum + e.duration_minutes, 0);
  // Duration with transition (for calendar slot checking)
  const maxTransition = selectedServices.length > 0
    ? Math.max(...selectedServices.map((s) => s.transition_minutes || 0))
    : 0;
  const totalBlockedTime = totalDuration + maxTransition;
  // Single-unit footprint = calendar slot STEP (keeps multi-device bookings on the
  // single-wash grid 08:00, 10:00, 12:00). Mirrors /api/availability slotStep.
  const baseUnitDuration = selectedVariant
    ? selectedVariant.duration_minutes
    : (selectedServices[0]?.duration_minutes ?? totalDuration);
  const slotStep = baseUnitDuration + maxTransition;

  const totalMaterialCents =
    selectedServices.reduce((sum, s) => sum + s.material_cost_cents * (serviceQty[s.id] || 1), 0) +
    selectedAddonList.reduce((sum, a) => sum + a.material_cost_cents * (selectedAddons[a.id] || 1), 0) +
    productsTotalCents +
    parsedExtras.reduce((sum, e) => sum + e.material_cost_cents, 0);

  // ─── Step labels per path ─────────────────────────────────────────────────
  const stepLabels =
    flowPath === "kartoitus"
      ? ["Tyyppi", "Asiakas", "Kalenteri"]
      : ["Tyyppi", "Palvelut", "Kalenteri", "Asiakas", "Yhteenveto"];

  // ─── Validation ───────────────────────────────────────────────────────────
  const canProceedCustomer = !!(
    customerForm.firstName &&
    customerForm.lastName &&
    customerForm.email &&
    customerForm.phone &&
    customerForm.address
  );
  const canProceedServices = selectedServiceIds.length > 0 || parsedExtras.length > 0;
  const canProceedCalendar = !!(selectedDate && selectedTime && selectedEmployeeId);

  // ─── Discount validation ──────────────────────────────────────────────────
  async function validateDiscountCode() {
    if (!discountCode.trim()) return;
    setDiscountError("");
    const { data: dc } = await supabase
      .from("discount_codes")
      .select("id, discount_type, discount_value, max_uses, times_used, expires_at, active")
      .ilike("code", discountCode.trim().toLowerCase())
      .eq("active", true)
      .single();
    if (!dc) {
      setDiscountError("Koodi ei ole voimassa");
      setDiscountValid(false);
      return;
    }
    if (dc.max_uses != null && dc.times_used >= dc.max_uses) {
      setDiscountError("Koodi käytetty loppuun");
      setDiscountValid(false);
      return;
    }
    if (dc.expires_at && new Date(dc.expires_at) < new Date()) {
      setDiscountError("Koodi vanhentunut");
      setDiscountValid(false);
      return;
    }
    setDiscountInfo({ id: dc.id, type: dc.discount_type, value: dc.discount_value });
    setDiscountValid(true);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitError("");
    setIsSubmitting(true);
    try {
      const customerInput = {
        first_name: customerForm.firstName.trim(),
        last_name: customerForm.lastName.trim(),
        email: customerForm.email.trim().toLowerCase(),
        phone: customerForm.phone.trim(),
        postal_code: customerForm.postalCode.trim() || null,
        address: customerForm.address.trim() || null,
      };

      const isKartoitus = flowPath === "kartoitus";

      const bookingServiceId = isKartoitus
        ? kartoitusService?.id || null
        : selectedServiceIds[0] || null;

      // Build line items
      const lineItems: {
        line_type: string;
        addon_service_id?: string;
        product_id?: string;
        name: string;
        price_cents: number;
        quantity: number;
        duration_minutes: number;
        material_cost_cents: number;
      }[] = [];

      // Always add main service as a line item (single source of truth)
      if (isKartoitus && kartoitusService) {
        lineItems.push({
          line_type: "service",
          name: kartoitusService.name,
          price_cents: kartoitusService.base_price_cents,
          quantity: 1,
          duration_minutes: kartoitusService.duration_minutes,
          material_cost_cents: kartoitusService.material_cost_cents,
        });
      } else if (!isKartoitus) {
        // Add service line item
        if (selectedServices[0]) {
          const primary = selectedServices[0];
          const qty = serviceQty[primary.id] || 1;
          const unitPrice = selectedVariant ? selectedVariant.price_cents : getUnitPriceCents(primary, qty);
          lineItems.unshift({
            line_type: "service",
            name: selectedVariant ? `${primary.name} — ${selectedVariant.label}` : primary.name,
            price_cents: unitPrice,
            quantity: qty,
            duration_minutes: selectedVariant ? selectedVariant.duration_minutes : primary.duration_minutes,
            material_cost_cents: primary.material_cost_cents,
          });
        }
        // Add addons, products, extras
        for (const addon of selectedAddonList) {
          lineItems.push({
            line_type: "addon_service",
            addon_service_id: addon.id,
            name: addon.name,
            price_cents: addon.price_cents,
            quantity: selectedAddons[addon.id] || 1,
            duration_minutes: addon.duration_minutes,
            material_cost_cents: addon.material_cost_cents,
          });
        }
        for (const prod of selectedProductList) {
          lineItems.push({
            line_type: "product",
            product_id: prod.id,
            name: prod.name,
            price_cents: prod.price_cents,
            quantity: selectedProducts[prod.id] || 1,
            duration_minutes: 0,
            material_cost_cents: prod.price_cents,
          });
        }
        for (const extra of parsedExtras) {
          lineItems.push({
            line_type: "custom",
            name: extra.name,
            price_cents: extra.price_cents,
            quantity: 1,
            duration_minutes: extra.duration_minutes,
            material_cost_cents: extra.material_cost_cents,
          });
        }
      }

      const { error } = await supabase.functions.invoke("create-admin-booking", {
        body: {
          customer: customerInput,
          booking: {
            service_id: bookingServiceId,
            variant_id: isKartoitus ? null : selectedVariantId || null,
            employee_id: selectedEmployeeId,
            calendar_id: selectedCalendarId,
            price_cents: 0, // trigger recalculates from line items
            device_count: (() => {
              if (isKartoitus) return 1;
              const primary = selectedServices[0];
              return primary ? (serviceQty[primary.id] || 1) : 1;
            })(),
            unit_price_cents: (() => {
              if (isKartoitus) return kartoitusService?.base_price_cents || undefined;
              const primary = selectedServices[0];
              if (!primary) return undefined;
              return selectedVariant
                ? selectedVariant.price_cents
                : getUnitPriceCents(primary, serviceQty[primary.id] || 1);
            })(),
            service_label: (() => {
              if (isKartoitus) return kartoitusService?.name || undefined;
              const primary = selectedServices[0];
              if (!primary) return undefined;
              const base = selectedVariant ? `${primary.name} — ${selectedVariant.label}` : primary.name;
              const qty = serviceQty[primary.id] || 1;
              return qty > 1 ? `${base} × ${qty}` : base;
            })(),
            duration_minutes: isKartoitus ? kartoitusDuration : (totalDuration || undefined),
            booking_date: selectedDate!,
            time_slot: selectedTime!,
            postal_code: customerForm.postalCode || null,
            address: customerForm.address || null,
            notes: notes.trim() || null,
            discount_code_id: !isKartoitus && discountValid ? discountInfo!.id : null,
            discount_amount_cents: isKartoitus ? 0 : discountAmountCents,
            lead_source: leadSource || "sales_pipeline",
            opportunity_id: opportunityId || null,
          },
          line_items: lineItems.length > 0 ? lineItems : undefined,
        },
      });

      if (error) throw error;

      toast.success("Varaus luotu onnistuneesti");
      navigate(-1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Varauksen luominen epäonnistui";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (oppLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Takaisin
      </button>

      <h1 className="text-xl sm:text-2xl font-bold text-text-primary mb-1">Varaa aika</h1>
      {opportunity?.name && (
        <p className="text-sm text-text-muted mb-6">{opportunity.name}</p>
      )}

      {/* Step indicator */}
      {flowPath && (
        <StepIndicator labels={stepLabels} currentStep={step} onStepClick={(i) => { if (i < step) setStep(i); }} />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          STEP 0: Choose path
         ═══════════════════════════════════════════════════════════════════════ */}
      {step === 0 && (
        <div className="max-w-xl space-y-4">
          <p className="text-sm text-text-muted mb-4">Valitse varaustyyppi</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => {
                setFlowPath("kartoitus");
                setStep(1);
              }}
              className="p-5 rounded-xl border-2 border-border hover:border-accent text-left transition-all group"
            >
              <CalendarPlus className="w-6 h-6 text-accent mb-2 group-hover:scale-110 transition-transform" />
              <p className="font-semibold text-sm text-text-primary mb-1">Kartoituskäynti</p>
              <p className="text-xs text-text-muted">Varaa kartoituskäynti asiakkaalle</p>
            </button>
            <button
              onClick={() => {
                setFlowPath("muu");
                setStep(1);
              }}
              className="p-5 rounded-xl border-2 border-border hover:border-accent text-left transition-all group"
            >
              <Package className="w-6 h-6 text-accent mb-2 group-hover:scale-110 transition-transform" />
              <p className="font-semibold text-sm text-text-primary mb-1">Muu varaus</p>
              <p className="text-xs text-text-muted">Valitse palvelut ja varaa aika</p>
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          PATH A: Kartoituskäynti
         ═══════════════════════════════════════════════════════════════════════ */}

      {/* Path A - Step 1: Customer review */}
      {flowPath === "kartoitus" && step === 1 && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-4">
            <h3 className="font-semibold text-text-primary text-sm mb-4">Asiakkaan tiedot</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Etunimi *</label>
                <input
                  value={customerForm.firstName}
                  onChange={(e) => setCustomerForm({ ...customerForm, firstName: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Sukunimi *</label>
                <input
                  value={customerForm.lastName}
                  onChange={(e) => setCustomerForm({ ...customerForm, lastName: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Puhelin *</label>
                <input
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Sähköposti *</label>
                <input
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Osoite *</label>
                <input
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Postinumero</label>
                <input
                  value={customerForm.postalCode}
                  onChange={(e) => setCustomerForm({ ...customerForm, postalCode: e.target.value.replace(/\D/g, "") })}
                  maxLength={5}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Kaupunki</label>
                <input
                  value={customerForm.city}
                  onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {kartoitusService && (
            <div className="bg-surface border border-border rounded-2xl p-4">
              <p className="text-xs text-text-muted">Palvelu</p>
              <p className="text-sm font-semibold text-text-primary">
                {kartoitusService.name} &middot; {kartoitusDuration} min
              </p>
            </div>
          )}

          <div className="flex justify-center gap-3 pt-4">
            <button
              onClick={() => setStep(0)}
              className="px-6 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Takaisin
            </button>
            <button
              disabled={!canProceedCustomer}
              onClick={() => setStep(2)}
              className="px-6 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
            >
              Seuraava
            </button>
          </div>
        </div>
      )}

      {/* Path A - Step 2: Calendar */}
      {flowPath === "kartoitus" && step === 2 && (
        <div>
          <CalendarStep
            path="free"
            postalCode={customerForm.postalCode}
            selectedServiceIds={kartoitusServiceIds}
            allServices={allServices || []}
            allEmployees={allEmployees || []}
            allAreas={allAreas || []}
            selectedEmployeeId={selectedEmployeeId}
            setSelectedEmployeeId={setSelectedEmployeeId}
            selectedCalendarId={selectedCalendarId}
            setSelectedCalendarId={setSelectedCalendarId}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedTime={selectedTime}
            setSelectedTime={setSelectedTime}
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            totalDuration={kartoitusDuration}
            minSchedulingNoticeHours={0}
            onBack={() => setStep(1)}
            onNext={() => {
              // Submit directly after calendar for kartoitus
              handleSubmit();
            }}
            canProceed={canProceedCalendar && !isSubmitting}
          />
          {isSubmitting && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-text-muted">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              Luodaan varausta...
            </div>
          )}
          {submitError && (
            <div className="max-w-3xl mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {submitError}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          PATH B: Muu varaus
         ═══════════════════════════════════════════════════════════════════════ */}

      {/* Path B - Step 1: Service selection */}
      {flowPath === "muu" && step === 1 && (
        <ServiceSelectionStep
          allServices={allServices}
          allAddons={allAddons}
          allProducts={allProducts}
          linkedAddons={linkedAddons}
          serviceVariants={serviceVariants}
          serviceQty={serviceQty} setServiceQty={setServiceQty}
          selectedVariantId={selectedVariantId} setSelectedVariantId={setSelectedVariantId}
          selectedAddons={selectedAddons} setSelectedAddons={setSelectedAddons}
          selectedProducts={selectedProducts} setSelectedProducts={setSelectedProducts}
          productSearch={productSearch} setProductSearch={setProductSearch}
          showAllAddons={showAllAddons} setShowAllAddons={setShowAllAddons}
          showAllServices={showAllServices} setShowAllServices={setShowAllServices}
          showProductPicker={showProductPicker} setShowProductPicker={setShowProductPicker}
          extraItems={extraItems} setExtraItems={setExtraItems}
          subtotalCents={subtotalCents}
          totalDuration={totalDuration}
          canProceed={canProceedServices}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}

      {/* Path B - Step 2: Calendar */}
      {flowPath === "muu" && step === 2 && (
        <div>
          <CalendarStep
            path="free"
            postalCode={customerForm.postalCode}
            selectedServiceIds={selectedServiceIds}
            selectedAddonIds={selectedAddonList.map((a) => a.id)}
            allServices={allServices || []}
            allEmployees={allEmployees || []}
            allAreas={allAreas || []}
            selectedEmployeeId={selectedEmployeeId}
            setSelectedEmployeeId={setSelectedEmployeeId}
            selectedCalendarId={selectedCalendarId}
            setSelectedCalendarId={setSelectedCalendarId}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedTime={selectedTime}
            setSelectedTime={setSelectedTime}
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            totalDuration={totalBlockedTime || 60}
            slotStepMinutes={slotStep}
            minSchedulingNoticeHours={0}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            canProceed={canProceedCalendar}
          />
        </div>
      )}

      {/* Path B - Step 3: Customer */}
      {flowPath === "muu" && step === 3 && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-4">
            <h3 className="font-semibold text-text-primary text-sm mb-4">Asiakkaan tiedot</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Etunimi *</label>
                <input
                  value={customerForm.firstName}
                  onChange={(e) => setCustomerForm({ ...customerForm, firstName: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Sukunimi *</label>
                <input
                  value={customerForm.lastName}
                  onChange={(e) => setCustomerForm({ ...customerForm, lastName: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Puhelin *</label>
                <input
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Sähköposti *</label>
                <input
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Osoite *</label>
                <input
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Postinumero</label>
                <input
                  value={customerForm.postalCode}
                  onChange={(e) => setCustomerForm({ ...customerForm, postalCode: e.target.value.replace(/\D/g, "") })}
                  maxLength={5}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Kaupunki</label>
                <input
                  value={customerForm.city}
                  onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-4">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Takaisin
            </button>
            <button
              disabled={!canProceedCustomer}
              onClick={() => setStep(4)}
              className="px-6 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
            >
              Seuraava
            </button>
          </div>
        </div>
      )}

      {/* Path B - Step 4: Summary */}
      {flowPath === "muu" && step === 4 && (
        <div className="max-w-2xl space-y-6">
          {/* Services summary */}
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
            <h3 className="font-semibold text-text-primary text-sm">Palvelut</h3>
            {selectedServices.map((s) => {
              const qty = serviceQty[s.id] || 1;
              return (
                <div key={s.id} className="flex justify-between text-sm">
                  <span className="text-text-secondary">
                    {s.name}
                    {qty > 1 && ` \u00d7 ${qty}`}
                  </span>
                  <span className="font-medium text-text-primary">
                    {formatCents(selectedVariant && selectedServices[0]?.id === s.id ? selectedVariant.price_cents * qty : getUnitPriceCents(s, qty) * qty)}
                  </span>
                </div>
              );
            })}
            {selectedVariant && (
              <p className="text-xs text-text-muted">Variantti: {selectedVariant.label}</p>
            )}
            {selectedAddonList.map((a) => (
              <div key={a.id} className="flex justify-between text-sm">
                <span className="text-text-secondary">
                  {a.name}
                  {(selectedAddons[a.id] || 1) > 1 && ` \u00d7 ${selectedAddons[a.id]}`}
                </span>
                <span className="font-medium text-text-primary">
                  {formatCents(a.price_cents * (selectedAddons[a.id] || 1))}
                </span>
              </div>
            ))}
            {selectedProductList.map((p) => (
              <div key={p.id} className="flex justify-between text-sm">
                <span className="text-text-secondary">
                  {p.brand ? `${p.brand} ` : ""}
                  {p.name}
                  {(selectedProducts[p.id] || 1) > 1 && ` \u00d7 ${selectedProducts[p.id]}`}
                </span>
                <span className="font-medium text-text-primary">
                  {formatCents(p.price_cents * (selectedProducts[p.id] || 1))}
                </span>
              </div>
            ))}
            {parsedExtras.map((e, i) => (
              <div key={`extra-${i}`} className="flex justify-between text-sm">
                <span className="text-text-secondary">{e.name}</span>
                <span className="font-medium text-text-primary">{formatCents(e.price_cents)}</span>
              </div>
            ))}
          </div>

          {/* Time & installer */}
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
            <h3 className="font-semibold text-text-primary text-sm">Ajankohta</h3>
            <p className="text-sm text-text-secondary">
              {selectedDate} klo {selectedTime}
            </p>
            <p className="text-sm text-text-muted">
              {allEmployees?.find((e) => e.id === selectedEmployeeId)?.first_name}{" "}
              {allEmployees?.find((e) => e.id === selectedEmployeeId)?.last_name}
            </p>
          </div>

          {/* Customer */}
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
            <h3 className="font-semibold text-text-primary text-sm">Asiakas</h3>
            <p className="text-sm text-text-secondary">
              {customerForm.firstName} {customerForm.lastName}
            </p>
            <p className="text-sm text-text-muted">
              {customerForm.email} &middot; {customerForm.phone}
            </p>
            <p className="text-sm text-text-muted">
              {customerForm.address}
              {customerForm.postalCode && `, ${customerForm.postalCode}`}
              {customerForm.city && ` ${customerForm.city}`}
            </p>
          </div>

          {/* Lead source */}
          <div>
            <label className={labelCls}>Mistä asiakas tuli? *</label>
            <div className="flex flex-wrap gap-2">
              {LEAD_SOURCES.map((src) => (
                <button
                  key={src.value}
                  onClick={() => setLeadSource(src.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    leadSource === src.value
                      ? "bg-accent-muted text-accent-dark border-accent/30"
                      : "bg-surface text-text-secondary border-border hover:border-border-strong"
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Lisätiedot</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Vapaaehtoinen"
            />
          </div>

          {/* Discount */}
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-4">
            <h3 className="font-semibold text-text-primary text-sm">Alennukset</h3>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className={labelCls}>Alennuskoodi</label>
                <input
                  value={discountCode}
                  onChange={(e) => {
                    setDiscountCode(e.target.value);
                    setDiscountValid(false);
                    setDiscountError("");
                  }}
                  placeholder="esim. KEVAT25"
                  className={inputCls}
                />
              </div>
              <button
                onClick={validateDiscountCode}
                className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
              >
                Tarkista
              </button>
            </div>
            {discountValid && <p className="text-sm text-green-600">Koodi hyväksytty!</p>}
            {discountError && <p className="text-sm text-red-600">{discountError}</p>}

            <div>
              <label className={labelCls}>Manuaalinen alennus (&euro;)</label>
              <input
                type="number"
                step="0.01"
                value={manualDiscountCents}
                onChange={(e) => setManualDiscountCents(e.target.value)}
                placeholder="0"
                className={`${inputCls} max-w-[200px]`}
              />
            </div>
          </div>

          {/* Price summary */}
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Välisumma</span>
              <span className="text-text-primary">{formatCents(subtotalCents)}</span>
            </div>
            {discountAmountCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-600">Alennus</span>
                <span className="text-green-600">-{formatCents(discountAmountCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-border">
              <span className="text-text-primary">Yhteensä</span>
              <span className="text-text-primary">{formatCents(finalPriceCents)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Työn osuus (kotitalousvähennys)</span>
              <span className="text-text-muted">{formatCents(Math.max(0, finalPriceCents - totalMaterialCents))}</span>
            </div>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{submitError}</div>
          )}

          <div className="flex justify-center gap-3 pt-4">
            <button
              onClick={() => setStep(3)}
              className="px-6 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Takaisin
            </button>
            <button
              disabled={!leadSource || isSubmitting}
              onClick={handleSubmit}
              className="px-8 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
            >
              {isSubmitting ? "Luodaan..." : "Luo varaus"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
