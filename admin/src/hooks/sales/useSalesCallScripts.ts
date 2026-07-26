import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesCallScript } from "@/lib/sales-types";

export function useSalesCallScripts() {
  return useQuery({
    queryKey: queryKeys.sales.callScripts.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_call_scripts")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as SalesCallScript[];
    },
  });
}

export function useCreateCallScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Pick<SalesCallScript, "name" | "content" | "service_id" | "sort_order">) => {
      const { data, error } = await supabase
        .from("sales_call_scripts")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as SalesCallScript;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.callScripts.all }),
  });
}

export function useUpdateCallScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalesCallScript> & { id: string }) => {
      const { error } = await supabase
        .from("sales_call_scripts")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.callScripts.all }),
  });
}

export function useDeleteCallScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_call_scripts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.callScripts.all }),
  });
}
