import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Check, FileSignature, Users } from "lucide-react";
import { StepIndicator, ServiceSelectionStep } from "@/components/booking-wizard";
import { useServices } from "@/hooks/useServices";
import { useEmployees, useInstallerCalendars } from "@/hooks/useEmployees";
import { useCustomers } from "@/hooks/useCustomers";
import { useAddonServices, useAddonsByService } from "@/hooks/useAddonServices";
import { useProducts } from "@/hooks/useProducts";
import { useContractTemplates } from "@/hooks/useContracts";
import { useServiceVariants } from "@/hooks/useServiceVariants";
import { useUserRole } from "@/context/UserRoleContext";
import { formatCents, getUnitPriceCents, intervalLabel, billingLabel, formatAddress, finnishToday } from "@/lib/utils";
import type { ExtraItem, PaymentStatus, CustomerSatisfaction, ContractTemplate } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { inputCls } from "@/lib/constants";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import SignaturePad from "signature_pad";

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

const LEAD_SOURCES = [
  { value: "website", label: "Nettisivu" },
  { value: "contact_form", label: "Yhteydenottolomake" },
  { value: "phone", label: "Puhelin" },
  { value: "email", label: "Sähköposti" },
  { value: "other", label: "Muu" },
];

interface ExtraItemForm {
  name: string;
  price: string;
  duration: string;
  materialCost: string;
}

