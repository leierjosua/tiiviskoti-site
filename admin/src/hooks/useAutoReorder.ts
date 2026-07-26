import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { AutoReorderAlert } from "@/lib/types";

// ─── Active alerts (suggested) ──────────────────────────────────────────────

export function useAutoReorderAlerts() {
  return useQuery({
    queryKey: queryKeys.logistics.autoReorder.alerts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_reorder_log")
        .select(`
          *,
          products(id, name, brand, model, sku, images, stock_quantity, stock_low_threshold)
        `)
        .eq("status", "suggested")
        .order("triggered_at", { ascending: false });
      if (error) throw error;
      return data as AutoReorderAlert[];
    },
  });
}

// ─── Trigger auto-reorder check ─────────────────────────────────────────────

export function useTriggerAutoReorderCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("check_auto_reorder");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.logistics.autoReorder.alerts });
    },
  });
}

// ─── Approve alert → creates draft manufacturer order ───────────────────────

export function useApproveReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      // Fetch the alert
      const { data: alert, error: alertErr } = await supabase
        .from("auto_reorder_log")
        .select("*, products(id, name, brand, cost_cents)")
        .eq("id", alertId)
        .single();
      if (alertErr) throw alertErr;

      const product = alert.products as { id: string; name: string; brand: string | null; cost_cents: number };
      if (!product.brand) throw new Error("Tuotteelta puuttuu brändi.");

      const { data: { user } } = await supabase.auth.getUser();

      // Create draft manufacturer order
      const { data: order, error: orderErr } = await supabase
        .from("manufacturer_orders")
        .insert({
          brand: product.brand,
          order_type: "batch",
          status: "draft",
          notes: `Automaattinen täydennystilaus: ${product.name}`,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      // Create order line
      const { error: lineErr } = await supabase
        .from("manufacturer_order_lines")
        .insert({
          manufacturer_order_id: order.id,
          product_id: product.id,
          quantity_ordered: alert.suggested_quantity,
          cost_cents: product.cost_cents ?? null,
        });
      if (lineErr) throw lineErr;

      // Mark alert as approved
      const { error: updateErr } = await supabase
        .from("auto_reorder_log")
        .update({
          status: "approved",
          manufacturer_order_id: order.id,
          resolved_by: user?.id ?? null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", alertId);
      if (updateErr) throw updateErr;

      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.logistics.autoReorder.alerts });
      qc.invalidateQueries({ queryKey: queryKeys.logistics.manufacturerOrders.all });
    },
  });
}

// ─── Dismiss alert ──────────────────────────────────────────────────────────

export function useDismissReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("auto_reorder_log")
        .update({
          status: "dismissed",
          resolved_by: user?.id ?? null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.logistics.autoReorder.alerts });
    },
  });
}
