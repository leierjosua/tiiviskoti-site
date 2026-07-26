import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

export interface ApplyToOrdersResult {
  applied: number;
  leftover: number;
  allocations: { order_id: string; order_number: number; applied: number }[];
}

/**
 * Distribute a received quantity of a product across its open purchase orders
 * (oldest first): closes order lines as they fill, leaves the remainder on
 * order, and the surplus becomes plain stock. Does NOT create units — the
 * caller creates inventory_units first (so serials / split handling stay intact).
 */
export function useApplyReceivedToOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, qty }: { productId: string; qty: number }) => {
      const { data, error } = await supabase.rpc("apply_received_to_orders", {
        p_product_id: productId,
        p_qty: qty,
      });
      if (error) throw error;
      return data as ApplyToOrdersResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.logistics.manufacturerOrders.all });
      qc.invalidateQueries({ queryKey: queryKeys.logistics.bookingProductOrders.all });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}