export default function CompletedGig({ backUrl = "/varaukset", successUrlPrefix = "/varaukset", autoAssignSelf = false }: { backUrl?: string; successUrlPrefix?: string; autoAssignSelf?: boolean } = {}) {
  const navigate = useNavigate();
  const { data: allServices } = useServices();
  const { data: allEmployees } = useEmployees("installer");
  const { data: allCalendars } = useInstallerCalendars();
  const { data: allAddons } = useAddonServices();
  const { data: allProducts } = useProducts();
  const { data: contractTemplates } = useContractTemplates();
  const { employee: currentEmployee } = useUserRole();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Steps: 0 = customer + installer, 1 = services, 2 = finalization
  const [step, setStep] = useState(0);

  // Step 0: Customer & Installer
  const [customerMode, setCustomerMode] = useState<"new" | "existing">("new");
  const [customerType, setCustomerType] = useState<"private" | "company">("private");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    postalCode: "", address: "",
    companyName: "", businessId: "",
  });

  // Installer selection — auto-assign self in installer mode
  const [selectedInstallerIds, setSelectedInstallerIds] = useState<string[]>(() =>
    autoAssignSelf && currentEmployee ? [currentEmployee.id] : []
  );
  const [gigDate, setGigDate] = useState(finnishToday);
  const [gigTime, setGigTime] = useState(() => {
    const h = new Date().getHours();
    return `${String(h).padStart(2, "0")}:00`;
  });

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

  // Step 2: Finalization
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [satisfaction, setSatisfaction] = useState<CustomerSatisfaction | null>(null);
  const [sendReceipt, setSendReceipt] = useState(true);
  const [notes, setNotes] = useState("");
  const [leadSource, setLeadSource] = useState("phone");
  const [discountCode, setDiscountCode] = useState("");
  const [discountValid, setDiscountValid] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [discountInfo, setDiscountInfo] = useState<{ id: string; type: string; value: number } | null>(null);
  const [manualDiscountCents, setManualDiscountCents] = useState("");

  // Contract
  const [offerContract, setOfferContract] = useState(false);
  const [selectedContractTemplate, setSelectedContractTemplate] = useState<ContractTemplate | null>(null);
  const [signedByName, setSignedByName] = useState("");
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [contractSigned, setContractSigned] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  const { data: customers } = useCustomers(customerSearch || undefined);

  // Service-related computed values
  const primaryServiceIdForAddons = Object.keys(serviceQty).find((id) => serviceQty[id] > 0);
  const { data: linkedAddons } = useAddonsByService(primaryServiceIdForAddons);
  const { data: serviceVariants } = useServiceVariants(primaryServiceIdForAddons);
  const selectedVariant = (serviceVariants || []).find((v) => v.id === selectedVariantId) ?? null;

  const selectedServiceIds = Object.keys(serviceQty).filter((id) => serviceQty[id] > 0);
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
      discountAmountCents = Math.round(subtotalCents * discountInfo.value / 100);
    }
  }
  if (manualDiscountCents) {
    discountAmountCents += Math.round(parseFloat(manualDiscountCents) * 100);
  }
  const finalPriceCents = Math.max(0, subtotalCents - discountAmountCents);

  const totalDuration = (selectedVariant
    ? (selectedVariant.duration_minutes + (selectedServices[0]?.transition_minutes || 0)) * (serviceQty[selectedServices[0]?.id] || 1)
    : selectedServices.reduce((sum, s) => sum + (s.duration_minutes + (s.transition_minutes || 0)) * (serviceQty[s.id] || 1), 0))
    + selectedAddonList.reduce((sum, a) => sum + a.duration_minutes * (selectedAddons[a.id] || 1), 0)
    + parsedExtras.reduce((sum, e) => sum + e.duration_minutes, 0);

  // Contract templates
  const activeTemplates = useMemo(
    () => (contractTemplates || []).filter((t) => t.active),
    [contractTemplates]
  );
  const matchingTemplates = useMemo(
    () => activeTemplates.filter((t) => selectedServiceIds.includes(t.service_id)),
    [activeTemplates, selectedServiceIds]
  );
  const otherTemplates = useMemo(
    () => activeTemplates.filter((t) => !selectedServiceIds.includes(t.service_id)),
    [activeTemplates, selectedServiceIds]
  );

  const fetchPdfPreview = useCallback(async (
    template: ContractTemplate,
    sig?: { name: string; data: string }
  ) => {
    const customer = customerMode === "existing"
      ? customers?.find((c) => c.id === selectedCustomerId)
      : {
          first_name: customerForm.firstName,
          last_name: customerForm.lastName,
          email: customerForm.email,
          phone: customerForm.phone,
        };
    if (!customer) return;
    setPdfLoading(true);
    setPdfPreviewUrl(null);
    setPdfPreviewError(null);
    try {
      const { previewContractPdf } = await import("@/lib/chromiumPdf");
      const url = await previewContractPdf(
        { ...template, services: template.services, service_name: template.services?.name },
        customer,
        { address: customerForm.address, postal_code: customerForm.postalCode },
        sig || null,
      );
      setPdfPreviewUrl(url);
    } catch (err) {
      console.error("PDF preview failed:", err);
      setPdfPreviewError(err instanceof Error ? err.message : "Tuntematon virhe");
    } finally {
      setPdfLoading(false);
    }
  }, [customerMode, customers, selectedCustomerId, customerForm]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const initSignaturePad = useCallback(() => {
    if (canvasRef.current && !sigPadRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(2, 2);
      sigPadRef.current = new SignaturePad(canvas, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(26, 26, 26)",
      });
    }
  }, []);

  // Validation
  const canProceedStep0 = (() => {
    const hasInstaller = selectedInstallerIds.length > 0;
    const hasCustomer = customerMode === "existing"
      ? !!selectedCustomerId
      : customerType === "company"
        ? !!(customerForm.companyName && customerForm.businessId && customerForm.address)
        : !!(customerForm.firstName && customerForm.lastName && customerForm.email && customerForm.phone && customerForm.address);
    return hasInstaller && hasCustomer && gigDate;
  })();

  const canProceedStep1 = selectedServiceIds.length > 0 || parsedExtras.length > 0;

  const canSubmit = !!paymentStatus && !!satisfaction && !!leadSource;

  async function validateDiscountCode() {
    if (!discountCode.trim()) return;
    setDiscountError("");
    const { data: dc } = await supabase
      .from("discount_codes")
      .select("id, discount_type, discount_value, max_uses, times_used, expires_at, active")
      .ilike("code", discountCode.trim().toLowerCase())
      .eq("active", true)
      .single();
    if (!dc) { setDiscountError("Koodi ei ole voimassa"); setDiscountValid(false); return; }
    if (dc.max_uses != null && dc.times_used >= dc.max_uses) { setDiscountError("Koodi käytetty loppuun"); setDiscountValid(false); return; }
    if (dc.expires_at && new Date(dc.expires_at) < new Date()) { setDiscountError("Koodi vanhentunut"); setDiscountValid(false); return; }
    setDiscountInfo({ id: dc.id, type: dc.discount_type, value: dc.discount_value });
    setDiscountValid(true);
  }

  async function handleSubmit() {
    setSubmitError("");
    setIsSubmitting(true);

    try {
      // Contract validation
      if (selectedContractTemplate && !contractSigned) {
        setSubmitError("Allekirjoita sopimus ensin");
        setIsSubmitting(false);
        return;
      }

      // Build customer input
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

      const primaryInstallerId = selectedInstallerIds[0];

      // Build team array if multiple installers
      const teamArray = selectedInstallerIds.length > 1
        ? selectedInstallerIds.map((empId, idx) => {
            const cal = (allCalendars || []).find((c) => c.employee_id === empId && c.active);
            return { employee_id: empId, calendar_id: cal?.id || null, role: idx === 0 ? "primary" : "secondary" };
          })
        : undefined;

      // 1. Create the booking
      const { data: bookingData, error: createError } = await supabase.functions.invoke("create-admin-booking", {
        body: {
          customer: customerInput,
          booking: {
            service_id: selectedServiceIds[0] || null,
            variant_id: selectedVariantId || null,
            employee_id: primaryInstallerId,
            calendar_id: null,
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
            duration_minutes: totalDuration || undefined,
            booking_date: gigDate,
            time_slot: gigTime + ":00",
            postal_code: customerForm.postalCode || null,
            address: customerForm.address || null,
            notes: notes.trim() || null,
            discount_code_id: discountValid ? discountInfo!.id : null,
            discount_amount_cents: discountAmountCents,
            lead_source: leadSource,
            status: "completed",
            team: teamArray,
          },
          line_items: lineItems.length > 0 ? lineItems : undefined,
          skip_notifications: true,
        },
      });
      if (createError) throw createError;

      const bookingId = bookingData?.bookingId;
      const bookingNumber = bookingData?.bookingNumber;
      if (!bookingId) throw new Error("Varauksen luominen epäonnistui — ei booking ID:tä");

      // 2. Immediately finalize the booking
      const contractInput = (selectedContractTemplate && contractSigned && signatureData)
        ? {
            template_id: selectedContractTemplate.id,
            service_id: selectedContractTemplate.service_id,
            frequency: selectedContractTemplate.frequency,
            visit_months: selectedContractTemplate.visit_months,
            visit_interval_months: selectedContractTemplate.visit_interval_months,
            billing_interval_months: selectedContractTemplate.billing_interval_months,
            contract_price_cents: selectedContractTemplate.contract_price_cents,
            duration_months: selectedContractTemplate.duration_months,
            device_count: selectedContractTemplate.device_count,
            auto_renew: selectedContractTemplate.auto_renew,
            cancellation_notice_days: selectedContractTemplate.cancellation_notice_days,
            signature_data: signatureData,
            signed_by_name: signedByName,
            signature_method: "on_site",
          }
        : undefined;

      const { error: finalizeError } = await supabase.functions.invoke("finalize-booking", {
        body: {
          booking_id: bookingId,
          payment_status: paymentStatus,
          customer_satisfaction: satisfaction,
          send_receipt: paymentStatus === "paid" ? sendReceipt : false,
          contract: contractInput,
        },
      });
      if (finalizeError) throw finalizeError;

      navigate(`${successUrlPrefix}/${bookingNumber}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Virhe tallennuksessa");
    } finally {
      setIsSubmitting(false);
    }
  }

  const showContractOffer = activeTemplates.length > 0;

  return (
    <div>
      <button onClick={() => navigate(backUrl)} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Takaisin
      </button>

      <h1 className="text-xl sm:text-2xl font-bold text-text-primary mb-2">Tehty keikka</h1>
      <p className="text-sm text-text-muted mb-6">Kirjaa tehty keikka järjestelmään ja viimeistele suoraan</p>

      <StepIndicator
        labels={["Asiakas & tekijä", "Palvelut", "Viimeistely"]}
        currentStep={step}
        onStepClick={(i) => { if (i < step) setStep(i); }}
        useCheckIcon
      />

      {/* ──── STEP 0: Customer & Installer ──── */}
      {step === 0 && (
        <div className="max-w-2xl space-y-6">
          {/* Gig date & time */}
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
            <h3 className="font-semibold text-text-primary text-sm">Keikan ajankohta</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Päivämäärä *</label>
                <DatePicker value={gigDate} onChange={setGigDate} placeholder="Valitse päivä" />
              </div>
              <div>
                <label className={labelCls}>Kellonaika</label>
                <TimePicker value={gigTime} onChange={setGigTime} placeholder="Valitse aika" />
              </div>
            </div>
          </div>

          {/* Installer selection */}
          {!autoAssignSelf && (
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
            <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" /> Tekijä(t) *
            </h3>
            <p className="text-xs text-text-muted">Valitse yksi tai useampi asentaja</p>
            <div className="flex flex-wrap gap-2">
              {(allEmployees || []).filter((emp) => emp.active).map((emp) => {
                const isSelected = selectedInstallerIds.includes(emp.id);
                return (
                  <button
                    key={emp.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedInstallerIds((prev) => prev.filter((id) => id !== emp.id));
                      } else {
                        setSelectedInstallerIds((prev) => [...prev, emp.id]);
                      }
                    }}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all min-h-[44px] ${
                      isSelected
                        ? "bg-accent-muted text-accent-dark border-accent/30"
                        : "bg-surface text-text-secondary border-border hover:border-border-strong"
                    }`}
                  >
                    {emp.first_name} {emp.last_name}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* Customer */}
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
            <h3 className="font-semibold text-text-primary text-sm">Asiakastiedot</h3>
            <div className="flex gap-2">
              <button
                onClick={() => { setCustomerMode("new"); setSelectedCustomerId(null); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  customerMode === "new" ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border"
                }`}
              >
                Uusi asiakas
              </button>
              <button
                onClick={() => setCustomerMode("existing")}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  customerMode === "existing" ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border"
                }`}
              >
                Olemassa oleva
              </button>
            </div>

            {customerMode === "existing" && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Hae nimellä, emaililla tai puhelinnumerolla..."
                    className={`${inputCls} pl-10`}
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {customers?.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        setCustomerForm({
                          firstName: c.first_name || "",
                          lastName: c.last_name || "",
                          email: c.email || "",
                          phone: c.phone || "",
                          postalCode: c.postal_code || "",
                          address: c.address || "",
                          companyName: c.company_name || "",
                          businessId: c.business_id || "",
                        });
                        setCustomerType(c.company_name ? "company" : "private");
                      }}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${
                        selectedCustomerId === c.id ? "border-accent bg-accent-muted" : "border-border hover:border-border-strong"
                      }`}
                    >
                      <p className="text-sm font-medium text-text-primary">
                        {c.company_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "(nimetön)"}
                      </p>
                      <p className="text-xs text-text-muted">{c.email || c.phone || c.business_id || "—"}</p>
                    </button>
                  ))}
                  {customers?.length === 0 && customerSearch && (
                    <p className="text-sm text-text-muted py-4 text-center">Ei tuloksia</p>
                  )}
                </div>
              </div>
            )}

            {(customerMode === "new" || selectedCustomerId) && (() => {
              const isCompany = customerType === "company";
              const personReq = isCompany ? "" : " *";
              const companyReq = isCompany ? " *" : "";
              const roField = customerMode === "existing";
              return (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => setCustomerType("private")}
                    disabled={roField}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      customerType === "private" ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border"
                    } disabled:opacity-60`}
                  >
                    Yksityinen
                  </button>
                  <button
                    onClick={() => setCustomerType("company")}
                    disabled={roField}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      customerType === "company" ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border"
                    } disabled:opacity-60`}
                  >
                    Yritys (verkkolasku)
                  </button>
                </div>

                {isCompany && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Yrityksen nimi{companyReq}</label>
                      <input value={customerForm.companyName} onChange={(e) => setCustomerForm({ ...customerForm, companyName: e.target.value })}
                        className={inputCls} readOnly={roField} />
                    </div>
                    <div>
                      <label className={labelCls}>Y-tunnus{companyReq}</label>
                      <input value={customerForm.businessId} onChange={(e) => setCustomerForm({ ...customerForm, businessId: e.target.value })}
                        placeholder="1234567-8" className={inputCls} readOnly={roField} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Etunimi{personReq}</label>
                    <input value={customerForm.firstName} onChange={(e) => setCustomerForm({ ...customerForm, firstName: e.target.value })}
                      className={inputCls} readOnly={roField} />
                  </div>
                  <div>
                    <label className={labelCls}>Sukunimi{personReq}</label>
                    <input value={customerForm.lastName} onChange={(e) => setCustomerForm({ ...customerForm, lastName: e.target.value })}
                      className={inputCls} readOnly={roField} />
                  </div>
                  <div>
                    <label className={labelCls}>Sähköposti{personReq}</label>
                    <input type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                      className={inputCls} readOnly={roField} />
                  </div>
                  <div>
                    <label className={labelCls}>Puhelin{personReq}</label>
                    <input value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                      className={inputCls} readOnly={roField} />
                  </div>
                  <div>
                    <label className={labelCls}>Postinumero</label>
                    <input value={customerForm.postalCode} onChange={(e) => setCustomerForm({ ...customerForm, postalCode: e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Osoite *</label>
                    <input value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                      className={inputCls} />
                  </div>
                </div>
                {!isCompany && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Yrityksen nimi</label>
                      <input value={customerForm.companyName} onChange={(e) => setCustomerForm({ ...customerForm, companyName: e.target.value })}
                        placeholder="Valinnainen" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Y-tunnus</label>
                      <input value={customerForm.businessId} onChange={(e) => setCustomerForm({ ...customerForm, businessId: e.target.value })}
                        placeholder="1234567-8" className={inputCls} />
                    </div>
                  </div>
                )}
              </div>
              );
            })()}
          </div>

          <div className="flex justify-center pt-4">
            <button
              disabled={!canProceedStep0}
              onClick={() => setStep(1)}
              className="px-6 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 min-h-[44px]"
            >
              Seuraava
            </button>
          </div>
        </div>
      )}

      {/* ──── STEP 1: Services & Products ──── */}
      {step === 1 && (
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
          canProceed={canProceedStep1}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}

      {/* ──── STEP 2: Finalization ──── */}
      {step === 2 && (
        <div className="max-w-2xl space-y-6">
          {/* Summary */}
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
            <h3 className="font-semibold text-text-primary text-sm">Yhteenveto</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Asiakas</p>
                <p className="font-medium text-text-primary">
                  {customerForm.companyName || `${customerForm.firstName} ${customerForm.lastName}`.trim() || "—"}
                </p>
                <p className="text-xs text-text-muted">{customerForm.email || customerForm.phone || customerForm.businessId || ""}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Tekijä(t)</p>
                <p className="font-medium text-text-primary">
                  {selectedInstallerIds.map((id) => {
                    const emp = allEmployees?.find((e) => e.id === id);
                    return emp ? `${emp.first_name} ${emp.last_name}` : "";
                  }).filter(Boolean).join(", ")}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Ajankohta</p>
                <p className="font-medium text-text-primary">{gigDate} klo {gigTime}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Osoite</p>
                <p className="font-medium text-text-primary">{formatAddress(customerForm.address, customerForm.postalCode)}</p>
              </div>
            </div>
            {/* Price breakdown */}
            <div className="border-t border-border pt-3 mt-3 space-y-1.5">
              {selectedServices.map((s) => {
                const qty = serviceQty[s.id] || 1;
                return (
                  <div key={s.id} className="flex justify-between text-sm">
                    <span className="text-text-secondary">{s.name}{qty > 1 && ` × ${qty}`}</span>
                    <span className="font-medium text-text-primary">{formatCents(getUnitPriceCents(s, qty) * qty)}</span>
                  </div>
                );
              })}
              {selectedAddonList.map((a) => (
                <div key={a.id} className="flex justify-between text-sm">
                  <span className="text-text-secondary">{a.name}{(selectedAddons[a.id] || 1) > 1 && ` × ${selectedAddons[a.id]}`}</span>
                  <span className="font-medium text-text-primary">{formatCents(a.price_cents * (selectedAddons[a.id] || 1))}</span>
                </div>
              ))}
              {selectedProductList.map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-text-secondary">{p.brand ? `${p.brand} ` : ""}{p.name}{(selectedProducts[p.id] || 1) > 1 && ` × ${selectedProducts[p.id]}`}</span>
                  <span className="font-medium text-text-primary">{formatCents(p.price_cents * (selectedProducts[p.id] || 1))}</span>
                </div>
              ))}
              {parsedExtras.map((e, i) => (
                <div key={`extra-${i}`} className="flex justify-between text-sm">
                  <span className="text-text-secondary">{e.name}</span>
                  <span className="font-medium text-text-primary">{formatCents(e.price_cents)}</span>
                </div>
              ))}
              {discountAmountCents > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-500">Alennus</span>
                  <span className="font-medium text-red-500">-{formatCents(discountAmountCents)}</span>
                </div>
              )}
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-semibold text-text-primary">Yhteensä</span>
                <span className="font-bold text-lg text-accent-dark">{formatCents(finalPriceCents)}</span>
              </div>
            </div>
          </div>

          {/* Payment status — direct, no "standard/modify" choice */}
          <div className="bg-surface rounded-2xl border border-border p-5">
            <h3 className="font-semibold text-text-primary mb-4 text-sm">Maksutilanne *</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentStatus("paid")}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  paymentStatus === "paid" ? "border-accent bg-accent-muted" : "border-border hover:border-accent"
                }`}
              >
                <div className="text-xl mb-1">💳</div>
                <h4 className="font-semibold text-sm text-text-primary">Maksettu</h4>
                <p className="text-xs text-text-muted">Asiakas on maksanut</p>
              </button>
              <button
                onClick={() => { setPaymentStatus("unpaid"); setSendReceipt(false); }}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  paymentStatus === "unpaid" ? "border-red-300 bg-red-50" : "border-border hover:border-red-300"
                }`}
              >
                <div className="text-xl mb-1">⏳</div>
                <h4 className="font-semibold text-sm text-text-primary">Ei maksettu</h4>
                <p className="text-xs text-text-muted">Laskutetaan jälkikäteen</p>
              </button>
            </div>
          </div>

          {/* Customer satisfaction */}
          <div className="bg-surface rounded-2xl border border-border p-5">
            <h3 className="font-semibold text-text-primary mb-4 text-sm">Asiakastyytyväisyys *</h3>
            <div className="flex flex-wrap gap-3 justify-center">
              {([
                { value: "unhappy" as const, emoji: "😞", label: "Huono" },
                { value: "neutral" as const, emoji: "😐", label: "Ok" },
                { value: "happy" as const, emoji: "🤩", label: "Erinomainen" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSatisfaction(opt.value)}
                  className={`flex flex-col items-center gap-2 px-5 py-4 rounded-2xl border-2 transition-all ${
                    satisfaction === opt.value
                      ? opt.value === "happy"
                        ? "border-accent bg-accent-muted"
                        : opt.value === "neutral"
                        ? "border-amber-300 bg-amber-50"
                        : "border-red-300 bg-red-50"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  <span className="text-3xl">{opt.emoji}</span>
                  <span className="text-xs font-medium text-text-secondary">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Receipt toggle — only when paid */}
          {paymentStatus === "paid" && (
            <div className="bg-surface rounded-2xl border border-border p-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-10 h-6 rounded-full transition-colors relative ${sendReceipt ? "bg-accent" : "bg-border"}`}
                  onClick={() => setSendReceipt(!sendReceipt)}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sendReceipt ? "translate-x-4.5" : "translate-x-0.5"}`} />
                </div>
                <span className="text-sm font-medium text-text-primary">Lähetä sähköpostikuitti asiakkaalle</span>
              </label>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={labelCls}>Lisätiedot</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} placeholder="Vapaaehtoinen" />
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

          {/* Discount */}
          <div>
            <label className={labelCls}>Alennuskoodi</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={discountCode}
                onChange={(e) => { setDiscountCode(e.target.value); setDiscountValid(false); setDiscountError(""); }}
                placeholder="KOODI123"
                className={`${inputCls} flex-1`}
              />
              <button onClick={validateDiscountCode} className="px-4 py-2.5 bg-surface border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap">
                Tarkista
              </button>
            </div>
            {discountValid && <p className="text-xs text-green-600 mt-1 font-medium">Koodi hyväksytty!</p>}
            {discountError && <p className="text-xs text-red-500 mt-1">{discountError}</p>}
          </div>

          <div>
            <label className={labelCls}>Manuaalinen alennus (€)</label>
            <input
              type="number"
              step="0.01"
              value={manualDiscountCents}
              onChange={(e) => setManualDiscountCents(e.target.value)}
              placeholder="0.00"
              className={`${inputCls} max-w-[200px]`}
            />
          </div>

          {/* Contract offer */}
          {showContractOffer && (
            <div className="bg-surface rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FileSignature className="w-5 h-5 text-accent-dark" />
                  <h3 className="font-semibold text-text-primary text-sm">Sopimus</h3>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    className={`w-10 h-6 rounded-full transition-colors relative ${offerContract ? "bg-accent" : "bg-border"}`}
                    onClick={() => {
                      setOfferContract(!offerContract);
                      if (!offerContract) {
                        setSignedByName(`${customerForm.firstName} ${customerForm.lastName}`.trim());
                      } else {
                        setSelectedContractTemplate(null);
                        sigPadRef.current = null;
                      }
                    }}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${offerContract ? "translate-x-4.5" : "translate-x-0.5"}`} />
                  </div>
                  <span className="text-sm font-medium text-text-primary">Tarjoa</span>
                </label>
              </div>

              {offerContract && !selectedContractTemplate && (
                <div className="space-y-4">
                  {matchingTemplates.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Suositellut</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {matchingTemplates.map((t) => (
                          <TemplateCard key={t.id} template={t} recommended onSelect={() => {
                            setSelectedContractTemplate(t);
                            fetchPdfPreview(t);
                            setTimeout(initSignaturePad, 100);
                          }} />
                        ))}
                      </div>
                    </div>
                  )}
                  {otherTemplates.length > 0 && (
                    <div>
                      <button onClick={() => setShowAllTemplates(!showAllTemplates)} className="text-sm text-text-muted hover:text-text-primary transition-colors">
                        {showAllTemplates ? "Piilota muut" : `Näytä muut (${otherTemplates.length})`}
                      </button>
                      {showAllTemplates && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                          {otherTemplates.map((t) => (
                            <TemplateCard key={t.id} template={t} onSelect={() => {
                              setSelectedContractTemplate(t);
                              fetchPdfPreview(t);
                              setTimeout(initSignaturePad, 100);
                            }} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {matchingTemplates.length === 0 && otherTemplates.length > 0 && !showAllTemplates && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activeTemplates.map((t) => (
                        <TemplateCard key={t.id} template={t} onSelect={() => {
                          setSelectedContractTemplate(t);
                          fetchPdfPreview(t);
                          setTimeout(initSignaturePad, 100);
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {offerContract && selectedContractTemplate && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-accent-muted/50 rounded-xl p-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary text-sm">{selectedContractTemplate.name}</p>
                      <p className="text-xs text-text-muted">
                        {intervalLabel(selectedContractTemplate.visit_interval_months)}
                      </p>
                      <p className="text-lg font-bold text-accent-dark mt-1">{formatCents(selectedContractTemplate.contract_price_cents)} / {billingLabel(selectedContractTemplate.billing_interval_months)}</p>
                    </div>
                    {!contractSigned && (
                      <button onClick={() => { setSelectedContractTemplate(null); setPdfPreviewUrl(null); sigPadRef.current = null; }}
                        className="text-xs text-text-muted hover:text-text-primary transition-colors">Vaihda</button>
                    )}
                  </div>

                  {/* PDF preview */}
                  <div>
                    <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Sopimuksen esikatselu</label>
                    {pdfLoading ? (
                      <div className="border border-border rounded-xl bg-surface-hover flex items-center justify-center h-[300px] sm:h-[500px]">
                        <div className="text-center">
                          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-sm text-text-muted">Luodaan esikatselua...</p>
                        </div>
                      </div>
                    ) : pdfPreviewUrl ? (
                      <>
                        <a
                          href={pdfPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sm:hidden w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-accent text-accent font-semibold text-sm hover:bg-accent/5 transition-colors"
                        >
                          <FileSignature className="w-4 h-4" />
                          Avaa sopimus PDF
                        </a>
                        <iframe
                          src={pdfPreviewUrl}
                          className="hidden sm:block w-full border border-border rounded-xl h-[500px]"
                          title="Sopimuksen esikatselu"
                        />
                      </>
                    ) : (
                      <div className="border border-border rounded-xl bg-surface-hover flex flex-col items-center justify-center gap-3 p-6 h-[200px]">
                        <p className="text-sm text-text-muted">Esikatselua ei voitu ladata</p>
                        {pdfPreviewError && (
                          <p className="text-xs text-red-500">{pdfPreviewError}</p>
                        )}
                        {selectedContractTemplate && (
                          <button
                            onClick={() => fetchPdfPreview(selectedContractTemplate)}
                            className="text-sm font-medium text-accent hover:text-accent-dark transition-colors"
                          >
                            Yritä uudelleen
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {contractSigned ? (
                    <div className="bg-accent-muted/50 border border-accent/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-text-primary text-sm">Sopimus allekirjoitettu</p>
                          <p className="text-xs text-text-muted truncate">{signedByName}</p>
                        </div>
                      </div>
                      <div className="sm:ml-auto flex items-center gap-3">
                        <button onClick={() => { setContractSigned(false); setSignatureData(null); setTimeout(initSignaturePad, 100); }}
                          className="text-xs text-text-muted hover:text-text-primary transition-colors">Muokkaa</button>
                        <button onClick={() => { setContractSigned(false); setSignatureData(null); setSelectedContractTemplate(null); setPdfPreviewUrl(null); sigPadRef.current = null; }}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors">Poista</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Allekirjoittajan nimi</label>
                        <input type="text" value={signedByName} onChange={(e) => setSignedByName(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Allekirjoitus</label>
                        <div className="border border-border rounded-xl overflow-hidden bg-white">
                          <canvas ref={canvasRef} className="w-full" style={{ height: "140px", touchAction: "none" }} />
                        </div>
                        <button onClick={() => sigPadRef.current?.clear()} className="mt-1 text-xs text-text-muted hover:text-text-primary transition-colors">Tyhjennä</button>
                      </div>
                      <button
                        onClick={() => {
                          if (!signedByName.trim()) { setSubmitError("Allekirjoittajan nimi puuttuu"); return; }
                          if (sigPadRef.current?.isEmpty()) { setSubmitError("Allekirjoitus puuttuu"); return; }
                          setSubmitError("");
                          const sigData = sigPadRef.current?.toDataURL("image/png") || "";
                          setSignatureData(sigData);
                          setContractSigned(true);
                          if (selectedContractTemplate) {
                            fetchPdfPreview(selectedContractTemplate, { name: signedByName.trim(), data: sigData });
                          }
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors"
                      >
                        <FileSignature className="w-4 h-4" /> Hyväksy allekirjoitus
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            <button onClick={() => setStep(1)} className="px-6 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors min-h-[44px]">
              Takaisin
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Tallennetaan...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Tallenna & viimeistele
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Template card component ───
function TemplateCard({
  template: t,
  recommended,
  onSelect,
}: {
  template: ContractTemplate;
  recommended?: boolean;
  onSelect: () => void;
}) {
  const savings = t.regular_price_cents - t.contract_price_cents;
  const savingsPercent = t.regular_price_cents > 0
    ? Math.round((savings / t.regular_price_cents) * 100)
    : 0;

  return (
    <button
      onClick={onSelect}
      className={`p-5 bg-surface rounded-2xl border-2 transition-all text-left relative ${
        recommended ? "border-accent/40 hover:border-accent" : "border-border hover:border-accent"
      }`}
    >
      {recommended && (
        <span className="absolute -top-2.5 left-4 px-2.5 py-0.5 bg-accent text-white text-[10px] font-bold uppercase tracking-wider rounded-full">
          Suositeltu
        </span>
      )}
      <h4 className="font-semibold text-text-primary text-sm mb-1">{t.name}</h4>
      {t.services && <p className="text-xs text-text-muted mb-2">{t.services.name}</p>}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xl font-bold text-accent-dark">{formatCents(t.contract_price_cents)}</span>
        <span className="text-sm text-text-muted line-through">{formatCents(t.regular_price_cents)}</span>
      </div>
      {savings > 0 && (
        <p className="text-sm text-accent-dark font-semibold mb-2">Säästö {formatCents(savings)} ({savingsPercent}%)</p>
      )}
      <p className="text-xs text-text-muted">
        {intervalLabel(t.visit_interval_months)} · {formatCents(t.contract_price_cents)} / {billingLabel(t.billing_interval_months)}
      </p>
    </button>
  );
}
