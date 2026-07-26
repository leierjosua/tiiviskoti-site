import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

export interface SellerTarget {
  id: string;
  salesperson_id: string;
  period_type: "weekly" | "monthly";
  period_start: string;
  target_leads: number;
  target_opportunities: number;
  target_won: number;
  target_revenue: number;
  created_at: string;
  updated_at: string;
}

export function useSellerTargets(salespersonId?: string) {
  return useQuery({
    queryKey: queryKeys.sales.management.sellerTargets(salespersonId),
    queryFn: async () => {
      let query = supabase
        .from("sales_seller_targets")
        .select("*")
        .order("period_start", { ascending: false });
      if (salespersonId) query = query.eq("salesperson_id", salespersonId);
      const { data, error } = await query;
      if (error) throw error;
      return data as SellerTarget[];
    },
  });
}

export function useUpsertSellerTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<SellerTarget, "id" | "created_at" | "updated_at">) => {
      const { error } = await supabase
        .from("sales_seller_targets")
        .upsert(
          { ...input, updated_at: new Date().toISOString() },
          { onConflict: "salesperson_id,period_type,period_start" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-seller-targets"] });
    },
  });
}
