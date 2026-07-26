import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { InventoryMovement, InventoryMovementType } from "@/lib/types";

// ─── Movements list (with product join) ─────────────────────────────────────

interface MovementFilters {
  productId?: string;
  movementType?: InventoryMovementType;
  from?: string; // ISO date
  to?: string;
  limit?: number;
}

export function useInventoryMovements(filters: MovementFilters = {}) {
  return useQuery({
    queryKey: queryKeys.inventory.movements(filters),
    queryFn: async () => {
      let query = supabase
        .from("inventory_movements")
        .select("*, products(id, name, sku, brand, model, images)")
        .order("created_at", { ascending: false });

      if (filters.productId) query = query.eq("product_id", filters.productId);
      if (filters.movementType) query = query.eq("movement_type", filters.movementType);
      if (filters.from) query = query.gte("created_at", filters.from);
      if (filters.to) query = query.lte("created_at", filters.to + "T23:59:59");
      if (filters.limit) query = query.limit(filters.limit);

      const { data, error } = await query;
      if (error) throw error;
      return data as InventoryMovement[];
    },
  });
}

// ─── Movements for a single product ─────────────────────────────────────────

export function useProductMovements(productId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.byProduct(productId),
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*")
        .eq("product_id", productId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as InventoryMovement[];
    },
  });
}

// ─── Create movement ────────────────────────────────────────────────────────

interface CreateMovementInput {
  product_id: string;
  quantity: number;
  movement_type: InventoryMovementType;
  reason?: string;
  booking_id?: string;
}

export function useCreateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMovementInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("inventory_movements")
        .insert({ ...input, performed_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as InventoryMovement;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.movements() });
      qc.invalidateQueries({ queryKey: queryKeys.inventory.byProduct(variables.product_id) });
      qc.invalidateQueries({ queryKey: queryKeys.inventory.summary });
      qc.invalidateQueries({ queryKey: queryKeys.products.all });
      qc.invalidateQueries({ queryKey: queryKeys.products.detail(variables.product_id) });
    },
  });
}

// ─── Inventory summary: products with stock tracking ────────────────────────

export interface InventorySummaryItem {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  sku: string | null;
  images: string[];
  stock_quantity: number;
  stock_low_threshold: number | null;
  price_cents: number;
  cost_cents: number;
  category_name: string | null;
}

export function useInventorySummary() {
  return useQuery({
    queryKey: queryKeys.inventory.summary,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, model, sku, images, stock_quantity, stock_low_threshold, price_cents, cost_cents, product_categories(name)")
        .not("stock_quantity", "is", null)
        .order("name");
      if (error) throw error;
      return (data || []).map((p: Record<string, unknown>) => ({
        ...p,
        category_name: (p.product_categories as { name: string } | null)?.name ?? null,
      })) as InventorySummaryItem[];
    },
  });
}
