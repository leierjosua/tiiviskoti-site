import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Product } from "@/lib/types";

// ─── Countable products with current system counts ───────────────────────────
//
// A product is physically countable when it can hold inventory_units: that is
// every product EXCEPT split-parent bundles (whose stock lives on their indoor /
// outdoor components). Inactive products are included only if they still carry
// stock, so discontinued lines can be zeroed out.

export interface InventoryCountRow extends Product {
  /** in_stock units — what the system believes is on the shelf. */
  inStock: number;
  /** reserved units — committed to a booking but possibly still physically present. */
  reserved: number;
}

export interface InventoryCountGroup {
  categoryId: string | null;
  categoryName: string;
  sortOrder: number;
  rows: InventoryCountRow[];
}

export function useInventoryCountList() {
  return useQuery({
    queryKey: ["inventory-count-list"],
    queryFn: async () => {
      const [productsRes, unitsRes] = await Promise.all([
        supabase
          .from("products")
          .select("*, product_categories(id, name, sort_order)")
          .order("name"),
        supabase
          .from("inventory_units")
          .select("product_id, status")
          .in("status", ["in_stock", "reserved"]),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (unitsRes.error) throw unitsRes.error;

      const inStockBy = new Map<string, number>();
      const reservedBy = new Map<string, number>();
      for (const u of unitsRes.data || []) {
        const m = u.status === "in_stock" ? inStockBy : reservedBy;
        m.set(u.product_id, (m.get(u.product_id) || 0) + 1);
      }

      const products = (productsRes.data || []) as unknown as (Product & {
        product_categories?: { id: string; name: string; sort_order: number } | null;
      })[];

      const rows: InventoryCountRow[] = products
        // Exclude split-parent bundles — their stock is on the components.
        .filter((p) => !(p.indoor_component_id && p.outdoor_component_id))
        .map((p) => ({
          ...p,
          inStock: inStockBy.get(p.id) || 0,
          reserved: reservedBy.get(p.id) || 0,
        }))
        // Active products, or anything still holding stock.
        .filter((r) => r.active || r.inStock > 0 || r.reserved > 0);

      // Group by category
      const groupsMap = new Map<string, InventoryCountGroup>();
      for (const r of rows) {
        const cat = r.product_categories;
        const key = cat?.id || "__none";
        let g = groupsMap.get(key);
        if (!g) {
          g = {
            categoryId: cat?.id || null,
            categoryName: cat?.name || "Muut",
            sortOrder: cat?.sort_order ?? 9999,
            rows: [],
          };
          groupsMap.set(key, g);
        }
        g.rows.push(r);
      }
      const groups = [...groupsMap.values()].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.categoryName.localeCompare(b.categoryName, "fi"),
      );
      for (const g of groups) {
        g.rows.sort((a, b) =>
          (a.brand || "").localeCompare(b.brand || "", "fi") ||
          a.name.localeCompare(b.name, "fi"),
        );
      }

      return { groups, totalProducts: rows.length };
    },
    staleTime: 10_000,
  });
}

// ─── Apply a count ───────────────────────────────────────────────────────────

export interface ApplyCountInput {
  countDate: string; // YYYY-MM-DD
  note?: string;
  lines: { product_id: string; counted: number }[];
}

export interface ApplyCountResult {
  count_id: string;
  lines_recorded: number;
  total_added: number;
  total_removed: number;
  applied_to_orders: number;
}

export function useApplyInventoryCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyCountInput) => {
      const { data, error } = await supabase.rpc("apply_inventory_count", {
        p_count_date: input.countDate,
        p_note: input.note ?? null,
        p_lines: input.lines,
      });
      if (error) throw error;
      return data as ApplyCountResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-count-list"] });
      qc.invalidateQueries({ queryKey: ["inventory-counts"] });
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
      qc.invalidateQueries({ queryKey: queryKeys.logistics.manufacturerOrders.all });
    },
  });
}

// ─── Count history ───────────────────────────────────────────────────────────

export interface InventoryCountRecord {
  id: string;
  count_date: string;
  note: string | null;
  created_at: string;
  inventory_count_lines?: {
    id: string;
    product_id: string;
    system_count: number;
    counted_count: number;
    delta: number;
    products?: Pick<Product, "id" | "name" | "brand" | "model">;
  }[];
}

export function useInventoryCounts(limit = 20) {
  return useQuery({
    queryKey: ["inventory-counts", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select(
          "id, count_date, note, created_at, inventory_count_lines(id, product_id, system_count, counted_count, delta, products(id, name, brand, model))",
        )
        .order("count_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as InventoryCountRecord[];
    },
    staleTime: 30_000,
  });
}
