import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileSignature } from "lucide-react";
import { useBookingByNumber } from "@/hooks/useBookings";
import { useBookingLineItems } from "@/hooks/useBookingLineItems";
import { useProtocolsByBooking } from "@/hooks/useProtocols";
import {
  useContractTemplates,
  useCustomerContracts,
} from "@/hooks/useContracts";
import { useServices } from "@/hooks/useServices";
import { useAddonServices, useAddonsByService } from "@/hooks/useAddonServices";
import { useProducts } from "@/hooks/useProducts";
import { useServiceVariants } from "@/hooks/useServiceVariants";
import { getFreshToken } from "@/lib/supabase";
import { formatCents, formatDate, getUnitPriceCents, getTierUnitPrices, PLAN_LABELS, intervalLabel, billingLabel } from "@/lib/utils";
import type { PaymentStatus, CustomerSatisfaction, ContractTemplate, ContractDurationTier } from "@/lib/types";
import { ServiceSelectionStep } from "@/components/booking-wizard/steps/ServiceSelectionStep";
import type { ExtraItemForm } from "@/components/booking-wizard/types";
import SignaturePad from "signature_pad";
import { inputCls } from "@/lib/constants";

type FinalizeStep = 0 | 1 | 2 | 3;
type PathType = "standard" | "modify";

function templateTiers(t: ContractTemplate): ContractDurationTier[] {
  return Array.isArray(t.duration_tiers) && t.duration_tiers.length > 0
    ? [...t.duration_tiers].sort((a, b) => a.months - b.months)
    : [{
        months: t.duration_months,
        contract_price_cents: t.contract_price_cents,
        regular_price_cents: t.regular_price_cents,
      }];
}

function tierMonthsLabel(m: number) {
  return m % 12 === 0 ? `${m / 12} v` : `${m} kk`;
}

