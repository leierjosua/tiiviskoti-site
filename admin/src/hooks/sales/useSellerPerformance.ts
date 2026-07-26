import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

export interface SellerPerformanceRow {
  salesperson_id: string;
  first_name: string;
  last_name: string;
  total_leads: number;
  contacted_leads: number;
  qualified_leads: number;
  won_leads: number;
  lost_leads: number;
  total_opportunities: number;
  won_opportunities: number;
  lost_opportunities: number;
  total_commissions: number;
  pipeline_value: number;
}

export interface LossReasonRow {
  reason: string;
  lead_count: number;
  opportunity_count: number;
  total_count: number;
}

export interface StageDistRow {
  salesperson_id: string;
  first_name: string;
  last_name: string;
  status: string;
  lead_count?: number;
  opp_count?: number;
}

export function useSellerPerformance(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: queryKeys.sales.management.sellerPerformance(dateFrom, dateTo),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_seller_performance", {
        p_date_from: dateFrom || "1970-01-01T00:00:00Z",
        p_date_to: dateTo || "2099-12-31T23:59:59Z",
      });
      if (error) throw error;
      return (data ?? []) as SellerPerformanceRow[];
    },
  });
}

export function useLossReasonStats(dateFrom?: string, dateTo?: string, salespersonId?: string) {
  return useQuery({
    queryKey: queryKeys.sales.management.lossReasons(dateFrom, dateTo, salespersonId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_loss_reason_stats", {
        p_date_from: dateFrom || "1970-01-01T00:00:00Z",
        p_date_to: dateTo || "2099-12-31T23:59:59Z",
        p_salesperson_id: salespersonId || null,
      });
      if (error) throw error;
      return (data ?? []) as LossReasonRow[];
    },
  });
}

export function useLeadStageDistribution(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: queryKeys.sales.management.leadStageDistribution(dateFrom, dateTo),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_lead_stage_distribution", {
        p_date_from: dateFrom || "1970-01-01T00:00:00Z",
        p_date_to: dateTo || "2099-12-31T23:59:59Z",
      });
      if (error) throw error;
      return (data ?? []) as StageDistRow[];
    },
  });
}

export function useOppStageDistribution(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: queryKeys.sales.management.oppStageDistribution(dateFrom, dateTo),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_opportunity_stage_distribution", {
        p_date_from: dateFrom || "1970-01-01T00:00:00Z",
        p_date_to: dateTo || "2099-12-31T23:59:59Z",
      });
      if (error) throw error;
      return (data ?? []) as StageDistRow[];
    },
  });
}

export interface PipelineOverviewRow {
  entity_type: "lead" | "opportunity";
  status: string;
  cnt: number;
}

export function usePipelineOverview(dateFrom?: string, dateTo?: string, salespersonId?: string) {
  return useQuery({
    queryKey: queryKeys.sales.management.pipelineOverview(dateFrom, dateTo, salespersonId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_pipeline_overview", {
        p_date_from: dateFrom || "1970-01-01T00:00:00Z",
        p_date_to: dateTo || "2099-12-31T23:59:59Z",
        p_salesperson_id: salespersonId || null,
      });
      if (error) throw error;
      return (data ?? []) as PipelineOverviewRow[];
    },
  });
}
