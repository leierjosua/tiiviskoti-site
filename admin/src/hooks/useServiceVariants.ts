import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ServiceVariant } from "@/lib/types";

export function useServiceVariants(serviceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.serviceVariants.byService(serviceId),
    queryFn: async () => {
      if (!serviceId) return [];
      const { data, error } = await supabase
        .from("service_variants")
        .select("*")
        .eq("service_id", serviceId)
        .order("sort_order");
      // Table may not exist yet (pre-migration) — return empty gracefully
      if (error) {
        const code = error.code;
        const msg = error.message || "";
        if (code === "42P01" || code === "PGRST204" || msg.includes("does not exist") || msg.includes("404")) {
          return [];
        }
        throw error;
      }
      return data as ServiceVariant[];
    },
    enabled: !!serviceId,
    retry: false,
  });
}

export function useCreateServiceVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ServiceVariant, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("service_variants").insert(input).select().single();
      if (error) throw error;
      return data as ServiceVariant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceVariants.all });
    },
  });
}

export function useUpdateServiceVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServiceVariant> & { id: string }) => {
      const { error } = await supabase.from("service_variants").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceVariants.all });
    },
  });
}

export function useDeleteServiceVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_variants").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceVariants.all });
    },
  });
}
