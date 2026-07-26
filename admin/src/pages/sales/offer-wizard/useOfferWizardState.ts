import { useReducer, useEffect, useMemo } from "react";
import type { WizardState, WizardAction, InstallPlan, PackageConfig } from "./types";
import type { SalesOpportunity } from "@/lib/sales-types";
import type { Service } from "@/lib/types";
import { DEFAULT_OFFER_VALIDITY_DAYS } from "@/lib/sales-types";

const now = new Date();

const emptyUpsells = { addonQty: {}, productQty: {}, customItems: [] };

const initialState: WizardState = {
  step: "customer",
  customer: { firstName: "", lastName: "", email: "", phone: "", address: "", postcode: "", city: "" },
  serviceQty: {},
  serviceVariantId: {},
  addonQty: {},
  productQty: {},
  customItems: [],
  packages: [],
  activePackageIndex: -1,
  upsells: { ...emptyUpsells },
  installPlan: {
    lapivienti: "sisayksikon_taakse",
    teline: "seinateline",
    sahko: "pistotulppa",
    kondenssi: "maahan",
    huomiot: "",
  },
  showInstallPlanModal: false,
  offerTitle: "",
  noteTitle: "",
  noteContent: "",
  discount: "",
  deliveryMode: null,
  signatureDataUrl: null,
  signerName: "",
  emailBody: "",
  pendingConfirmEmailSubject: "",
  pendingConfirmEmailBody: "",
  validityDays: DEFAULT_OFFER_VALIDITY_DAYS,
  selectedEmployeeId: null,
  selectedCalendarId: null,
  selectedDate: null,
  selectedTime: null,
  calMonth: { year: now.getFullYear(), month: now.getMonth() },
  insideNotes: "",
  isSubmitting: false,
  confirmedOfferNumber: null,
  serviceCategoryId: null,
  showAllProducts: false,
  showAllAddons: false,
  priceOverrides: {},
  showMargin: false,
};

