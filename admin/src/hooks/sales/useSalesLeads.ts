import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesLead, SalesLeadNote, SalesLeadEvent, LeadStatus } from "@/lib/sales-types";

interface LeadFilters {
  status?: LeadStatus;
  callListId?: string;
  salespersonId?: string;
  search?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export function useSalesLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: queryKeys.sales.leads.list(filters),
    queryFn: async () => {
      let query = supabase
        .from("sales_leads")
        .select("*, sales_call_lists(id, name, category)")
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.callListId) query = query.eq("call_list_id", filters.callListId);
      if (filters?.salespersonId) query = query.eq("assigned_salesperson_id", filters.salespersonId);
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%,city.ilike.%${filters.search}%`);
      }
      if (filters?.tags?.length) {
        query = query.overlaps("tags_cache", filters.tags);
      }
      if (filters?.dateFrom) query = query.gte("created_at", filters.dateFrom);
      if (filters?.dateTo) query = query.lte("created_at", filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;
      return data as SalesLead[];
    },
  });
}

export function useSalesLead(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.leads.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_leads")
        .select("*, sales_call_lists(id, name, category)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as SalesLead;
    },
  });
}

export function useUpdateSalesLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalesLead> & { id: string }) => {
      const { error } = await supabase
        .from("sales_leads")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.detail(vars.id) });
    },
  });
}

export function useBulkInsertLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leads: Array<{
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      postcode?: string;
      city?: string;
      company?: string;
      call_list_id?: string;
      external_source?: string;
      external_id?: string;
    }>) => {
      const rows = leads.map((l, i) => ({
        ...l,
        external_source: l.external_source || "csv_import",
        external_id: l.external_id || `csv-${Date.now()}-${i}`,
        status: "new" as const,
      }));
      const { data, error } = await supabase
        .from("sales_leads")
        .insert(rows)
        .select("id");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.callLists.all });
    },
  });
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function useLeadNotes(leadId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.leads.notes(leadId),
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_lead_notes")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesLeadNote[];
    },
  });
}

export function useCreateLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lead_id: string; body: string }) => {
      const { error } = await supabase.from("sales_lead_notes").insert(input);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.notes(vars.lead_id) });
    },
  });
}

export function useUpdateLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body, leadId }: { id: string; body: string; leadId: string }) => {
      const { error } = await supabase.from("sales_lead_notes").update({ body }).eq("id", id);
      if (error) throw error;
      return leadId;
    },
    onSuccess: (leadId) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.notes(leadId) });
    },
  });
}

export function useDeleteLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string }) => {
      const { error } = await supabase.from("sales_lead_notes").delete().eq("id", id);
      if (error) throw error;
      return leadId;
    },
    onSuccess: (leadId) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.leads.notes(leadId) });
    },
  });
}

// ─── Events ──────────────────────────────────────────────────────────────────

export function useLeadEvents(leadId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.leads.events(leadId),
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_lead_events")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesLeadEvent[];
    },
  });
}
