import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesInboundAssignmentSetting } from "@/lib/sales-types";

export function useSalesAssignmentSettings() {
  return useQuery({
    queryKey: queryKeys.sales.assignmentSettings.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_inbound_assignment_settings")
        .select("*, salesperson:employees(id, first_name, last_name)")
        .order("priority");
      if (error) throw error;
      return data as SalesInboundAssignmentSetting[];
    },
  });
}

export function useUpsertAssignmentSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      salesperson_id: string;
      weekly_limit: number;
      priority: number;
      is_active: boolean;
      email_notifications?: boolean;
    }) => {
      const { error } = await supabase
        .from("sales_inbound_assignment_settings")
        .upsert(input, { onConflict: "salesperson_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.assignmentSettings.all }),
  });
}
