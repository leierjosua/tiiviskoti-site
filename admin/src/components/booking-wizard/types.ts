import type { ExtraItem, AddonService, Service, ServiceVariant } from "@/lib/types";

export interface ExtraItemForm {
  name: string;
  price: string;
  duration: string;
  materialCost: string;
}

export interface CustomerFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  postalCode: string;
  address: string;
  companyName: string;
  businessId: string;
  city?: string;
}

export interface LeadSourceOption {
  value: string;
  label: string;
}

export const LEAD_SOURCES: LeadSourceOption[] = [
  { value: "website", label: "Nettisivu" },
  { value: "contact_form", label: "Yhteydenottolomake" },
  { value: "phone", label: "Puhelin" },
  { value: "email", label: "Sähköposti" },
  { value: "other", label: "Muu" },
];

export const LEAD_SOURCES_WITH_SALES: LeadSourceOption[] = [
  ...LEAD_SOURCES,
  { value: "sales_pipeline", label: "Myyntiputki" },
];

export const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

// ─── Shared pricing & line item helpers ──────────────────────────────────────

export interface LineItemInput {
  line_type: string;
  addon_service_id?: string;
  product_id?: string;
  name: string;
  price_cents: number;
  quantity: number;
  duration_minutes: number;
  material_cost_cents: number;
  cost_cents?: number;
}

export function parseExtras(extraItems: ExtraItemForm[]): ExtraItem[] {
  return extraItems
    .filter((e) => e.name && e.price)
    .map((e) => ({
      name: e.name,
      price_cents: Math.round(parseFloat(e.price || "0") * 100),
      duration_minutes: parseInt(e.duration || "0") || 0,
      material_cost_cents: Math.round(parseFloat(e.materialCost || "0") * 100),
    }));
}

