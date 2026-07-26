// Category slugs that make a product a component (indoor / outdoor unit).
// Kept in sync with the DB classifier in migration 20260531000002.
const COMPONENT_CATEGORY_SLUGS = new Set(["komponentit", "sisayksikot", "ulkoyksikot"]);

type ComponentCheckInput = {
  is_component?: boolean | null;
  // The joined category arrives as `product_categories` from useProducts(),
  // but some queries alias it as `category` — accept either.
  product_categories?: { slug?: string | null } | null;
  category?: { slug?: string | null } | null;
};

function categorySlug(p: ComponentCheckInput): string | null {
  return p?.product_categories?.slug ?? p?.category?.slug ?? null;
}

/**
 * True when the product is an indoor/outdoor unit rather than a sellable
 * system. Prefers the denormalized `is_component` column (single source of
 * truth, set by a DB trigger) and falls back to the joined category slug so
 * the check still works in views fetched before the column existed.
 *
 * Use this to hide components from sales/selection pickers BY DEFAULT — keep
 * them reachable via search, inventory receiving, and bundle expansion.
 */
export function isComponentProduct(p: ComponentCheckInput): boolean {
  if (typeof p?.is_component === "boolean") return p.is_component;
  return COMPONENT_CATEGORY_SLUGS.has(categorySlug(p) ?? "");
}

/** True for a sellable bundle/system (a split unit linked to its two components). */
export function isSystemBundle(p: { indoor_component_id?: string | null }): boolean {
  return !!p?.indoor_component_id;
}

/** True for an indoor-unit component (sisäyksikkö). */
export function isIndoorComponent(p: ComponentCheckInput): boolean {
  return categorySlug(p) === "sisayksikot";
}

/** True for an outdoor-unit component (ulkoyksikkö). */
export function isOutdoorComponent(p: ComponentCheckInput): boolean {
  return categorySlug(p) === "ulkoyksikot";
}

/** True for a multisplit outdoor unit (one outdoor → many indoor units). */
export function isMultisplitOutdoor(p: { multisplit_ports?: number | null }): boolean {
  return typeof p?.multisplit_ports === "number" && p.multisplit_ports >= 2;
}
