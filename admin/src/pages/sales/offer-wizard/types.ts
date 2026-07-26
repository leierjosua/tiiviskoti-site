import type { SalesOpportunity } from "@/lib/sales-types";

// ─── Data types ─────────────────────────────────────────────────────────────

export interface CustomItem {
  name: string;
  priceCents: number;
  qty: number;
  durationMinutes: number;
  materialCostCents: number;
}

export interface LineItem {
  lineType: string;
  itemId: string | null;
  name: string;
  qty: number;
  unitPriceCents: number;
  /** Total cost per unit (material + labor + sales commission). Used for kate. */
  costCents: number;
  /** Cost breakdown per unit, for display/debug. */
  costBreakdown?: { material: number; labor: number; salesCommission: number };
  durationMinutes: number | null;
  salesCommissionCents: number;
  optionGroup?: string | null;
  isUpsell?: boolean;
  /** Position within its scope's customItems array — only set for line_type="other_charge" */
  customIndex?: number;
  /** Original catalog price before any priceOverride is applied */
  defaultUnitPriceCents?: number;
}

/** A named package of services/products/addons (one option group the customer picks from) */
export interface PackageConfig {
  name: string;
  serviceQty: Record<string, number>;
  serviceVariantId: Record<string, string>;
  addonQty: Record<string, number>;
  productQty: Record<string, number>;
  customItems: CustomItem[];
}

// ─── Wizard steps ───────────────────────────────────────────────────────────

export type WizardStep =
  | "customer"
  | "devices"
  | "install_plan"
  | "summary"
  | "signature"
  | "booking"
  | "confirmation";

export type DeliveryMode = "send" | "sign_now" | "sign_pending_confirm";

// ─── State ──────────────────────────────────────────────────────────────────

export interface CustomerData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
}

export interface InstallPlan {
  lapivienti: "sisayksikon_taakse" | "asennuskotelolla";
  lapivienti_text?: string;
  teline: "seinateline" | "parvekkeen_lattia" | "maateline";
  teline_text?: string;
  sahko: "kiintea" | "pistotulppa";
  sahko_text?: string;
  kondenssi: "maahan" | "sadevesikaivoon" | "parveke" | "parveke_astia";
  kondenssi_text?: string;
  huomiot?: string;
}

export interface UpsellState {
  addonQty: Record<string, number>;
  productQty: Record<string, number>;
  customItems: CustomItem[];
}

export interface WizardState {
  step: WizardStep;
  customer: CustomerData;
  // Base items (always included, no option group)
  serviceQty: Record<string, number>;
  serviceVariantId: Record<string, string>;
  addonQty: Record<string, number>;
  productQty: Record<string, number>;
  customItems: CustomItem[];
  // Option group packages
  packages: PackageConfig[];
  activePackageIndex: number; // -1 = base items, 0+ = package index
  // Upsell items (optional for customer)
  upsells: UpsellState;
  // Install plan
  installPlan: InstallPlan;
  showInstallPlanModal: boolean;
  // Offer document
  offerTitle: string;
  noteTitle: string;
  noteContent: string;
  discount: string;
  deliveryMode: DeliveryMode | null;
  signatureDataUrl: string | null;
  signerName: string;
  emailBody: string;
  /** Subject for the "Allekirjoita + odota lupaa" email (sign_pending_confirm) */
  pendingConfirmEmailSubject: string;
  /** Body (prose only — link button + footer get auto-appended) for the pending-confirm email */
  pendingConfirmEmailBody: string;
  validityDays: number;
  // Booking (CalendarStep)
  selectedEmployeeId: string | null;
  selectedCalendarId: string | null;
  selectedDate: string | null;
  selectedTime: string | null;
  calMonth: { year: number; month: number };
  insideNotes: string;
  isSubmitting: boolean;
  // Confirmation data (populated after submit)
  confirmedOfferNumber: string | null;
  // Service category filter
  serviceCategoryId: string | null;
  // UI toggles for showing all products/addons (not just linked ones)
  showAllProducts: boolean;
  showAllAddons: boolean;
  // Per-line price overrides (cents). Keyed by lineItemKey() — overrides catalog price.
  priceOverrides: Record<string, number>;
  // UI-only: show kate (margin) column and totals. Default off.
  showMargin: boolean;
}

// ─── Actions ────────────────────────────────────────────────────────────────

export type WizardAction =
  | { type: "SET_STEP"; step: WizardStep }
  | { type: "UPDATE_CUSTOMER"; field: keyof CustomerData; value: string }
  // Base item actions
  | { type: "SET_SERVICE_QTY"; id: string; qty: number }
  | { type: "SET_VARIANT"; serviceId: string; variantId: string }
  | { type: "SET_ADDON_QTY"; id: string; qty: number }
  | { type: "SET_PRODUCT_QTY"; id: string; qty: number }
  | { type: "ADD_CUSTOM_ITEM"; item: CustomItem }
  | { type: "REMOVE_CUSTOM_ITEM"; index: number }
  // Package management
  | { type: "ADD_PACKAGE"; name: string }
  | { type: "REMOVE_PACKAGE"; index: number }
  | { type: "SET_ACTIVE_PACKAGE"; index: number }
  | { type: "RENAME_PACKAGE"; index: number; name: string }
  // Per-package item actions
  | { type: "PKG_SET_SERVICE_QTY"; pkgIndex: number; id: string; qty: number }
  | { type: "PKG_SET_VARIANT"; pkgIndex: number; serviceId: string; variantId: string }
  | { type: "PKG_SET_ADDON_QTY"; pkgIndex: number; id: string; qty: number }
  | { type: "PKG_SET_PRODUCT_QTY"; pkgIndex: number; id: string; qty: number }
  | { type: "PKG_ADD_CUSTOM_ITEM"; pkgIndex: number; item: CustomItem }
  | { type: "PKG_REMOVE_CUSTOM_ITEM"; pkgIndex: number; index: number }
  // Upsell item actions
  | { type: "UPSELL_SET_ADDON_QTY"; id: string; qty: number }
  | { type: "UPSELL_SET_PRODUCT_QTY"; id: string; qty: number }
  | { type: "UPSELL_ADD_CUSTOM_ITEM"; item: CustomItem }
  | { type: "UPSELL_REMOVE_CUSTOM_ITEM"; index: number }
  // Misc
  | { type: "SET_INSTALL_PLAN"; field: keyof InstallPlan; value: string }
  | { type: "TOGGLE_INSTALL_PLAN_MODAL" }
  | { type: "SET_FIELD"; field: keyof WizardState; value: unknown }
  | { type: "APPLY_TEMPLATE"; serviceQty: Record<string, number>; addonQty: Record<string, number>; productQty: Record<string, number>; customItems: CustomItem[] }
  | { type: "APPLY_FULL_TEMPLATE"; serviceQty: Record<string, number>; addonQty: Record<string, number>; productQty: Record<string, number>; customItems: CustomItem[]; packages: PackageConfig[]; upsells: UpsellState }
  | { type: "SET_DELIVERY_MODE"; mode: DeliveryMode }
  | { type: "PREFILL_CUSTOMER"; opportunity: SalesOpportunity }
  | { type: "PREFILL_SERVICE"; serviceId: string }
  | { type: "SET_SUBMITTING"; value: boolean }
  | { type: "SET_PRICE_OVERRIDE"; key: string; cents: number | null };
