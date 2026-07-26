import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isSystemBundle } from "@/lib/products";
import type { BookingLineItem, Product } from "@/lib/types";

/** Minimal component-product shape needed to identify a physical unit. */
export interface ComponentLite {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  model: string | null;
}

/**
 * Fetch the indoor/outdoor component products referenced by a set of bundle
 * products, in a single `.in()` query. We deliberately avoid a nested
 * PostgREST self-embed (products → products via two FKs) because that is
 * ambiguous and would break the whole line-items query.
 *
 * Returns a Map keyed by component product id.
 */
export function useComponentProducts(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean) as string[])].sort();
  return useQuery({
    queryKey: ["component-products", unique],
    enabled: unique.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, brand, model")
        .in("id", unique);
      if (error) throw error;
      const map = new Map<string, ComponentLite>();
      for (const p of (data || []) as ComponentLite[]) map.set(p.id, p);
      return map;
    },
  });
}

/** Collect every indoor/outdoor component id referenced by these line items. */
export function lineItemComponentIds(lineItems: Pick<BookingLineItem, "products">[]): string[] {
  const ids: string[] = [];
  for (const li of lineItems) {
    const p = li.products;
    if (p?.indoor_component_id) ids.push(p.indoor_component_id);
    if (p?.outdoor_component_id) ids.push(p.outdoor_component_id);
  }
  return ids;
}

/**
 * Renders the indoor + outdoor model numbers for a split-system heat pump so
 * the warehouse/installer can tell which physical boxes belong to e.g.
 * "Toshiba Seiya+ 13" (sisä RAS-… + ulko RAS-…). Renders nothing for
 * single-package products or while the lookup is still loading.
 */
export function ProductComponentBreakdown({
  product,
  components,
  className = "",
}: {
  product: Pick<Product, "indoor_component_id" | "outdoor_component_id"> | null | undefined;
  components: Map<string, ComponentLite>;
  className?: string;
}) {
  if (!product || !isSystemBundle(product) || !product.outdoor_component_id) return null;
  const indoor = components.get(product.indoor_component_id!);
  const outdoor = components.get(product.outdoor_component_id);
  if (!indoor && !outdoor) return null;

  return (
    <div className={`mt-1 space-y-0.5 ${className}`}>
      {indoor && <ComponentRow label="Sisä" comp={indoor} />}
      {outdoor && <ComponentRow label="Ulko" comp={outdoor} />}
    </div>
  );
}

function ComponentRow({ label, comp }: { label: string; comp: ComponentLite }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
      <span className="text-[9px] uppercase tracking-wide font-semibold text-text-muted/70 w-7 shrink-0">
        {label}
      </span>
      {comp.sku && <span className="font-mono text-text-secondary">{comp.sku}</span>}
      <span className="truncate">{comp.name}</span>
    </div>
  );
}
