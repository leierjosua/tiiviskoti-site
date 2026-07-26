import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { BrandOrderRule } from "@/lib/sales-types";

export function useBrandOrderRules() {
  return useQuery({
    queryKey: queryKeys.sales.brandOrderRules.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_order_rules")
        .select("*")
        .order("brand");
      if (error) throw error;
      return data as BrandOrderRule[];
    },
  });
}

export function useCreateBrandOrderRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<BrandOrderRule, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("brand_order_rules")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as BrandOrderRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.brandOrderRules.all }),
  });
}

export function useUpdateBrandOrderRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BrandOrderRule> & { id: string }) => {
      const { error } = await supabase
        .from("brand_order_rules")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.brandOrderRules.all }),
  });
}

export function useDeleteBrandOrderRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("brand_order_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.brandOrderRules.all }),
  });
}
