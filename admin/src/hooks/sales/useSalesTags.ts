import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesTag } from "@/lib/sales-types";

export function useSalesTags(tagType?: string) {
  return useQuery({
    queryKey: queryKeys.sales.tags.byType(tagType),
    queryFn: async () => {
      let query = supabase
        .from("sales_tags")
        .select("*")
        .order("position");
      if (tagType) query = query.eq("tag_type", tagType);
      const { data, error } = await query;
      if (error) throw error;
      return data as SalesTag[];
    },
  });
}

export function useCreateSalesTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tag: Pick<SalesTag, "name" | "color" | "tag_type" | "scope" | "position">) => {
      const { error } = await supabase.from("sales_tags").insert(tag);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.tags.all }),
  });
}

export function useUpdateSalesTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, ...updates }: Partial<SalesTag> & { name: string }) => {
      const { error } = await supabase
        .from("sales_tags")
        .update(updates)
        .eq("name", name);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.tags.all }),
  });
}

export function useDeleteSalesTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("sales_tags").delete().eq("name", name);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.tags.all }),
  });
}