export function buildLineItems(
  selectedAddonList: AddonService[],
  selectedAddons: Record<string, number>,
  selectedProductList: { id: string; name: string; price_cents: number; cost_cents?: number; brand?: string | null }[],
  selectedProducts: Record<string, number>,
  parsedExtras: ExtraItem[],
): LineItemInput[] {
  const items: LineItemInput[] = [];

  for (const addon of selectedAddonList) {
    items.push({
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
    items.push({
      line_type: "product",
      product_id: prod.id,
      name: prod.name,
      price_cents: prod.price_cents,
      quantity: selectedProducts[prod.id] || 1,
      duration_minutes: 0,
      material_cost_cents: prod.price_cents,
      cost_cents: prod.cost_cents || 0,
    });
  }
  for (const extra of parsedExtras) {
    items.push({
      line_type: "custom",
      name: extra.name,
      price_cents: extra.price_cents,
      quantity: 1,
      duration_minutes: extra.duration_minutes,
      material_cost_cents: extra.material_cost_cents,
    });
  }

  return items;
}

export interface PricingResult {
  serviceTotalCents: number;
  addonsTotalCents: number;
  productsTotalCents: number;
  extrasTotalCents: number;
  subtotalCents: number;
  discountAmountCents: number;
  finalPriceCents: number;
  totalDuration: number;
  totalBlockedTime: number;
  totalMaterialCents: number;
  slotStep: number;
}

export function calculatePricing(opts: {
  selectedServices: Service[];
  serviceQty: Record<string, number>;
  selectedVariant: ServiceVariant | null;
  selectedAddonList: AddonService[];
  selectedAddons: Record<string, number>;
  selectedProductList: { id: string; price_cents: number }[];
  selectedProducts: Record<string, number>;
  parsedExtras: ExtraItem[];
  discountValid: boolean;
  discountInfo: { id: string; type: string; value: number } | null;
  manualDiscountCents: string;
  getUnitPriceCents: (service: Service, qty: number) => number;
}): PricingResult {
  const {
    selectedServices, serviceQty, selectedVariant,
    selectedAddonList, selectedAddons,
    selectedProductList, selectedProducts,
    parsedExtras,
    discountValid, discountInfo, manualDiscountCents,
    getUnitPriceCents,
  } = opts;

  const serviceTotalCents = selectedVariant
    ? selectedVariant.price_cents * (serviceQty[selectedServices[0]?.id] || 1)
    : selectedServices.reduce((sum, s) => {
        const qty = serviceQty[s.id] || 1;
        return sum + getUnitPriceCents(s, qty) * qty;
      }, 0);

  const addonsTotalCents = selectedAddonList.reduce((sum, a) => sum + a.price_cents * (selectedAddons[a.id] || 1), 0);
  const productsTotalCents = selectedProductList.reduce((sum, p) => sum + p.price_cents * (selectedProducts[p.id] || 1), 0);
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

  // Duration without transition (for storing on booking, display to customer)
  const totalDuration = (selectedVariant
    ? selectedVariant.duration_minutes * (serviceQty[selectedServices[0]?.id] || 1)
    : selectedServices.reduce((sum, s) => {
        const qty = serviceQty[s.id] || 1;
        const extra = (s as any).extra_duration_per_unit_minutes;
        const dur = extra != null ? s.duration_minutes + Math.max(0, qty - 1) * extra : s.duration_minutes * qty;
        return sum + dur;
      }, 0))
    + selectedAddonList.reduce((sum, a) => sum + a.duration_minutes * (selectedAddons[a.id] || 1), 0)
    + parsedExtras.reduce((sum, e) => sum + e.duration_minutes, 0);

  // Duration with transition (for calendar slot checking)
  const maxTransition = selectedServices.length > 0
    ? Math.max(...selectedServices.map((s) => s.transition_minutes || 0))
    : 0;
  const totalBlockedTime = totalDuration + maxTransition;

  // Single-unit footprint (one device + transition) used as the calendar slot
  // STEP, so a multi-device booking is offered on the single-wash grid (08:00,
  // 10:00, 12:00) instead of a coarse multi-device grid that fragments the day.
  // Mirrors /api/availability's slotStep = baseDuration + transition.
  const baseUnitDuration = selectedVariant
    ? selectedVariant.duration_minutes
    : (selectedServices[0]?.duration_minutes ?? totalDuration);
  const slotStep = baseUnitDuration + maxTransition;

  const totalMaterialCents = selectedServices.reduce((sum, s) => sum + s.material_cost_cents * (serviceQty[s.id] || 1), 0)
    + selectedAddonList.reduce((sum, a) => sum + a.material_cost_cents * (selectedAddons[a.id] || 1), 0)
    + productsTotalCents
    + parsedExtras.reduce((sum, e) => sum + e.material_cost_cents, 0);

  return {
    serviceTotalCents,
    addonsTotalCents,
    totalBlockedTime,
    productsTotalCents,
    extrasTotalCents,
    subtotalCents,
    discountAmountCents,
    finalPriceCents,
    totalDuration,
    totalMaterialCents,
    slotStep,
  };
}

export async function validateDiscountCode(
  code: string,
  supabase: { from: (table: string) => any },
): Promise<{ valid: boolean; error?: string; info?: { id: string; type: string; value: number } }> {
  if (!code.trim()) return { valid: false, error: "Syötä koodi" };

  const { data: dc } = await supabase
    .from("discount_codes")
    .select("id, discount_type, discount_value, max_uses, times_used, expires_at, active")
    .ilike("code", code.trim().toLowerCase())
    .eq("active", true)
    .single();

  if (!dc) return { valid: false, error: "Koodi ei ole voimassa" };
  if (dc.max_uses != null && dc.times_used >= dc.max_uses) return { valid: false, error: "Koodi käytetty loppuun" };
  if (dc.expires_at && new Date(dc.expires_at) < new Date()) return { valid: false, error: "Koodi vanhentunut" };

  return { valid: true, info: { id: dc.id, type: dc.discount_type, value: dc.discount_value } };
}
