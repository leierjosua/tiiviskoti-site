import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesQuoteTemplate, SalesQuoteTemplateItem } from "@/lib/sales-types";

export function useSalesQuoteTemplates(kind: "template" | "one_off" = "template") {
  return useQuery({
    queryKey: queryKeys.sales.quoteTemplates.byKind(kind),
    queryFn: async () => {
      const query = supabase
        .from("sales_quote_templates")
        .select("*, sales_quote_template_items(*)")
        .eq("is_active", true)
        .eq("kind", kind);
      const { data, error } = kind === "one_off"
        ? await query.order("created_at", { ascending: false })
        : await query.order("sort_order");
      if (error) throw error;
      return data as SalesQuoteTemplate[];
    },
  });
}

export function useOneOffQuotesByOpportunity(opportunityId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.quoteTemplates.byOpportunity(opportunityId),
    enabled: !!opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_quote_templates")
        .select("*, sales_quote_template_items(*)")
        .eq("is_active", true)
        .eq("kind", "one_off")
        .eq("opportunity_id", opportunityId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesQuoteTemplate[];
    },
  });
}

export function useSalesQuoteTemplate(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.quoteTemplates.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_quote_templates")
        .select("*, sales_quote_template_items(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as SalesQuoteTemplate;
    },
  });
}

export function useCreateQuoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SalesQuoteTemplate> & { name: string }) => {
      const { data, error } = await supabase
        .from("sales_quote_templates")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as SalesQuoteTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.all }),
  });
}

export function useUpdateQuoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalesQuoteTemplate> & { id: string }) => {
      const { error } = await supabase
        .from("sales_quote_templates")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.detail(vars.id) });
    },
  });
}

export function useDeleteQuoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sales_quote_templates")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.all }),
  });
}

export function useDuplicateAsOneOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { templateId: string; opportunityId?: string | null }) => {
      const { data: tpl, error: tErr } = await supabase
        .from("sales_quote_templates")
        .select("*, sales_quote_template_items(*)")
        .eq("id", params.templateId)
        .single();
      if (tErr) throw tErr;
      const t = tpl as SalesQuoteTemplate;
      const { data: newRow, error: nErr } = await supabase
        .from("sales_quote_templates")
        .insert({
          name: t.name,
          kind: "one_off",
          opportunity_id: params.opportunityId ?? null,
          note_title: t.note_title,
          note_content: t.note_content,
          validity_days: t.validity_days,
          offer_number: t.offer_number,
          discount_cents: t.discount_cents,
        })
        .select()
        .single();
      if (nErr) throw nErr;
      const items = (t.sales_quote_template_items || []).map((it) => ({
        template_id: (newRow as SalesQuoteTemplate).id,
        line_type: it.line_type,
        item_id: it.item_id,
        name: it.name,
        description: it.description,
        unit_price_cents: it.unit_price_cents,
        quantity: it.quantity,
        is_optional: it.is_optional,
        sort_order: it.sort_order,
        combo_group: it.combo_group,
        section_title: it.section_title,
        section_order: it.section_order,
      }));
      if (items.length > 0) {
        const { error: iErr } = await supabase.from("sales_quote_template_items").insert(items);
        if (iErr) throw iErr;
      }
      return newRow as SalesQuoteTemplate;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.all });
      if (data.opportunity_id) {
        qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.byOpportunity(data.opportunity_id) });
      }
    },
  });
}

// ─── Template Items ──────────────────────────────────────────────────────────

export function useCreateQuoteTemplateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<SalesQuoteTemplateItem, "id">) => {
      const { error } = await supabase.from("sales_quote_template_items").insert(input);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.detail(vars.template_id) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.all });
    },
  });
}

export function useUpdateQuoteTemplateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, template_id, ...updates }: Partial<SalesQuoteTemplateItem> & { id: string; template_id: string }) => {
      const { error } = await supabase
        .from("sales_quote_template_items")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.detail(vars.template_id) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.all });
    },
  });
}

export function useDeleteQuoteTemplateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, template_id: _template_id }: { id: string; template_id: string }) => {
      const { error } = await supabase
        .from("sales_quote_template_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.detail(vars.template_id) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.quoteTemplates.all });
    },
  });
}