/** Helper: update a package at a given index immutably */
function updatePackage(packages: PackageConfig[], index: number, updater: (pkg: PackageConfig) => PackageConfig): PackageConfig[] {
  return packages.map((pkg, i) => (i === index ? updater(pkg) : pkg));
}

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };

    case "UPDATE_CUSTOMER":
      return { ...state, customer: { ...state.customer, [action.field]: action.value } };

    // ─── Base item actions ─────────────────────────────────────────────
    case "SET_SERVICE_QTY":
      return { ...state, serviceQty: { ...state.serviceQty, [action.id]: action.qty } };

    case "SET_VARIANT":
      return { ...state, serviceVariantId: { ...state.serviceVariantId, [action.serviceId]: action.variantId } };

    case "SET_ADDON_QTY":
      return { ...state, addonQty: { ...state.addonQty, [action.id]: action.qty } };

    case "SET_PRODUCT_QTY":
      return { ...state, productQty: { ...state.productQty, [action.id]: action.qty } };

    case "ADD_CUSTOM_ITEM":
      return { ...state, customItems: [...state.customItems, action.item] };

    case "REMOVE_CUSTOM_ITEM":
      return { ...state, customItems: state.customItems.filter((_, i) => i !== action.index) };

    // ─── Package management ────────────────────────────────────────────
    case "ADD_PACKAGE":
      return {
        ...state,
        packages: [...state.packages, {
          name: action.name,
          serviceQty: {},
          serviceVariantId: {},
          addonQty: {},
          productQty: {},
          customItems: [],
        }],
        activePackageIndex: state.packages.length, // switch to new package
      };

    case "REMOVE_PACKAGE": {
      const newPackages = state.packages.filter((_, i) => i !== action.index);
      let newActive = state.activePackageIndex;
      if (action.index === state.activePackageIndex) {
        newActive = -1; // go back to base
      } else if (action.index < state.activePackageIndex) {
        newActive = state.activePackageIndex - 1;
      }
      return { ...state, packages: newPackages, activePackageIndex: newActive };
    }

    case "SET_ACTIVE_PACKAGE":
      return { ...state, activePackageIndex: action.index };

    case "RENAME_PACKAGE":
      return {
        ...state,
        packages: updatePackage(state.packages, action.index, (pkg) => ({ ...pkg, name: action.name })),
      };

    // ─── Per-package item actions ──────────────────────────────────────
    case "PKG_SET_SERVICE_QTY":
      return {
        ...state,
        packages: updatePackage(state.packages, action.pkgIndex, (pkg) => ({
          ...pkg, serviceQty: { ...pkg.serviceQty, [action.id]: action.qty },
        })),
      };

    case "PKG_SET_VARIANT":
      return {
        ...state,
        packages: updatePackage(state.packages, action.pkgIndex, (pkg) => ({
          ...pkg, serviceVariantId: { ...pkg.serviceVariantId, [action.serviceId]: action.variantId },
        })),
      };

    case "PKG_SET_ADDON_QTY":
      return {
        ...state,
        packages: updatePackage(state.packages, action.pkgIndex, (pkg) => ({
          ...pkg, addonQty: { ...pkg.addonQty, [action.id]: action.qty },
        })),
      };

    case "PKG_SET_PRODUCT_QTY":
      return {
        ...state,
        packages: updatePackage(state.packages, action.pkgIndex, (pkg) => ({
          ...pkg, productQty: { ...pkg.productQty, [action.id]: action.qty },
        })),
      };

    case "PKG_ADD_CUSTOM_ITEM":
      return {
        ...state,
        packages: updatePackage(state.packages, action.pkgIndex, (pkg) => ({
          ...pkg, customItems: [...pkg.customItems, action.item],
        })),
      };

    case "PKG_REMOVE_CUSTOM_ITEM":
      return {
        ...state,
        packages: updatePackage(state.packages, action.pkgIndex, (pkg) => ({
          ...pkg, customItems: pkg.customItems.filter((_, i) => i !== action.index),
        })),
      };

    // ─── Upsell item actions ───────────────────────────────────────────
    case "UPSELL_SET_ADDON_QTY":
      return { ...state, upsells: { ...state.upsells, addonQty: { ...state.upsells.addonQty, [action.id]: action.qty } } };

    case "UPSELL_SET_PRODUCT_QTY":
      return { ...state, upsells: { ...state.upsells, productQty: { ...state.upsells.productQty, [action.id]: action.qty } } };

    case "UPSELL_ADD_CUSTOM_ITEM":
      return { ...state, upsells: { ...state.upsells, customItems: [...state.upsells.customItems, action.item] } };

    case "UPSELL_REMOVE_CUSTOM_ITEM":
      return { ...state, upsells: { ...state.upsells, customItems: state.upsells.customItems.filter((_, i) => i !== action.index) } };

    // ─── Misc ──────────────────────────────────────────────────────────
    case "SET_INSTALL_PLAN":
      return { ...state, installPlan: { ...state.installPlan, [action.field]: action.value } as InstallPlan };

    case "TOGGLE_INSTALL_PLAN_MODAL":
      return { ...state, showInstallPlanModal: !state.showInstallPlanModal };

    case "SET_FIELD":
      return { ...state, [action.field]: action.value };

    case "APPLY_TEMPLATE":
      return {
        ...state,
        serviceQty: action.serviceQty,
        addonQty: action.addonQty,
        productQty: action.productQty,
        customItems: action.customItems,
        priceOverrides: {},
      };

    case "APPLY_FULL_TEMPLATE":
      return {
        ...state,
        serviceQty: action.serviceQty,
        addonQty: action.addonQty,
        productQty: action.productQty,
        customItems: action.customItems,
        packages: action.packages,
        activePackageIndex: action.packages.length > 0 ? 0 : -1,
        upsells: action.upsells,
        priceOverrides: {},
      };

    case "SET_DELIVERY_MODE":
      return { ...state, deliveryMode: action.mode };

    case "PREFILL_CUSTOMER": {
      const opp = action.opportunity;
      const parts = (opp.name || "").trim().split(/\s+/);
      return {
        ...state,
        customer: {
          firstName: parts[0] || "",
          lastName: parts.slice(1).join(" ") || "",
          email: opp.email || "",
          phone: opp.phone || "",
          address: opp.address || "",
          postcode: opp.postcode || "",
          city: opp.city || "",
        },
        installPlan: opp.install_plan ?? state.installPlan,
      };
    }

    case "PREFILL_SERVICE":
      if (Object.values(state.serviceQty).some((q) => q > 0)) return state;
      return { ...state, serviceQty: { [action.serviceId]: 1 } };

    case "SET_SUBMITTING":
      return { ...state, isSubmitting: action.value };

    case "SET_PRICE_OVERRIDE": {
      const next = { ...state.priceOverrides };
      if (action.cents == null) delete next[action.key];
      else next[action.key] = action.cents;
      return { ...state, priceOverrides: next };
    }

    default:
      return state;
  }
}

export function useOfferWizardState(
  opportunity: SalesOpportunity | undefined,
  allServices: Service[],
) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Prefill customer from opportunity
  useEffect(() => {
    if (opportunity) dispatch({ type: "PREFILL_CUSTOMER", opportunity });
  }, [opportunity]);

  // Auto-select perusasennus
  useEffect(() => {
    if (allServices.length === 0) return;
    const perus =
      allServices.find((s) => s.active && s.name.toLowerCase().includes("perusasennus")) ||
      allServices.find((s) => s.active && s.name.toLowerCase().includes("asennus"));
    if (perus) dispatch({ type: "PREFILL_SERVICE", serviceId: perus.id });
  }, [allServices]);

  // Selected service IDs (for variant fetching etc.)
  const selectedServiceIds = useMemo(
    () => Object.entries(state.serviceQty).filter(([, q]) => q > 0).map(([id]) => id),
    [state.serviceQty],
  );

  return { state, dispatch, selectedServiceIds };
}
