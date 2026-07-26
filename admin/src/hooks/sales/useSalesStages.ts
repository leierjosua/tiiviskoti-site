import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesLeadStage, SalesOpportunityStage } from "@/lib/sales-types";

// ─── Lead Stages (Outbound) ─────────────────────────────────────────────────

export function useLeadStages() {
  return useQuery({
    queryKey: queryKeys.sales.leadStages.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_lead_stages")
        .select("*")
        .order("position");
      if (error) throw error;
      return data as SalesLeadStage[];
    },
  });
}

export function useUpsertLeadStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stage: Partial<SalesLeadStage> & { key: string }) => {
      const { error } = await supabase
        .from("sales_lead_stages")
        .upsert(stage, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.leadStages.all }),
  });
}

export function useDeleteLeadStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase
        .from("sales_lead_stages")
        .delete()
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.leadStages.all }),
  });
}

// ─── Opportunity Stages (Inbound) ───────────────────────────────────────────

export function useOpportunityStages() {
  return useQuery({
    queryKey: queryKeys.sales.opportunityStages.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunity_stages")
        .select("*")
        .order("position");
      if (error) throw error;
      return data as SalesOpportunityStage[];
    },
  });
}

export function useUpsertOpportunityStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stage: Partial<SalesOpportunityStage> & { key: string }) => {
      const { error } = await supabase
        .from("sales_opportunity_stages")
        .upsert(stage, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.opportunityStages.all }),
  });
}

export function useDeleteOpportunityStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase
        .from("sales_opportunity_stages")
        .delete()
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.opportunityStages.all }),
  });
}
