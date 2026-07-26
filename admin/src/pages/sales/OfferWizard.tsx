import { useMemo, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, AlertCircle } from "lucide-react";
import { useServices, useServiceCategories } from "@/hooks/useServices";
import { useServiceVariants } from "@/hooks/useServiceVariants";
import { useAddonServices, useAddonsByService } from "@/hooks/useAddonServices";
import { useProducts, useServiceProductCategories, useProductsByService } from "@/hooks/useProducts";
import { useSalesOpportunity, useOpportunityNotes } from "@/hooks/sales/useSalesOpportunities";
import {
  useCreateOffer,
  useUpdateOffer,
  useOffersByOpportunity,
  useCreateOfferLineItem,
} from "@/hooks/sales/useSalesOffers";
import { useSalesQuoteTemplates } from "@/hooks/sales/useSalesQuoteTemplates";
import { useToast } from "@/context/ToastContext";
import { useUserRole } from "@/context/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { formatAddress } from "@/lib/utils";
import { OfferPdfContent } from "@/components/sales/OfferPdfContent";
import type { OfferPdfData } from "@/components/sales/OfferPdfContent";
import { InstallPlanPdf } from "@/components/sales/InstallPlanPdf";

import { useOfferWizardState } from "./offer-wizard/useOfferWizardState";
import { computeLineItems } from "./offer-wizard/computeLineItems";
import { submitOffer } from "./offer-wizard/submitOffer";
import { StepIndicator, getVisibleSteps } from "./offer-wizard/StepIndicator";
import { CustomerStep } from "./offer-wizard/CustomerStep";
import { DevicesStep } from "./offer-wizard/DevicesStep";
import { SummaryStep } from "./offer-wizard/SummaryStep";
import { InstallPlanStep } from "./offer-wizard/InstallPlanStep";
import { SignatureStep } from "./offer-wizard/SignatureStep";
import { BookingStep } from "./offer-wizard/BookingStep";
import { ConfirmationStep } from "./offer-wizard/ConfirmationStep";
import type { CustomItem } from "./offer-wizard/types";

