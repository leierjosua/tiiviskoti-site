import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { CSCategory } from "@/lib/cs-types";

export function useCreateCSCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      cat: Pick<CSCategory, "id" | "label" | "color"> &
        Partial<Pick<CSCategory, "sla_first_response_minutes" | "sla_resolution_minutes" | "auto_archive" | "position">>
    ) => {
      const { data, error } = await supabase
        .from("cs_categories")
        .insert(cat)
        .select()
        .single();
      if (error) throw error;
      return data as CSCategory;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customerService.categories.all });
    },
  });
}

export function useUpdateCSCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<CSCategory> & { id: string }) => {
      const { error } = await supabase
        .from("cs_categories")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customerService.categories.all });
    },
  });
}

export function useDeleteCSCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cs_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customerService.categories.all });
    },
  });
}
