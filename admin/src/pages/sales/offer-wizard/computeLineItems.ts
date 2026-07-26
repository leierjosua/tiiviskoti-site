import type { WizardState, LineItem } from "./types";
import type { Service, ServiceVariant, AddonService, Product } from "@/lib/types";

/** Finnish VAT rate applied to consumer prices in offers. */
const VAT_DIVISOR = 1.255;

export interface ComputedTotals {
  lineItems: LineItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  /** Distinct option group names (from packages) */
  optionGroups: string[];
  /** Total cost (cogs) for displayed totals — base + selected package, ex-VAT-aware via revenue side. */
  totalCostCents: number;
  /** Ex-VAT revenue used as the basis for kate %. */
  revenueExVatCents: number;
  /** Margin € = revenueExVat − totalCost (after discount applied to revenue). */
  marginCents: number;
  /** Margin % of revenue ex-VAT. */
  marginPct: number;
}

/** Stable key for a line item — used for per-line price overrides. */
export function lineItemKey(li: Pick<LineItem, "lineType" | "itemId" | "optionGroup" | "isUpsell" | "customIndex">): string {
  const scope = li.isUpsell ? "upsell" : (li.optionGroup ?? "base");
  const id = li.itemId ?? `custom-${li.customIndex ?? 0}`;
  return `${li.lineType}|${id}|${scope}`;
}

/** Build line items from a set of quantities (shared logic for base, packages, upsells) */
function buildItems(
  serviceQty: Record<string, number>,
  serviceVariantId: Record<string, string>,
  addonQty: Record<string, number>,
  productQty: Record<string, number>,
  customItems: { name: string; priceCents: number; qty: number; durationMinutes: number; materialCostCents: number }[],
  allServices: Service[],
  allAddons: AddonService[],
  allProducts: Product[],
  variants: ServiceVariant[],
  optionGroup: string | null,
  isUpsell: boolean,
  priceOverrides: Record<string, number>,
): LineItem[] {
  const items: LineItem[] = [];

  const withOverride = (li: LineItem): LineItem => {
    const key = lineItemKey(li);
    const override = priceOverrides[key];
    if (override == null) return li;
    return { ...li, defaultUnitPriceCents: li.unitPriceCents, unitPriceCents: override };
  };

  // Services — cost matches booking_employees.commission_cents (alihankkija) + sales_commission.
  // material_cost_cents is informational only and NOT subtracted in the booking margin
  // (alihankkija-provisio kattaa materiaalit). Variant overrides service if set.
  for (const [id, qty] of Object.entries(serviceQty)) {
    if (qty <= 0) continue;
    const svc = allServices.find((s) => s.id === id);
    if (!svc) continue;
    const variantId = serviceVariantId[id];
    const variant = variants.find((v) => v.id === variantId);
    const labor = variant
      ? (variant.commission_alihankkija_cents ?? svc.commission_alihankkija_cents ?? 0)
      : (svc.commission_alihankkija_cents || 0);
    const salesCommission = variant
      ? (variant.sales_commission_cents ?? svc.sales_commission_cents ?? 0)
      : (svc.sales_commission_cents || 0);
    items.push(withOverride({
      lineType: "service",
      itemId: id,
      name: variant ? `${svc.name} - ${variant.label}` : svc.name,
      qty,
      unitPriceCents: variant ? variant.price_cents : svc.base_price_cents,
      costCents: labor + salesCommission,
      costBreakdown: { material: 0, labor, salesCommission },
      durationMinutes: variant ? variant.duration_minutes : svc.duration_minutes,
      salesCommissionCents: salesCommission,
      optionGroup,
      isUpsell,
    }));
  }

  // Addons — same logic: alihankkija-provisio + sales_commission, ei materiaalia.
  for (const [id, qty] of Object.entries(addonQty)) {
    if (qty <= 0) continue;
    const addon = allAddons.find((a) => a.id === id);
    if (!addon) continue;
    const labor = addon.commission_alihankkija_cents || 0;
    const salesCommission = addon.sales_commission_cents || 0;
    items.push(withOverride({
      lineType: "additional_service",
      itemId: id,
      name: addon.name,
      qty,
      unitPriceCents: addon.price_cents,
      costCents: labor + salesCommission,
      costBreakdown: { material: 0, labor, salesCommission },
      durationMinutes: addon.duration_minutes,
      salesCommissionCents: salesCommission,
      optionGroup,
      isUpsell,
    }));
  }

  // Products
  for (const [id, qty] of Object.entries(productQty)) {
    if (qty <= 0) continue;
    const prod = allProducts.find((p) => p.id === id);
    if (!prod) continue;
    const material = prod.cost_cents || 0;
    items.push(withOverride({
      lineType: "product",
      itemId: id,
      name: prod.name,
      qty,
      unitPriceCents: prod.price_cents,
      costCents: material,
      costBreakdown: { material, labor: 0, salesCommission: 0 },
      durationMinutes: null,
      salesCommissionCents: 0,
      optionGroup,
      isUpsell,
    }));
  }

  // Custom items — track positional customIndex for stable override keys
  customItems.forEach((ci, idx) => {
    const material = ci.materialCostCents || 0;
    items.push(withOverride({
      lineType: "other_charge",
      itemId: null,
      name: ci.name,
      qty: ci.qty,
      unitPriceCents: ci.priceCents,
      costCents: material,
      costBreakdown: { material, labor: 0, salesCommission: 0 },
      durationMinutes: ci.durationMinutes || null,
      salesCommissionCents: 0,
      optionGroup,
      isUpsell,
      customIndex: idx,
    }));
  });

  return items;
}

