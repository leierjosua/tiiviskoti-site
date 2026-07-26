import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { useEmployees, useInstallerCalendars } from "@/hooks/useEmployees";
import { useCustomers } from "@/hooks/useCustomers";
import { useServiceAreas } from "@/hooks/useServices";
import { useAddonServices, useAddonsByService } from "@/hooks/useAddonServices";
import { useProducts } from "@/hooks/useProducts";
import { getUnitPriceCents, postalCodesToCities } from "@/lib/utils";
import { useServiceVariants } from "@/hooks/useServiceVariants";
import { useUserRole } from "@/context/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { CalendarStep } from "@/components/CalendarStep";
import { inputCls } from "@/lib/constants";
import {
  StepIndicator,
  ServiceSelectionStep,
  CustomerFormStep,
  SummaryStep,
  type ExtraItemForm,
  type CustomerFormData,
  type CustomerType,
  LEAD_SOURCES,
  parseExtras,
  buildLineItems,
  calculatePricing,
  validateDiscountCode,
} from "@/components/booking-wizard";

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

type PathType = "postal" | "free";

export default function CreateBooking({ backUrl = "/varaukset", successUrlPrefix = "/varaukset", skipPathSelection = false }: { backUrl?: string; successUrlPrefix?: string; skipPathSelection?: boolean } = {}) {
  const navigate = useNavigate();
  const { employee: currentEmployee } = useUserRole();
  const { data: allServices } = useServices();
  const { data: allEmployees } = useEmployees("installer");
  const { data: allAreas } = useServiceAreas();
  const { data: allCalendars } = useInstallerCalendars();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Installer mode: only show services from the installer's own calendar
  const installerServiceIds = useMemo(() => {
    if (!skipPathSelection || !currentEmployee || !allCalendars) return null;
    const myCals = allCalendars.filter((c) => c.employee_id === currentEmployee.id && c.active);
    const ids = new Set<string>();
    myCals.forEach((c) => (c.calendar_services || []).forEach((cs: any) => ids.add(cs.service_id)));
    return ids;
  }, [skipPathSelection, currentEmployee, allCalendars]);

  const visibleServices = useMemo(() => {
    if (!allServices) return undefined;
    if (installerServiceIds) return allServices.filter((s) => installerServiceIds.has(s.id));
    return allServices;
  }, [allServices, installerServiceIds]);

  // Steps: 0=path, 1=services, 2=calendar, 3=customer, 4=summary
  const [step, setStep] = useState(skipPathSelection ? 1 : 0);

  // Step 0: Path
  const [path, setPath] = useState<PathType | null>(skipPathSelection ? "free" : null);
  const [postalCode, setPostalCode] = useState("");

  // Step 1: Services
  const [serviceQty, setServiceQty] = useState<Record<string, number>>({});
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});
  const [productSearch, setProductSearch] = useState("");
  const [showAllAddons, setShowAllAddons] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [extraItems, setExtraItems] = useState<ExtraItemForm[]>([]);

  // Step 2: Calendar — pre-select installer's own calendar when in installer mode
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);

  useEffect(() => {
    if (!skipPathSelection || !currentEmployee || !allCalendars || selectedEmployeeId) return;
    const myCal = allCalendars.find((c) => c.employee_id === currentEmployee.id && c.active);
    if (myCal) {
      setSelectedEmployeeId(currentEmployee.id);
      setSelectedCalendarId(myCal.id);
    }
  }, [skipPathSelection, currentEmployee, allCalendars, selectedEmployeeId]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [secondaryTeam, setSecondaryTeam] = useState<{ employeeId: string; calendarId: string }[]>([]);

  // Step 3: Customer
  const [customerMode, setCustomerMode] = useState<"new" | "existing">("new");
  const [customerType, setCustomerType] = useState<CustomerType>("private");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormData>({
    firstName: "", lastName: "", email: "", phone: "",
    postalCode: "", address: "",
    companyName: "", businessId: "",
  });

  // Step 4: Summary
  const [notes, setNotes] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountValid, setDiscountValid] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [discountInfo, setDiscountInfo] = useState<{ id: string; type: string; value: number } | null>(null);
  const [manualDiscountCents, setManualDiscountCents] = useState("");
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [submitError, setSubmitError] = useState("");

  const { data: customers } = useCustomers(customerSearch || undefined);
  const { data: allAddons } = useAddonServices();
  const { data: allProducts } = useProducts();

  const primaryServiceIdForAddons = Object.keys(serviceQty).find((id) => serviceQty[id] > 0);
  const { data: linkedAddons } = useAddonsByService(primaryServiceIdForAddons);
  const { data: serviceVariants } = useServiceVariants(primaryServiceIdForAddons);
  const selectedVariant = (serviceVariants || []).find((v) => v.id === selectedVariantId) ?? null;

  useEffect(() => {
    if (path === "postal" && postalCode) {
      setCustomerForm((prev) => ({ ...prev, postalCode }));
    }
  }, [path, postalCode]);

  // Derived values
  const selectedServiceIds = Object.keys(serviceQty).filter((id) => serviceQty[id] > 0);
  const selectedServices = (allServices || []).filter((s) => selectedServiceIds.includes(s.id));
  const parsedExtras = parseExtras(extraItems);
  const selectedAddonList = (allAddons || []).filter((a) => (selectedAddons[a.id] || 0) > 0);
  const selectedProductList = (allProducts || []).filter((p) => (selectedProducts[p.id] || 0) > 0);

  const pricing = calculatePricing({
    selectedServices, serviceQty, selectedVariant,
    selectedAddonList, selectedAddons,
    selectedProductList, selectedProducts,
    parsedExtras,
    discountValid, discountInfo, manualDiscountCents,
    getUnitPriceCents,
  });

  const requiredEmployees = selectedServices.length > 0 ? Math.max(...selectedServices.map((s) => (s as any).required_employees || 1)) : 1;
  const needsSecondary = requiredEmployees > 1;

  const canProceedStep0 = path === "free" || (path === "postal" && /^\d{5}$/.test(postalCode));
  const canProceedStep1 = selectedServiceIds.length > 0 || parsedExtras.length > 0;
  const canProceedStep2 = selectedDate && selectedTime && selectedEmployeeId && (!needsSecondary || secondaryTeam.length >= requiredEmployees - 1);
  const canProceedStep3 = customerMode === "existing"
    ? !!selectedCustomerId
    : customerType === "company"
      ? !!(customerForm.companyName && customerForm.businessId && customerForm.address)
      : !!(customerForm.firstName && customerForm.lastName && customerForm.email && customerForm.phone && customerForm.address);
  const canSubmit = !!leadSource;

  async function handleValidateDiscount() {
    const result = await validateDiscountCode(discountCode, supabase);
    setDiscountValid(result.valid);
    setDiscountError(result.error || "");
    if (result.info) setDiscountInfo(result.info);
  }

  async function handleSubmit() {
    setSubmitError("");
    setIsSubmitting(true);
    try {
      const customerInput = (customerMode === "existing" && selectedCustomerId)
        ? { id: selectedCustomerId }
        : {
            first_name: customerForm.firstName.trim() || null,
            last_name: customerForm.lastName.trim() || null,
            email: customerForm.email.trim().toLowerCase() || null,
            phone: customerForm.phone.trim() || null,
            postal_code: customerForm.postalCode.trim(),
            address: customerForm.address.trim(),
            company_name: customerForm.companyName.trim() || null,
            business_id: customerForm.businessId.trim() || null,
          };

      const lineItems = buildLineItems(selectedAddonList, selectedAddons, selectedProductList, selectedProducts, parsedExtras);

      // Add main service as a line item (single source of truth)
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

      const teamArray = needsSecondary && secondaryTeam.length > 0
        ? [
            { employee_id: selectedEmployeeId, calendar_id: selectedCalendarId, role: "primary" },
            ...secondaryTeam.map((t) => ({ employee_id: t.employeeId, calendar_id: t.calendarId, role: "secondary" })),
          ]
        : undefined;

      const { data, error } = await supabase.functions.invoke("create-admin-booking", {
        body: {
          customer: customerInput,
          booking: {
            service_id: selectedServiceIds[0] || null,
            variant_id: selectedVariantId || null,
            employee_id: selectedEmployeeId,
            calendar_id: selectedCalendarId,
            price_cents: 0, // trigger recalculates from line items
            device_count: selectedServices[0] ? (serviceQty[selectedServices[0].id] || 1) : 1,
            unit_price_cents: selectedServices[0]
              ? (selectedVariant
                ? selectedVariant.price_cents
                : getUnitPriceCents(selectedServices[0], serviceQty[selectedServices[0].id] || 1))
              : undefined,
            service_label: (() => {
              const primary = selectedServices[0];
              if (!primary) return undefined;
              const base = selectedVariant ? `${primary.name} — ${selectedVariant.label}` : primary.name;
              const qty = serviceQty[primary.id] || 1;
              return qty > 1 ? `${base} × ${qty}` : base;
            })(),
            duration_minutes: pricing.totalDuration || undefined,
            booking_date: selectedDate!,
            time_slot: selectedTime!,
            postal_code: customerForm.postalCode || postalCode || null,
            address: customerForm.address || null,
            notes: notes.trim() || null,
            discount_code_id: discountValid ? discountInfo!.id : null,
            discount_amount_cents: pricing.discountAmountCents,
            lead_source: leadSource,
            team: teamArray,
          },
          line_items: lineItems.length > 0 ? lineItems : undefined,
          skip_notifications: !sendConfirmation,
        },
      });
      if (error) throw error;
      navigate(`${successUrlPrefix}/${data.bookingNumber}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Varauksen luominen epäonnistui");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button onClick={() => navigate(backUrl)} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Takaisin
      </button>

      <h1 className="text-xl sm:text-2xl font-bold text-text-primary mb-6">Luo varaus</h1>

      <StepIndicator
        labels={skipPathSelection ? ["Palvelut", "Kalenteri", "Asiakas", "Yhteenveto"] : ["Tyyppi", "Palvelut", "Kalenteri", "Asiakas", "Yhteenveto"]}
        currentStep={skipPathSelection ? step - 1 : step}
        onStepClick={(i) => { const realStep = skipPathSelection ? i + 1 : i; if (realStep < step) setStep(realStep); }}
      />

      {/* Step 0: Path selection */}
      {step === 0 && (
        <div className="max-w-xl space-y-4">
          <p className="text-sm text-text-muted mb-4">Valitse varauksen tyyppi</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={() => setPath("postal")}
              className={`p-5 rounded-xl border-2 text-left transition-all ${path === "postal" ? "border-accent bg-accent-muted" : "border-border hover:border-border-strong"}`}>
              <p className="font-semibold text-sm text-text-primary mb-1">Postinumeron mukaan</p>
              <p className="text-xs text-text-muted">Asentajat valikoituvat palvelualueen perusteella</p>
            </button>
            <button onClick={() => setPath("free")}
              className={`p-5 rounded-xl border-2 text-left transition-all ${path === "free" ? "border-accent bg-accent-muted" : "border-border hover:border-border-strong"}`}>
              <p className="font-semibold text-sm text-text-primary mb-1">Vapaa valinta</p>
              <p className="text-xs text-text-muted">Valitse asentaja vapaasti ilman aluerajoitusta</p>
            </button>
          </div>

          {path === "postal" && (
            <div className="mt-4">
              <label className={labelCls}>Postinumero *</label>
              <input type="text" maxLength={5} value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ""))}
                placeholder="00100" className={`${inputCls} max-w-[200px]`} />
              {postalCode.length === 5 && (() => {
                const city = postalCodesToCities([postalCode]).join(", ");
                const matchingAreaIds = new Set(
                  (allAreas || []).filter((a) => a.active && a.postal_codes.includes(postalCode)).map((a) => a.id)
                );
                const availableServiceIds = new Set<string>();
                (allCalendars || []).filter((c) => c.active && (c.calendar_service_areas || []).some((csa: any) => matchingAreaIds.has(csa.service_area_id)))
                  .forEach((c) => (c.calendar_services || []).forEach((cs: any) => availableServiceIds.add(cs.service_id)));
                const availableServices = (allServices || []).filter((s) => s.active && availableServiceIds.has(s.id));
                return (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-text-muted">{city || "Tuntematon alue"}</p>
                    {availableServices.length > 0 ? (
                      <p className="text-xs text-green-600 font-medium">Palvelut: {availableServices.map((s) => s.name).join(", ")}</p>
                    ) : (
                      <p className="text-xs text-red-600 font-medium">Ei palveluita tällä alueella</p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex justify-center pt-4">
            <button disabled={!canProceedStep0} onClick={() => setStep(1)}
              className="px-6 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40">
              Seuraava
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Service selection */}
      {step === 1 && (
        <ServiceSelectionStep
          allServices={visibleServices}
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
          subtotalCents={pricing.subtotalCents}
          totalDuration={pricing.totalDuration}
          canProceed={canProceedStep1}
          onBack={skipPathSelection ? () => navigate(backUrl) : () => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}

      {/* Step 2: Calendar */}
      {step === 2 && (
        <div>
          <CalendarStep
            path={path!}
            postalCode={postalCode}
            selectedServiceIds={selectedServiceIds}
            allServices={allServices || []}
            allEmployees={allEmployees || []}
            allAreas={allAreas || []}
            selectedEmployeeId={selectedEmployeeId}
            setSelectedEmployeeId={(id) => { setSelectedEmployeeId(id); setSecondaryTeam([]); }}
            selectedCalendarId={selectedCalendarId}
            setSelectedCalendarId={setSelectedCalendarId}
            selectedDate={selectedDate}
            setSelectedDate={(d) => { setSelectedDate(d); setSecondaryTeam([]); }}
            selectedTime={selectedTime}
            setSelectedTime={(t) => { setSelectedTime(t); setSecondaryTeam([]); }}
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            totalDuration={pricing.totalBlockedTime || 60}
            slotStepMinutes={pricing.slotStep}
            minSchedulingNoticeHours={0}
            selectedAddonIds={selectedAddonList.map((a) => a.id)}
            hideEmployeeFilter={skipPathSelection}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            canProceed={!!canProceedStep2}
          />

          {needsSecondary && selectedDate && selectedTime && selectedEmployeeId && (
            <div className="max-w-3xl mt-6 bg-surface rounded-2xl border border-border p-5">
              <h3 className="font-semibold text-text-primary mb-3">
                2. asentaja {requiredEmployees > 2 ? `(${secondaryTeam.length + 1}/${requiredEmployees})` : ""}
              </h3>
              <p className="text-sm text-text-muted mb-3">
                Valitse {requiredEmployees - 1} lisäasentaja{requiredEmployees > 2 ? "a" : ""} jolla on vapaa kalenteri valittuna aikana
              </p>
              <div className="flex flex-wrap gap-2">
                {(allEmployees || []).filter((emp) => emp.active && emp.id !== selectedEmployeeId).map((emp) => {
                  const isSelected = secondaryTeam.some((t) => t.employeeId === emp.id);
                  const empCal = (allCalendars || []).find((c) => c.employee_id === emp.id && c.active);
                  return (
                    <button key={emp.id}
                      onClick={() => {
                        if (isSelected) setSecondaryTeam((prev) => prev.filter((t) => t.employeeId !== emp.id));
                        else if (secondaryTeam.length < requiredEmployees - 1) setSecondaryTeam((prev) => [...prev, { employeeId: emp.id, calendarId: empCal?.id || "" }]);
                      }}
                      disabled={!isSelected && secondaryTeam.length >= requiredEmployees - 1}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        isSelected ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border hover:border-border-strong disabled:opacity-40"
                      }`}>
                      {emp.first_name} {emp.last_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Customer */}
      {step === 3 && (
        <CustomerFormStep
          customerMode={customerMode} setCustomerMode={setCustomerMode}
          customerSearch={customerSearch} setCustomerSearch={setCustomerSearch}
          selectedCustomerId={selectedCustomerId} setSelectedCustomerId={setSelectedCustomerId}
          customerForm={customerForm} setCustomerForm={setCustomerForm}
          customers={customers}
          customerType={customerType} setCustomerType={setCustomerType}
          showExistingToggle
          showCompanyFields
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
          canProceed={!!canProceedStep3}
        />
      )}

      {/* Step 4: Summary */}
      {step === 4 && (
        <SummaryStep
          selectedServices={selectedServices}
          serviceQty={serviceQty}
          selectedVariant={selectedVariant}
          selectedAddonList={selectedAddonList}
          selectedAddons={selectedAddons}
          selectedProductList={selectedProductList}
          selectedProducts={selectedProducts}
          parsedExtras={parsedExtras}
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          employeeName={(() => { const e = allEmployees?.find((e) => e.id === selectedEmployeeId); return e ? `${e.first_name} ${e.last_name}` : ""; })()}
          secondaryNames={secondaryTeam.map((t) => { const emp = allEmployees?.find((e) => e.id === t.employeeId); return emp ? `${emp.first_name} ${emp.last_name}` : ""; })}
          customerForm={customerForm}
          notes={notes} setNotes={setNotes}
          leadSources={LEAD_SOURCES}
          leadSource={leadSource} setLeadSource={setLeadSource}
          discountCode={discountCode} setDiscountCode={setDiscountCode}
          discountValid={discountValid} setDiscountValid={setDiscountValid}
          discountError={discountError} setDiscountError={setDiscountError}
          manualDiscountCents={manualDiscountCents} setManualDiscountCents={setManualDiscountCents}
          onValidateDiscount={handleValidateDiscount}
          pricing={pricing}
          sendConfirmation={sendConfirmation} setSendConfirmation={setSendConfirmation}
          submitError={submitError}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
}
