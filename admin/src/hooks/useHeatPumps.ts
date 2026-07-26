import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { HeatPump, HeatPumpInput } from "@/lib/types";

export function useHeatPumps() {
  return useQuery({
    queryKey: queryKeys.heatPumps.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heat_pumps")
        .select("*")
        .order("display_order", { ascending: true })
        .order("brand", { ascending: true })
        .order("marketing_name", { ascending: true });
      if (error) throw error;
      return data as HeatPump[];
    },
  });
}

export function useHeatPump(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.heatPumps.detail(id),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("heat_pumps")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as HeatPump;
    },
    enabled: !!id,
  });
}

export function useCreateHeatPump() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: HeatPumpInput) => {
      const { data, error } = await supabase
        .from("heat_pumps")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as HeatPump;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.heatPumps.all });
    },
  });
}

export function useUpdateHeatPump() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<HeatPumpInput>) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase
        .from("heat_pumps")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as HeatPump;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.heatPumps.all });
      qc.invalidateQueries({ queryKey: queryKeys.heatPumps.detail(vars.id) });
    },
  });
}

export function useDeleteHeatPump() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("heat_pumps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.heatPumps.all });
    },
  });
}