export default function InstallerFinalizeBooking() {
  const { bookingNumber } = useParams<{ bookingNumber: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const parsedNumber = bookingNumber ? parseInt(bookingNumber, 10) : undefined;
  const { data: booking, isLoading } = useBookingByNumber(parsedNumber);
  const { data: allServices } = useServices();
  const { data: allAddons } = useAddonServices();
  const { data: allProducts } = useProducts();
  const primaryServiceId = booking?.service_id || "";
  const { data: linkedAddons } = useAddonsByService(primaryServiceId || undefined);
  const { data: serviceVariants } = useServiceVariants(primaryServiceId || undefined);
  const { data: contractTemplates } = useContractTemplates();
  const { data: customerContracts } = useCustomerContracts(booking?.customer_id);
  const { data: existingLineItems } = useBookingLineItems(booking?.id);
  const { data: protocols = [] } = useProtocolsByBooking(booking?.id);
  const hasCompletedProtocol = protocols.length > 0 && protocols.every((p) => p.status === "completed");

  const [step, setStep] = useState<FinalizeStep>(0);
  const [path, setPath] = useState<PathType | null>(null);

  // Step 1 — extras (full service selection)
  const [addedServiceQty, setAddedServiceQty] = useState<Record<string, number>>({});
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});
  const [productSearch, setProductSearch] = useState("");
  const [showAllAddons, setShowAllAddons] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [extraItems, setExtraItems] = useState<ExtraItemForm[]>([]);

  // Pre-populate state from existing line items so volume pricing works correctly
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (initialized || !existingLineItems?.length) return;
    setInitialized(true);

    const svcQty: Record<string, number> = {};
    const addonQty: Record<string, number> = {};
    const prodQty: Record<string, number> = {};
    const customs: ExtraItemForm[] = [];

    for (const li of existingLineItems) {
      if (li.line_type === "service" && booking?.service_id) {
        svcQty[booking.service_id] = (svcQty[booking.service_id] || 0) + li.quantity;
      } else if (li.line_type === "addon_service" && li.addon_service_id) {
        addonQty[li.addon_service_id] = (addonQty[li.addon_service_id] || 0) + li.quantity;
      } else if (li.line_type === "product" && li.product_id) {
        prodQty[li.product_id] = (prodQty[li.product_id] || 0) + li.quantity;
      } else if (li.line_type === "custom") {
        customs.push({
          name: li.name,
          price: String(li.price_cents / 100),
          duration: String(li.duration_minutes || 0),
          materialCost: String((li.material_cost_cents || 0) / 100),
        });
      }
    }

    setAddedServiceQty(svcQty);
    setSelectedAddons(addonQty);
    setSelectedProducts(prodQty);
    if (customs.length) setExtraItems(customs);
  }, [existingLineItems, booking?.service_id, initialized]);

  // Step 2 — payment
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);

  // Step 3 — finalization
  const [satisfaction, setSatisfaction] = useState<CustomerSatisfaction | null>(null);
  const [sendReceipt, setSendReceipt] = useState(true);
  const [sendProtocol, setSendProtocol] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [manualDiscountEur, setManualDiscountEur] = useState("");
  const [manualDiscountReason, setManualDiscountReason] = useState("");

  // Contract offer
  const [selectedContractTemplate, setSelectedContractTemplate] = useState<ContractTemplate | null>(null);
  const [selectedContractTier, setSelectedContractTier] = useState<ContractDurationTier | null>(null);
  const [contractDeviceCount, setContractDeviceCount] = useState<number>(1);
  const [signedByName, setSignedByName] = useState("");
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [offerContract, setOfferContract] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [contractSigned, setContractSigned] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  const hasActiveContractForService = useMemo(
    () => (customerContracts || []).some(
      (c) => (c.status === "active" || c.status === "expiring") && c.service_id === booking?.service_id
    ),
    [customerContracts, booking?.service_id]
  );
  const activeTemplates = useMemo(
    () => (contractTemplates || []).filter((t) => t.active),
    [contractTemplates]
  );
  const matchingTemplates = useMemo(
    () => activeTemplates.filter((t) => t.service_id === booking?.service_id),
    [activeTemplates, booking?.service_id]
  );
  const otherTemplates = useMemo(
    () => activeTemplates.filter((t) => t.service_id !== booking?.service_id),
    [activeTemplates, booking?.service_id]
  );

  const pickContractTemplate = useCallback((t: ContractTemplate) => {
    const tiers = templateTiers(t);
    setSelectedContractTemplate(t);
    setContractDeviceCount(t.device_count || 1);
    if (tiers.length === 1) {
      setSelectedContractTier(tiers[0]);
    } else {
      setSelectedContractTier(null);
    }
  }, []);

  const contractUnitPrices = (selectedContractTier && contractDeviceCount > 0)
    ? getTierUnitPrices(selectedContractTier, contractDeviceCount)
    : null;
  const contractTotalCents = contractUnitPrices
    ? contractUnitPrices.contract_price_cents * contractDeviceCount
    : 0;

  const fetchPdfPreview = useCallback(async (
    template: ContractTemplate,
    sig?: { name: string; data: string },
    tier?: ContractDurationTier | null,
    deviceCount?: number,
  ) => {
    if (!booking?.customers) return;
    setPdfLoading(true);
    setPdfPreviewUrl(null);
    setPdfPreviewError(null);
    try {
      const { previewContractPdf } = await import("@/lib/chromiumPdf");
      const qty = Math.max(1, deviceCount || template.device_count || 1);
      let totalContract = template.contract_price_cents;
      let totalRegular = template.regular_price_cents;
      let durationMonths = template.duration_months;
      if (tier) {
        const unit = getTierUnitPrices(tier, qty);
        totalContract = unit.contract_price_cents * qty;
        totalRegular = unit.regular_price_cents * qty;
        durationMonths = tier.months;
      }
      const url = await previewContractPdf(
        {
          ...template,
          contract_price_cents: totalContract,
          regular_price_cents: totalRegular,
          duration_months: durationMonths,
          device_count: qty,
          services: template.services,
          service_name: template.services?.name,
        },
        booking.customers,
        { address: booking.address, postal_code: booking.postal_code },
        sig || null,
      );
      setPdfPreviewUrl(url);
    } catch (err) {
      console.error("PDF preview failed:", err);
      setPdfPreviewError(err instanceof Error ? err.message : "Tuntematon virhe");
    } finally {
      setPdfLoading(false);
    }
  }, [booking]);

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

  const activeServices = useMemo(
    () => (allServices || []).filter((s) => s.active),
    [allServices]
  );

  interface FinalizeLineItem {
    name: string;
    price_cents: number;
    quantity: number;
    duration_minutes: number;
    material_cost_cents: number;
    line_type: string;
    addon_service_id?: string;
    product_id?: string;
    service_id?: string;
    variant_id?: string;
  }

  const parsedLineItems: FinalizeLineItem[] = useMemo(() => {
    const items: FinalizeLineItem[] = [];
    for (const [serviceId, qty] of Object.entries(addedServiceQty)) {
      if (qty <= 0) continue;
      const svc = activeServices.find((s) => s.id === serviceId);
      if (!svc) continue;
      items.push({
        name: svc.name,
        price_cents: getUnitPriceCents(svc, qty),
        quantity: qty,
        duration_minutes: svc.duration_minutes,
        material_cost_cents: svc.material_cost_cents,
        line_type: "service",
        service_id: serviceId,
        variant_id: serviceId === primaryServiceId && selectedVariantId ? selectedVariantId : undefined,
      });
    }
    for (const [addonId, qty] of Object.entries(selectedAddons)) {
      if (qty <= 0) continue;
      const addon = (allAddons || []).find((a) => a.id === addonId);
      if (!addon) continue;
      items.push({
        name: addon.name,
        price_cents: addon.price_cents,
        quantity: qty,
        duration_minutes: addon.duration_minutes,
        material_cost_cents: addon.material_cost_cents,
        line_type: "addon_service",
        addon_service_id: addonId,
      });
    }
    for (const [productId, qty] of Object.entries(selectedProducts)) {
      if (qty <= 0) continue;
      const prod = (allProducts || []).find((p: any) => p.id === productId);
      if (!prod) continue;
      items.push({
        name: prod.name,
        price_cents: prod.price_cents,
        quantity: qty,
        duration_minutes: 0,
        material_cost_cents: prod.price_cents,
        line_type: "product",
        product_id: productId,
      });
    }
    for (const item of extraItems) {
      if (!item.name.trim()) continue;
      items.push({
        name: item.name.trim(),
        price_cents: Math.round(parseFloat(item.price || "0") * 100),
        quantity: 1,
        duration_minutes: parseInt(item.duration || "0", 10) || 0,
        material_cost_cents: Math.round(parseFloat(item.materialCost || "0") * 100),
        line_type: "custom",
      });
    }
    return items;
  }, [addedServiceQty, selectedAddons, selectedProducts, extraItems, activeServices, allAddons, allProducts, primaryServiceId, selectedVariantId]);


  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-border rounded w-32" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  if (!booking) {
    return <p className="text-text-muted">Varausta ei löytynyt</p>;
  }

  // RLS on the bookings table guarantees we only loaded this row if the user
  // can see it (own booking, on the team, or shares an employee_team with the
  // primary). No further client-side gating needed — matches InstallerBookingDetail.

  const extrasCostCents = parsedLineItems.reduce((sum, e) => sum + e.price_cents * e.quantity, 0);
  const originalPrice = booking.price_cents || 0;
  const manualDiscountCents = Math.round(parseFloat(manualDiscountEur || "0") * 100);
  // Standard path: keep original price. Modify path: recalculate from line items.
  const subtotalPrice = path === "modify" ? extrasCostCents : originalPrice;
  const finalPrice = Math.max(0, subtotalPrice - manualDiscountCents);

  const customerName = booking.customers
    ? `${booking.customers.first_name} ${booking.customers.last_name}`
    : "–";
  const serviceName = booking.services?.name || (booking.plan && PLAN_LABELS[booking.plan]) || "–";

  function goToStep(s: FinalizeStep) {
    setStep(s);
  }

  function handlePathSelect(p: PathType) {
    setPath(p);
    if (p === "standard") {
      setStep(2);
    } else {
      setStep(1);
    }
  }

  async function handleSubmit() {
    if (!booking || !paymentStatus) return;
    setSubmitError("");
    setSubmitting(true);

    try {
      // If contract selected, must be signed first
      if (selectedContractTemplate && !contractSigned) {
        setSubmitError("Allekirjoita sopimus ensin");
        setSubmitting(false);
        return;
      }

      // Centralized Edge Function handles all finalization logic
      const tierForContract = selectedContractTier
        ?? (selectedContractTemplate ? templateTiers(selectedContractTemplate)[0] : null);
      const qtyForContract = Math.max(1, contractDeviceCount || 1);
      const unitForContract = tierForContract ? getTierUnitPrices(tierForContract, qtyForContract) : null;
      const totalCentsForContract = unitForContract
        ? unitForContract.contract_price_cents * qtyForContract
        : 0;
      const contractInput = (selectedContractTemplate && tierForContract && contractSigned && signatureData)
        ? {
            template_id: selectedContractTemplate.id,
            service_id: selectedContractTemplate.service_id,
            frequency: selectedContractTemplate.frequency,
            visit_months: selectedContractTemplate.visit_months,
            visit_interval_months: selectedContractTemplate.visit_interval_months,
            billing_interval_months: selectedContractTemplate.billing_interval_months,
            contract_price_cents: totalCentsForContract,
            duration_months: tierForContract.months,
            device_count: qtyForContract,
            auto_renew: selectedContractTemplate.auto_renew,
            cancellation_notice_days: selectedContractTemplate.cancellation_notice_days,
            signature_data: signatureData,
            signed_by_name: signedByName,
            signature_method: "on_site",
          }
        : undefined;

      // Debug: test with minimal fetch
      const token = await getFreshToken();

      // Step 1: test OPTIONS preflight manually
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finalize-booking`;
      let res: Response;
      try {
        res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            booking_id: booking.id,
            payment_status: paymentStatus,
            price_cents: finalPrice,
            customer_satisfaction: satisfaction,
            send_receipt: paymentStatus === "paid" ? sendReceipt : false,
            send_protocol: hasCompletedProtocol ? sendProtocol : false,
            replace_line_items: path === "modify" && parsedLineItems.length > 0 ? parsedLineItems : undefined,
            contract: contractInput,
            manual_discount_cents: manualDiscountCents > 0 ? manualDiscountCents : 0,
            manual_discount_reason: manualDiscountCents > 0 ? manualDiscountReason || null : null,
          }),
        });
      } catch (fetchErr: any) {
        throw new Error(`fetch failed: ${fetchErr?.name} ${fetchErr?.message} | origin: ${window.location.origin} | url: ${fnUrl}`);
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      queryClient.invalidateQueries({ queryKey: ["booking-by-number", booking.booking_number] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["installer-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking-line-items", booking.id] });
      navigate(`/tyontekija/varaukset/${booking.booking_number}`);
    } catch (err: any) {
      setSubmitError(err.message || "Virhe viimeistelyssä");
      setSubmitting(false);
    }
  }

  const stepLabels = path === "modify"
    ? ["Polku", "Muokkaa", "Maksu", "Yhteenveto"]
    : ["Polku", "Maksu", "Yhteenveto"];

  const displayStep = path === "modify"
    ? step
    : step === 0 ? 0 : step === 2 ? 1 : 2;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <Link
          to={`/tyontekija/varaukset/${booking.booking_number}`}
          className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-bold text-text-primary">
          Viimeistely #{booking.booking_number}
        </h1>
      </div>

      {/* Step indicator */}
      {step > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {stepLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className="w-4 sm:w-8 h-px bg-border" />}
              <div
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  displayStep === i
                    ? "bg-brand text-white"
                    : displayStep > i
                    ? "bg-accent-muted text-accent-dark"
                    : "bg-surface text-text-muted border border-border"
                }`}
              >
                {displayStep > i && <Check className="w-3 h-3" />}
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 0 — Path selection */}
      {step === 0 && (
        <div className="space-y-4">
          {/* Booking summary */}
          <div className="bg-surface rounded-xl border border-border p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-text-muted">Asiakas</p>
                <p className="font-medium text-text-primary">{customerName}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Palvelu</p>
                <p className="font-medium text-text-primary">{serviceName}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Aika</p>
                <p className="font-medium text-text-primary">{formatDate(booking.booking_date)} klo {booking.time_slot?.slice(0, 5)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Hinta</p>
                <p className="font-bold text-text-primary">{formatCents(booking.price_cents)}</p>
              </div>
              {booking.address && (
                <div className="col-span-2">
                  <p className="text-xs text-text-muted">Osoite</p>
                  <p className="font-medium text-text-primary">{booking.address}{booking.postal_code ? `, ${booking.postal_code}` : ""}</p>
                </div>
              )}
              {booking.customers?.email && (
                <div>
                  <p className="text-xs text-text-muted">Sähköposti</p>
                  <p className="font-medium text-text-primary text-xs">{booking.customers.email}</p>
                </div>
              )}
              {booking.customers?.phone && (
                <div>
                  <p className="text-xs text-text-muted">Puhelin</p>
                  <p className="font-medium text-text-primary">{booking.customers.phone}</p>
                </div>
              )}
            </div>
            {(existingLineItems || []).length > 0 && (
              <p className="text-xs text-text-muted mt-2 pt-2 border-t border-border">
                Lisätyöt: {(existingLineItems || []).map((li) => li.name).join(", ")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handlePathSelect("standard")}
              className="p-4 bg-surface rounded-xl border-2 border-border hover:border-accent transition-all text-left"
            >
              <div className="text-xl mb-1">✅</div>
              <h3 className="font-semibold text-sm text-text-primary">Vakiokeikka</h3>
              <p className="text-xs text-text-muted mt-0.5">Ei muutoksia</p>
            </button>
            <button
              onClick={() => handlePathSelect("modify")}
              className="p-4 bg-surface rounded-xl border-2 border-border hover:border-accent transition-all text-left"
            >
              <div className="text-xl mb-1">✏️</div>
              <h3 className="font-semibold text-sm text-text-primary">Muokkaa</h3>
              <p className="text-xs text-text-muted mt-0.5">Lisää veloituksia</p>
            </button>
          </div>
        </div>
      )}

      {/* Step 1 — Modify */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Service selection — pre-populated from existing line items */}
          <ServiceSelectionStep
            allServices={allServices}
            allAddons={allAddons}
            allProducts={allProducts}
            linkedAddons={linkedAddons}
            serviceVariants={serviceVariants}
            serviceQty={addedServiceQty}
            setServiceQty={setAddedServiceQty}
            selectedVariantId={selectedVariantId}
            setSelectedVariantId={setSelectedVariantId}
            selectedAddons={selectedAddons}
            setSelectedAddons={setSelectedAddons}
            selectedProducts={selectedProducts}
            setSelectedProducts={setSelectedProducts}
            productSearch={productSearch}
            setProductSearch={setProductSearch}
            showAllAddons={showAllAddons}
            setShowAllAddons={setShowAllAddons}
            showAllServices={showAllServices}
            setShowAllServices={setShowAllServices}
            showProductPicker={showProductPicker}
            setShowProductPicker={setShowProductPicker}
            extraItems={extraItems}
            setExtraItems={setExtraItems}
            subtotalCents={finalPrice}
            totalDuration={0}
            canProceed={true}
            onBack={() => goToStep(0)}
            onNext={() => goToStep(2)}
          />
        </div>
      )}

      {/* Step 2 — Payment status */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <p className="text-sm text-text-muted">
              Lopullinen hinta: <span className="font-bold text-text-primary text-base">{formatCents(finalPrice)}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setPaymentStatus("paid"); goToStep(3); }}
              className={`p-5 rounded-xl border-2 transition-all text-left ${
                paymentStatus === "paid"
                  ? "border-accent bg-accent-muted"
                  : "border-border hover:border-accent"
              }`}
            >
              <div className="text-xl mb-1">💳</div>
              <h3 className="font-semibold text-sm text-text-primary">Maksettu</h3>
              <p className="text-xs text-text-muted mt-0.5">Asiakas on maksanut</p>
            </button>
            <button
              onClick={() => { setPaymentStatus("unpaid"); setSendReceipt(false); goToStep(3); }}
              className={`p-5 rounded-xl border-2 transition-all text-left ${
                paymentStatus === "unpaid"
                  ? "border-red-300 bg-red-50"
                  : "border-border hover:border-red-300"
              }`}
            >
              <div className="text-xl mb-1">⏳</div>
              <h3 className="font-semibold text-sm text-text-primary">Ei maksettu</h3>
              <p className="text-xs text-text-muted mt-0.5">Laskutetaan jälkikäteen</p>
            </button>
          </div>
          <button
            onClick={() => goToStep(path === "modify" ? 1 : 0)}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Takaisin
          </button>
        </div>
      )}

      {/* Step 3 — Summary */}
      {step === 3 && booking && (
        <div className="space-y-5">
          {/* Yhteenveto */}
          <div className="bg-surface rounded-2xl border border-border p-5">
            <h2 className="font-semibold text-text-primary mb-4">Yhteenveto</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Asiakas</p>
                <p className="font-medium text-text-primary">{customerName}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Palvelu</p>
                <p className="font-medium text-text-primary">{serviceName}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Päivämäärä</p>
                <p className="font-medium text-text-primary">{formatDate(booking.booking_date)}</p>
              </div>
            </div>
          </div>

          {/* Hintaerittely */}
          <div className="bg-surface rounded-2xl border border-border p-5">
            <h2 className="font-semibold text-text-primary mb-4">Hintaerittely</h2>
            <div className="space-y-2 text-sm">
              {initialized ? (
                parsedLineItems.map((li, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-text-secondary">{li.name}{li.quantity > 1 ? ` × ${li.quantity}` : ""}</span>
                    <span className="font-medium">{formatCents(li.price_cents * li.quantity)}</span>
                  </div>
                ))
              ) : existingLineItems && existingLineItems.length > 0 ? (
                existingLineItems.map((li) => (
                  <div key={li.id} className="flex justify-between">
                    <span className="text-text-secondary">{li.name}{li.quantity > 1 ? ` × ${li.quantity}` : ""}</span>
                    <span className="font-medium">{formatCents(li.price_cents * li.quantity)}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between">
                  <span className="text-text-secondary">{serviceName}</span>
                  <span className="font-medium">{formatCents(originalPrice)}</span>
                </div>
              )}
              {manualDiscountCents > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Alennus{manualDiscountReason ? ` (${manualDiscountReason})` : ""}</span>
                  <span className="font-medium">-{formatCents(manualDiscountCents)}</span>
                </div>
              )}
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-semibold text-text-primary">Yhteensä</span>
                <span className="font-bold text-lg text-accent-dark">{formatCents(finalPrice)}</span>
              </div>
            </div>
          </div>

          {/* Alennus */}
          <div className="bg-surface rounded-2xl border border-border p-5">
            <h2 className="font-semibold text-text-primary mb-4">Alennus</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                  Summa (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualDiscountEur}
                  onChange={(e) => setManualDiscountEur(e.target.value)}
                  placeholder="0,00"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                  Syy
                </label>
                <input
                  type="text"
                  value={manualDiscountReason}
                  onChange={(e) => setManualDiscountReason(e.target.value)}
                  placeholder="esim. kanta-asiakas, reklamaatio..."
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Maksutila */}
          <div className="bg-surface rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">Maksutila</span>
              <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                paymentStatus === "paid"
                  ? "bg-accent-muted text-accent-dark"
                  : "bg-red-50 text-red-600"
              }`}>
                {paymentStatus === "paid" ? "Maksettu" : "Ei maksettu"}
              </span>
            </div>
          </div>

          {/* Asiakastyytyväisyys */}
          <div className="bg-surface rounded-2xl border border-border p-5">
            <h2 className="font-semibold text-text-primary mb-4">Asiakastyytyväisyys</h2>
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

          {/* Toggles */}
          {paymentStatus === "paid" && (
            <div className="bg-surface rounded-2xl border border-border p-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    sendReceipt ? "bg-accent" : "bg-border"
                  }`}
                  onClick={() => setSendReceipt(!sendReceipt)}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    sendReceipt ? "translate-x-4.5" : "translate-x-0.5"
                  }`} />
                </div>
                <span className="text-sm font-medium text-text-primary">Lähetä sähköpostikuitti asiakkaalle</span>
              </label>
            </div>
          )}
          {hasCompletedProtocol && (
            <div className="bg-surface rounded-2xl border border-border p-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    sendProtocol ? "bg-accent" : "bg-border"
                  }`}
                  onClick={() => setSendProtocol(!sendProtocol)}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    sendProtocol ? "translate-x-4.5" : "translate-x-0.5"
                  }`} />
                </div>
                <span className="text-sm font-medium text-text-primary">Lähetä pöytäkirja asiakkaalle</span>
              </label>
            </div>
          )}

          {/* Contract offer */}
          {activeTemplates.length > 0 && (
            <div className="bg-surface rounded-xl border border-border px-4 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FileSignature className="w-5 h-5 text-accent-dark flex-shrink-0" />
                  <div className="min-w-0">
                    <h2 className="font-semibold text-text-primary">Sopimus</h2>
                    <p className="text-xs text-text-muted">
                      {hasActiveContractForService
                        ? "Asiakkaalla on jo sopimus tälle palvelulle — voit silti luoda uuden"
                        : "Asiakkaalla ei ole voimassa olevaa sopimusta"}
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                  <div
                    className={`w-10 h-6 rounded-full transition-colors relative ${
                      offerContract ? "bg-accent" : "bg-border"
                    }`}
                    onClick={() => {
                      setOfferContract(!offerContract);
                      if (!offerContract) {
                        setSignedByName(
                          booking.customers
                            ? `${booking.customers.first_name} ${booking.customers.last_name}`
                            : ""
                        );
                      } else {
                        setSelectedContractTemplate(null);
                        setSelectedContractTier(null);
                        setContractDeviceCount(1);
                        sigPadRef.current = null;
                      }
                    }}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        offerContract ? "translate-x-4.5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                  <span className="text-sm font-medium text-text-primary">Tarjoa sopimusta</span>
                </label>
              </div>

              {offerContract && !selectedContractTemplate && (
                <div className="space-y-4">
                  {matchingTemplates.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                        Sopimukset palvelulle: {serviceName}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {matchingTemplates.map((t) => {
                          const tiers = templateTiers(t);
                          return (
                            <TemplateCard
                              key={t.id}
                              template={t}
                              recommended
                              onSelect={() => {
                                pickContractTemplate(t);
                                if (tiers.length === 1) {
                                  fetchPdfPreview(t, undefined, tiers[0], t.device_count || 1);
                                  setTimeout(initSignaturePad, 100);
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {otherTemplates.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowAllTemplates(!showAllTemplates)}
                        className="text-sm text-text-muted hover:text-text-primary transition-colors"
                      >
                        {showAllTemplates ? "Piilota muut sopimukset" : `Näytä muiden palveluiden sopimukset (${otherTemplates.length})`}
                      </button>
                      {showAllTemplates && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                          {otherTemplates.map((t) => {
                            const tiers = templateTiers(t);
                            return (
                              <TemplateCard
                                key={t.id}
                                template={t}
                                onSelect={() => {
                                  pickContractTemplate(t);
                                  if (tiers.length === 1) {
                                    fetchPdfPreview(t, undefined, tiers[0], t.device_count || 1);
                                    setTimeout(initSignaturePad, 100);
                                  }
                                }}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {matchingTemplates.length === 0 && otherTemplates.length > 0 && !showAllTemplates && (
                    <div>
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                        Saatavilla olevat sopimukset
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activeTemplates.map((t) => {
                          const tiers = templateTiers(t);
                          return (
                            <TemplateCard
                              key={t.id}
                              template={t}
                              onSelect={() => {
                                pickContractTemplate(t);
                                if (tiers.length === 1) {
                                  fetchPdfPreview(t, undefined, tiers[0], t.device_count || 1);
                                  setTimeout(initSignaturePad, 100);
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Selected template — tier picker (only when multi-tier and no tier yet) */}
              {offerContract && selectedContractTemplate && !selectedContractTier && (
                <div className="space-y-3 bg-surface rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary text-sm">{selectedContractTemplate.name}</p>
                      <p className="text-xs text-text-muted mt-0.5">Valitse sopimuskauden pituus</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedContractTemplate(null);
                        setSelectedContractTier(null);
                        setContractDeviceCount(1);
                        setPdfPreviewUrl(null);
                      }}
                      className="text-xs text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
                    >
                      Vaihda malli
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {templateTiers(selectedContractTemplate).map((tier) => {
                      const tierSavings = tier.regular_price_cents - tier.contract_price_cents;
                      return (
                        <button
                          key={tier.months}
                          onClick={() => {
                            setSelectedContractTier(tier);
                            fetchPdfPreview(selectedContractTemplate, undefined, tier, contractDeviceCount);
                            setTimeout(initSignaturePad, 100);
                          }}
                          className="p-3 bg-surface rounded-xl border-2 border-border hover:border-accent transition-all text-left"
                        >
                          <p className="text-[11px] text-text-muted uppercase tracking-wide">
                            {tierMonthsLabel(tier.months)}
                          </p>
                          <p className="text-lg font-bold text-accent-dark leading-tight">
                            {formatCents(tier.contract_price_cents)}
                          </p>
                          {tierSavings > 0 && (
                            <p className="text-[11px] text-accent-dark mt-0.5">
                              Säästö {formatCents(tierSavings)}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected template — PDF preview + signing */}
              {offerContract && selectedContractTemplate && selectedContractTier && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-accent-muted/50 rounded-xl p-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary text-sm">{selectedContractTemplate.name}</p>
                      <p className="text-xs text-text-muted break-words">
                        {intervalLabel(selectedContractTemplate.visit_interval_months)} · {tierMonthsLabel(selectedContractTier.months)} · {contractDeviceCount} laite{contractDeviceCount > 1 ? "tta" : ""}
                      </p>
                      <p className="text-lg font-bold text-accent-dark mt-1">{formatCents(contractTotalCents)} / {billingLabel(selectedContractTemplate.billing_interval_months)}</p>
                      {contractDeviceCount > 1 && contractUnitPrices && (
                        <p className="text-[11px] text-text-muted">
                          {formatCents(contractUnitPrices.contract_price_cents)} × {contractDeviceCount}
                        </p>
                      )}
                    </div>
                    {!contractSigned && (
                      <button
                        onClick={() => {
                          setSelectedContractTemplate(null);
                          setSelectedContractTier(null);
                          setContractDeviceCount(1);
                          setPdfPreviewUrl(null);
                          sigPadRef.current = null;
                        }}
                        className="text-xs text-text-muted hover:text-text-primary transition-colors"
                      >
                        Vaihda
                      </button>
                    )}
                  </div>

                  {/* Device count picker — only when not yet signed */}
                  {!contractSigned && (
                    <div className="flex flex-wrap items-center gap-3 bg-surface rounded-xl border border-border p-3">
                      <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Laitteet</span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(1, contractDeviceCount - 1);
                          setContractDeviceCount(next);
                          if (selectedContractTemplate && selectedContractTier) {
                            fetchPdfPreview(selectedContractTemplate, undefined, selectedContractTier, next);
                          }
                        }}
                        disabled={contractDeviceCount <= 1}
                        className="w-8 h-8 rounded-lg border border-border text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-30"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={contractDeviceCount}
                        onChange={(e) => {
                          const next = Math.max(1, parseInt(e.target.value) || 1);
                          setContractDeviceCount(next);
                          if (selectedContractTemplate && selectedContractTier) {
                            fetchPdfPreview(selectedContractTemplate, undefined, selectedContractTier, next);
                          }
                        }}
                        className="w-16 text-center px-2 py-1.5 border border-border rounded-lg bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = contractDeviceCount + 1;
                          setContractDeviceCount(next);
                          if (selectedContractTemplate && selectedContractTier) {
                            fetchPdfPreview(selectedContractTemplate, undefined, selectedContractTier, next);
                          }
                        }}
                        className="w-8 h-8 rounded-lg border border-border text-text-primary hover:bg-surface-hover transition-colors"
                      >
                        +
                      </button>
                      <span className="text-xs text-text-muted">kpl</span>
                      {contractUnitPrices && contractDeviceCount > 1 && contractUnitPrices.contract_price_cents !== selectedContractTier.contract_price_cents && (
                        <span className="ml-auto text-xs text-accent-dark">Volyymihinta voimassa</span>
                      )}
                    </div>
                  )}

                  {/* PDF preview */}
                  <div>
                    <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                      Sopimuksen esikatselu
                    </label>
                    {pdfLoading ? (
                      <div className="border border-border rounded-xl bg-surface-hover flex items-center justify-center h-[300px] sm:h-[500px]">
                        <div className="text-center">
                          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-sm text-text-muted">Luodaan esikatselua...</p>
                        </div>
                      </div>
                    ) : pdfPreviewUrl ? (
                      <>
                        {/* Mobile: download button (iframe renders zoomed-in on narrow screens) */}
                        <a
                          href={pdfPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sm:hidden w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-accent text-accent font-semibold text-sm hover:bg-accent/5 transition-colors"
                        >
                          <FileSignature className="w-4 h-4" />
                          Avaa sopimus PDF
                        </a>
                        {/* Desktop: inline iframe */}
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
                            onClick={() => fetchPdfPreview(selectedContractTemplate, undefined, selectedContractTier, contractDeviceCount)}
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
                          <p className="text-xs text-text-muted truncate">{signedByName} — tallennetaan viimeistelyssä</p>
                        </div>
                      </div>
                      <div className="sm:ml-auto flex items-center gap-3 pl-11 sm:pl-0">
                        <button
                          onClick={() => {
                            setContractSigned(false);
                            setSignatureData(null);
                            setTimeout(initSignaturePad, 100);
                          }}
                          className="text-xs text-text-muted hover:text-text-primary transition-colors"
                        >
                          Muokkaa
                        </button>
                        <button
                          onClick={() => {
                            setContractSigned(false);
                            setSignatureData(null);
                            setSelectedContractTemplate(null);
                            setSelectedContractTier(null);
                            setContractDeviceCount(1);
                            setPdfPreviewUrl(null);
                            sigPadRef.current = null;
                          }}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors"
                        >
                          Poista
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                          Allekirjoittajan nimi
                        </label>
                        <input
                          type="text"
                          value={signedByName}
                          onChange={(e) => setSignedByName(e.target.value)}
                          className={inputCls}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                          Allekirjoitus
                        </label>
                        <div className="border border-border rounded-xl overflow-hidden bg-white">
                          <canvas
                            ref={canvasRef}
                            className="w-full"
                            style={{ height: "140px", touchAction: "none" }}
                          />
                        </div>
                        <button
                          onClick={() => sigPadRef.current?.clear()}
                          className="mt-1 text-xs text-text-muted hover:text-text-primary transition-colors"
                        >
                          Tyhjennä allekirjoitus
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          if (!signedByName.trim()) {
                            setSubmitError("Allekirjoittajan nimi puuttuu");
                            return;
                          }
                          if (sigPadRef.current?.isEmpty()) {
                            setSubmitError("Allekirjoitus puuttuu");
                            return;
                          }
                          setSubmitError("");
                          const sigData = sigPadRef.current?.toDataURL("image/png") || "";
                          setSignatureData(sigData);
                          setContractSigned(true);
                          if (selectedContractTemplate) {
                            fetchPdfPreview(
                              selectedContractTemplate,
                              { name: signedByName.trim(), data: sigData },
                              selectedContractTier,
                              contractDeviceCount,
                            );
                          }
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors"
                      >
                        <FileSignature className="w-4 h-4" />
                        Hyväksy allekirjoitus
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {submitError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => goToStep(2)}
              className="px-4 py-2.5 rounded-lg text-sm font-medium border border-border text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Takaisin
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Viimeistellään...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Viimeistele
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
  const tiers = templateTiers(t);
  const defaultTier = tiers[0];
  const savings = defaultTier.regular_price_cents - defaultTier.contract_price_cents;
  const savingsPercent = defaultTier.regular_price_cents > 0
    ? Math.round((savings / defaultTier.regular_price_cents) * 100)
    : 0;

  return (
    <button
      onClick={onSelect}
      className={`p-6 bg-surface rounded-2xl border-2 transition-all text-left relative ${
        recommended ? "border-accent/40 hover:border-accent" : "border-border hover:border-accent"
      }`}
    >
      {recommended && (
        <span className="absolute -top-2.5 left-4 px-2.5 py-0.5 bg-accent text-white text-[10px] font-bold uppercase tracking-wider rounded-full">
          Suositeltu
        </span>
      )}
      <h3 className="font-semibold text-text-primary mb-1">{t.name}</h3>
      {t.services && (
        <p className="text-xs text-text-muted mb-2">{t.services.name}</p>
      )}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-lg font-bold text-accent-dark">
          {tiers.length > 1 ? "Alk. " : ""}{formatCents(defaultTier.contract_price_cents)}
        </span>
        <span className="text-xs text-text-muted">/ {t.billing_interval_months ? billingLabel(t.billing_interval_months) : "vuosi"}</span>
      </div>
      {savings > 0 && (
        <p className="text-xs text-accent-dark font-medium">
          Säästö {formatCents(savings)} ({savingsPercent}%)
        </p>
      )}
      <p className="text-xs text-text-muted mt-2">
        {intervalLabel(t.visit_interval_months)} · {tiers.length > 1
          ? `${tiers.length} kestoa: ${tiers.map((tier) => tierMonthsLabel(tier.months)).join(", ")}`
          : tierMonthsLabel(defaultTier.months)}
      </p>
    </button>
  );
}