export default function OfferWizard() {
  const navigate = useNavigate();
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const toast = useToast();
  const { employee } = useUserRole();

  // ─── Data hooks ─────────────────────────────────────────────────────────
  const { data: opportunity, isLoading: oppLoading } = useSalesOpportunity(opportunityId);
  const { data: existingOffers = [] } = useOffersByOpportunity(opportunityId);
  const { data: allServices = [] } = useServices();
  const { data: allAddons = [] } = useAddonServices();
  const { data: allProducts = [] } = useProducts();
  const { data: templates = [] } = useSalesQuoteTemplates();
  const { data: serviceCategories = [] } = useServiceCategories();
  const { data: oppNotes = [] } = useOpportunityNotes(opportunityId);

  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();
  const createLineItem = useCreateOfferLineItem();

  // ─── Wizard state ─────────────────────────────────────────────────────
  const { state, dispatch, selectedServiceIds } = useOfferWizardState(opportunity, allServices);

  // Prefill noteContent from opportunity notes (if any, and not already set)
  useEffect(() => {
    if (oppNotes.length > 0 && !state.noteContent) {
      dispatch({ type: "SET_FIELD", field: "noteTitle", value: "Kartoitusmuistiinpanot" });
      dispatch({ type: "SET_FIELD", field: "noteContent", value: oppNotes[0].body });
    }
  }, [oppNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Variant fetching for primary selected service
  const primaryServiceId = selectedServiceIds[0] || undefined;
  const { data: variants = [] } = useServiceVariants(primaryServiceId);

  // Guided filtering: linked addons and relevant product categories
  const { data: linkedAddonData = [] } = useAddonsByService(primaryServiceId);
  const { data: relevantProductCategoryIds = [] } = useServiceProductCategories(primaryServiceId);
  const { data: productLinks = [] } = useProductsByService(primaryServiceId);

  // ─── Computed totals ──────────────────────────────────────────────────
  const computed = useMemo(
    () => computeLineItems({ state, allServices, allAddons, allProducts, variants }),
    [state, allServices, allAddons, allProducts, variants],
  );

  // Addon services in this offer — used to filter out installers who can't perform
  // them (e.g. timanttiporaus). Matches exactly what becomes booking line items.
  const selectedAddonIds = useMemo(
    () => Array.from(new Set(
      computed.lineItems
        .filter((li) => li.lineType === "additional_service" && li.itemId)
        .map((li) => li.itemId as string),
    )),
    [computed.lineItems],
  );

  // ─── Confirmation data (populated after submit) ───────────────────────
  // We store these in refs so they survive state changes

  // ─── Template application ─────────────────────────────────────────────
  const applyTemplate = useCallback((templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl?.sales_quote_template_items) return;

    const newServiceQty: Record<string, number> = {};
    const newAddonQty: Record<string, number> = {};
    const newProductQty: Record<string, number> = {};
    const newCustomItems: CustomItem[] = [];

    // Package and upsell support from template combo_group / is_optional
    const packageMap = new Map<string, { serviceQty: Record<string, number>; serviceVariantId: Record<string, string>; addonQty: Record<string, number>; productQty: Record<string, number>; customItems: CustomItem[] }>();
    const newUpsells = { serviceQty: {} as Record<string, number>, addonQty: {} as Record<string, number>, productQty: {} as Record<string, number>, customItems: [] as CustomItem[] };
    let hasPackagesOrUpsells = false;

    for (const item of tpl.sales_quote_template_items) {
      const addToTarget = (target: { serviceQty: Record<string, number>; addonQty: Record<string, number>; productQty: Record<string, number>; customItems: CustomItem[] }) => {
        if (item.line_type === "service" && item.item_id) target.serviceQty[item.item_id] = item.quantity;
        else if (item.line_type === "addon_service" && item.item_id) target.addonQty[item.item_id] = item.quantity;
        else if (item.line_type === "product" && item.item_id) target.productQty[item.item_id] = item.quantity;
        else if (item.line_type === "custom") target.customItems.push({ name: item.name, priceCents: item.unit_price_cents, qty: item.quantity, durationMinutes: 0, materialCostCents: 0 });
      };

      if (item.combo_group) {
        hasPackagesOrUpsells = true;
        if (!packageMap.has(item.combo_group)) {
          packageMap.set(item.combo_group, { serviceQty: {}, serviceVariantId: {}, addonQty: {}, productQty: {}, customItems: [] });
        }
        addToTarget(packageMap.get(item.combo_group)!);
      } else if (item.is_optional) {
        hasPackagesOrUpsells = true;
        addToTarget(newUpsells);
      } else {
        addToTarget({ serviceQty: newServiceQty, addonQty: newAddonQty, productQty: newProductQty, customItems: newCustomItems });
      }
    }

    if (hasPackagesOrUpsells) {
      const packages = Array.from(packageMap.entries()).map(([name, data]) => ({ name, ...data }));
      dispatch({ type: "APPLY_FULL_TEMPLATE", serviceQty: newServiceQty, addonQty: newAddonQty, productQty: newProductQty, customItems: newCustomItems, packages, upsells: newUpsells });
    } else {
      dispatch({ type: "APPLY_TEMPLATE", serviceQty: newServiceQty, addonQty: newAddonQty, productQty: newProductQty, customItems: newCustomItems });
    }
    toast.success("Malli ladattu");
  }, [templates, dispatch, toast]);

  // ─── Navigation helpers ───────────────────────────────────────────────
  const goNext = useCallback(async () => {
    const visibleSteps = getVisibleSteps(state.deliveryMode);
    const currentIdx = visibleSteps.findIndex((s) => s.key === state.step);
    if (currentIdx < visibleSteps.length - 1) {
      const nextStep = visibleSteps[currentIdx + 1].key;

      // Save customer data when leaving customer step
      if (state.step === "customer" && opportunityId) {
        const c = state.customer;
        const fullName = `${c.firstName} ${c.lastName}`.trim();
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (fullName) updates.name = fullName;
        if (c.email) updates.email = c.email;
        if (c.phone) updates.phone = c.phone;
        if (c.address) updates.address = c.address;
        if (c.postcode) updates.postcode = c.postcode;
        if (c.city) updates.city = c.city;
        await supabase.from("sales_opportunities").update(updates).eq("id", opportunityId);
      }

      dispatch({ type: "SET_STEP", step: nextStep });
    }
  }, [state.step, state.deliveryMode, state.customer, opportunityId, dispatch]);

  const goBack = useCallback(() => {
    const visibleSteps = getVisibleSteps(state.deliveryMode);
    const currentIdx = visibleSteps.findIndex((s) => s.key === state.step);
    if (currentIdx > 0) {
      dispatch({ type: "SET_STEP", step: visibleSteps[currentIdx - 1].key });
    }
  }, [state.step, state.deliveryMode, dispatch]);

  // ─── Submit handlers ──────────────────────────────────────────────────
  const handleSubmit = useCallback(async (mode: "send" | "sign_now" | "sign_pending_confirm") => {
    if (!opportunityId) return;
    dispatch({ type: "SET_DELIVERY_MODE", mode });
    dispatch({ type: "SET_SUBMITTING", value: true });

    try {
      const result = await submitOffer({
        state: { ...state, deliveryMode: mode },
        lineItems: computed.lineItems,
        subtotalCents: computed.subtotalCents,
        discountCents: computed.discountCents,
        totalCents: computed.totalCents,
        opportunityId,
        employee: employee || null,
        createOffer: createOffer as any,
        createLineItem: createLineItem as any,
        updateOffer: updateOffer as any,
      });

      // Store confirmation data and go to confirmation
      dispatch({ type: "SET_FIELD", field: "confirmedOfferNumber", value: result.offerNumber });
      dispatch({ type: "SET_STEP", step: "confirmation" });
      const successMsg = mode === "send"
        ? "Tarjous lähetetty"
        : mode === "sign_pending_confirm"
          ? "Tarjous allekirjoitettu — asiakkaalle lähetetty ajanvahvistuspyyntö"
          : "Tarjous allekirjoitettu";
      toast.success(successMsg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Tuntematon virhe";
      toast.error(`Virhe: ${msg}`);
    } finally {
      dispatch({ type: "SET_SUBMITTING", value: false });
    }
  }, [opportunityId, state, computed, employee, createOffer, createLineItem, updateOffer, toast, dispatch]);

  const handleSend = useCallback(() => handleSubmit("send"), [handleSubmit]);

  const handleSignNow = useCallback(() => {
    dispatch({ type: "SET_DELIVERY_MODE", mode: "sign_now" });
    dispatch({ type: "SET_STEP", step: "signature" });
  }, [dispatch]);

  const handleSignPendingConfirm = useCallback(() => {
    dispatch({ type: "SET_DELIVERY_MODE", mode: "sign_pending_confirm" });
    dispatch({ type: "SET_STEP", step: "signature" });
  }, [dispatch]);

  const handleBookingNext = useCallback(
    () => handleSubmit(state.deliveryMode === "sign_pending_confirm" ? "sign_pending_confirm" : "sign_now"),
    [handleSubmit, state.deliveryMode],
  );

  // ─── Loading / error ──────────────────────────────────────────────────
  if (oppLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="p-6 text-center text-text-muted">
        <AlertCircle className="mx-auto mb-2" size={24} />
        <p>Diiliä ei löytynyt</p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────
  const showNav = state.step !== "confirmation" && state.step !== "booking" && state.step !== "install_plan";
  const isFirstStep = state.step === "customer";
  const showNextBtn = state.step === "customer" || state.step === "devices";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary mb-4">
        <ArrowLeft size={16} /> Takaisin
      </button>

      <h1 className="text-xl font-bold text-text-primary mb-1">Luo tarjous</h1>
      <p className="text-sm text-text-muted mb-6">{opportunity.name}</p>

      {/* Existing offers notice */}
      {existingOffers.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
          <AlertCircle size={16} />
          Tällä diilillä on jo {existingOffers.length} tarjousta
        </div>
      )}

      {/* Step indicator */}
      <StepIndicator
        currentStep={state.step}
        deliveryMode={state.deliveryMode}
        onStepClick={(step) => dispatch({ type: "SET_STEP", step })}
      />

      {/* Steps */}
      {state.step === "customer" && (
        <CustomerStep customer={state.customer} dispatch={dispatch} />
      )}

      {state.step === "devices" && (
        <DevicesStep
          state={state}
          dispatch={dispatch}
          allServices={allServices}
          allAddons={allAddons}
          allProducts={allProducts}
          variants={variants}
          serviceCategories={serviceCategories}
          linkedAddonData={linkedAddonData}
          relevantProductCategoryIds={relevantProductCategoryIds}
          productLinks={productLinks}
          templates={templates}
          computed={computed}
          onApplyTemplate={applyTemplate}
        />
      )}

      {state.step === "install_plan" && (
        <InstallPlanStep
          installPlan={state.installPlan}
          dispatch={dispatch}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {state.step === "summary" && (
        <SummaryStep
          state={state}
          dispatch={dispatch}
          lineItems={computed.lineItems}
          subtotalCents={computed.subtotalCents}
          discountCents={computed.discountCents}
          totalCents={computed.totalCents}
          optionGroups={computed.optionGroups}
          totalCostCents={computed.totalCostCents}
          marginCents={computed.marginCents}
          marginPct={computed.marginPct}
          employee={employee || null}
          onSend={handleSend}
          onSignNow={handleSignNow}
          onSignPendingConfirm={handleSignPendingConfirm}
          isSubmitting={state.isSubmitting}
        />
      )}

      {state.step === "signature" && (
        <SignatureStep
          signerName={state.signerName}
          signatureDataUrl={state.signatureDataUrl}
          customerName={`${state.customer.firstName} ${state.customer.lastName}`.trim()}
          dispatch={dispatch}
        />
      )}

      {state.step === "booking" && (
        <BookingStep
          state={state}
          dispatch={dispatch}
          allServices={allServices}
          selectedServiceIds={selectedServiceIds}
          selectedAddonIds={selectedAddonIds}
          onBack={goBack}
          onNext={handleBookingNext}
        />
      )}

      {state.step === "confirmation" && (
        <ConfirmationStep
          deliveryMode={state.deliveryMode}
          offerNumber={state.confirmedOfferNumber || ""}
          customer={state.customer}
          totalCents={computed.totalCents}
          bookingDate={state.selectedDate}
          bookingTime={state.selectedTime}
        />
      )}

      {/* Hidden PDF elements — always in DOM so submitOffer can access them from any step */}
      {state.step !== "customer" && state.step !== "confirmation" && (() => {
        const { customer: c, offerTitle: ot, noteTitle: nt, noteContent: nc, signatureDataUrl: sig, signerName: sn, installPlan: ip } = state;
        const basePdfData: OfferPdfData = {
          offerNumber: "___OFFER_NUM___",
          title: ot || "Tarjous",
          createdAt: new Date().toISOString(),
          customerName: `${c.firstName} ${c.lastName}`.trim(),
          customerAddress: formatAddress(c.address, c.postcode, c.city),
          customerContact: [c.email, c.phone].filter(Boolean).join(" \u00B7 "),
          customerEmail: c.email || undefined,
          customerPhone: c.phone || undefined,
          lineItems: computed.lineItems.map((li) => ({
            name: li.name, description: null, quantity: li.qty,
            unitPrice: li.unitPriceCents / 100, totalPrice: (li.unitPriceCents * li.qty) / 100, lineType: li.lineType,
            optionGroup: li.optionGroup ?? null, isUpsell: li.isUpsell ?? false,
          })),
          optionGroups: computed.optionGroups.length > 0 ? computed.optionGroups : undefined,
          subtotal: computed.subtotalCents / 100,
          discount: computed.discountCents / 100,
          total: computed.totalCents / 100,
          sellerName: employee ? `${employee.first_name} ${employee.last_name}`.trim() : undefined,
          noteTitle: nt || undefined,
          noteContent: nc || undefined,
          signatureDataUrl: sig || undefined,
          signerName: sn || undefined,
        };
        return (
          <>
            <div id="offer-pdf-preview" style={{ position: "absolute", left: "-9999px", top: 0, width: "794px", background: "white" }}>
              <OfferPdfContent data={basePdfData} />
            </div>
            <div id="install-plan-preview" style={{ position: "absolute", left: "-9999px", top: 0, width: "794px", background: "white" }}>
              <InstallPlanPdf
                installPlan={ip}
                customerName={`${c.firstName} ${c.lastName}`.trim()}
                customerAddress={formatAddress(c.address, c.postcode, c.city)}
                date={new Date().toISOString()}
              />
            </div>
          </>
        );
      })()}

      {/* Navigation (not on summary which has its own CTAs, not on booking which has CalendarStep nav, not on install_plan which has its own, not on confirmation) */}
      {showNav && (
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
          {!isFirstStep ? (
            <button onClick={goBack} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-bg-secondary">
              <ArrowLeft size={16} /> Edellinen
            </button>
          ) : (
            <div />
          )}

          {showNextBtn && (
            <button
              onClick={goNext}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand/90"
            >
              Seuraava <ArrowRight size={16} />
            </button>
          )}

          {state.step === "signature" && (
            <button
              onClick={goNext}
              disabled={!state.signatureDataUrl}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Seuraava <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
