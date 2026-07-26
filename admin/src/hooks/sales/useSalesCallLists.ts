import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesCallList } from "@/lib/sales-types";

export function useSalesCallLists() {
  return useQuery({
    queryKey: queryKeys.sales.callLists.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_call_lists")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesCallList[];
    },
  });
}

export function useCreateCallList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Pick<SalesCallList, "name" | "category" | "description" | "lead_count">) => {
      const { data, error } = await supabase
        .from("sales_call_lists")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as SalesCallList;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.callLists.all }),
  });
}

export function useDeleteCallList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_call_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.callLists.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.all });
    },
  });
}
