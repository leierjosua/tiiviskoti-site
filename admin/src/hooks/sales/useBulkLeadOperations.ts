import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { LeadStatus } from "@/lib/sales-types";

export function useBulkUpdateLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: { status?: LeadStatus; assigned_salesperson_id?: string | null };
    }) => {
      const { error } = await supabase
        .from("sales_leads")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.all });
    },
  });
}

export function useBulkTagLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadIds, tagNames, tagType = "normal" }: { leadIds: string[]; tagNames: string[]; tagType?: "normal" | "import" }) => {
      // Ensure all tags exist in sales_tags (create if missing)
      for (const tagName of tagNames) {
        await supabase
          .from("sales_tags")
          .upsert(
            { name: tagName, color: tagType === "import" ? "#8b5cf6" : "#3b82f6", position: 999, is_active: true, tag_type: tagType, scope: "lead" },
            { onConflict: "name" }
          );
      }

      // Insert lead-tag associations in chunks (ignore duplicates)
      const rows = leadIds.flatMap((lead_id) =>
        tagNames.map((tag_name) => ({ lead_id, tag_name }))
      );
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase.from("sales_lead_tags").insert(chunk);
        // Ignore duplicate key errors (23505)
        if (error && error.code !== "23505") throw error;
      }

      // Batch update tags_cache directly
      await supabase
        .from("sales_leads")
        .update({ tags_cache: tagNames, updated_at: new Date().toISOString() })
        .in("id", leadIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.tags.all });
    },
  });
}

export function useBulkDeleteLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("sales_leads")
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.callLists.all });
    },
  });
}

export function useBulkUpdateOpportunities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: { status?: string; assigned_salesperson_id?: string | null };
    }) => {
      const { error } = await supabase
        .from("sales_opportunities")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.all });
    },
  });
}