interface ComputeInput {
  state: WizardState;
  allServices: Service[];
  allAddons: AddonService[];
  allProducts: Product[];
  variants: ServiceVariant[];
}

export function computeLineItems({
  state,
  allServices,
  allAddons,
  allProducts,
  variants,
}: ComputeInput): ComputedTotals {
  const items: LineItem[] = [];
  const overrides = state.priceOverrides ?? {};

  // 1. Base items (always included)
  items.push(...buildItems(
    state.serviceQty, state.serviceVariantId,
    state.addonQty, state.productQty, state.customItems,
    allServices, allAddons, allProducts, variants,
    null, false, overrides,
  ));

  // 2. Package items (one option group per package)
  for (const pkg of state.packages) {
    items.push(...buildItems(
      pkg.serviceQty, pkg.serviceVariantId,
      pkg.addonQty, pkg.productQty, pkg.customItems,
      allServices, allAddons, allProducts, variants,
      pkg.name, false, overrides,
    ));
  }

  // 3. Upsell items
  items.push(...buildItems(
    {}, {},
    state.upsells.addonQty, state.upsells.productQty, state.upsells.customItems,
    allServices, allAddons, allProducts, variants,
    null, true, overrides,
  ));

  // Sort by total price descending (most expensive first)
  items.sort((a, b) => (b.unitPriceCents * b.qty) - (a.unitPriceCents * a.qty));

  const optionGroups = state.packages.map((p) => p.name);

  // Calculate totals: base items + first/most-expensive package (not all packages)
  // Upsells are optional so excluded from the displayed total
  const baseItems = items.filter((li) => !li.optionGroup && !li.isUpsell);
  const baseTotal = baseItems.reduce((sum, li) => sum + li.unitPriceCents * li.qty, 0);
  const baseCost = baseItems.reduce((sum, li) => sum + li.costCents * li.qty, 0);

  let selectedPackageTotal = 0;
  let selectedPackageCost = 0;
  if (optionGroups.length > 0) {
    // Pair revenue+cost per package and pick the package with max revenue (the displayed "starting" total)
    const packageStats = optionGroups.map((g) => {
      const groupItems = items.filter((li) => li.optionGroup === g);
      return {
        revenue: groupItems.reduce((sum, li) => sum + li.unitPriceCents * li.qty, 0),
        cost: groupItems.reduce((sum, li) => sum + li.costCents * li.qty, 0),
      };
    });
    const maxIdx = packageStats.reduce((best, s, i) => (s.revenue > packageStats[best].revenue ? i : best), 0);
    selectedPackageTotal = packageStats[maxIdx].revenue;
    selectedPackageCost = packageStats[maxIdx].cost;
  }

  const subtotalCents = baseTotal + selectedPackageTotal;
  const rawDiscount = parseFloat(state.discount || "0");
  const discountCents = isNaN(rawDiscount) || rawDiscount < 0 ? 0 : Math.round(rawDiscount * 100);
  const totalCents = subtotalCents - discountCents;

  // Margin: ex-VAT revenue (after discount) − total cost. Cost is already net (purchase costs / labor).
  const totalCostCents = baseCost + selectedPackageCost;
  const revenueExVatCents = Math.round(totalCents / VAT_DIVISOR);
  const marginCents = revenueExVatCents - totalCostCents;
  const marginPct = revenueExVatCents > 0 ? (marginCents / revenueExVatCents) * 100 : 0;

  return {
    lineItems: items,
    subtotalCents,
    discountCents,
    totalCents,
    optionGroups,
    totalCostCents,
    revenueExVatCents,
    marginCents,
    marginPct,
  };
}

/** Helper for UI: per-line ex-VAT revenue, cost, and margin. */
export function lineMargin(li: LineItem): {
  revenueExVatCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number;
} {
  const revenueExVatCents = Math.round((li.unitPriceCents * li.qty) / VAT_DIVISOR);
  const costCents = li.costCents * li.qty;
  const marginCents = revenueExVatCents - costCents;
  const marginPct = revenueExVatCents > 0 ? (marginCents / revenueExVatCents) * 100 : 0;
  return { revenueExVatCents, costCents, marginCents, marginPct };
}
